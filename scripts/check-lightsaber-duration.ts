import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
function end(state: GameState): GameState {
  return step(state, { type: 'end-turn', playerId: state.activePlayerId });
}
function setup(existingStacks = 0): GameState {
  let state = createHotseatTestState(true, 'shinobi', 2, 'dummy');
  state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 6, y: 6 };
  state.players.P1.hand = []; state.players.P1.deck = [];
  state.players.P1.lightsaberBuff = true;
  state.players.P1.lightsaberStacks = existingStacks;
  state.players.P1.spellEcho = [null, { instanceId: 'highground', cardId: 'higround-advantage' }, null];
  state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
  assert.equal(state.players.P1.lightsaberStacks, existingStacks + 1);
  return step(state, { type: 'free-move', playerId: 'P1' });
}

for (const existingStacks of [0, 2]) {
  let state = setup(existingStacks);
  for (const x of [3, 4, 5]) {
    state = step(state, { type: 'move', playerId: 'P1', to: { x, y: 2 } });
    assert.equal(state.players.P1.lightsaberStacks, existingStacks, 'Only one stack is consumed per movement turn.');
    assert.equal(state.players.P1.lightsaberMovementProtection, true);
    assert.equal(state.players.P1.lightsaberBuff, true);
  }
  state = end(state);
  assert.equal(state.players.P1.lightsaberBuff, true, 'Repeated moves preserve Lightsaber through turn end.');
  assert.equal(state.players.P1.lightsaberMovementProtection, false, 'Protection resets for the next turn.');
  state = end(state);
  state = end(state);
  assert.equal(state.players.P1.lightsaberBuff, true, 'A subsequent stationary turn preserves Lightsaber.');
  assert.equal(state.players.P1.lightsaberStacks, existingStacks, 'Stationary turns do not consume stacks.');
  state = end(state);
  state = step(state, { type: 'free-move', playerId: 'P1' });
  state = step(state, { type: 'move', playerId: 'P1', to: { x: 4, y: 2 } });
  state = end(state);
  assert.equal(state.players.P1.lightsaberBuff, existingStacks > 0, 'A later movement turn requires another stack.');
  assert.equal(state.players.P1.lightsaberStacks, Math.max(0, existingStacks - 1));
}

let singleMove = setup();
singleMove = step(singleMove, { type: 'move', playerId: 'P1', to: { x: 5, y: 2 } });
singleMove = end(singleMove);
assert.equal(singleMove.players.P1.lightsaberBuff, true, 'One long move matches several short moves.');
assert.equal(singleMove.players.P1.lightsaberStacks, 0);
console.log('Lightsaber duration checks passed.');
