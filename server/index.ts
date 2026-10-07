import { Room, Server, type Client } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { HistoryOutbox, buildIdentity } from './history-outbox.ts';
import { finishedMatchRecord } from './match-record.ts';
import { DEFAULT_STATS_URL } from '../shared/stats-config.ts';
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

  onCreate(options: JoinOptions) {
    this.password = String(options.password ?? '');
    this.format = options.format === 'ffa' ? 'ffa' : options.format === 'bo3' ? 'bo3' : 'duel';
    this.seriesMode = options.seriesMode === 'tournament' ? 'tournament' : 'duel';
    this.arena = this.format === 'ffa' ? 'lordaeron' : options.arena === 'trench' || options.arena === 'pipe' ? options.arena : 'nagrand';
    this.maxClients = this.format === 'ffa' ? 3 : 2;
    this.setPrivate(true);
    this.onMessage('command', (client, raw) => this.handleCommand(client, raw));
    this.onMessage('hover-character', (client, raw) => this.previewCharacter(client, raw));
    this.onMessage('select-character', (client, raw) => this.confirmCharacter(client, raw));
    this.onMessage('ready', (client) => this.sendSnapshot(client));
  }

  onAuth(_client: Client, options: JoinOptions) {
    return String(options.password ?? '') === this.password;
  }

  onJoin(client: Client) {
    const occupied = new Set(this.seats.values());
    const seat: PlayerId = !occupied.has('P1') ? 'P1' : !occupied.has('P2') ? 'P2' : 'P3';
    this.seats.set(client.sessionId, seat);
    client.send('seat', seat);
    this.broadcastLobby();
  }

  onDrop(client: Client) {
    this.broadcast('notice', 'A player lost connection. Waiting for them to reconnect.');
    this.allowReconnection(client, 90);
  }

  onReconnect(client: Client) {
    this.broadcast('notice', 'A player reconnected.');
    this.sendSnapshot(client);
  }

  onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
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
    if (raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'combat-stack-submit') {
      if (!this.game || !seat || this.game.phase !== 'choosing-combat-stack' || !this.game.pendingAttack || ![this.game.pendingAttack.attackerId, this.game.pendingAttack.defenderId].includes(seat)) return client.send('error', 'No Combat Stack selection is available.');
      if (this.combatStackSelections.has(seat)) return client.send('error', 'Your Combat Stack selection is already locked.');
      const cardInstanceIds = (raw as { cardInstanceIds?: unknown }).cardInstanceIds;
      if (!Array.isArray(cardInstanceIds) || cardInstanceIds.some((id) => typeof id !== 'string')) return client.send('error', 'Invalid Combat Stack selection.');
      if (new Set(cardInstanceIds).size > 1) return client.send('error', 'You may apply only one Combat Card per combat.');
      this.combatStackSelections.set(seat, [...new Set(cardInstanceIds)]);
      this.broadcast('character-activity', { playerId: seat });
      const combatants = [this.game.pendingAttack.attackerId, this.game.pendingAttack.defenderId];
      this.broadcast('combat-stack-status', { submittedPlayerIds: combatants.filter((id) => this.combatStackSelections.has(id)) });
      if (combatants.every((id) => this.combatStackSelections.has(id))) {
        const selections = Object.fromEntries(combatants.map((id) => [id, this.combatStackSelections.get(id)!]));
        this.combatStackSelections.clear();
        const result = resolveMultiplayerCombatStack(this.game, selections);
        if (!result.ok) return this.broadcast('error', result.error);
        this.game = result.state;
        this.broadcastState();
      }
      return;
    }
    const parsed = GameCommandSchema.safeParse(raw);
    if (!this.game) return client.send('error', 'The battle has not started yet.');
    if (!seat || !parsed.success || parsed.data.playerId !== seat) {
      client.send('error', 'Rejected invalid or unauthorized command.');
      return;
    }
    const orkkActionEvent = orkkActionEventForCommand(this.game, parsed.data);
    const wizardActionEvent = wizardActionEventForCommand(this.game, parsed.data);
    const forcePowerActionEvent = forcePowerActionEventForCommand(this.game, parsed.data);
    const spectreActionEvent = spectreActionEventForCommand(this.game, parsed.data);
    const previousGame = this.game;
    const result = applyCommand(this.game, parsed.data);
    if (!result.ok) {
      client.send('error', result.error);
      return;
    }
    this.game = result.state;
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
      const combatants = [this.game.pendingAttack!.attackerId, this.game.pendingAttack!.defenderId];
      this.broadcast('combat-stack-status', { submittedPlayerIds: combatants.filter((id) => this.combatStackSelections.has(id)) });
    }
    this.broadcastState();
  }

  private broadcastState() {
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
    this.broadcastLobby();
  }

  private confirmCharacter(client: Client, raw: unknown) {
    const seat = this.seats.get(client.sessionId);
    const tournament = this.format === 'bo3' && this.seriesMode === 'tournament';
    const pair = tournament && Array.isArray(raw) && raw.length === 2
      ? [CharacterIdSchema.safeParse(raw[0]), CharacterIdSchema.safeParse(raw[1])] as const : null;
    const parsed = CharacterIdSchema.safeParse(raw);
    if (!seat || this.game || this.characters[seat] || (tournament ? !pair?.[0].success || !pair?.[1].success || pair[0].data === pair[1].data : !parsed.success)) return client.send('error', 'Character selection was rejected.');
    const requiredPlayerCount = this.format === 'ffa' ? 3 : 2;
    if (this.seats.size < requiredPlayerCount) return client.send('error', `Wait for ${requiredPlayerCount - this.seats.size} more Player${requiredPlayerCount - this.seats.size === 1 ? '' : 's'} to join.`);
    const firstCharacter = tournament ? pair![0].data! : parsed.data!;
    this.characterSelections[seat] = firstCharacter;
    this.characters[seat] = firstCharacter;
    if (tournament) this.tournamentCharacters[seat] = [pair![0].data!, pair![1].data!];
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
    if (this.game) client.send('state', this.game);
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
