import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type CardTypeId, type GameState } from '../shared/game.ts';
import { johnAttackAnimation, johnAttackUsesProjectile } from '../src/johnChristLocomotion.ts';

function resolveJohnAttack(cardId: CardTypeId, targetX = 4): GameState {
  const state = createHotseatTestState(true, 'john-christ', 2, 'dummy');
  state.objects = [];
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: targetX, y: 2 };
  state.players.P1.hand = [{ instanceId: `${cardId}-presentation`, cardId }];
  state.players.P2.hand = [];
  const attack = applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: `${cardId}-presentation`, targetId: 'P2' });
  assert.equal(attack.ok, true);
  if (!attack.ok) throw new Error(attack.error);
  const combat = applyCommand(attack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(combat.ok, true);
  if (!combat.ok) throw new Error(combat.error);
  const firstAck = applyCommand(combat.state, { type: 'ack-combat', playerId: 'P1' });
  assert.equal(firstAck.ok, true);
  if (!firstAck.ok) throw new Error(firstAck.error);
  const secondAck = applyCommand(firstAck.state, { type: 'ack-combat', playerId: 'P2' });
  assert.equal(secondAck.ok, true);
  if (!secondAck.ok) throw new Error(secondAck.error);
  return secondAck.state;
}

const cleanse = resolveJohnAttack('cleanse');
assert(cleanse.players.P2.hand.some((card) => card.cardId === 'burning'));
assert(cleanse.spellProjectiles.some((event) => event.style === 'cleanse-immolate' && event.targetId === 'P2'));
assert.equal(johnAttackAnimation('cleanse'), 'Cleanse');
assert.equal(johnAttackUsesProjectile('cleanse'), false);

const repent = resolveJohnAttack('repent', 3);
assert(repent.spellProjectiles.some((event) => event.style === 'cleanse-immolate' && event.targetId === 'P2'));
assert.equal(repent.spellProjectiles.filter((event) => event.style === 'cleanse-immolate' && event.targetId === 'P2').length, 1, 'Adjacent targets get one impact, not overlapping duplicate fire.');
assert(repent.spellProjectiles.some((event) => event.style === 'repent-fire' && event.to.x === 2 && event.to.y === 2));
const distantRepent = resolveJohnAttack('repent', 5);
assert(distantRepent.spellProjectiles.some((event) => event.style === 'cleanse-immolate' && event.targetId === 'P2'), 'A distant target still receives the immolation impact.');
assert.equal(distantRepent.players.P2.hp, repent.players.P2.hp + 2, 'Distant impact does not add adjacent-area damage.');
assert.equal(distantRepent.players.P1.hp, repent.players.P1.hp);
assert.equal(distantRepent.players.P1.spiritForm, true, 'Self-damage enters Spirit Form.');
assert.equal(johnAttackAnimation('repent'), 'Cleanse');
assert.equal(johnAttackUsesProjectile('repent'), false);

const mindBlast = createHotseatTestState(true, 'john-christ', 2, 'dummy');
mindBlast.objects = [];
mindBlast.players.P1.position = { x: 2, y: 2 };
mindBlast.players.P2.position = { x: 4, y: 2 };
mindBlast.players.P1.spellEcho = [{ instanceId: 'mind-blast-presentation', cardId: 'mind-blast' }, null, null];
mindBlast.players.P2.hand = [];
const mindBlastPlayed = applyCommand(mindBlast, { type: 'use-echo-perk', playerId: 'P1', position: 1 });
assert.equal(mindBlastPlayed.ok, true);
if (!mindBlastPlayed.ok) throw new Error(mindBlastPlayed.error);
const mindBlastTargeted = applyCommand(mindBlastPlayed.state, { type: 'arcane-missle-target', playerId: 'P1', targetId: 'P2' });
assert.equal(mindBlastTargeted.ok, true);
if (!mindBlastTargeted.ok) throw new Error(mindBlastTargeted.error);
assert(mindBlastTargeted.state.spellProjectiles.some((event) => event.style === 'mind-blast' && event.targetId === 'P2'));

console.log('John Cleanse, Repent, and Mind Blast presentation checks passed.');
