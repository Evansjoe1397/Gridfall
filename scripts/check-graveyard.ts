import assert from 'node:assert/strict';
import { CARDS, applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}

function setup(tombPosition?: { x: number; y: number }, inside = false): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'wreckna');
  state.phase = 'active';
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  for (const player of Object.values(state.players)) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
  }
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
  state.players.P2.hand = [
    { instanceId: 'graveyard', cardId: 'graveyard' },
    { instanceId: 'other-defense', cardId: 'brain-freeze' },
  ];
  state.objects = tombPosition ? [{ id: 'tomb', name: 'Tomb', kind: 'tomb', ownerId: 'P2', hp: 3, maxHp: 3, position: tombPosition, heavy: true }] : [];
  state.players.P2.wrecknaInsideTombId = inside ? 'tomb' : null;
  return state;
}

function combat(state: GameState, targetKind: 'player' | 'object' = 'player'): GameState {
  const attacked = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: targetKind === 'object' ? 'tomb' : 'P2', targetKind });
  return step(attacked, { type: 'defend', playerId: 'P2', cardInstanceId: 'graveyard' });
}

assert.equal(CARDS.find((card) => card.id === 'graveyard')?.effectText, 'Value of this card is 4, if adjacent or inside the Tomb. Can use from inside Tomb.');

const normal = combat(setup());
assert.equal(normal.combatReveal?.defendTotal, 3, 'Graveyard remains Value 3 away from Tombs.');

const adjacent = combat(setup({ x: 4, y: 2 }));
assert.equal(adjacent.combatReveal?.defendTotal, 4, 'Graveyard has Value 4 while adjacent to a Tomb.');

const insideState = setup({ x: 3, y: 2 }, true);
const insideAttack = step(insideState, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'tomb', targetKind: 'object' });
assert.equal(insideAttack.phase, 'defending', 'Attacking an occupied Tomb allows the entombed Wreckna to respond when Graveyard is held.');
const invalidDefense = applyCommand(insideAttack, { type: 'defend', playerId: 'P2', cardInstanceId: 'other-defense' });
assert.equal(invalidDefense.ok, false, 'Only Graveyard can Defend from inside a Tomb.');
const inside = step(insideAttack, { type: 'defend', playerId: 'P2', cardInstanceId: 'graveyard' });
assert.equal(inside.combatReveal?.defendTotal, 4, 'Graveyard can be used from inside a Tomb and has Value 4.');
assert.equal(inside.objects.some((object) => object.id === 'tomb'), true, 'Using Graveyard no longer sacrifices the Tomb.');

console.log('Graveyard checks passed: positional Value 4 and exclusive use from inside a Tomb.');
