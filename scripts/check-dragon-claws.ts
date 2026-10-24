import assert from 'node:assert/strict';
import { applyCommand, attackCardTargetInRange, cardDefinition, createHotseatTestState, isBurningSquare, modifySquare, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (x: number, y = 1) => ({ x, y });
function fresh(stack = true, defense: CardTypeId = 'defend-1'): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell(2); state.players.P2.position = cell(3);
  state.players.P1.hp = 10; state.players.P2.hp = state.players.P2.maxHp = 20;
  state.players.P1.hand = [{ instanceId: 'claws', cardId: 'dragon-claws' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
const attack = (state: GameState) => step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'claws', targetId: 'P2' });
function defend(state: GameState, heated = false): GameState {
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selected = (state as any).combatStackSelections ?? {};
    const playerId = selected.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P2' ? 'heated' : null });
  }
  return state;
}
function acknowledge(state: GameState): GameState {
  while (state.phase === 'choosing-exhaust') {
    const choice = state.combatReveal!.exhaust!;
    const playerId = choice.eligible.find((id) => !choice.decided.includes(id))!;
    state = step(state, { type: 'exhaust-decision', playerId, use: false });
  }
  return step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
}
const burn = (state: GameState) => state.players.P2.hand.push({ instanceId: 'enemy-burning', cardId: 'burning', sourcePlayerId: 'P2' });
const ignite = (state: GameState, x: number, y = 1) => assert.ok(modifySquare(state, cell(x, y), 'patch-of-flames'));

const definition = cardDefinition({ instanceId: '', cardId: 'dragon-claws' });
assert.equal(definition.name, 'Dragon Claws'); assert.equal(definition.value, 2);
assert.equal(definition.effectText, 'Can use only in melee Range. Before combat: Deal 1 Damage if target is Burning. After combat: Absorb flames in FP Range.');
assert.ok(createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks').players.P1.deck.some((card) => card.cardId === 'dragon-claws'));

for (const stack of [false, true]) {
  for (const pile of ['hand', 'deck', 'discard', 'removedDeck', 'none'] as const) {
    let state = fresh(stack);
    if (pile !== 'none') (state.players.P2[pile] ??= []).push({ instanceId: 'burn', cardId: 'burning' });
    state = defend(attack(state));
    assert.equal(state.combatReveal?.attackTotal, 2, 'Focus Lens does not add ATT to Dragon Claws.');
    assert.equal(state.players.P2.hp, pile === 'hand' ? 18 : 19, 'Only Burning in Hand triggers the one pre-combat Damage.');
    assert.equal(state.players.P1.pyroCharges, 0, 'Absorption waits for combat acknowledgement.');
    state = acknowledge(state);
    assert.equal(state.players.P1.pyroCharges, pile === 'hand' ? 1 : 0);
    assert.equal(state.players.P1.hp, pile === 'hand' ? 11 : 10);
    if (pile === 'hand') assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'burn'), 'Absorption transfers the original Burning Card.');
  }
  for (const outcome of ['win', 'tie', 'loss']) {
    let state = fresh(stack); burn(state);
    if (outcome !== 'win') state.players.P1.hand.push({ instanceId: 'exhaust', cardId: 'exhaust' });
    if (outcome === 'loss') state.players.P2.lightsaberBuff = true;
    state = acknowledge(defend(attack(state)));
    assert.equal(state.players.P1.pyroCharges, 1, `${outcome} still resolves Absorb Flames: ${state.log.slice(0, 6).join(' | ')}`);
  }
  for (const block of ['block', 'spellblock', 'decisive-block', 'tomb-block', 'da-blokk', 'blessed-block'] as CardTypeId[]) {
    let state = fresh(stack, block); burn(state);
    state = acknowledge(defend(attack(state)));
    assert.equal(state.players.P1.pyroCharges, 0, `${block} cancels absorption.`);
    assert.ok(!state.log.some((line) => line.startsWith('Dragon Claws dealt')), `${block} cancels pre-combat Damage.`);
    assert.ok(state.players.P2.hand.some((card) => card.cardId === 'burning'));
  }
  let state = fresh(stack); burn(state); state.players.P2.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
  state = acknowledge(defend(attack(state), true));
  assert.equal(state.players.P2.hp, 18, 'Heated Debate preserves the earlier pre-combat Damage.');
  assert.equal(state.players.P1.pyroCharges, 0, 'Heated Debate cancels after-combat absorption.');

  state = fresh(stack, 'calmness'); burn(state); state.players.P1.hand.push({ instanceId: 'pinned', cardId: 'pinned' }); state.players.P1.pinnedStacks = 1;
  state = acknowledge(defend(attack(state)));
  assert.equal(state.players.P2.hp, 20, 'Damage negation prevents the pre-combat and combat Damage.');
  assert.equal(state.players.P1.pyroCharges, 1, 'Damage negation does not cancel absorption.');

  state = fresh(stack); burn(state); state.players.P2.hp = 1;
  state = defend(attack(state));
  assert.equal(state.winner, 'P1'); assert.equal(state.pendingAttack, null); assert.equal(state.combatReveal, null);
  assert.equal(state.players.P1.pyroCharges, 0, 'A pre-combat defeat ends combat without replaying effects.');

  state = fresh(stack); burn(state); state.players.P1.pyroCharges = 2;
  state = acknowledge(defend(attack(state)));
  assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.hp, 11);
  assert.equal(state.players.P2.hp, 16, 'Third Charge discharge adds 2 Damage after the pre-combat/combat Damage.');
  assert.ok(state.spellProjectiles.some((event) => event.style === 'absorb-flames'));
  assert.ok(state.spellProjectiles.some((event) => event.style === 'pyro-discharge'));

  state = fresh(stack); state.players.P1.attackRange = 4; ignite(state, 6);
  state = acknowledge(defend(attack(state)));
  assert.equal(state.players.P1.pyroCharges, 0); assert.ok(isBurningSquare(state, cell(6)), 'FP caps absorption at Range 3 even with maximum Attack Range 4.');
  state = fresh(stack); state.players.P1.attackRange = 4; ignite(state, 5);
  state = attack(state); assert.equal(state.pendingAttack?.fyrePoints, 3);
  state.players.P1.attackRange = 1;
  state = acknowledge(defend(state));
  assert.equal(state.players.P1.pyroCharges, 1, 'Absorption uses the FP captured on this Attack, not a changed maximum Range.');
  assert.equal(isBurningSquare(state, cell(5)), false);

  state = fresh(stack); state.players.P1.traitBlocked = true; burn(state);
  state = acknowledge(defend(attack(state)));
  assert.equal(state.players.P2.hp, 18, 'The Card pre-combat effect does not require Focus Lens.');
  assert.equal(state.players.P1.pyroCharges, 0, 'Blocked Trait cannot absorb or gain Charges.');

  state = fresh(stack, 'yamato'); burn(state);
  state = defend(attack(state)); assert.equal(state.phase, 'choosing-yamato-move');
  state = step(state, { type: 'yamato-move', playerId: 'P2', to: cell(4) });
  if (state.combatReveal) state = acknowledge(state);
  assert.equal(state.players.P2.hp, 20, 'Moving beyond melee before combat evades Dragon Claws even within maximum Attack Range.');
}

let state = fresh(); state.players.P1.attackRange = 5;
for (const target of [cell(2), cell(4), cell(5), cell(4, 3)]) assert.equal(attackCardTargetInRange(state, state.players.P1, 'dragon-claws', target), false);
for (const target of [cell(3), cell(3, 2), cell(2, 2)]) assert.equal(attackCardTargetInRange(state, state.players.P1, 'dragon-claws', target), true);
state.players.P2.position = cell(4);
assert.equal(applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'claws', targetId: 'P2' }).ok, false);
assert.equal(applyCommand(state, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'claws', origin: 'spectre', targetKind: 'player', targetId: 'P2' }).ok, false);

state = fresh(); state.players.P2.character = 'spectre'; state.players.P2.position = cell(7); burn(state);
state.objects.push({ id: 'enemy-replica', name: 'Replica', kind: 'spectre-replica', hp: 999, maxHp: 999, ownerId: 'P2', position: cell(3) });
state = step(state, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'claws', origin: 'spectre', targetKind: 'replica', targetId: 'enemy-replica' });
state = acknowledge(defend(state)); assert.equal(state.players.P2.hp, 18); assert.equal(state.players.P1.pyroCharges, 1);

state = fresh(); state.players.P1.attackRange = 4; state.players.P2.position = cell(7);
state.objects.push({ id: 'box', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell(4) });
assert.equal(applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'claws', targetKind: 'object', targetId: 'box' }).ok, false);
state.objects[0].position = cell(3); ignite(state, 5);
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'claws', targetKind: 'object', targetId: 'box' });
assert.equal(state.objects.length, 0); assert.equal(state.players.P1.pyroCharges, 1, 'A melee Object Attack still absorbs in captured FP Range.');

console.log('Dragon Claws checks passed: melee targeting, ordered Burning Damage, cancellation/negation, outcomes, FP-range absorption, Charges/discharge, replicas and Objects.');
