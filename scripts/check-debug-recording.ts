import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { applyDebugChanges, DebugRecorder, projectDebugState, type DebugChange, type DebugValue } from '../shared/debug-recording.ts';
import { applyCommand, createMultiplayerState, type GameCommand } from '../shared/game.ts';

function reconstruct(recorder: DebugRecorder): DebugValue {
  let state: DebugValue = null;
  for (const line of recorder.exportEventLinesAfter(0)) {
    const event = JSON.parse(line);
    if (event.k === 'state') state = event.d.value;
    if (event.k === 'state.delta') state = applyDebugChanges(state, event.d.changes);
  }
  return state;
}

const recorder = new DebugRecorder({ source: 'test' });
recorder.reset({ password: 'do-not-export', commit: 'example' });
let state = createMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'shinobi' });
state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 7, y: 7 };
state.players.P1.freeMoveUsed = true; state.players.P1.movementRemaining = 6;
recorder.state(state);
for (const command of [
  { type: 'move', playerId: 'P1', to: { x: 2, y: 3 } },
  { type: 'move', playerId: 'P1', to: { x: 2, y: 4 } },
  { type: 'undo-last-action', playerId: 'P1' },
  { type: 'move', playerId: 'P1', to: { x: 2, y: 3 } },
  { type: 'cancel-movement', playerId: 'P1' },
] as GameCommand[]) {
  recorder.record('command.submitted', command);
  const result = applyCommand(state, command);
  assert.ok(result.ok, result.ok ? '' : result.error);
  state = result.state;
  recorder.record('command.accepted', { type: command.type });
  recorder.state(state);
  assert.deepEqual(reconstruct(recorder), JSON.parse(JSON.stringify(projectDebugState(state))), `Reconstruct ${command.type}, including undo/log rollback.`);
}
const invalid = applyCommand(state, { type: 'move', playerId: 'P2', to: { x: 3, y: 3 } });
assert.equal(invalid.ok, false);
recorder.record('command.rejected', invalid.ok ? {} : { error: invalid.error });
assert.ok(!recorder.exportLines().includes('do-not-export'));
assert.ok(!recorder.exportLines().includes('\\"boardSize\\"'), 'Undo JSON bodies are not embedded.');

const changes = new DebugRecorder();
for (const value of [
  { log: ['old'], a: [1], nested: { 'x/y': 1, 'a~b': false }, gone: true },
  { log: ['new', 'old'], a: [1, 2], nested: { 'x/y': 2, 'a~b': true } },
  { log: ['old'], a: [], nested: { 'x/y': 3 } },
]) { changes.state(value); assert.deepEqual(reconstruct(changes), value); }
const dangerous: DebugChange[] = [{ p: '/__proto__/polluted', v: true }];
assert.throws(() => applyDebugChanges({}, dangerous), /Unsafe/);
assert.equal(({} as { polluted?: boolean }).polluted, undefined);
const cyclic: { cycle?: unknown; numeric: number } = { numeric: Infinity }; cyclic.cycle = cyclic;
assert.doesNotThrow(() => recorder.record('malformed', cyclic));
const hostile = Object.defineProperty({}, 'throws', { enumerable: true, get() { throw new Error('Diagnostic getter failure'); } });
const guarded = new DebugRecorder();
assert.doesNotThrow(() => guarded.reset(hostile));
assert.doesNotThrow(() => guarded.record('hostile', hostile));
assert.equal(guarded.snapshot().incomplete, true, 'Recorder errors cannot break gameplay and are visible as missing records.');
guarded.reset();
assert.doesNotThrow(() => guarded.state(hostile));
assert.equal(guarded.snapshot().incomplete, true);

const capped = new DebugRecorder({ maxBytes: 12_000 });
capped.reset({ enormousMetadata: 'x'.repeat(200_000) });
for (let index = 0; index < 1000; index++) capped.record('frame', { index, value: 't'.repeat(100) }, 'telemetry');
assert.equal(capped.snapshot().incomplete, false, 'Telemetry cap preserves gameplay reserve.');
assert.ok(capped.snapshot().dropped.telemetry > 0);
capped.record('command.submitted', { type: 'end-turn' });
assert.ok(capped.exportLines().includes('end-turn'), 'Critical action fits after telemetry cap.');
for (let index = 0; index < 1000; index++) capped.record('command.submitted', { index, value: 'c'.repeat(100) });
assert.equal(capped.snapshot().incomplete, true);
assert.ok(capped.snapshot().dropped.critical > 0);
assert.ok(Buffer.byteLength(capped.exportLines()) <= capped.maxBytes, 'Entire export respects UTF-8 budget.');
const serverBudget = 2 * 1024 * 1024;
const boundedServer = new DebugRecorder({ source: 'server', maxBytes: serverBudget - 256 * 1024 - 1024 });
for (let index = 0; index < 150; index++) boundedServer.record('command.submitted', { index, payload: '漢'.repeat(16_384) });
assert.equal(boundedServer.snapshot().incomplete, true);
const fullCurrentCheckpoint = JSON.stringify({ k: 'server.current', value: 'c'.repeat(256 * 1024 - 100) }) + '\n';
assert.ok(Buffer.byteLength(boundedServer.exportLines() + fullCurrentCheckpoint) <= serverBudget,
  'Full server prefix plus its reserved current checkpoint remains inside the 2 MiB allocation, including Unicode.');
const cursor = recorder.snapshot().lastSequence;
recorder.record('next', { n: 1 });
assert.equal(recorder.exportEventLinesAfter(cursor).length, 1);

// Representative recording load: 1,000 state changes with growing logs and damage history,
// movement undo bodies, commands, and frame summaries. Timing measures recorder work only.
const long = new DebugRecorder();
const load = createMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'shinobi' }) as typeof state & { damageLog: unknown[] };
load.damageLog = [];
const timings: number[] = [];
let repeatedStateBytes = 0;
for (let index = 0; index < 1000; index++) {
  load.turn = Math.floor(index / 10) + 1;
  load.players.P1.position = { x: 1 + index % 6, y: 1 + index % 5 };
  load.log.unshift(`Action ${index}: P1 moved to ${load.players.P1.position.x},${load.players.P1.position.y}.`);
  load.damageLog.push({ eventType: 'damage', turn: load.turn, targetId: 'P2', sourceId: 'P1', amount: 1, hpAfter: 20 - index % 20 });
  load.movementUndo = { playerId: 'P1', stateJson: JSON.stringify({ ...load, movementUndo: null }), actionsRemaining: 3, perkUsed: false };
  repeatedStateBytes += Buffer.byteLength(JSON.stringify(load));
  const started = performance.now();
  long.record('command.submitted', { type: 'move', playerId: 'P1', to: load.players.P1.position });
  long.record('command.accepted');
  long.state(load);
  if (index % 10 === 0) long.record('performance', { frames: 600, averageMs: 16.7, p95Ms: 18, maxMs: 35 }, 'telemetry');
  timings.push(performance.now() - started);
}
assert.equal(long.snapshot().incomplete, false);
assert.deepEqual(reconstruct(long), JSON.parse(JSON.stringify(projectDebugState(load))));
assert.ok(long.snapshot().bytes < 1_000_000, 'Growing histories are delta encoded; no quadratic dump growth.');
const ordered = timings.toSorted((a, b) => a - b);
console.log(JSON.stringify({ result: 'PASS', transitions: timings.length,
  exportBytes: Buffer.byteLength(long.exportLines()), repeatedSnapshotBytes: repeatedStateBytes,
  recorderMeanMs: Number((timings.reduce((sum, value) => sum + value, 0) / timings.length).toFixed(3)),
  recorderP95Ms: Number(ordered[Math.floor(ordered.length * 0.95)].toFixed(3)),
  recorderMaxMs: Number(ordered.at(-1)!.toFixed(3)), note: 'Node synthetic load; device/browser performance can differ.' }, null, 2));
