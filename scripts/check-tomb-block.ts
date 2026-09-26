import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type BoardObject, type GameState } from '../shared/game.ts';

const blockedAdjacentCells = [
  { x: 2, y: 3 },
  { x: 3, y: 1 },
  { x: 3, y: 3 },
  { x: 4, y: 1 },
  { x: 4, y: 3 },
];

function column(position: { x: number; y: number }, index: number): BoardObject {
  return { id: `tomb-block-column-${index}`, name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position };
}

function setup(objects: BoardObject[]): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'wreckna');
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.objects = [...objects, ...blockedAdjacentCells.map(column)];
  state.players.P1.hand = [{ instanceId: 'tomb-block-priority-attack', cardId: 'attack-2' }];
  state.players.P2.hand = [{ instanceId: 'tomb-block-priority-defense', cardId: 'tomb-block' }];
  return state;
}

function resolveTombBlock(state: GameState): GameState {
  const attack = applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'tomb-block-priority-attack', targetId: 'P2' });
  assert.equal(attack.ok, true, 'The Tomb Block priority scenario starts combat.');
  const defense = applyCommand(attack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'tomb-block-priority-defense' });
  assert.equal(defense.ok, true, 'Tomb Block resolves.');
  const deferred = defense.state.combatReveal?.deferredAfterCombatState;
  return deferred ? JSON.parse(deferred) as GameState : defense.state;
}

const infusedObject: BoardObject = {
  id: 'protected-phylactery',
  name: 'Infused Wooden Box',
  kind: 'wooden-box',
  hp: 3,
  maxHp: 3,
  position: { x: 2, y: 1 },
  phylacteryType: 'might',
  phylacteryOwnerId: 'P2',
};
const ordinaryObject: BoardObject = {
  id: 'ordinary-object',
  name: 'Wooden Box',
  kind: 'wooden-box',
  hp: 3,
  maxHp: 3,
  position: { x: 4, y: 2 },
};

const originalRandom = Math.random;
try {
  Math.random = () => 0;
  const prioritized = resolveTombBlock(setup([infusedObject, ordinaryObject]));
  assert.ok(prioritized.objects.some((object) => object.id === infusedObject.id), 'Tomb Block preserves an infused Object when another eligible Square exists.');
  assert.equal(prioritized.objects.some((object) => object.id === ordinaryObject.id), false, 'Tomb Block may replace a non-infused Object instead.');
  assert.ok(prioritized.objects.some((object) => object.kind === 'tomb' && object.position.x === ordinaryObject.position.x && object.position.y === ordinaryObject.position.y), 'The Tomb spawns on the prioritized non-infused Square.');

  const fallback = resolveTombBlock(setup([infusedObject, column({ x: 4, y: 2 }, 99)]));
  assert.equal(fallback.objects.some((object) => object.id === infusedObject.id), false, 'An infused Object remains the last-resort target when no other eligible Square exists.');
  assert.ok(fallback.objects.some((object) => object.kind === 'tomb' && object.position.x === infusedObject.position.x && object.position.y === infusedObject.position.y), 'The last-resort Tomb uses the only eligible Square.');
} finally {
  Math.random = originalRandom;
}

console.log('Tomb Block priority checks passed.');
