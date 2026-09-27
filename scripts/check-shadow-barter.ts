import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type GameState } from '../shared/game.ts';

const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  if (result.state.combatReveal?.deferredAfterCombatState) {
    const first = applyCommand(result.state, { type: 'ack-combat', playerId: 'P1' });
    assert.equal(first.ok, true, first.ok ? '' : first.error);
    const second = applyCommand(first.state, { type: 'ack-combat', playerId: 'P2' });
    assert.equal(second.ok, true, second.ok ? '' : second.error);
    return second.state;
  }
  return result.state;
};

function setup(enemyHasCard: boolean): GameState {
  const state = createHotseatTestState(true, 'wreckna', 2);
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 4, y: 2 };
  state.players.P1.hand = [{ instanceId: 'barter-attack', cardId: 'shadow-barter' }];
  state.players.P1.deck = [{ instanceId: 'barter-draw', cardId: 'attack-3' }];
  state.players.P2.hand = enemyHasCard ? [{ instanceId: 'barter-discard', cardId: 'attack-2' }] : [];
  return state;
}

assert.equal(cardDefinition({ instanceId: 'barter-description', cardId: 'shadow-barter' }).effectText, 'Draw 1 Card, then the enemy Discards 1 Card. Create a Tomb within Range.');

let state = setup(true);
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'barter-attack', targetId: 'P2' });
state = step(state, { type: 'pass-defense', playerId: 'P2' });
assert.equal(state.players.P1.hand.some((card) => card.instanceId === 'barter-draw'), true, 'Shadow Barter draws before the enemy discards.');
assert.equal(state.phase, 'choosing-shadow-barter-discard');
state = step(state, { type: 'shadow-barter-discard', playerId: 'P2', cardInstanceId: 'barter-discard' });
assert.equal(state.players.P2.discard.some((card) => card.instanceId === 'barter-discard'), true);
assert.equal(state.phase, 'choosing-shadow-barter-tomb-square');
assert.equal(applyCommand(state, { type: 'shadow-barter-tomb-square', playerId: 'P2', to: { x: 3, y: 2 } }).ok, false, 'Only the attacker chooses the Tomb.');
assert.equal(applyCommand(state, { type: 'shadow-barter-tomb-square', playerId: 'P1', to: { x: 7, y: 7 } }).ok, false, 'The Tomb must be within Range.');
state = step(state, { type: 'shadow-barter-tomb-square', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(state.phase, 'active');
assert.equal(state.objects.some((object) => object.kind === 'tomb' && object.ownerId === 'P1' && object.position.x === 3 && object.position.y === 2), true);

let emptyHand = setup(false);
emptyHand = step(emptyHand, { type: 'attack', playerId: 'P1', cardInstanceId: 'barter-attack', targetId: 'P2' });
emptyHand = step(emptyHand, { type: 'pass-defense', playerId: 'P2' });
assert.equal(emptyHand.phase, 'choosing-shadow-barter-tomb-square', 'An empty enemy Hand does not skip Tomb placement.');
emptyHand = step(emptyHand, { type: 'shadow-barter-tomb-square', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(emptyHand.objects.some((object) => object.kind === 'tomb' && object.ownerId === 'P1'), true);

console.log('Shadow Barter checks passed.');
