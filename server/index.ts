import { Room, Server, type Client } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { applyCommand, CharacterIdSchema, createLordaeronMultiplayerState, createMultiplayerState, GameCommandSchema, type CharacterId, type GameState, type PlayerId } from '../shared/game.ts';
import { arenaForPlayerCount } from '../shared/arenas.ts';

type GameFormat = 'duel' | 'ffa';
type JoinOptions = { password?: string; format?: GameFormat };

class DuelRoom extends Room {
  maxClients = 3;
  private game: GameState | null = null;
  private password = '';
  private format: GameFormat = 'duel';
  private seats = new Map<string, PlayerId>();
  private characters: Partial<Record<PlayerId, CharacterId>> = {};

  onCreate(options: JoinOptions) {
    this.password = String(options.password ?? '');
    this.format = options.format === 'ffa' ? 'ffa' : 'duel';
    this.maxClients = this.format === 'ffa' ? 3 : 2;
    this.setPrivate(true);
    this.onMessage('command', (client, raw) => this.handleCommand(client, raw));
    this.onMessage('choose-character', (client, raw) => this.chooseCharacter(client, raw));
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

  onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    this.seats.delete(client.sessionId);
    if (!this.game && seat) delete this.characters[seat];
    this.broadcast('notice', 'A player disconnected.');
    this.broadcastLobby();
  }

  private handleCommand(client: Client, raw: unknown) {
    const seat = this.seats.get(client.sessionId);
    const parsed = GameCommandSchema.safeParse(raw);
    if (!this.game) return client.send('error', 'The battle has not started yet.');
    if (!seat || !parsed.success || parsed.data.playerId !== seat) {
      client.send('error', 'Rejected invalid or unauthorized command.');
      return;
    }
    const result = applyCommand(this.game, parsed.data);
    if (!result.ok) {
      client.send('error', result.error);
      return;
    }
    this.game = result.state;
    this.broadcastState();
  }

  private broadcastState() {
    if (this.game) this.broadcast('state', this.game);
  }

  private chooseCharacter(client: Client, raw: unknown) {
    const seat = this.seats.get(client.sessionId);
    const parsed = CharacterIdSchema.safeParse(raw);
    if (!seat || !parsed.success || this.game) return client.send('error', 'Character choice was rejected.');
    const requiredPlayerCount = this.format === 'ffa' ? 3 : 2;
    if (this.seats.size < requiredPlayerCount) return client.send('error', `Wait for ${requiredPlayerCount - this.seats.size} more Player${requiredPlayerCount - this.seats.size === 1 ? '' : 's'} to join.`);
    if (seat === 'P1' && (!this.characters.P2 || (this.format === 'ffa' && !this.characters.P3))) return client.send('error', 'The joining Players choose first.');
    this.characters[seat] = parsed.data;
    this.broadcastLobby();
    const requiredSeats = [...this.seats.values()];
    if (requiredSeats.length === requiredPlayerCount && requiredSeats.every((id) => Boolean(this.characters[id]))) {
      this.game = this.format === 'ffa'
        ? createLordaeronMultiplayerState(this.characters as Record<PlayerId, CharacterId>)
        : createMultiplayerState(this.characters as Record<PlayerId, CharacterId>);
      this.broadcastState();
    }
  }

  private broadcastLobby() {
    const requiredPlayerCount = this.format === 'ffa' ? 3 : 2;
    const arena = arenaForPlayerCount(requiredPlayerCount);
    this.broadcast('lobby-state', { playerCount: this.seats.size, requiredPlayerCount, characters: this.characters, arena: arena.name, mode: this.format === 'ffa' ? 'Free For All' : '1 versus 1', started: Boolean(this.game) });
  }

  private sendSnapshot(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat) client.send('seat', seat);
    const requiredPlayerCount = this.format === 'ffa' ? 3 : 2;
    const arena = arenaForPlayerCount(requiredPlayerCount);
    client.send('lobby-state', { playerCount: this.seats.size, requiredPlayerCount, characters: this.characters, arena: arena.name, mode: this.format === 'ffa' ? 'Free For All' : '1 versus 1', started: Boolean(this.game) });
    if (this.game) client.send('state', this.game);
  }
}

const transport = new WebSocketTransport();
const app = transport.getExpressApp();
app.use(express.static('dist'));
app.get(/.*/, (_request, response) => response.sendFile('index.html', { root: 'dist' }));
const gameServer = new Server({ transport });
gameServer.define('duel', DuelRoom);
const port = Number(process.env.PORT ?? 2567);
await gameServer.listen(port, '0.0.0.0');
console.log(`Gridfall is serving the game and multiplayer rooms on port ${port}`);
