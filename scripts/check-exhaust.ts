import assert from 'node:assert/strict';
import { applyCommand, createInitialState, resolveMultiplayerCombatStack, type CardTypeId } from '../shared/game.ts';

function setup(defendCard: CardTypeId) {
  const state = createInitialState();
  state.simultaneousCombatStack = true;
  state.objects = [];
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [
    { instanceId: 'attack', cardId: 'attack-3' },
    { instanceId: 'attacker-exhaust', cardId: 'exhaust' },
  ];
  state.players.P2.hand = [
    { instanceId: 'defend', cardId: defendCard },
    { instanceId: 'defender-exhaust', cardId: 'exhaust' },
  ];
  return state;
}

function reachCombatStack() {
  const attack = applyCommand(setup('decisive-block'), { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  assert.equal(attack.ok, true);
  if (!attack.ok) throw new Error(attack.error);
  const defend = applyCommand(attack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defend' });
  assert.equal(defend.ok, true);
  if (!defend.ok) throw new Error(defend.error);
  return defend.state;
}

const attackerAttached = resolveMultiplayerCombatStack(reachCombatStack(), { P1: ['attacker-exhaust'], P2: [] });
assert.equal(attackerAttached.ok, true);
if (attackerAttached.ok) {
  assert.equal(attackerAttached.state.combatReveal?.attackTotal, 1, 'Attaching Exhaust replaces the held -1 with an active -2 Attack penalty.');
  assert.deepEqual(attackerAttached.state.combatReveal?.attackModifiers?.filter((modifier) => modifier.source.includes('Exhaust')), [{ value: -2, source: 'attached Exhaust' }]);
}

const defenderAttached = resolveMultiplayerCombatStack(reachCombatStack(), { P1: [], P2: ['defender-exhaust'] });
assert.equal(defenderAttached.ok, true);
if (defenderAttached.ok) {
  assert.equal(defenderAttached.state.combatReveal?.defendTotal, 1, 'Attaching Exhaust applies an active -2 Defend penalty.');
  assert.deepEqual(defenderAttached.state.combatReveal?.defendModifiers?.filter((modifier) => modifier.source.includes('Exhaust')), [{ value: -2, source: 'attached Exhaust' }]);
}

const passiveOnly = reachCombatStack();
assert.equal(passiveOnly.combatReveal?.attackTotal, 2, 'Held Exhaust keeps its passive -1 Attack penalty.');
assert.equal(passiveOnly.combatReveal?.defendTotal, 2, 'Held Exhaust keeps its passive -1 Defend penalty.');

const tacticianState = createInitialState();
tacticianState.objects = [];
tacticianState.elevations = {};
tacticianState.players.P1.position = { x: 3, y: 4 };
tacticianState.players.P2.position = { x: 4, y: 4 };
tacticianState.players.P2.character = 'merylin';
tacticianState.players.P1.hand = [{ instanceId: 'tactician-attack', cardId: 'attack-3' }];
tacticianState.players.P1.deck = [{ instanceId: 'older-deck-card', cardId: 'attack-2' }];
tacticianState.players.P2.hand = [{ instanceId: 'tactician-defense', cardId: 'tactician' }];
const tacticianAttack = applyCommand(tacticianState, { type: 'attack', playerId: 'P1', cardInstanceId: 'tactician-attack', targetId: 'P2' });
assert.equal(tacticianAttack.ok, true);
if (tacticianAttack.ok) {
  const tacticianDefense = applyCommand(tacticianAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'tactician-defense' });
  assert.equal(tacticianDefense.ok, true);
  if (tacticianDefense.ok) {
    const resolved = JSON.parse(tacticianDefense.state.combatReveal!.deferredAfterCombatState!) as typeof tacticianDefense.state;
    assert.equal(resolved.players.P1.deck.at(-1)?.cardId, 'exhaust', 'Tactician places Exhaust above the existing Deck.');
    assert.equal(resolved.players.P1.knownTopCardId, 'exhaust');
    assert.equal(resolved.players.P1.deck.some((card) => card.cardId === 'headache'), false);
  }
}

console.log('Exhaust and Tactician checks passed.');
