import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type CardTypeId, type GameState } from '../shared/game.ts';

const calmness = cardDefinition({ instanceId: 'calmness-definition', cardId: 'calmness' });
assert.equal(calmness.value, 1);
assert.equal(calmness.effectText, 'During this combat negate all damage if the attacker has -MOV stacks.');

function fight(attackId: CardTypeId, attackerPinned: number, defenderPinned = 0, defenderLightsaber = false): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, attackId === 'mana-barrage' ? 'magician' : 'shinobi');
  state.activePlayerId = 'P2';
  state.objects = [];
  state.players.P1.position = { x: 2, y: 1 };
  state.players.P2.position = { x: 3, y: 1 };
  state.players.P1.hand = [{ instanceId: 'calmness', cardId: 'calmness' }, { instanceId: 'existing-status', cardId: 'headache' }];
  state.players.P2.hand = [{ instanceId: 'attack', cardId: attackId }];
  state.players.P1.pinnedStacks = defenderPinned;
  state.players.P1.lightsaberBuff = defenderLightsaber;
  state.players.P2.pinnedStacks = attackerPinned;
  if (attackId === 'mana-barrage') state.players.P2.manaMode = 'consume';
  const attack = applyCommand(state, { type: 'attack', playerId: 'P2', cardInstanceId: 'attack', targetId: 'P1' });
  assert.equal(attack.ok, true, attack.ok ? '' : attack.error);
  const defense = applyCommand(attack.state, { type: 'defend', playerId: 'P1', cardInstanceId: 'calmness' });
  assert.equal(defense.ok, true, defense.ok ? '' : defense.error);
  assert.ok(defense.state.combatReveal?.deferredAfterCombatState);
  return JSON.parse(defense.state.combatReveal.deferredAfterCombatState) as GameState;
}

const pinned = fight('cut-them-legs', 1, 1, true);
assert.equal(pinned.players.P1.hp, 20, 'An attacker with -MOV stacks cannot damage the Calmness defender.');
assert.equal(pinned.players.P1.lightsaberBuff, true, 'Calmness no longer removes positive effects.');
assert.equal(pinned.players.P1.pinnedStacks, 2, 'Calmness keeps existing -MOV stacks and does not block a new Attack Card debuff.');
assert.equal(pinned.players.P1.hand.some((card) => card.instanceId === 'existing-status'), true, 'Calmness no longer removes Status Cards.');
assert.equal(pinned.players.P2.pinnedStacks, 1, 'Calmness does not remove the attacker\'s -MOV stacks.');

const unpinned = fight('attack-3', 0);
assert.equal(unpinned.players.P1.hp, 18, 'Without attacker -MOV stacks, Calmness blocks only its printed 1 DEF.');

const helloThere = fight('hello-there', 1, 1);
assert.equal(helloThere.players.P1.hp, 20, 'Calmness negates Hello There effect Damage.');
assert.equal(helloThere.players.P1.hand.some((card) => card.cardId === 'headache' && card.instanceId !== 'existing-status'), true, 'Damage negation does not cancel Hello There\'s Headache.');

const barrage = fight('mana-barrage', 1);
assert.equal(barrage.players.P1.hp, 20, 'Calmness also negates Mana Barrage Consume Damage after combat.');
assert.equal(barrage.players.P1.matchStats?.combatDamageBlocked, 5, 'Blocked Damage includes the 3 Attack Value and 2 after-combat Mana Barrage Damage.');

console.log('Calmness checks passed.');
