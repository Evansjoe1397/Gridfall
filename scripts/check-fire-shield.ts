import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { applyCommand, cardBaseValue, cardDefinition, createHotseatTestState, defenseCardValueBonus, isBurningSquare, modifySquare, storedManaShieldDefenseBonus, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function setup(stack = true, attack: CardTypeId = 'attack-3'): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = { x: 2, y: 1 }; state.players.P2.position = { x: 3, y: 1 }; state.players.P2.hp = 10;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'fire-shield' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function fight(state: GameState, heated = false): GameState {
  if (heated) state.players.P1.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selected = (state as any).combatStackSelections ?? {};
    const playerId = selected.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P1' ? 'heated' : null });
  }
  return state;
}
function acknowledge(state: GameState): GameState {
  while (state.phase === 'choosing-exhaust') {
    const choice = state.combatReveal!.exhaust!;
    state = step(state, { type: 'exhaust-decision', playerId: choice.eligible.find((id) => !choice.decided.includes(id))!, use: false });
  }
  return step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
}
const burn = (state: GameState, id: 'P1' | 'P2' = 'P1') => state.players[id].hand.push({ instanceId: `burn-${id}`, cardId: 'burning' });
const burning = (state: GameState, id: 'P1' | 'P2') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
assert.equal(cardDefinition({ instanceId: '', cardId: 'fire-shield' }).kind, 'defend');
assert.equal(cardDefinition({ instanceId: '', cardId: 'fire-shield' }).value, 1);
for (const id of ['P1', 'P2'] as const) assert.ok(createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks').players[id].hand.some((card) => card.cardId === 'fire-shield'));

for (const stack of [false, true]) {
  let state = fight(setup(stack));
  assert.equal(state.combatReveal?.defendTotal, 1);
  assert.equal(state.players.P2.pyroCharges, 0);
  state = acknowledge(state); assert.equal(burning(state, 'P1'), 0); assert.equal(burning(state, 'P2'), 0);

  state = setup(stack); burn(state);
  assert.equal(defenseCardValueBonus(state.players.P2, 'fire-shield'), 0);
  state = fight(state);
  assert.equal(state.combatReveal?.defendTotal, 3, 'Absorbed Burning must raise DEF in the same combat.');
  assert.ok(state.combatReveal?.defendModifiers?.some((modifier) => modifier.value === 2 && modifier.source === 'Fire Shield · Burning'));
  assert.equal(state.players.P2.hp, 11, 'Pre-combat absorption heals before incoming combat Damage.');
  assert.equal(state.players.P2.pyroCharges, 1); assert.equal(burning(state, 'P1'), 0); assert.equal(burning(state, 'P2'), 1);
  assert.ok(state.players.P2.hand.some((card) => card.instanceId === 'burn-P1'), 'Absorb transfers the actual Burning Card.');
  assert.equal(state.spellProjectiles.filter((event) => event.style === 'absorb-flames').length, 1);
  state = acknowledge(state); assert.equal(burning(state, 'P1'), 1); assert.equal(burning(state, 'P2'), 1);
  assert.equal(state.players.P2.pyroCharges, 1, 'Retaliation is not another absorption or Charge.');
  state = acknowledge(state); assert.equal(burning(state, 'P1'), 1);

  state = setup(stack); burn(state, 'P2'); state = fight(state);
  assert.equal(state.combatReveal?.defendTotal, 3); assert.equal(state.players.P2.pyroCharges, 0);
  state = acknowledge(state); assert.equal(burning(state, 'P1'), 1);

  state = setup(stack); assert.ok(modifySquare(state, { x: 4, y: 1 }, 'patch-of-flames'));
  state = fight(state); assert.equal(isBurningSquare(state, { x: 4, y: 1 }), false);
  assert.equal(state.combatReveal?.defendTotal, 3); assert.equal(state.players.P2.pyroCharges, 1);
  state = acknowledge(state); assert.equal(burning(state, 'P1'), 1);

  state = setup(stack); burn(state); state = acknowledge(fight(state, true));
  assert.equal(burning(state, 'P1'), 0, 'Heated Debate cancels Burning retaliation.');
  assert.equal(state.players.P2.hp, 11); assert.equal(state.players.P2.pyroCharges, 1, 'Heated Debate preserves pre-combat absorption and DEF 3.');
  for (const attack of ['feint', 'blessed-might'] as CardTypeId[]) {
    state = setup(stack, attack); burn(state); state = fight(state);
    assert.equal(state.combatReveal?.defendTotal, 3, `${attack} cannot undo defensive pre-combat absorption or its value.`);
    state = acknowledge(state); assert.equal(burning(state, 'P1'), 0); assert.equal(state.players.P2.pyroCharges, 1);
  }

  state = setup(stack); burn(state); state.players.P2.pyroCharges = 2;
  state = fight(state); assert.equal(state.players.P2.pyroCharges, 0);
  assert.equal(state.spellProjectiles.filter((event) => event.style === 'pyro-discharge').length, 1);
  assert.equal(state.players.P1.hp, 16); assert.equal(state.combatReveal?.defendTotal, 3);
  state = acknowledge(state); assert.equal(burning(state, 'P1'), 2, 'Third-Charge discharge and retaliation each apply their own Burning.');

  state = setup(stack, 'dragon-claws'); burn(state);
  state = fight(state); assert.equal(state.combatReveal?.defendTotal, 3);
  assert.equal(state.players.P2.hp, 10, 'Absorption Burning triggers the later Dragon Claws pre-combat Damage.');
  state = acknowledge(state);
  assert.equal(burning(state, 'P2'), 0); assert.equal(burning(state, 'P1'), 1, 'Attack absorption removed defender Burning before retaliation was checked.');
  assert.equal(state.players.P1.pyroCharges, 1); assert.equal(state.players.P2.pyroCharges, 1);

  state = fight(setup(stack, 'arch-beam')); assert.equal(state.combatReveal?.defendTotal, 1);
  assert.equal(state.combatReveal?.attackTotal, 2, 'Fire Shield does not cancel Attack Card effects.');
  state = acknowledge(state); assert.equal(burning(state, 'P2'), 1); assert.equal(burning(state, 'P1'), 1, 'Retaliation sees Burning applied by the Attack after combat.');
}

let state = setup(); burn(state); state.players.P2.traitBlocked = true;
state = fight(state); assert.equal(state.combatReveal?.defendTotal, 1); assert.equal(state.players.P2.pyroCharges, 0); assert.equal(burning(state, 'P1'), 1);
state = setup(); burn(state, 'P2'); state.players.P2.traitBlocked = true;
state = acknowledge(fight(state)); assert.equal(burning(state, 'P1'), 1, 'The conditional Card value and retaliation work with a blocked Trait.');
state = setup(); burn(state); state.players.P2.pyroCharges = 2; state.players.P1.hp = 2;
state = fight(state); assert.equal(state.phase, 'finished'); assert.equal(state.winner, 'P2');
assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.pendingAttack, null); assert.equal(state.combatReveal, null);
assert.equal(state.players.P2.discard.filter((card) => card.cardId === 'fire-shield').length, 1, 'Lethal pre-combat discharge discards the defense exactly once.');

// Resuming an Exhaust choice must not repeat pre-combat absorption.
state = setup(false); burn(state); state.players.P2.hand.push({ instanceId: 'exhaust', cardId: 'exhaust' });
state = fight(state); assert.equal(state.phase, 'choosing-exhaust'); assert.equal(state.combatReveal?.defendTotal, 2);
assert.equal(state.players.P2.pyroCharges, 1); state = acknowledge(state); assert.equal(state.players.P2.pyroCharges, 1);
assert.equal(state.spellProjectiles.filter((event) => event.style === 'absorb-flames').length, 1);

// Execute the production Hand value formatter: 1 normally, 3 Burning, 2 with Exhaust.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const render = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'renderHand') as ts.FunctionDeclaration;
const formatter = render.body!.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(parsed) === 'handValueHtml'))!;
const hud = setup(); const context = { viewer: hud.players.P2, hasHeldExhaust: false, gameState: hud, cardDefinition, cardBaseValue, defenseCardValueBonus, storedManaShieldDefenseBonus };
const format = runInNewContext(ts.transpileModule(formatter.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nhandValueHtml;', context);
assert.equal(format(hud.players.P2.hand[0]), '<b>1</b>'); burn(hud, 'P2');
assert.equal(format(hud.players.P2.hand[0]), '<b>3</b>'); context.hasHeldExhaust = true;
assert.match(format(hud.players.P2.hand[0]), />2<\/b>/);
console.log('Fire Shield checks passed: dynamic DEF after absorption, pre-combat ordering, source transfer/Patch removal, Charges/healing/discharge/lethal cleanup, retaliation timing, cancellation, resumptions and actual Hand values.');
