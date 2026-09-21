import assert from 'node:assert/strict';
import { CARDS, applyCommand, createHotseatTestState } from '../shared/game.ts';

assert.equal(CARDS.find((card) => card.id === 'sacrifice')?.effectText, 'If you lost this fight: force the enemy to sacrifice 1 HP and create Tomb within your attacking range.');

const state = createHotseatTestState(true, 'shinobi', 2, 'wreckna');
state.objects = [];
state.players.P1.position = { x: 2, y: 2 };
state.players.P2.position = { x: 3, y: 2 };
state.players.P1.hand = [{ instanceId: 'sacrifice-attack', cardId: 'attack-3' }];
state.players.P2.hand = [{ instanceId: 'sacrifice-defense', cardId: 'sacrifice' }];

const attack = applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'sacrifice-attack', targetId: 'P2' });
assert.equal(attack.ok, true);
const defense = attack.ok ? applyCommand(attack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'sacrifice-defense' }) : attack;
assert.equal(defense.ok, true);
if (!defense.ok) process.exit(1);

const deferred = JSON.parse(defense.state.combatReveal?.deferredAfterCombatState ?? 'null');
assert.ok(deferred, 'Sacrifice has a deferred after-combat state.');
assert.equal(deferred.players.P1.hp, 19, 'The enemy sacrifices 1 HP after winning combat.');
assert.equal(deferred.phase, 'choosing-sacrifice-tomb-square');
assert.equal(deferred.objects.some((object: { phylacteryType?: string }) => Boolean(object.phylacteryType)), false, 'Sacrifice creates no Phylactery.');

const occupied = applyCommand(deferred, { type: 'sacrifice-tomb-square', playerId: 'P2', to: { x: 2, y: 2 } });
assert.equal(occupied.ok, false, 'Sacrifice cannot place a Tomb on an occupied Square.');
const placed = applyCommand(deferred, { type: 'sacrifice-tomb-square', playerId: 'P2', to: { x: 4, y: 3 } });
assert.equal(placed.ok, true);
if (placed.ok) {
  assert.equal(placed.state.phase, 'active');
  assert.equal(placed.state.objects.some((object) => object.kind === 'tomb' && object.ownerId === 'P2' && object.position.x === 4 && object.position.y === 3), true, 'Sacrifice creates Wreckna\'s Tomb on the selected in-range Square.');
}

console.log('Sacrifice checks passed: forced HP loss, no Phylactery, and selected in-range Tomb creation.');
