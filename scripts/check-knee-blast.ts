import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type GameState } from '../shared/game.ts';

assert.equal(
  cardDefinition({ instanceId: 'definition', cardId: 'knee-blast' }).effectText,
  'After combat, push the enemy X Squares, where X is the number of Rage Stacks. Deal 1 Damage and add Headache to their Hand if target collides with anything.',
);

function fight(rageStacks: number, obstacle = false, defend = false): { beforeHp: number; combatDamage: number; state: GameState } {
  const state = createHotseatTestState(true, 'orkk', 2, 'shinobi');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.players.P1.position = { x: 5, y: 1 };
  state.players.P2.position = { x: 6, y: 1 };
  state.players.P1.rageStacks = rageStacks;
  state.players.P1.hand = [{ instanceId: 'knee-blast-attack', cardId: 'knee-blast' }];
  state.players.P2.hand = defend ? [{ instanceId: 'knee-blast-block', cardId: 'block' }] : [];
  state.objects = obstacle ? [{ id: 'knee-blast-obstacle', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 7, y: 1 } }] : [];
  const beforeHp = state.players.P2.hp;
  const attack = applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'knee-blast-attack', targetId: 'P2' });
  assert.equal(attack.ok, true, attack.ok ? '' : attack.error);
  const defense = applyCommand(attack.state, defend
    ? { type: 'defend', playerId: 'P2', cardInstanceId: 'knee-blast-block' }
    : { type: 'pass-defense', playerId: 'P2' });
  assert.equal(defense.ok, true, defense.ok ? '' : defense.error);
  assert.ok(defense.state.combatReveal?.deferredAfterCombatState);
  return {
    beforeHp,
    combatDamage: defense.state.combatReveal.combatDamage,
    state: JSON.parse(defense.state.combatReveal.deferredAfterCombatState) as GameState,
  };
}

const clearPath = fight(1);
assert.deepEqual(clearPath.state.players.P2.position, { x: 7, y: 1 });
assert.equal(clearPath.state.players.P2.hp, clearPath.beforeHp - clearPath.combatDamage, 'A push without collision adds no Damage.');
assert.equal(clearPath.state.players.P2.hand.some((card) => card.cardId === 'headache'), false, 'A push without collision adds no Headache.');

const boardEdge = fight(3);
assert.deepEqual(boardEdge.state.players.P2.position, { x: 8, y: 1 });
assert.equal(boardEdge.state.players.P2.hp, boardEdge.beforeHp - boardEdge.combatDamage - 1, 'Board-edge collision adds exactly 1 Damage after combat.');
assert.equal(boardEdge.state.players.P2.hand.some((card) => card.cardId === 'headache'), true);
assert.equal(boardEdge.state.players.P1.matchStats?.attackDamage, boardEdge.combatDamage + 1, 'Collision Damage is credited to the attacker.');

const objectCollision = fight(2, true);
assert.deepEqual(objectCollision.state.players.P2.position, { x: 6, y: 1 });
assert.equal(objectCollision.state.players.P2.hp, objectCollision.beforeHp - objectCollision.combatDamage - 1, 'Colliding with an Object adds 1 Damage.');
assert.equal(objectCollision.state.players.P2.hand.some((card) => card.cardId === 'headache'), true);

const blocked = fight(3, false, true);
assert.deepEqual(blocked.state.players.P2.position, { x: 6, y: 1 }, 'Block cancels Knee Blast\'s push.');
assert.equal(blocked.state.players.P2.hp, blocked.beforeHp - blocked.combatDamage, 'Block cancels Knee Blast\'s collision Damage.');
assert.equal(blocked.state.players.P2.hand.some((card) => card.cardId === 'headache'), false);

console.log('Knee Blast checks passed.');
