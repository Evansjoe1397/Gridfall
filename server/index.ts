import { Room, Server, type Client } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { HistoryOutbox, buildIdentity } from './history-outbox.ts';
import { finishedMatchRecord } from './match-record.ts';
import { DEFAULT_STATS_URL } from '../shared/stats-config.ts';
import { DebugRecorder, projectDebugState } from '../shared/debug-recording.ts';
import { managementCapabilities, statsManagementRouter } from './stats-management.ts';
import { applyCommand, CharacterIdSchema, createBestOfThreeState, createLordaeronMultiplayerState, createMultiplayerState, forcePowerActionEventForCommand, GameCommandSchema, orkkActionEventForCommand, perkUseEventForTransition, resolveMultiplayerCombatStack, spectreActionEventForCommand, wizardActionEventForCommand, type BestOfThreeMode, type CharacterId, type GameState, type PlayerId } from '../shared/game.ts';
import { arenaForPlayerCount, NAGRAND_ARENA, THE_PIPE_ARENA, THE_TRENCH_ARENA, type ArenaId } from '../shared/arenas.ts';

type GameFormat = 'duel' | 'ffa' | 'bo3';
type JoinOptions = { password?: string; format?: GameFormat; arena?: ArenaId; seriesMode?: BestOfThreeMode };

if (existsSync('.env')) process.loadEnvFile('.env');
const historyOutbox = new HistoryOutbox(process.env.GRIDFALL_STATS_OUTBOX || '.gridfall-history', process.env.GRIDFALL_STATS_URL || DEFAULT_STATS_URL, process.env.GRIDFALL_STATS_WRITE_KEY ?? '');
const identity = buildIdentity();
historyOutbox.start();

class DuelRoom extends Room {
  private historySessionId = randomUUID();
  private savedMatches = new Set<string>();
  maxClients = 3;
  private game: GameState | null = null;
  private password = '';
  private format: GameFormat = 'duel';
  private seriesMode: BestOfThreeMode = 'duel';
  private arena: ArenaId = 'nagrand';
  private seats = new Map<string, PlayerId>();
  private characterSelections: Partial<Record<PlayerId, CharacterId>> = {};
  private characters: Partial<Record<PlayerId, CharacterId>> = {};
  private tournamentCharacters: Partial<Record<PlayerId, readonly [CharacterId, CharacterId]>> = {};
  private combatStackSelections = new Map<PlayerId, string[]>();
  // Keep the final current-state checkpoint inside the advertised 2 MiB server allocation.
  private diagnostics = new DebugRecorder({ source: 'server', maxBytes: 2 * 1024 * 1024 - 256 * 1024 - 1024 });
  private diagnosticRevision = 0;
  private diagnosticCommandEvent = 0;
  private debugExports = new Set<string>();
  private debugExportTimes = new Map<string, number>();

  onCreate(options: JoinOptions) {
    this.password = String(options.password ?? '');
    this.format = options.format === 'ffa' ? 'ffa' : options.format === 'bo3' ? 'bo3' : 'duel';
    this.seriesMode = options.seriesMode === 'tournament' ? 'tournament' : 'duel';
    this.arena = this.format === 'ffa' ? 'lordaeron' : options.arena === 'trench' || options.arena === 'pipe' ? options.arena : 'nagrand';
    this.maxClients = this.format === 'ffa' ? 3 : 2;
    this.diagnostics.reset({ recordingId: this.historySessionId, roomId: this.roomId, ...identity,
      format: this.format, arena: this.arena, seriesMode: this.seriesMode });
    this.diagnostics.record('room.created');
    this.setPrivate(true);
    this.onMessage('command', (client, raw) => this.handleCommand(client, raw));
    this.onMessage('hover-character', (client, raw) => this.previewCharacter(client, raw));
    this.onMessage('select-character', (client, raw) => this.confirmCharacter(client, raw));
    this.onMessage('ready', (client) => { this.diagnostics.record('client.ready', { seat: this.seats.get(client.sessionId) }); this.sendSnapshot(client); });
    this.onMessage('debug-export', (client, raw) => this.exportDiagnostics(client, raw));
    this.onMessage('debug-ping', (client, raw) => {
      if (raw && typeof raw.id === 'number' && Number.isSafeInteger(raw.id)) client.send('debug-pong', { id: raw.id, serverTime: Date.now() });
    });
  }

  onAuth(_client: Client, options: JoinOptions) {
    return String(options.password ?? '') === this.password;
  }

  onJoin(client: Client) {
    const occupied = new Set(this.seats.values());
    const seat: PlayerId = !occupied.has('P1') ? 'P1' : !occupied.has('P2') ? 'P2' : 'P3';
    this.seats.set(client.sessionId, seat);
    this.diagnostics.record('network.join', { seat });
    client.send('seat', seat);
    this.broadcastLobby();
  }

  onDrop(client: Client) {
    this.diagnostics.record('network.drop', { seat: this.seats.get(client.sessionId), reconnectWindowSeconds: 90 });
    this.broadcast('notice', 'A player lost connection. Waiting for them to reconnect.');
    this.allowReconnection(client, 90);
  }

  onReconnect(client: Client) {
    this.diagnostics.record('network.reconnect', { seat: this.seats.get(client.sessionId) });
    this.broadcast('notice', 'A player reconnected.');
    this.sendSnapshot(client);
  }

  onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    this.diagnostics.record('network.leave', { seat });
    this.debugExportTimes.delete(client.sessionId);
    this.seats.delete(client.sessionId);
    if (!this.game && seat) {
      delete this.characterSelections[seat];
      delete this.characters[seat];
      delete this.tournamentCharacters[seat];
    }
    this.broadcast('notice', 'A player left the room.');
    this.broadcastLobby();
  }

  private handleCommand(client: Client, raw: unknown) {
    const seat = this.seats.get(client.sessionId);
    const started = performance.now();
    const parsed = GameCommandSchema.safeParse(raw);
    const isStack = raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'combat-stack-submit';
    this.diagnosticCommandEvent = this.diagnostics.record('command.submitted', { seat,
      command: parsed.success ? parsed.data : isStack ? { type: 'combat-stack-submit',
        cardInstanceIds: Array.isArray((raw as { cardInstanceIds?: unknown }).cardInstanceIds)
          ? (raw as { cardInstanceIds: unknown[] }).cardInstanceIds.slice(0, 3).map((value) => typeof value === 'string' ? value.slice(0, 200) : '[invalid]') : '[invalid]' }
        : { type: raw && typeof raw === 'object' ? String((raw as { type?: unknown }).type).slice(0, 80) : typeof raw, invalid: true } });
    const reject = (error: string) => {
      this.diagnostics.record('command.rejected', { commandEvent: this.diagnosticCommandEvent, seat, error, durationMs: Math.round((performance.now() - started) * 100) / 100 });
      client.send('error', error);
    };
    if (raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'combat-stack-submit') {
      if (!this.game || !seat || this.game.phase !== 'choosing-combat-stack' || !this.game.pendingAttack || ![this.game.pendingAttack.attackerId, this.game.pendingAttack.defenderId].includes(seat)) return reject('No Combat Stack selection is available.');
      if (this.combatStackSelections.has(seat)) return reject('Your Combat Stack selection is already locked.');
      const cardInstanceIds = (raw as { cardInstanceIds?: unknown }).cardInstanceIds;
      if (!Array.isArray(cardInstanceIds) || cardInstanceIds.some((id) => typeof id !== 'string')) return reject('Invalid Combat Stack selection.');
      if (new Set(cardInstanceIds).size > 1) return reject('You may apply only one Combat Card per combat.');
      this.combatStackSelections.set(seat, [...new Set(cardInstanceIds)]);
      this.diagnostics.record('command.accepted', { commandEvent: this.diagnosticCommandEvent, seat, durationMs: Math.round((performance.now() - started) * 100) / 100 });
      this.broadcast('character-activity', { playerId: seat });
      const combatants = [this.game.pendingAttack.attackerId, this.game.pendingAttack.defenderId];
      this.broadcast('combat-stack-status', { submittedPlayerIds: combatants.filter((id) => this.combatStackSelections.has(id)) });
      if (combatants.every((id) => this.combatStackSelections.has(id))) {
        const selections = Object.fromEntries(combatants.map((id) => [id, this.combatStackSelections.get(id)!]));
        this.combatStackSelections.clear();
        const result = resolveMultiplayerCombatStack(this.game, selections);
        if (!result.ok) { this.diagnostics.record('combat-stack.rejected', { selections, error: result.error }); return this.broadcast('error', result.error); }
        this.game = result.state;
        this.diagnostics.record('combat-stack.resolved', { selections });
        this.broadcastState();
      }
      return;
    }
    if (!this.game) return reject('The battle has not started yet.');
    if (!seat || !parsed.success || parsed.data.playerId !== seat) {
      reject('Rejected invalid or unauthorized command.');
      return;
    }
    const orkkActionEvent = orkkActionEventForCommand(this.game, parsed.data);
    const wizardActionEvent = wizardActionEventForCommand(this.game, parsed.data);
    const forcePowerActionEvent = forcePowerActionEventForCommand(this.game, parsed.data);
    const spectreActionEvent = spectreActionEventForCommand(this.game, parsed.data);
    const previousGame = this.game;
    const result = applyCommand(this.game, parsed.data);
    if (!result.ok) {
      reject(result.error);
      return;
    }
    this.game = result.state;
    this.diagnostics.record('command.accepted', { commandEvent: this.diagnosticCommandEvent, seat, durationMs: Math.round((performance.now() - started) * 100) / 100 });
    this.broadcast('character-activity', { playerId: seat });
    const perkUseEvent = perkUseEventForTransition(previousGame, parsed.data, this.game);
    if (orkkActionEvent) this.broadcast('orkk-action', orkkActionEvent);
    if (wizardActionEvent) this.broadcast('wizard-action', wizardActionEvent);
    if (spectreActionEvent) this.broadcast('spectre-action', spectreActionEvent);
    if (perkUseEvent) this.broadcast('perk-used', perkUseEvent);
    if (forcePowerActionEvent && (forcePowerActionEvent.action !== 'power-started' || (forcePowerActionEvent.perk === 'force-throw' ? this.game.forceThrow : this.game.forcePull))) {
      this.broadcast('force-power-action', forcePowerActionEvent);
    }
    if (this.game.phase === 'choosing-combat-stack') {
      this.combatStackSelections.clear();
      const automaticSelections = (this.game as GameState & { combatStackSelections?: Partial<Record<PlayerId, string[]>> }).combatStackSelections ?? {};
      for (const [playerId, selection] of Object.entries(automaticSelections) as [PlayerId, string[]][]) this.combatStackSelections.set(playerId, selection);
      if (Object.keys(automaticSelections).length) this.diagnostics.record('combat-stack.automatic', { selections: automaticSelections });
      const combatants = [this.game.pendingAttack!.attackerId, this.game.pendingAttack!.defenderId];
      this.broadcast('combat-stack-status', { submittedPlayerIds: combatants.filter((id) => this.combatStackSelections.has(id)) });
    }
    this.broadcastState();
  }

  private broadcastState() {
    if (this.game) {
      this.diagnosticRevision++;
      this.diagnostics.state(this.game, { revision: this.diagnosticRevision, commandEvent: this.diagnosticCommandEvent });
      this.broadcast('debug-meta', this.diagnosticMeta());
    }
    if (this.game?.phase === 'finished') {
      try {
        const record = finishedMatchRecord(this.game, { sessionId: this.historySessionId, hostId: historyOutbox.hostId,
          ...identity, arena: this.arena, mode: this.format === 'bo3' ? this.seriesMode === 'tournament' ? 'tournament' : 'series' : this.format });
        if (record && !this.savedMatches.has(record.id)) {
          historyOutbox.enqueue(record);
          this.savedMatches.add(record.id);
          void historyOutbox.flush();
        }
      } catch (error) { console.error('Could not queue the completed match history.', error instanceof Error ? error.message : 'Unknown error'); }
    }
    if (this.game) this.broadcast('state', this.game);
  }

  private previewCharacter(client: Client, raw: unknown) {
    const seat = this.seats.get(client.sessionId);
    if (!seat || this.game || this.characters[seat]) return;
    if (raw === null) {
      if (!this.characterSelections[seat]) return;
      delete this.characterSelections[seat];
    }
    else {
      const parsed = CharacterIdSchema.safeParse(raw);
      if (!parsed.success) return;
      if (this.characterSelections[seat] === parsed.data) return;
      this.characterSelections[seat] = parsed.data;
    }
    this.diagnostics.record('character.preview', { seat, character: this.characterSelections[seat] ?? null }, 'telemetry');
    this.broadcastLobby();
  }

  private confirmCharacter(client: Client, raw: unknown) {
    const seat = this.seats.get(client.sessionId);
    const tournament = this.format === 'bo3' && this.seriesMode === 'tournament';
    const pair = tournament && Array.isArray(raw) && raw.length === 2
      ? [CharacterIdSchema.safeParse(raw[0]), CharacterIdSchema.safeParse(raw[1])] as const : null;
    const parsed = CharacterIdSchema.safeParse(raw);
    if (!seat || this.game || this.characters[seat] || (tournament ? !pair?.[0].success || !pair?.[1].success || pair[0].data === pair[1].data : !parsed.success)) {
      this.diagnostics.record('character.rejected', { seat, reason: 'invalid-or-unavailable' });
      return client.send('error', 'Character selection was rejected.');
    }
    const requiredPlayerCount = this.format === 'ffa' ? 3 : 2;
    if (this.seats.size < requiredPlayerCount) {
      this.diagnostics.record('character.rejected', { seat, reason: 'waiting-for-players' });
      return client.send('error', `Wait for ${requiredPlayerCount - this.seats.size} more Player${requiredPlayerCount - this.seats.size === 1 ? '' : 's'} to join.`);
    }
    const firstCharacter = tournament ? pair![0].data! : parsed.data!;
    this.characterSelections[seat] = firstCharacter;
    this.characters[seat] = firstCharacter;
    if (tournament) this.tournamentCharacters[seat] = [pair![0].data!, pair![1].data!];
    this.diagnostics.record('character.selected', { seat, character: firstCharacter, pair: this.tournamentCharacters[seat] });
    this.broadcastLobby();
    const requiredSeats = [...this.seats.values()];
    if (requiredSeats.length === requiredPlayerCount && requiredSeats.every((id) => Boolean(this.characters[id]))) {
      this.game = this.format === 'ffa'
        ? createLordaeronMultiplayerState(this.characters as Record<PlayerId, CharacterId>)
        : this.format === 'bo3'
        ? createBestOfThreeState(this.seriesMode, {
          P1: this.tournamentCharacters.P1 ?? [this.characters.P1!, this.characters.P1!],
          P2: this.tournamentCharacters.P2 ?? [this.characters.P2!, this.characters.P2!],
        })
        : createMultiplayerState(this.characters as Record<PlayerId, CharacterId>, this.arena === 'trench' || this.arena === 'pipe' ? this.arena : 'nagrand');
      this.broadcastState();
    }
  }

  private broadcastLobby() {
    const requiredPlayerCount = this.format === 'ffa' ? 3 : 2;
    const arena = this.format === 'ffa' ? arenaForPlayerCount(requiredPlayerCount) : this.arena === 'trench' ? THE_TRENCH_ARENA : this.arena === 'pipe' ? THE_PIPE_ARENA : NAGRAND_ARENA;
    this.broadcast('lobby-state', { playerCount: this.seats.size, requiredPlayerCount, selections: this.characterSelections, characters: this.characters, seriesCharacters: this.tournamentCharacters, seriesMode: this.format === 'bo3' ? this.seriesMode : null, arena: this.format === 'bo3' ? 'Nagrand, Trench, Pipe (random order)' : arena.name, mode: this.format === 'ffa' ? 'Free For All' : this.format === 'bo3' ? `Best-of-Three · ${this.seriesMode === 'tournament' ? 'The Tournament' : '1 versus 1'}` : '1 versus 1', started: Boolean(this.game) });
  }

  private sendSnapshot(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat) client.send('seat', seat);
    const requiredPlayerCount = this.format === 'ffa' ? 3 : 2;
    const arena = this.format === 'ffa' ? arenaForPlayerCount(requiredPlayerCount) : this.arena === 'trench' ? THE_TRENCH_ARENA : this.arena === 'pipe' ? THE_PIPE_ARENA : NAGRAND_ARENA;
    client.send('lobby-state', { playerCount: this.seats.size, requiredPlayerCount, selections: this.characterSelections, characters: this.characters, seriesCharacters: this.tournamentCharacters, seriesMode: this.format === 'bo3' ? this.seriesMode : null, arena: this.format === 'bo3' ? 'Nagrand, Trench, Pipe (random order)' : arena.name, mode: this.format === 'ffa' ? 'Free For All' : this.format === 'bo3' ? `Best-of-Three · ${this.seriesMode === 'tournament' ? 'The Tournament' : '1 versus 1'}` : '1 versus 1', started: Boolean(this.game) });
    client.send('debug-meta', this.diagnosticMeta());
    if (this.game) client.send('state', this.game);
  }

  private diagnosticMeta() {
    const stats = this.diagnostics.snapshot();
    return { recordingId: this.historySessionId, revision: this.diagnosticRevision, event: stats.lastSequence, elapsedMs: Date.now() - stats.startedAt };
  }

  private exportDiagnostics(client: Client, raw: unknown) {
    const requestId = raw && typeof raw === 'object' ? (raw as { requestId?: unknown }).requestId : null;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)) return;
    if (!this.seats.has(client.sessionId)) return;
    const previous = this.debugExportTimes.get(client.sessionId);
    if (this.debugExports.has(client.sessionId) || previous !== undefined && Date.now() - previous < 5000) {
      client.send('debug-export-error', { requestId, error: 'Wait five seconds between debug exports.' }); return;
    }
    this.debugExportTimes.set(client.sessionId, Date.now());
    this.debugExports.add(client.sessionId);
    // Export-only work: exact current projected state also survives an exhausted timeline budget.
    let current = JSON.stringify({ k: 'server.current', revision: this.diagnosticRevision, value: projectDebugState(this.game),
      combatStackSelections: Object.fromEntries(this.combatStackSelections) });
    if (Buffer.byteLength(current) > 256 * 1024) current = JSON.stringify({ k: 'server.current', omitted: 'Current state exceeds the 256 KiB export reserve.' });
    const text = `${this.diagnostics.exportLines()}${current}\n`;
    // UTF-16 slices use <=24 KiB UTF-8 even for non-ASCII text, and never split a surrogate pair.
    const chunks: string[] = [];
    for (let index = 0; index < text.length;) {
      let end = Math.min(index + 6000, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      chunks.push(text.slice(index, end)); index = end;
    }
    let index = 0;
    const send = () => {
      if (!this.clients.includes(client)) { this.debugExports.delete(client.sessionId); return; }
      try { client.send('debug-export-chunk', { requestId, index, total: chunks.length, text: chunks[index] }); }
      catch { this.debugExports.delete(client.sessionId); return; }
      if (++index < chunks.length) this.clock.setTimeout(send, 5);
      else this.debugExports.delete(client.sessionId);
    };
    send();
  }
}

const transport = new WebSocketTransport();
const app = transport.getExpressApp();
const statsManagement = { url: process.env.GRIDFALL_STATS_URL || DEFAULT_STATS_URL,
  importKey: process.env.GRIDFALL_STATS_IMPORT_KEY, adminKey: process.env.GRIDFALL_STATS_ADMIN_KEY };
app.get('/api/stats-config', (request, response) => response.set('Cache-Control', 'no-store').json({ url: statsManagement.url, ...managementCapabilities(request, statsManagement) }));
app.use('/api/stats-management', statsManagementRouter(statsManagement));
app.use(express.static('dist'));
app.get(/.*/, (_request, response) => response.sendFile('index.html', { root: 'dist' }));
const gameServer = new Server({ transport });
gameServer.define('duel', DuelRoom);
const port = Number(process.env.PORT ?? 2567);
await gameServer.listen(port, '0.0.0.0');
console.log(`Gridfall is serving the game and multiplayer rooms on port ${port}`);
