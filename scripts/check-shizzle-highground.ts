import assert from 'node:assert/strict';
import { applyCommand, createTrenchTestState, type Cell, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: GameCommand): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};
const setup = (origin: string, consume = false): GameState => {
  const state = createTrenchTestState(false, 'magician', 'dummy');
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = [];
  state.players.P1.position = cell(origin);
  state.players.P2.position = cell('H8');
  state.players.P1.hand = [{ instanceId: 'shizzle', cardId: 'shizzle' }];
  state.players.P1.manaMode = consume ? 'consume' : 'generate';
  state.players.P1.manaPoints = 3;
  return state;
};
const start = (state: GameState) => step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'shizzle', destination: 'direct' });

for (const origin of ['C7', 'C8']) {
  const moved = step(start(setup(origin)), { type: 'shizzle-destination', playerId: 'P1', to: cell('C6') });
  assert.deepEqual(moved.players.P1.position, cell('C6'), 'Normal Shizzle can climb a Slide onto High Ground, including through an intermediate Slide.');
}
let consume = start(setup('C7', true));
consume = step(consume, { type: 'move', playerId: 'P1', to: cell('D6') });
assert.deepEqual(consume.players.P1.position, cell('D6'), 'Consume Shizzle can climb diagonally onto High Ground.');
consume = step(consume, { type: 'move', playerId: 'P1', to: cell('E6') });
assert.equal(consume.phase, 'active');

const normal = setup('C7');
normal.players.P1.movementRemaining = 1;
assert.equal(applyCommand(normal, { type: 'move', playerId: 'P1', to: cell('C6') }).ok, false, 'Ordinary movement still cannot climb a Slide.');
const occupied = setup('C7');
occupied.objects = [{ id: 'box', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('C6') }];
assert.equal(applyCommand(start(occupied), { type: 'shizzle-destination', playerId: 'P1', to: cell('C6') }).ok, false, 'Shizzle must still finish on an empty Square.');
console.log('Shizzle High Ground checks passed.');
