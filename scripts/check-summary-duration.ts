import assert from 'node:assert/strict';
import { applyCommand, createBestOfThreeState, createInitialState, type GameState, type GameCommand } from '../shared/game.ts';
import { elapsedSummaryDuration, formatSummaryDuration } from '../src/summary-duration.ts';

const originalNow = Date.now;
let now = 1_000_000;
Date.now = () => now;
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}
function finish(state: GameState, draw = false): GameState {
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.players.P2.hp = 0;
  if (draw) state.players.P1.hp = 0;
  return step(state, { type: 'free-move', playerId: 'P1' });
}
function ready(state: GameState): GameState {
  return step(step(state, { type: 'ready-series-match', playerId: 'P1' }), { type: 'ready-series-match', playerId: 'P2' });
}
try {
  let single = createInitialState();
  now += 65_000;
  single = finish(single);
  assert.equal(elapsedSummaryDuration(single.matchStartedAt, single.matchEndedAt), 65_000);
  assert.equal(formatSummaryDuration(65_000), '1m 5s');
  assert.equal(formatSummaryDuration(3_661_000), '1h 1m 1s');
  assert.equal(formatSummaryDuration(999), '0m 0s');
  assert.equal(formatSummaryDuration(undefined), 'Unavailable');
  assert.equal(elapsedSummaryDuration(undefined, now), undefined);

  let state = createBestOfThreeState('tournament', { P1: ['shinobi', 'magician'], P2: ['orkk', 'spectre'] }, true);
  const tournamentStart = now;
  now += 60_000;
  state = finish(state, true);
  assert.equal(state.matchEndedAt, now);
  assert.equal(state.series!.endedAt, undefined);
  now += 10_000;
  state = ready(state);
  assert.equal(state.matchStartedAt, now, 'Replay resets the match clock.');
  assert.equal(state.matchEndedAt, undefined);
  now += 120_000;
  state = finish(state);
  assert.equal(state.series!.results[0].durationMs, 120_000);
  const firstEnd = state.matchEndedAt;
  now += 30_000;
  state = step(state, { type: 'ready-series-match', playerId: 'P1' });
  assert.equal(state.matchEndedAt, firstEnd, 'Readiness does not extend a completed match.');
  state = step(state, { type: 'ready-series-match', playerId: 'P2' });
  assert.equal(state.matchStartedAt, now);
  assert.equal(state.series!.startedAt, tournamentStart);
  now += 180_000;
  state = finish(state);
  assert.deepEqual(state.series!.results.map((result) => result.durationMs), [120_000, 180_000]);
  assert.equal(elapsedSummaryDuration(state.series!.startedAt, state.series!.endedAt), 400_000, 'Total includes a drawn match and breaks.');
  const restored = JSON.parse(JSON.stringify(state)) as GameState;
  now += 100_000;
  assert.equal(elapsedSummaryDuration(restored.series!.startedAt, restored.series!.endedAt), 400_000, 'Serialized results retain the frozen total.');
} finally {
  Date.now = originalNow;
}
console.log('Summary duration checks passed.');
