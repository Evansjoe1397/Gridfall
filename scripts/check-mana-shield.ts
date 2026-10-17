import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, storedManaShieldDefenseBonus, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';
import { ManaShieldVisual } from '../src/manaShieldVisuals.ts';
import * as THREE from 'three';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, command.type + ': ' + (result.ok ? '' : result.error));
  return JSON.parse(JSON.stringify(result.state));
}
function setup(stack = false, mana = 3, reserve = 0): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'magician');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.hp = player.maxHp = 30; player.actionsRemaining = 2; player.baseDefenseBonus = 0;
  }
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'mana-shield' }];
  state.players.P2.manaPoints = mana;
  state.players.P2.manaShieldUnusedBlock = reserve;
  return state;
}
function reveal(state: GameState, attack = 1, pass = false, attackId: CardTypeId = 'attack-3'): GameState {
  state.players.P1.hand.find((card) => card.instanceId === 'attack')!.cardId = attackId;
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state.pendingAttack!.attackValue = attack;
  state = step(state, pass ? { type: 'pass-defense', playerId: 'P2' } : { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selections = (state as GameState & { combatStackSelections?: Record<string, unknown> }).combatStackSelections ?? {};
    state = step(state, { type: 'combat-stack-choice', playerId: selections.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  }
  while (state.phase === 'choosing-exhaust' && state.combatReveal?.exhaust) {
    const choice = state.combatReveal.exhaust;
    const id = choice.eligible.find((id) => !choice.decided.includes(id))!;
    state = step(state, { type: 'exhaust-decision', playerId: id, use: false });
  }
  return state;
}
function finish(state: GameState): GameState {
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
assert.equal(cardDefinition({ instanceId: '', cardId: 'mana-shield' }).effectText,
  'Defend Value is equal to the amount of Stored Mana points. Remove 1 Mana Point if any Damage was blocked in this combat. Unused defend block will improve the Defend Value of the card in next combat.');
for (const stack of [false, true]) for (const mana of [0, 1, 2, 3]) for (const attack of [0, 1, 2, 3, 5, 8]) for (const reserve of [0, 2, 5]) {
  let state = reveal(setup(stack, mana, reserve), attack);
  const total = mana + reserve;
  assert.equal(state.combatReveal?.defendTotal, total);
  assert.equal(state.players.P2.manaPoints, mana, 'No Mana generation; spending waits for acknowledgement.');
  assert.equal(state.players.P2.manaShieldUnusedBlock, 0, 'The prior reserve is consumed on this Defend Card.');
  assert.equal(state.pendingAttack?.manaShieldUnusedBlock, reserve, 'Applied bonus is cached across combat choices.');
  if (reserve) assert.ok(state.combatReveal?.defendModifiers?.some((modifier) => modifier.source === 'Mana Shield · unused block' && modifier.value === reserve));
  state = finish(state);
  assert.equal(state.players.P2.manaPoints, mana - Number(mana > 0 && Math.min(attack, total) > 0));
  assert.equal(state.players.P2.manaShieldUnusedBlock, Math.max(0, total - attack), 'Carryover uses final DEF minus final ATT.');
  assert.ok(!state.players.P2.hand.some((card) => card.instanceId === 'defense'), 'Mana Shield no longer returns to Hand.');
  assert.ok(state.players.P2.discard.some((card) => card.instanceId === 'defense'));
}
for (const stack of [false, true]) {
  let chained = finish(reveal(setup(stack, 3), 1));
  assert.equal(chained.players.P2.manaShieldUnusedBlock, 2);
  chained.players.P1.hand.push({ instanceId: 'attack', cardId: 'attack-3' });
  chained.players.P2.hand.push({ instanceId: 'defense', cardId: 'defend-1' });
  const nextCombat = reveal(chained, 2);
  assert.equal(nextCombat.combatReveal?.defendTotal, 3, 'The actual previous combat supplies the next Defend bonus.');
  chained = finish(nextCombat);
  assert.equal(chained.players.P2.manaShieldUnusedBlock, 0);

  const turnPassed = step(setup(stack, 2, 4), { type: 'end-turn', playerId: 'P1' });
  assert.equal(turnPassed.players.P2.manaShieldUnusedBlock, 4, 'The reserve survives turn boundaries.');
  let state = setup(stack, 3);
  state.players.P2.character = 'merylin';
  state.players.P2.merylinSummonActive = true; state.players.P2.merylinSummonedDefenseBonus = 3;
  state.players.P2.hand.push({ instanceId: 'exhaust', cardId: 'exhaust' });
  const modified = reveal(state, 2);
  assert.equal(modified.combatReveal?.defendTotal, 5, 'Stored Mana +3, Summoned Guard +3, held Exhaust -1.');
  state = finish(modified);
  assert.equal(state.players.P2.manaShieldUnusedBlock, 3);

  state = setup(stack, 2, 4); state.players.P2.hand[0].cardId = 'defend-1';
  assert.equal(storedManaShieldDefenseBonus(state, state.players.P2), 4);
  const defended = reveal(state, 3);
  assert.equal(defended.combatReveal?.defendTotal, 5);
  state = finish(defended);
  assert.equal(state.players.P2.manaShieldUnusedBlock, 0);
  assert.equal(state.players.P2.manaPoints, 2, 'An ordinary Defend Card spends no Mana.');

  state = setup(stack, 2, 4);
  assert.equal(applyCommand(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'missing' }).ok, false);
  state = finish(reveal(state, 1, true));
  assert.equal(state.players.P2.manaShieldUnusedBlock, 4, 'Taking the hit preserves unused block.');

  state = setup(stack, 1); state.players.P1.manaShieldUnusedBlock = 7;
  state = finish(reveal(state));
  assert.equal(state.players.P1.manaShieldUnusedBlock, 7, 'Attacking preserves unused block.');

  state = setup(stack, 3, 2); state.players.P1.character = 'john-christ';
  const cancelled = reveal(state, 1, false, 'blessed-might');
  assert.equal(cancelled.combatReveal?.defendTotal, 5, 'Stored Mana and the external defense bonus survive post-combat effect cancellation.');
  state = finish(cancelled);
  assert.equal(state.players.P2.manaPoints, 3);
  assert.equal(state.players.P2.manaShieldUnusedBlock, 0, 'Cancelled Mana Shield creates no new reserve.');
}
let preview = setup(true, 2, 4);
preview.players.P2.hand.push({ instanceId: 'banner', cardId: 'banner' });
preview = step(preview, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
preview.pendingAttack!.attackValue = 8;
preview = step(preview, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
assert.equal(preview.phase, 'choosing-combat-stack');
assert.equal(preview.combatReveal?.defendTotal, 6, 'Private combat preview includes the stored bonus before consumption.');
assert.equal(preview.players.P2.manaShieldUnusedBlock, 4);
assert.ok(preview.combatReveal?.defendModifiers?.some((modifier) => modifier.source === 'Mana Shield · unused block' && modifier.value === 4));
// The bubble has no timeout while stored, follows movement, and frees GPU resources.
const scene = new THREE.Scene();
const effect = new ManaShieldVisual(scene, new THREE.Vector3(), 0);
assert.equal(effect.update(600_000, new THREE.Vector3(2, 1, 3)), true);
assert.deepEqual(effect.root.position.toArray(), [2, 1, 3]);
assert.equal(scene.children.length, 1);
effect.dispose(); effect.dispose();
assert.equal(scene.children.length, 0);
assert.equal(effect.update(600_001), false);
console.log('Mana Shield checks passed: 144 combat cases, final-value surplus, one-Mana cost, no generation/return, next-Defend consumption, persistence, cancellation, and sustained bubble lifecycle.');
