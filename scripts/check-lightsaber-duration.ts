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

// Burning resolves Dash automatically, without any manual move command.
for (const [active, stacks] of [[false, 0], [true, 0], [true, 1], [true, 3]] as const) {
  let state = createHotseatTestState(true, 'shinobi', 2, 'dummy');
  state.objects = []; state.elevations = {};
  const shinobi = state.players.P1;
  shinobi.position = { x: 4, y: 4 };
  state.players.P2.position = { x: 8, y: 7 };
  shinobi.hand = [{ instanceId: 'burning-dash', cardId: 'burning', sourcePlayerId: 'P2' }];
  shinobi.deck = [];
  shinobi.freeMoveUsed = true;
  shinobi.movementRemaining = 0;
  shinobi.lightsaberBuff = active;
  shinobi.lightsaberStacks = stacks;
  const hpBefore = shinobi.hp;
  state = step(state, { type: 'dash', playerId: 'P1' });
  const afterDash = state.players.P1;
  assert.equal(afterDash.visualMovement?.path.length, active ? 3 : 2, 'Burning Dash spends its movement automatically.');
  assert.equal(afterDash.hp, hpBefore - 1);
  assert.equal(afterDash.hand.some((card) => card.cardId === 'burning'), false);
  assert.equal(state.activePlayerId, 'P2', 'Burning Dash ends the turn.');
  assert.equal(afterDash.lightsaberBuff, active && stacks > 0, 'Automatic Dash movement prevents Lightsaber activation and requires a stack to preserve it.');
  assert.equal(afterDash.lightsaberStacks, Math.max(0, stacks - 1), 'A Burning Dash consumes only one duration stack.');
  assert.equal(afterDash.lightsaberMovementProtection, false);
}

for (const [active, stacks] of [[false, 0], [true, 0], [true, 1], [true, 3]] as const) {
  let state = createHotseatTestState(true, 'shinobi', 2, 'dummy');
  state.objects = []; state.elevations = {};
  const shinobi = state.players.P1;
  shinobi.position = { x: 4, y: 4 };
  state.players.P2.position = { x: 8, y: 7 };
  shinobi.hand = [{ instanceId: 'panic-free-move', cardId: 'panic', sourcePlayerId: 'P2' }];
  shinobi.deck = [];
  shinobi.lightsaberBuff = active;
  shinobi.lightsaberStacks = stacks;
  state = step(state, { type: 'free-move', playerId: 'P1' });
  assert.equal(state.players.P1.visualMovement?.path.length, active ? 3 : 2, 'Panic spends Free Move automatically.');
  assert.equal(state.players.P1.movedThisTurn, true, 'Panic movement counts without any manual move command.');
  assert.equal(state.players.P1.hand.some((card) => card.cardId === 'panic'), false);
  assert.equal(state.players.P1.lightsaberStacks, Math.max(0, stacks - 1));
  state = end(state);
  assert.equal(state.players.P1.lightsaberBuff, active && stacks > 0, 'Panic prevents Lightsaber activation and requires a stack to preserve it.');
  assert.equal(state.players.P1.lightsaberMovementProtection, false);
}

let stationaryDash = createHotseatTestState(true, 'shinobi', 2, 'dummy');
stationaryDash.objects = []; stationaryDash.elevations = {};
stationaryDash.players.P1.hand = [{ instanceId: 'stationary-burning', cardId: 'burning', sourcePlayerId: 'P2' }];
stationaryDash.players.P1.deck = [];
stationaryDash.players.P1.freeMoveUsed = true;
stationaryDash.players.P1.movementRemaining = 0;
stationaryDash.players.P1.moveRange = 0;
stationaryDash = step(stationaryDash, { type: 'dash', playerId: 'P1' });
assert.equal(stationaryDash.players.P1.visualMovement?.path.length ?? 0, 0);
assert.equal(stationaryDash.players.P1.lightsaberBuff, true, 'A Dash that cannot move still qualifies as a stationary turn.');
console.log('Lightsaber duration checks passed.');
