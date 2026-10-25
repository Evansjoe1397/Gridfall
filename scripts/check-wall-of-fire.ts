import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { applyCommand, cardBaseValue, cardDefinition, createHotseatTestState, defenseCardValueBonus, isBurningSquare, modifySquare, storedManaShieldDefenseBonus, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(stack = true, attack: CardTypeId = 'attack-3'): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell('D4'); state.players.P2.position = cell('E4'); state.players.P2.hp = 10;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'wall-of-fire' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
const declare = (state: GameState) => step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
function choices(state: GameState, heated = false): GameState {
  while (state.phase === 'choosing-combat-stack' || state.phase === 'choosing-exhaust') {
    if (state.phase === 'choosing-exhaust') {
      const choice = state.combatReveal!.exhaust!;
      state = step(state, { type: 'exhaust-decision', playerId: choice.eligible.find((id) => !choice.decided.includes(id))!, use: false });
    } else {
      const selected = (state as any).combatStackSelections ?? {}; const playerId = selected.P1 === undefined ? 'P1' : 'P2';
      state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P1' ? 'heated' : null });
    }
  }
  return state;
}
function fight(state: GameState, heated = false): GameState {
  if (heated) state.players.P1.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
  return choices(step(declare(state), { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' }), heated);
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const burning = (state: GameState, id: 'P1' | 'P2' = 'P1') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
const card = cardDefinition({ instanceId: '', cardId: 'wall-of-fire' });
assert.equal(card.name, 'Wall of Fire'); assert.equal(card.kind, 'defend'); assert.equal(card.value, 3);
assert.equal(card.effectText, 'Will obtain +1 DEF bonus on HighGround if Attacker is on Low Ground Square. Before combat: create Patch of Flames under the Attacker. The Attacker is guaranteed to Burn if they leave this Square in this combat. Absorb Flames in Range after combat.');
for (const player of Object.values(createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks').players)) assert.equal([...player.hand, ...player.deck].some((card) => card.cardId === 'wall-of-fire'), false, 'wall-of-fire is outside the base starting pool.');

for (const stack of [false, true]) {
  for (const [attackerHigh, defenderHigh, expected] of [[false,false,3],[false,true,4],[true,true,3],[true,false,3]] as const) {
    let state = setup(stack); state.elevations = { D4: Number(attackerHigh), E4: Number(defenderHigh) };
    state = declare(state);
    assert.equal(defenseCardValueBonus(state.players.P2, 'wall-of-fire', false, state), expected - 3);
    state = choices(step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' }));
    assert.equal(state.combatReveal?.defendTotal, expected);
    assert.equal(state.combatReveal?.defendModifiers?.some((modifier) => modifier.source === 'Wall of Fire · High Ground against Low Ground'), expected === 4);
  }
  let state = fight(setup(stack));
  assert.ok(isBurningSquare(state, cell('D4')), 'Patch is visible before the result is acknowledged.');
  assert.equal(burning(state), 0); assert.equal(state.players.P2.pyroCharges, 0);
  assert.equal(state.log.filter((line) => line.includes('Wall of Fire created Patch')).length, 1, 'Pre-combat effect runs once through resumed defense.');
  state = acknowledge(state);
  assert.equal(isBurningSquare(state, cell('D4')), false, 'After-combat absorption consumes the nearby Patch.');
  assert.equal(burning(state), 0, 'Stationary attacker does not receive guaranteed Burning.');
  assert.equal(burning(state, 'P2'), 1); assert.equal(state.players.P2.pyroCharges, 1); assert.equal(state.players.P2.hp, 11);
  state.players.P1.movementRemaining = 1; state.players.P1.freeMoveUsed = true;
  state = step(state, { type: 'move', playerId: 'P1', to: cell('C4') });
  assert.equal(burning(state), 0, 'The departure guarantee expires with combat.');

  state = acknowledge(fight(setup(stack, 'pocket-lens')));
  assert.deepEqual(state.players.P1.position, cell('B4')); assert.equal(burning(state), 1, 'Departure from existing fire gives one Card, without a duplicate guarantee.');
  assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P2.pyroCharges, 1);
  state = acknowledge(fight(setup(stack, 'pyrodash')));
  assert.deepEqual(state.players.P1.position, cell('G4')); assert.equal(burning(state), 1, 'Guarantee survives absorption before deferred Pyrodash.');
  assert.equal(state.players.P1.pyroCharges, 0); assert.equal(isBurningSquare(state, cell('D4')), false);
  state = acknowledge(fight(setup(stack, 'feint')));
  assert.ok(isBurningSquare(state, cell('D4')), 'Feint cannot undo resolved pre-combat flames.');
  assert.equal(state.players.P2.pyroCharges, 0, 'Feint cancels after-combat absorption.');
  state = setup(stack); state.players.P2.traitBlocked = true; state = acknowledge(fight(state));
  assert.ok(isBurningSquare(state, cell('D4'))); assert.equal(state.players.P2.pyroCharges, 0, 'Curse blocks absorption, not terrain creation.');

  for (const water of ['water', 'shallow-water'] as const) {
    state = setup(stack, 'pyrodash'); assert.ok(modifySquare(state, cell('D4'), water));
    state = fight(state); assert.equal(isBurningSquare(state, cell('D4')), false); assert.equal(state.pendingAttack?.wallOfFire, undefined);
    state = acknowledge(state); assert.equal(burning(state), 0, 'No Patch creation means no guaranteed Burning, as clarified by user.');
  }
  state = setup(stack); state.players.P1.position = cell('B4'); state.players.P1.attackRange = 3;
  state = acknowledge(fight(state)); assert.ok(isBurningSquare(state, cell('B4'))); assert.equal(state.players.P2.pyroCharges, 0, 'Absorption uses defender Range, not attacker Range.');
  state = setup(stack); state.players.P2.pyroCharges = 2; state.players.P1.hp = 2;
  state = acknowledge(fight(state)); assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.players.P1.hp, 0, 'Third Charge discharges normally.');
  assert.equal(state.players.P2.discard.filter((card) => card.cardId === 'wall-of-fire').length, 1);
}

let state = acknowledge(fight(setup(true, 'pyrodash'), true));
assert.equal(burning(state), 1); assert.ok(isBurningSquare(state, cell('D4'))); assert.equal(state.players.P2.pyroCharges, 0, 'Heated Debate cancels absorption but not prior flames/guarantee.');
state = setup(true, 'pyrodash'); state.players.P2.position = cell('F5');
state = acknowledge(fight(state)); assert.equal(state.phase, 'choosing-pyrodash-direction'); assert.equal(burning(state), 0);
state = step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: 1, dy: 0 }); assert.equal(burning(state), 1, 'Guarantee survives manual selection of deferred dash direction.');
for (const moveDuringEffect of [false, true]) {
  state = acknowledge(fight(setup(true, 'dance-through'))); assert.equal(state.phase, 'dance-through');
  assert.equal(isBurningSquare(state, cell('D4')), false);
  if (moveDuringEffect) state = step(state, { type: 'move', playerId: 'P1', to: cell('C4') });
  assert.equal(burning(state), moveDuringEffect ? 1 : 0, 'Deferred Dance Through retains the combat departure guarantee.');
  state = step(state, { type: 'end-dance', playerId: 'P1' });
  state.players.P1.movementRemaining = 1; state.players.P1.freeMoveUsed = true;
  state = step(state, { type: 'move', playerId: 'P1', to: cell(moveDuringEffect ? 'B4' : 'C4') });
  assert.equal(burning(state), moveDuringEffect ? 1 : 0, 'Ending Dance Through clears its deferred guarantee.');
}

for (const replica of [false, true]) {
  state = setup(true, 'lightbringer');
  if (replica) {
    state.players.P1.character = 'spectre'; state.players.P1.position = cell('H8');
    state.objects.push({ id: 'attacking-replica', name: 'Replica', kind: 'spectre-replica', ownerId: 'P1', hp: 999, maxHp: 999, position: cell('D4') });
    state = step(state, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', origin: 'replica', targetKind: 'player', targetId: 'P2' });
  } else state = declare(state);
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  assert.equal(state.phase, 'choosing-lightbringer-swap'); assert.ok(isBurningSquare(state, cell('D4')));
  if (replica) assert.equal(isBurningSquare(state, cell('H8')), false, 'Create fire under the attacking body, not its owner.');
  state = step(state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
  state = acknowledge(choices(state)); assert.equal(burning(state), 1, 'Pre-combat body movement triggers the same guarantee once.');
}

// Execute the production Hand value formatter with an actual declared Attack.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const render = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'renderHand') as ts.FunctionDeclaration;
const formatter = render.body!.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(parsed) === 'handValueHtml'))!;
state = setup(); state.elevations = { E4: 1 }; state = declare(state);
const context = { viewer: state.players.P2, hasHeldExhaust: false, gameState: state, cardDefinition, cardBaseValue, defenseCardValueBonus, storedManaShieldDefenseBonus };
const format = runInNewContext(ts.transpileModule(formatter.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nhandValueHtml;', context);
assert.match(format(state.players.P2.hand[0]), />4<\/b>/);
console.log('Wall of Fire checks passed: conditional DEF/HUD, once-only pre-combat Patch, departure guarantee/absorption/deferred movement, water clarification, cancellation, Range, Trait blocking and Charges.');
