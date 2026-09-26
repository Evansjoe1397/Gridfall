import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type CardTypeId, type GameState, type HotseatCharacterId } from '../shared/game.ts';

function play(attackCard: CardTypeId, attacker: HotseatCharacterId, blocked = false): GameState {
  const state = createHotseatTestState(true, attacker, 2, 'magician');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.players.P1.position = { x: blocked ? 1 : 2, y: 2 };
  state.players.P2.position = { x: blocked ? 2 : 3, y: 2 };
  state.players.P1.hp = state.players.P1.maxHp = 20;
  state.players.P2.hp = state.players.P2.maxHp = 20;
  state.players.P1.merylinSummonActive = true;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attackCard }];
  state.players.P2.hand = [{ instanceId: 'barrier', cardId: 'arcane-barrier' }];
  const attack = applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  assert.equal(attack.ok, true, attack.ok ? undefined : attack.error);
  if (!attack.ok) throw new Error(attack.error);
  const defense = applyCommand(attack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'barrier' });
  assert.equal(defense.ok, true, defense.ok ? undefined : defense.error);
  if (!defense.ok) throw new Error(defense.error);
  const first = applyCommand(defense.state, { type: 'ack-combat', playerId: 'P1' });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error(first.error);
  const second = applyCommand(first.state, { type: 'ack-combat', playerId: 'P2' });
  assert.equal(second.ok, true);
  if (!second.ok) throw new Error(second.error);
  return second.state;
}

for (const [card, attacker, expectedStyles] of [
  ['repent', 'john-christ', ['repent-fire', 'cleanse-immolate']],
  ['cleanse', 'john-christ', ['cleanse-immolate']],
  ['moonlight', 'merylin', ['moonwave']],
  ['blessed-light', 'john-christ', ['blessing']],
  ['attack-2', 'shinobi', []],
] as const) {
  const state = play(card, attacker);
  const barrier = state.objectPushAnimations.find((event) => event.arcaneBarrier)?.arcaneBarrier;
  assert(barrier, `${card} creates a barrier presentation event`);
  assert.equal(barrier.targetPlayerId, 'P1');
  assert.deepEqual(barrier.waitForAttackEffectIds.map((id) => state.spellProjectiles.find((effect) => effect.id === id)?.style ?? (state.blessingAnimations.some((effect) => effect.id === id) ? 'blessing' : undefined)), expectedStyles, `${card}'s attack animations precede Arcane Barrier`);
  assert.deepEqual(state.players.P1.position, { x: 1, y: 2 }, `${card} still resolves the push in the game state`);
}

const blocked = play('repent', 'john-christ', true);
const blockedBarrier = blocked.objectPushAnimations.find((event) => event.arcaneBarrier);
assert(blockedBarrier?.collided, 'The board edge blocks the push');
assert(blocked.objectPushAnimations.some((event) => event.damage && event.afterBarrierAnimationId === blockedBarrier.id), 'Blocked-push damage waits for the barrier visual');

console.log('Arcane Barrier attack-effect ordering checks passed.');
