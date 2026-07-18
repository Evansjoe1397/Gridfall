import { Room, Server, type Client } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { applyCommand, CharacterIdSchema, createMultiplayerState, GameCommandSchema, type CharacterId, type GameState, type PlayerId } from '../shared/game.ts';

type JoinOptions = { password?: string };

class DuelRoom extends Room {
  maxClients = 2;
  private game: GameState | null = null;
  private password = '';
  private seats = new Map<string, PlayerId>();
  private characters: Partial<Record<PlayerId, CharacterId>> = {};

  onCreate(options: JoinOptions) {
    this.password = String(options.password ?? '');
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
    const seat: PlayerId = occupied.has('P1') ? 'P2' : 'P1';
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
    if (this.seats.size < 2) return client.send('error', 'Wait for the other Player to join.');
    if (seat === 'P1' && !this.characters.P2) return client.send('error', 'The joining Player chooses first.');
    this.characters[seat] = parsed.data;
    this.broadcastLobby();
    if (this.characters.P1 && this.characters.P2) {
      this.game = createMultiplayerState(this.characters as Record<PlayerId, CharacterId>);
      this.broadcastState();
    }
  }

  private broadcastLobby() {
    this.broadcast('lobby-state', { playerCount: this.seats.size, characters: this.characters, arena: 'Nagrand Arena', mode: '1 versus 1', started: Boolean(this.game) });
  }

  private sendSnapshot(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat) client.send('seat', seat);
    client.send('lobby-state', { playerCount: this.seats.size, characters: this.characters, arena: 'Nagrand Arena', mode: '1 versus 1', started: Boolean(this.game) });
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
