import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type Room } from '@colyseus/sdk';
import { applyDebugChanges, type DebugValue } from '../shared/debug-recording.ts';

// Isolated real WebSocket clients; never use the user's running game or a browser.
const probe = createServer();
await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
const port = (probe.address() as { port: number }).port;
await new Promise<void>(r => probe.close(() => r()));
const outbox = resolve('tmp', 'debug-server-check');
mkdirSync(outbox, { recursive: true });
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), GRIDFALL_STATS_OUTBOX: outbox, GRIDFALL_STATS_URL: 'http://127.0.0.1:9', GRIDFALL_STATS_WRITE_KEY: '' },
});
let log = '';
child.stdout.on('data', b => { log = (log + b.toString()).slice(-12000); });
child.stderr.on('data', b => { log = (log + b.toString()).slice(-12000); });
const rooms: Room[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(predicate: () => boolean, message: string, timeout = 10000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`${message}\n${log}`);
    await sleep(20);
  }
}
try {
  await until(() => log.includes('serving the game'), 'Server did not start');
  const client = new Client(`ws://127.0.0.1:${port}`);
  const first = await client.create('duel', { password: 'test-password-not-for-dump' }); rooms.push(first);
  const messages: Array<{ type: string; data: any }> = [];
  first.onMessage('*', (type, data) => messages.push({ type: String(type), data }));
  const second = await client.joinById(first.roomId, { password: 'test-password-not-for-dump' }); rooms.push(second);
  second.onMessage('*', () => {});
  first.send('ready'); second.send('ready');
  first.send('select-character', 'orkk'); second.send('select-character', 'shinobi');
  await until(() => messages.some(m => m.type === 'state'), 'Missing initial state');
  first.send('command', { type: 'free-move', playerId: 'P2' }); // Wrong seat must be rejected and recorded.
  await until(() => messages.some(m => m.type === 'error'), 'Missing command rejection');
  const stateCount = messages.filter(m => m.type === 'state').length;
  const initial = messages.find(m => m.type === 'state')!.data;
  const choosingSeat = initial.openingSetup.pendingPlayerIds[0];
  (choosingSeat === 'P1' ? first : second).send('command', { type: 'choose-focus', playerId: choosingSeat, focus: 'attack' });
  await until(() => messages.filter(m => m.type === 'state').length > stateCount, 'Accepted action did not broadcast');
  first.send('debug-ping', { id: 123 });
  await until(() => messages.some(m => m.type === 'debug-pong'), 'Missing diagnostic pong');
  assert.equal(messages.find(m => m.type === 'debug-pong')!.data.id, 123);
  assert.ok(messages.some(m => m.type === 'debug-meta'), 'State correlation metadata missing');
  let reconnected = false;
  second.reconnection.minUptime = 0;
  second.reconnection.delay = 20;
  second.onReconnect(() => { reconnected = true; });
  second.connection.close(4010, 'diagnostic-reconnection-test');
  await until(() => reconnected, 'Automatic reconnection failed');
  await second.leave(); rooms.pop();
  first.send('debug-export', { requestId: 'check-export' });
  await until(() => {
    const chunks = messages.filter(m => m.type === 'debug-export-chunk' && m.data.requestId === 'check-export');
    return chunks.length > 0 && chunks.length === chunks[0].data.total;
  }, 'Server export did not complete');
  const chunks = messages.filter(m => m.type === 'debug-export-chunk').map(m => m.data).sort((a, b) => a.index - b.index);
  const text = chunks.map(c => c.text).join('');
  assert.ok(Buffer.byteLength(text) <= 2 * 1024 * 1024, 'Server recording exceeded budget');
  const records = text.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records[0].source, 'server');
  assert.ok(records.some(r => r.k === 'state'), 'Initial state missing');
  assert.ok(records.some(r => r.k === 'state.delta'), 'Action state change missing');
  assert.ok(records.some(r => r.k === 'command.rejected'), 'Rejected action absent from history');
  assert.ok(records.some(r => r.k === 'command.accepted'), 'Accepted action absent from history');
  assert.ok(records.some(r => r.k === 'network.leave'), 'Disconnect lifecycle absent from history');
  assert.ok(records.some(r => r.k === 'network.drop'), 'Connection drop absent from history');
  assert.ok(records.some(r => r.k === 'network.reconnect'), 'Reconnection absent from history');
  let reconstructed: DebugValue = null;
  for (const record of records) {
    if (record.k === 'state') reconstructed = record.d.value;
    if (record.k === 'state.delta') reconstructed = applyDebugChanges(reconstructed, record.d.changes);
  }
  assert.deepEqual(reconstructed, records.find(r => r.k === 'server.current')!.value, 'Export timeline must reconstruct current authoritative state');
  assert.ok(!text.includes('test-password-not-for-dump'), 'Room password leaked');
  first.send('debug-export', { requestId: 'too-soon' });
  await until(() => messages.some(m => m.type === 'debug-export-error' && m.data.requestId === 'too-soon'), 'Export throttle not applied');
  console.log(`Debug server WebSocket checks passed: ${records.length} records, ${Buffer.byteLength(text)} bytes, ${chunks.length} chunks.`);
} finally {
  await Promise.allSettled(rooms.map(room => room.leave()));
  child.kill();
  await new Promise<void>(r => { if (child.exitCode !== null) r(); else child.once('exit', () => r()); });
}
