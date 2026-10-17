import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { STARTING_DECKS, type CharacterId } from '../shared/game.ts';

const probe = createServer();
await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((resolve) => probe.close(() => resolve()));
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), GRIDFALL_STATS_OUTBOX: 'tmp/perk-mode-server-check', GRIDFALL_STATS_URL: 'http://127.0.0.1:9', GRIDFALL_STATS_WRITE_KEY: '' },
});
let log = '';
child.stdout.on('data', (data) => { log = (log + data).slice(-10000); });
child.stderr.on('data', (data) => { log = (log + data).slice(-10000); });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean, message: string) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 10000) throw new Error(`${message}\n${log}`);
    await sleep(20);
  }
}
const rooms: Room[] = [];
try {
  await until(() => log.includes('serving the game'), 'Server did not start');
  const client = new Client(`ws://127.0.0.1:${port}`);
  for (const options of [{ format: 'duel', arena: 'pipe' }, { format: 'ffa' }, { format: 'bo3', seriesMode: 'duel' }, { format: 'bo3', seriesMode: 'tournament' }]) {
    const first = await client.create('duel', options); rooms.push(first);
    let lobby: any;
    let latest: any;
    first.onMessage('*', (type, data) => { if (type === 'lobby-state') lobby = data; if (type === 'state') latest = data; });
    const second = await client.joinById(first.roomId); rooms.push(second); second.onMessage('*', () => {});
    const third = options.format === 'ffa' ? await client.joinById(first.roomId) : null;
    if (third) { rooms.push(third); third.onMessage('*', () => {}); }
    first.send('ready');
    await until(() => Boolean(lobby), 'Missing lobby');
    assert.equal(lobby.perkMode, false);
    second.send('set-perk-mode', true); first.send('ready');
    await sleep(50);
    assert.equal(lobby.perkMode, false, 'Guest cannot change the shared rules.');
    first.send('set-perk-mode', true);
    await until(() => lobby?.perkMode === true, 'Host mode setting was not broadcast');
    const tournament = options.seriesMode === 'tournament';
    first.send('select-character', tournament ? ['merylin', 'magician'] : 'merylin');
    await until(() => Boolean(lobby?.characters.P1), 'Host character missing');
    first.send('set-perk-mode', false);
    second.send('select-character', tournament ? ['shinobi', 'orkk'] : 'shinobi');
    third?.send('select-character', 'orkk');
    await until(() => Boolean(latest), 'Match did not start');
    assert.equal(latest.perkMode, true, 'Confirmed selections lock the shared mode.');
    assert.ok(Object.values(latest.players).every((player: any) => player.perkMode));
    let safety = 0;
    while (latest.openingSetup || Object.values(latest.players).some((player: any) => player.perkMode.pendingChoices)) {
      assert.ok(safety++ < 20);
      const pending = Object.values(latest.players).find((player: any) => player.perkMode.pendingChoices) as any;
      const id = pending?.id ?? latest.openingSetup.pendingPlayerIds[0];
      const current = latest;
      const connection = id === 'P1' ? first : id === 'P2' ? second : third!;
      const cardId = pending ? pending.perkMode.remaining.find((id: string) => !STARTING_DECKS[pending.character as CharacterId].attackFocus.includes(id as any) && !STARTING_DECKS[pending.character as CharacterId].defendFocus.includes(id as any))
        : STARTING_DECKS[latest.players[id].character as CharacterId].attackFocus[0];
      connection.send('command', { type: pending ? 'choose-drawn-perk' : 'choose-focus-card', playerId: id, cardId });
      await until(() => latest !== current, 'Opening or drawn Perk choice was not accepted');
    }
    for (const player of Object.values(latest.players) as any[]) {
      assert.equal(player.deck.at(-1).cardId, STARTING_DECKS[player.character as CharacterId].attackFocus[0]);
      assert.ok(!player.hand.some((card: any) => card.cardId === 'perk-draw'));
    }
    for (const connection of rooms.splice(0)) await connection.leave();
  }
  console.log('Perk Mode multiplayer checks passed: host authority, shared/locked setting, duel, FFA, both series formats, opening choices and queued Perks.');
} finally {
  for (const room of rooms) await room.leave().catch(() => {});
  child.kill();
}
