import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameState } from '../shared/game.ts';
import { merylinGait, merylinMovementDuration } from '../src/merylinAnimation.ts';
import { johnMovementClip, johnMovementDuration } from '../src/johnChristLocomotion.ts';

function step(state: GameState, command: Parameters<typeof applyCommand>[1]) {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}
function setup() {
  const state = createHotseatTestState(false, 'merylin', 2);
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 3, y: 3 }; state.players.P2.position = { x: 6, y: 3 };
  state.players.P1.freeMoveUsed = true; state.players.P1.movementRemaining = 1;
  state.players.P1.hand = [];
  return state;
}
for (const level of [1, 2, 3] as const) {
  let state = setup();
  state.players.P1.spellEcho[level - 1] = { instanceId: 'windwalker', cardId: 'windwalker-stance' };
  state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
  state = step(state, { type: 'move', playerId: 'P1', to: { x: 4, y: 3 } });
  assert.equal(state.players.P1.visualMovement?.fastRun, true, `Windwalker level ${level} runs one square`);
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(state.players.P1.windwalkerActive, false);
}
for (const character of ['merylin', 'shinobi', 'orkk', 'spectre', 'john-christ', 'magician', 'wreckna'] as const) {
  let state = setup(); state.players.P1.character = character; state.phase = 'dashing';
  state = step(state, { type: 'move', playerId: 'P1', to: { x: 4, y: 3 } });
  assert.notEqual(state.phase, 'dashing', 'Last Dash step ends Dash');
  assert.equal(state.players.P1.visualMovement?.fastRun, true, `${character} retains Dash gait after turn end`);
}
let state = setup(); state.players.P1.character = 'shinobi';
state.players.P2.position = { x: 4, y: 3 }; state.players.P2.character = 'merylin';
state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
state.players.P2.hand = [{ instanceId: 'yamato', cardId: 'yamato' }];
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2', targetKind: 'player' });
state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'yamato' });
state = step(state, { type: 'yamato-move', playerId: 'P2', to: { x: 5, y: 3 } });
assert.equal(state.players.P2.visualMovement?.fastRun, true);
assert.equal(state.players.P2.visualMovement?.sourceCardId, 'yamato');
assert.equal(merylinGait(1), 'Casual_Walk'); assert.equal(merylinGait(1, true), 'Running');
assert.equal(johnMovementClip(1), 'Walk'); assert.equal(johnMovementClip(1, true), 'Run');
assert.ok(merylinMovementDuration(1, true) < merylinMovementDuration(1));
assert.ok(johnMovementDuration(1, true) < johnMovementDuration(1));
console.log('Movement animation checks passed.');

