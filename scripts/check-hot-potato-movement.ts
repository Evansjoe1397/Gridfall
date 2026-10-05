import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, movementPath, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}

function setup(): GameState {
  const state = createHotseatTestState(true, 'magician', 2, 'shinobi');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.players.P1.position = { x: 3, y: 3 };
  state.players.P2.position = { x: 8, y: 7 };
  state.players.P1.movementRemaining = 4;
  state.players.P1.freeMoveUsed = true;
  state.players.P1.hand = [
    { instanceId: 'dash-payment', cardId: 'attack-2' },
    { instanceId: 'potato-payment', cardId: 'defend-1' },
  ];
  state.questPhases = {
    actionDamageByPlayer: {}, usedQuestIds: ['hot-potato'],
    currentQuest: { id: 'hot-potato', announcedRound: state.turn, endsAfterRound: state.turn + 4, winners: [], progress: {} },
    lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {},
    hotPotato: { anchor: { x: 4.5, y: 3.5 }, carrierId: null },
  };
  return state;
}

for (const dash of [false, true]) {
  let state = setup();
  if (dash) {
    state = step(state, { type: 'dash', playerId: 'P1' });
    state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'dash-payment' });
  }
  const to = { x: 6, y: 3 };
  assert.ok(movementPath(state, state.players.P1, to).some((cell) => cell.x === 4 && cell.y === 3));
  const moved = step(state, { type: 'move', playerId: 'P1', to });
  assert.equal(moved.questPhases?.hotPotato?.carrierId, 'P1', `${dash ? 'Dash' : 'Walking'} picks up Potato along the path.`);
  assert.equal(moved.players.P1.hand.filter((card) => card.cardId === 'hot-potato').length, 1);
  assert.equal(state.questPhases?.hotPotato?.carrierId, null, 'Movement does not mutate its source.');
}

let exhausted = setup();
exhausted = step(exhausted, { type: 'dash', playerId: 'P1' });
exhausted = step(exhausted, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'dash-payment' });
exhausted.players.P1.movementRemaining = 3;
exhausted = step(exhausted, { type: 'move', playerId: 'P1', to: { x: 6, y: 3 } });
assert.equal(exhausted.phase as string, 'choosing-hot-potato-discard', 'Finishing Dash still requires the Potato discard.');
assert.equal(exhausted.questPhases?.hotPotato?.carrierId, 'P1');
exhausted = step(exhausted, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'potato-payment' });
assert.equal(exhausted.activePlayerId, 'P2');
assert.equal(exhausted.questPhases?.hotPotato?.carrierId, 'P1', 'The paid Potato remains with its carrier after Dash ends.');

const missed = step(setup(), { type: 'move', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(missed.questPhases?.hotPotato?.carrierId, null, 'Movement outside the pickup squares leaves Potato alone.');
console.log('Hot Potato movement checks passed.');
