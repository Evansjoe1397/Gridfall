import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { Client, CloseCode, type Room } from '@colyseus/sdk';
import { OnlineSessions, trackOnlineSession } from '../src/online-session.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const shared = memoryStorage();
const legacy = memoryStorage();
const firstTab = new OnlineSessions(() => shared, () => legacy);
const otherTab = new OnlineSessions(() => shared, memoryStorage);
legacy.setItem('gridfall.reconnection.legacy', 'old');
assert.equal(firstTab.read('legacy'), 'old');
firstTab.save('test', 'first');
assert.equal(otherTab.read('test'), 'first');
otherTab.save('test', 'rotated');
firstTab.forget('test', 'first');
assert.equal(otherTab.read('test'), 'rotated', 'Old tabs cannot delete the new token');
otherTab.forget('test', 'rotated');
assert.equal(otherTab.read('test'), null);
const unavailable = new OnlineSessions(() => { throw Error('Storage disabled'); }, () => { throw Error('Storage disabled'); });
unavailable.save('test', 'token');
assert.equal(unavailable.read('test'), null);
unavailable.forget('test', 'token');

const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>(resolve => probe.close(() => resolve()));
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), GRIDFALL_STATS_OUTBOX: 'tmp/reconnection-check', GRIDFALL_STATS_URL: 'http://127.0.0.1:9', GRIDFALL_STATS_WRITE_KEY: '' },
});
let log = '';
child.stdout.on('data', data => { log = (log + data).slice(-8000); });
child.stderr.on('data', data => { log = (log + data).slice(-8000); });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, message: string) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 12000) throw Error(`${message}\n${log}`);
    await sleep(20);
  }
}
const rooms: Room[] = [];
function observe(room: Room) {
  rooms.push(room);
  const state = { seat: '', game: undefined as any, lobby: undefined as any };
  room.onMessage('*', (type, data) => {
    if (type === 'seat') state.seat = data;
    if (type === 'state') state.game = data;
    if (type === 'lobby-state') state.lobby = data;
  });
  room.send('ready');
  return state;
}
try {
  await until(() => log.includes('serving the game'), 'Server failed to start');
  const client = new Client(`ws://127.0.0.1:${port}`);
  const host = await client.create('duel', { format: 'ffa', password: 'private' });
  const hostState = observe(host);
  const second = await client.joinById(host.roomId, { password: 'private' });
  observe(second);
  const third = await client.joinById(host.roomId, { password: 'private' });
  observe(third);
  host.send('select-character', 'merylin');
  second.send('select-character', 'shinobi');
  third.send('select-character', 'orkk');
  await until(() => Boolean(hostState.game), 'FFA match did not start');
  firstTab.save(host.roomId, host.reconnectionToken);
  const sessionId = host.sessionId;
  const start = Date.now();
  const replacement = await client.reconnect(otherTab.read(host.roomId)!);
  const replacementState = observe(replacement);
  await until(() => replacementState.seat === 'P1' && Boolean(replacementState.game), 'Active-tab takeover lost the seat or match');
  assert.ok(Date.now() - start < 3000, 'Active connection takeover should not wait for heartbeat expiry');
  assert.equal(replacement.sessionId, sessionId);
  assert.equal(replacementState.game.players.P1.character, 'merylin');
  trackOnlineSession(replacement, otherTab);
  let recoveries = 0;
  replacement.onReconnect(() => queueMicrotask(() => {
    recoveries++;
  }));
  for (let index = 0; index < 2; index++) {
    const token = replacement.reconnectionToken;
    replacement.connection.close(CloseCode.MAY_TRY_RECONNECT);
    await until(() => recoveries === index + 1, 'Automatic reconnect did not complete');
    assert.notEqual(replacement.reconnectionToken, token);
    assert.equal(otherTab.read(host.roomId), replacement.reconnectionToken, 'Persist the rotated token after the SDK callback');
    assert.equal(replacement.sessionId, sessionId);
  }

  // Simulate closing a tab without an explicit Leave, then opening the URL.
  replacement.reconnection.enabled = false;
  await replacement.leave(false);
  const restored = await client.reconnect(firstTab.read(host.roomId)!);
  const restoredState = observe(restored);
  await until(() => restoredState.seat === 'P1' && Boolean(restoredState.game), 'Return after tab closure lost the seat or state');
  assert.equal(restored.sessionId, sessionId);
  assert.equal(restoredState.game.players.P1.character, 'merylin');
  await assert.rejects(client.reconnect(`${host.roomId}:invalid-secret`), 'Invalid credentials cannot reclaim a seat');
  await assert.rejects(client.joinById(host.roomId, { password: 'private' }), 'Another browser cannot take an occupied seat');

  const lobby = await client.create('duel', {});
  observe(lobby);
  const guest = await client.joinById(lobby.roomId);
  const guestState = observe(guest);
  await until(() => guestState.seat === 'P2', 'Guest did not get a separate seat');
  await guest.leave();
  const newGuest = await client.joinById(lobby.roomId);
  const newState = observe(newGuest);
  await until(() => newState.seat === 'P2', 'Explicit Leave did not release the seat');
  console.log('Reconnection checks passed: shared storage, migration, blocked storage, live takeover, repeated automatic reconnect/token rotation, closed-tab return, FFA state, invalid tokens and explicit Leave.');
} finally {
  for (const room of rooms) {
    if (room.connection.isOpen) await room.leave().catch(() => {});
  }
  child.kill();
}
