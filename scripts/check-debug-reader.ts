import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DebugRecorder, projectDebugState } from '../shared/debug-recording.ts';
import { applyCommand, createMultiplayerState, type GameCommand } from '../shared/game.ts';

const reader = fileURLToPath(new URL('./read-debug-dump.ts', import.meta.url));
const fixtureDirectory = mkdtempSync(join(tmpdir(), 'gridfall-debug-reader-'));
let assertions = 0;
function run(file: string, args: string[] = []) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', reader, file, ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.ifError(result.error);
  return result;
}
function success(file: string, args: string[] = []) {
  const result = run(file, args);
  assert.equal(result.status, 0, result.stderr);
  assertions++;
  return result.stdout.trim() ? result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)) : [];
}
function fixture(name: string, content: string) {
  const file = join(fixtureDirectory, name);
  writeFileSync(file, content);
  return file;
}

try {
  const client = new DebugRecorder({ source: 'client' });
  client.reset({ build: 'reader-fixture' });
  let state = createMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'shinobi' });
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 7, y: 7 };
  state.players.P1.freeMoveUsed = true; state.players.P1.movementRemaining = 6;
  state.log.unshift(`DO_NOT_PRINT_STATE_BY_DEFAULT:${'fixture-content-'.repeat(300)}`);
  client.state(state);
  const commandSequences: number[] = [];
  let undoSequence = 0;
  let expectedUndo: unknown;
  for (const command of [
    { type: 'move', playerId: 'P1', to: { x: 2, y: 3 } },
    { type: 'move', playerId: 'P1', to: { x: 2, y: 4 } },
    { type: 'undo-last-action', playerId: 'P1' },
    { type: 'move', playerId: 'P1', to: { x: 2, y: 3 } },
  ] as GameCommand[]) {
    commandSequences.push(client.record('command.submitted', command));
    const result = applyCommand(state, command);
    assert.ok(result.ok, result.ok ? '' : result.error);
    state = result.state;
    client.state(state);
    if (command.type === 'undo-last-action') {
      undoSequence = client.snapshot().lastSequence;
      expectedUndo = JSON.parse(JSON.stringify(projectDebugState(state)));
    }
  }
  const server = new DebugRecorder({ source: 'server' });
  server.reset({ roomId: 'fixture-room' });
  server.state({ privateServerSentinel: 'SERVER_STATE_ONLY', positions: [1, 2] });
  const serverCommand = server.record('command.submitted', { type: 'server-command', playerId: 'P2' });
  server.state({ privateServerSentinel: 'SERVER_STATE_ONLY', positions: [2, 3] });
  const combined = fixture('combined.jsonl', `${JSON.stringify({ k: 'dump', version: 1 })}\n${client.exportLines()}${JSON.stringify({ k: 'section', source: 'server' })}\n${server.exportLines()}${JSON.stringify({ k: 'dump.end' })}\n`);

  const summary = success(combined);
  assert.deepEqual(summary.map(record => record.k), ['dump', 'recording', 'recording.end', 'recording', 'recording.end', 'dump.end']);
  assert.ok(summary.every(record => !('n' in record) && !('state' in record)));
  const summaryText = JSON.stringify(summary);
  assert.ok(!summaryText.includes('DO_NOT_PRINT_STATE_BY_DEFAULT') && !summaryText.includes('SERVER_STATE_ONLY'));
  assert.ok(summaryText.length < readFileSync(combined, 'utf8').length / 2, 'Default output stays compact and never prints state bodies.');

  const range = success(combined, ['--from', String(commandSequences[1]), '--to', String(commandSequences[2]), '--kind', 'command']);
  assert.deepEqual(range.map(record => record.n), commandSequences.slice(1, 3));
  assert.ok(range.every(record => record.k === 'command.submitted'));
  assert.ok(!JSON.stringify(range).includes('DO_NOT_PRINT_STATE_BY_DEFAULT'));
  const serverRange = success(combined, ['--source', 'server', '--from', String(serverCommand), '--to', String(serverCommand)]);
  assert.equal(serverRange.length, 1);
  assert.equal(serverRange[0].d.type, 'server-command', 'Source-local event numbers must not return the client event with the same number.');

  const reconstructed = success(combined, ['--state-at', String(undoSequence)]);
  assert.equal(reconstructed.length, 1);
  assert.equal(reconstructed[0].lastStateEvent, undoSequence);
  assert.deepEqual(reconstructed[0].state, expectedUndo, 'State-at applies movement deltas and undo log/position rollback, stopping before the next action.');
  const serverState = success(combined, ['--source', 'server', '--state-at', String(server.snapshot().lastSequence)]);
  assert.deepEqual(serverState[0].state, { privateServerSentinel: 'SERVER_STATE_ONLY', positions: [2, 3] });

  const truncatedAt = (sequence: number) => `${client.exportHeaderLine()}\n${client.exportEventLinesAfter(0).filter(line => JSON.parse(line).n <= sequence).join('\n')}\nMALFORMED_TAIL_MUST_NOT_BE_READ\n`;
  const stoppedRange = fixture('stop-range.jsonl', truncatedAt(commandSequences[0]));
  assert.equal(success(stoppedRange, ['--from', String(commandSequences[0]), '--to', String(commandSequences[0])])[0].n, commandSequences[0]);
  const stoppedState = fixture('stop-state.jsonl', truncatedAt(undoSequence));
  assert.deepEqual(success(stoppedState, ['--state-at', String(undoSequence)])[0].state, expectedUndo);
  const limited = success(combined, ['--kind', 'command', '--limit', '1']);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].n, commandSequences[0]);
  assert.deepEqual(success(stoppedRange, ['--from', '0', '--limit', '0']), [], 'A zero limit prints nothing and never scans irrelevant input.');

  assert.notEqual(run(combined, ['--source', 'other', '--from', '0']).status, 0);
  const missingCheckpoint = fixture('missing-checkpoint.jsonl', `${client.exportHeaderLine()}\n${JSON.stringify({ n: 1, k: 'state.delta', d: { changes: [{ p: '/value', v: 2 }] } })}\n`);
  const invalid = run(missingCheckpoint, ['--state-at', '1']);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /no initial checkpoint/i);
  console.log(JSON.stringify({ result: 'PASS', cliRuns: assertions, checks: ['compact default', 'source ranges', 'kind/limit filtering', 'undo reconstruction', 'early stream termination', 'invalid input'] }));
} finally {
  const target = resolve(fixtureDirectory);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith('gridfall-debug-reader-'));
  rmSync(target, { recursive: true, force: true });
}
