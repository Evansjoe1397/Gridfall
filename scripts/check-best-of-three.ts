import assert from 'node:assert/strict';
import { applyCommand, createBestOfThreeState, phaseCardCandidates, type GameState, type PlayerId } from '../shared/game.ts';

function step(state: GameState, command: Parameters<typeof applyCommand>[1]): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}
function finishMatch(state: GameState, winner: 'P1' | 'P2', round: number): GameState {
  const loser: PlayerId = winner === 'P1' ? 'P2' : 'P1';
  state.phase = 'active';
  state.activePlayerId = winner;
  state.turn = round;
  state.players[loser].hp = 0;
  return step(state, { type: 'free-move', playerId: winner });
}

const roster = { P1: ['shinobi', 'magician'], P2: ['orkk', 'spectre'] } as const;
assert.throws(() => createBestOfThreeState('tournament', { P1: ['shinobi', 'shinobi'], P2: roster.P2 }, true));
let state = createBestOfThreeState('tournament', roster, true);
assert.deepEqual([...state.series!.arenaOrder].sort(), ['nagrand', 'pipe', 'trench']);
assert.equal((state as GameState & { arenaId?: string }).arenaId, state.series!.arenaOrder[0]);
assert.equal(state.series?.match, 1);
assert.equal(state.players.P1.character, 'shinobi');
assert.equal(state.players.P2.character, 'orkk');
state.players.P1.deck = [{ instanceId: 'winner-one-card', cardId: 'attack-2' }];
state.players.P1.hand = [{ instanceId: 'winner-one-status', cardId: 'pinned' }];
state.players.P1.spellEcho = [{ instanceId: 'winner-one-echo', cardId: 'swiftform' }, null, null];
state.players.P1.matchStats!.attackDamage = 7;
state = finishMatch(state, 'P1', 11);
assert.deepEqual(state.series?.wins, { P1: 1, P2: 0 });
assert.equal(state.series?.results[0].arenaId, state.series?.arenaOrder[0]);
assert.equal(state.series?.results[0].players.P1.matchStats.attackDamage, 7);
assert.equal(state.series?.winningSnapshots.P1?.phase, 2);
state = step(state, { type: 'ready-series-match', playerId: 'P1' });
assert.equal(state.series?.match, 1, 'One ready Player cannot start Match 2.');
assert.equal(applyCommand(state, { type: 'ready-series-match', playerId: 'P1' }).ok, false);
state = step(state, { type: 'ready-series-match', playerId: 'P2' });
assert.equal(state.series?.match, 2);
assert.equal((state as GameState & { arenaId?: string }).arenaId, state.series!.arenaOrder[1]);
assert.equal(state.players.P1.character, 'magician');
assert.equal(state.players.P2.character, 'spectre');
assert.equal(state.players.P1.hp, state.players.P1.maxHp);
assert.equal(state.players.P2.hp, state.players.P2.maxHp);
assert.equal(state.turn, 1);

state.players.P2.deck = [{ instanceId: 'winner-two-status', cardId: 'pinned' }, { instanceId: 'winner-two-card', cardId: 'attack-2' }];
state.players.P2.spellEcho = [null, { instanceId: 'winner-two-echo', cardId: 'replicate' }, null];
state.players.P2.matchStats!.perkDamage = 5;
state = finishMatch(state, 'P2', 2);
assert.deepEqual(state.series?.wins, { P1: 1, P2: 1 });
assert.equal(state.series?.results[1].players.P2.matchStats.perkDamage, 5);
state = step(state, { type: 'ready-series-match', playerId: 'P2' });
assert.equal(state.series?.match, 2);
state = step(state, { type: 'ready-series-match', playerId: 'P1' });
assert.equal(state.series?.match, 3);
assert.equal((state as GameState & { arenaId?: string }).arenaId, state.series!.arenaOrder[2]);
assert.equal(state.players.P1.character, 'shinobi');
assert.equal(state.players.P2.character, 'spectre');
assert.equal(state.players.P1.hp, state.players.P1.maxHp);
assert.equal(state.players.P2.hp, state.players.P2.maxHp);
assert.equal(state.turn, 11, 'The deciding match starts in the latest won-match Phase.');
assert.equal(state.players.P1.spellEcho[0]?.instanceId, 'winner-one-echo');
assert.equal(state.players.P2.spellEcho[1]?.instanceId, 'winner-two-echo');
assert.ok([...state.players.P1.deck, ...state.players.P1.hand].some((card) => card.instanceId === 'winner-one-status'));
assert.ok([...state.players.P2.deck, ...state.players.P2.hand].some((card) => card.instanceId === 'winner-two-status'));
assert.equal(state.phase, 'choosing-phase-card');
assert.equal((state as GameState & { questPhases?: { phaseReward?: { phase: number; pendingPlayerIds: PlayerId[] } } }).questPhases?.phaseReward?.phase, 1);
assert.deepEqual((state as GameState & { questPhases?: { phaseReward?: { pendingPlayerIds: PlayerId[] } } }).questPhases?.phaseReward?.pendingPlayerIds, ['P2']);
state = step(state, { type: 'phase-card-choice', playerId: 'P2', cardId: phaseCardCandidates(state, 'P2')[0] });
assert.equal((state as GameState & { questPhases?: { phaseReward?: { phase: number } } }).questPhases?.phaseReward?.phase, 2, 'Phase 2 follows the Phase 1 catch-up choice.');
state = step(state, { type: 'phase-card-choice', playerId: 'P2', cardId: phaseCardCandidates(state, 'P2')[0] });
assert.equal(state.phase, 'active', 'The deciding match starts after all missed rewards are selected.');
state = finishMatch(state, 'P1', 11);
assert.deepEqual(state.series?.results.map((result) => result.winnerId), ['P1', 'P2', 'P1']);
assert.deepEqual(state.series?.results.map((result) => result.arenaId), state.series?.arenaOrder);
assert.deepEqual(state.series?.wins, { P1: 2, P2: 1 });

const sweep = createBestOfThreeState('duel', { P1: ['shinobi', 'shinobi'], P2: ['orkk', 'orkk'] }, true);
let sweepState = finishMatch(sweep, 'P1', 1);
sweepState = step(sweepState, { type: 'ready-series-match', playerId: 'P1' });
sweepState = step(sweepState, { type: 'ready-series-match', playerId: 'P2' });
sweepState = finishMatch(sweepState, 'P1', 1);
assert.equal(sweepState.series?.results.length, 2, 'A 2-0 series has two match results.');
assert.equal(applyCommand(sweepState, { type: 'ready-series-match', playerId: 'P1' }).ok, false, 'A 2-0 series ends after Match 2.');

let drawState = createBestOfThreeState('duel', { P1: ['shinobi', 'shinobi'], P2: ['orkk', 'orkk'] }, true);
const drawnArena = (drawState as GameState & { arenaId?: string }).arenaId;
drawState.phase = 'finished';
drawState.winner = null;
drawState = step(drawState, { type: 'ready-series-match', playerId: 'P1' });
drawState = step(drawState, { type: 'ready-series-match', playerId: 'P2' });
assert.equal(drawState.series?.match, 1, 'A drawn match is replayed without advancing the series.');
assert.equal((drawState as GameState & { arenaId?: string }).arenaId, drawnArena, 'A replay keeps its assigned arena.');
assert.deepEqual(drawState.series?.wins, { P1: 0, P2: 0 });

console.log('Best-of-Three checks passed.');
