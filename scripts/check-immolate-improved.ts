import assert from 'node:assert/strict';
import { applyCommand, absorbFlames, cardDefinition, createHotseatTestState, modifySquare, summonLens, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (x: number, y = 1) => ({ x, y });
function setup(stack = true, defense: CardTypeId = 'defend-1'): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell(2); state.players.P2.position = cell(3);
  state.players.P1.hp = 10; state.players.P2.hp = state.players.P2.maxHp = 30;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'immolate-improved' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
const attack = (state: GameState) => step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
function defend(state: GameState, heated = false): GameState {
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selected = (state as any).combatStackSelections ?? {};
    const playerId = selected.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P2' ? 'heated' : null });
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const burn = (state: GameState) => state.players.P2.hand.push({ instanceId: 'original-burning', cardId: 'burning' });
const gained = (state: GameState) => state.players.P1.pyroChargesGainedThisTurn ?? 0;
const absorptions = (state: GameState) => state.spellProjectiles.filter((event) => event.style === 'absorb-flames').length;
function evocation(state: GameState): GameState {
  state.players.P1.spellEcho[1] = { instanceId: 'perk', cardId: 'evocation' };
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
}
const card = cardDefinition({ instanceId: '', cardId: 'immolate-improved' });
assert.equal(card.name, 'Immolate Improved'); assert.equal(card.kind, 'attack'); assert.equal(card.value, 0);
for (const player of Object.values(createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks').players)) assert.equal([...player.hand, ...player.deck].some((card) => card.cardId === 'immolate-improved'), false, 'immolate-improved is outside the base starting pool.');

for (const stack of [false, true]) {
  // One guaranteed absorption if Burning application succeeds; two if a source already exists.
  for (const initiallyBurning of [false, true]) {
    let state = setup(stack); if (initiallyBurning) burn(state);
    state = attack(state); assert.equal(state.pendingAttack?.attackValue, 2);
    assert.equal(gained(state), 0, 'Declaring the Attack does not absorb early.');
    state = defend(state);
    assert.equal(state.combatReveal?.attackTotal, initiallyBurning ? 4 : 3);
    assert.equal(gained(state), initiallyBurning ? 2 : 1);
    assert.equal(state.players.P1.hp, initiallyBurning ? 12 : 11);
    assert.equal(absorptions(state), initiallyBurning ? 2 : 1);
    assert.ok(!state.players.P2.hand.some((card) => card.cardId === 'burning'));
    if (initiallyBurning) assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'original-burning'));
    state = acknowledge(state);
    assert.equal(absorptions(state), initiallyBurning ? 2 : 1, 'No replay during reveal/acknowledgement.');
  }

  // User's 6 ATT example: one first-Action Charge + two in combat, even across discharge.
  let state = setup(stack); state.players.P1.attackRange = 3; state.players.P1.pyroCharges = 1;
  assert.ok(modifySquare(state, cell(2, 2), 'patch-of-flames'));
  state = evocation(state); assert.equal(gained(state), 1); assert.equal(state.players.P1.pyroCharges, 2);
  burn(state); state = defend(attack(state));
  assert.equal(state.combatReveal?.attackTotal, 6);
  assert.equal(gained(state), 3); assert.equal(state.players.P1.pyroCharges, 1, 'Third-Charge discharge does not subtract earned Charges from the formula.');
  assert.equal(state.players.P1.hp, 13); assert.equal(state.players.P2.hp, 23, '2 Fireball Damage plus 5 combat Damage.');
  assert.equal(absorptions(state), 3);
  assert.equal(state.spellProjectiles.filter((event) => event.style === 'pyro-discharge').length, 1);
  assert.ok(state.combatReveal?.attackModifiers?.some((modifier) => modifier.value === 6 && modifier.source.includes('FP + Pyro Charges')));

  state = setup(stack); state.players.P1.pyroCharges = 2; burn(state); state = defend(attack(state));
  assert.equal(gained(state), 2); assert.equal(state.combatReveal?.attackTotal, 4, 'Stored previous-turn Charges are not gained-this-turn Charges.');
  assert.equal(state.players.P1.pyroCharges, 1);

  // Lens uses captured magnified FP; absorption still uses caster Range, not the Lens.
  state = setup(stack); state.players.P2.position = cell(4); burn(state);
  assert.ok(summonLens(state, 'P1', cell(3)));
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects[0].id });
  const selection = JSON.stringify(state);
  const cancelled = step(state, { type: 'cancel-targeting', playerId: 'P1' });
  assert.equal(gained(cancelled), 0); assert.equal(cancelled.players.P1.actionsRemaining, 2);
  state = step(JSON.parse(selection), { type: 'lens-target', playerId: 'P1', targetId: 'P2', targetKind: 'player' });
  assert.equal(state.pendingAttack?.fyrePoints, 3); state = defend(state);
  assert.equal(state.combatReveal?.attackTotal, 5); assert.equal(gained(state), 2);
  assert.equal(state.objects.filter((object) => object.kind === 'lens').length, 1);

  // Intrinsic formula survives cancellation; pre-combat effects do not.
  for (const block of ['block', 'spellblock', 'block-with-flames', 'decisive-block'] as const) {
    state = setup(stack, block); burn(state); assert.ok(absorbFlames(state, 'P1')); burn(state);
    state = defend(attack(state)); assert.equal(gained(state), 1); assert.equal(state.combatReveal?.attackTotal, 3);
    assert.equal(absorptions(state), 1); assert.ok(state.players.P2.hand.some((card) => card.cardId === 'burning'));
  }
  state = setup(stack); burn(state); state.players.P1.hand.push({ instanceId: 'exhaust', cardId: 'exhaust' });
  state = defend(attack(state)); assert.equal(state.combatReveal?.attackTotal, 3, 'Other value modifiers still apply.');

  state = setup(stack); burn(state); state.players.P1.traitBlocked = true;
  state = defend(attack(state)); assert.equal(gained(state), 0); assert.equal(state.combatReveal?.attackTotal, 0);
  assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'burning').length, 2, 'Trait blocking prevents absorption, not Card Burning.');

  state = setup(stack, 'breezy'); burn(state);
  state = defend(attack(state)); assert.equal(gained(state), 1, 'Breezy removes the original Burning before the attacking sequence.');
  assert.equal(state.combatReveal?.attackTotal, 3); assert.equal(state.players.P2.hp, 30, 'Removing and reapplying Burning does not undo latched prevention.');

  state = setup(stack); state.players.P2.character = 'spectre'; state.players.P2.position = cell(7); burn(state);
  state.objects.push({ id: 'replica', kind: 'spectre-replica', name: 'Replica', ownerId: 'P2', hp: 999, maxHp: 999, position: cell(3) });
  state = step(state, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', origin: 'spectre', targetKind: 'replica', targetId: 'replica' });
  state = defend(state); assert.equal(gained(state), 2); assert.equal(state.combatReveal?.attackTotal, 4, 'Replica targeting uses the same ordered value and absorption.');

  state = setup(stack); state.players.P1.attackRange = 1; state.players.P2.position = cell(5); burn(state);
  assert.ok(summonLens(state, 'P1', cell(3)));
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects[0].id });
  state = step(state, { type: 'lens-target', playerId: 'P1', targetId: 'P2', targetKind: 'player' });
  state = defend(state); assert.equal(gained(state), 0, 'Lens extends targeting, not caster absorption Range.');
  assert.equal(state.combatReveal?.attackTotal, 1); assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'burning').length, 2);

  state = setup(stack); burn(state); state.players.P2.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
  state = defend(attack(state), stack); assert.equal(gained(state), 2, 'Later Combat Cards cannot undo resolved absorptions.');

  // Lethal first discharge stops the sequence, discards defense once and clears pending combat.
  state = setup(stack); burn(state); state.players.P1.pyroCharges = 2; state.players.P2.hp = 2;
  state = defend(attack(state)); assert.equal(state.winner, 'P1'); assert.equal(state.pendingAttack, null);
  assert.equal(absorptions(state), 1); assert.equal(gained(state), 1);
  assert.equal(state.players.P2.discard.filter((card) => card.instanceId === 'defense').length, 1);

  // Object targets have no Hand, but both absorption attempts still occur before destruction.
  state = setup(stack); state.players.P2.position = cell(7);
  state.objects.push({ id: 'box', kind: 'wooden-box', name: 'Box', hp: 3, maxHp: 3, position: cell(3) });
  assert.ok(modifySquare(state, cell(2, 2), 'patch-of-flames')); assert.ok(modifySquare(state, cell(2, 0), 'patch-of-flames'));
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'box' });
  assert.equal(gained(state), 2); assert.equal(absorptions(state), 2); assert.equal(state.objects.length, 0);
}

// Turn boundary/undo: actual successful gains only; no carryover from an enemy's turn.
let state = setup(); assert.ok(modifySquare(state, cell(2, 2), 'patch-of-flames'));
state = evocation(state); assert.equal(gained(state), 1);
state = step(state, { type: 'undo-last-action', playerId: 'P1' }); assert.equal(gained(state), 0);
state = evocation(state); state.players.P1.freeMoveUsed = true;
state = step(state, { type: 'end-turn', playerId: 'P1' }); assert.equal(gained(state), 0);
state.players.P2.freeMoveUsed = true;
state = step(state, { type: 'end-turn', playerId: 'P2' }); assert.equal(gained(state), 0);
assert.equal(absorbFlames(state, 'P1'), false); assert.equal(gained(state), 0, 'Failed absorption grants no Charge.');
state.players.P1.flameWard = { level: 3, triggered: false };
state.players.P1.freeMoveUsed = true; state = step(state, { type: 'end-turn', playerId: 'P1' });
state.players.P2.freeMoveUsed = true; state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(gained(state), 1, 'An unused Ward reward at own turn start counts in the new turn.');

console.log('Immolate Improved checks passed: dynamic FP + earned Charges, 6 ATT example, discharge, ordered absorption, Lens, cancellation, modifiers, lethal cleanup, Objects, turn resets and undo.');
