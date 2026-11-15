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
assert.equal(card.effectText, 'Will obtain +1 DEF bonus on HighGround if Attacker is on Low Ground Square. Absorb Flames in Range if you won this combat.');
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
  // Only a strict defense win absorbs; ties and losses leave existing fire alone.
  for (const outcome of ['win', 'tie', 'loss'] as const) {
    let state = setup(stack, outcome === 'win' ? 'attack-2' : 'attack-3');
    if (outcome === 'loss') state.elevations.D4 = 1;
    assert.ok(modifySquare(state, cell('D4'), 'patch-of-flames'));
    state = fight(state);
    assert.equal(state.players.P2.pyroCharges, 0, 'Absorption waits for acknowledgement.');
    assert.equal(burning(state), 0);
    state = acknowledge(state);
    assert.equal(state.players.P2.pyroCharges, outcome === 'win' ? 1 : 0);
    assert.equal(isBurningSquare(state, cell('D4')), outcome !== 'win');
    assert.equal(burning(state, 'P2'), outcome === 'win' ? 1 : 0);
    assert.equal(state.players.P2.hp, outcome === 'win' ? 11 : outcome === 'tie' ? 10 : 9);
  }
  let state = acknowledge(fight(setup(stack, 'attack-2')));
  assert.equal(Object.keys(state.squareModifications ?? {}).length, 0, 'Wall of Fire never creates flames.');
  assert.equal(state.players.P2.pyroCharges, 0, 'A win without a source grants no Charge.');
  assert.equal(burning(state), 0); assert.equal(burning(state, 'P2'), 0);

  state = setup(stack, 'attack-2');
  state.players.P1.hand.push({ instanceId: 'source-burning', cardId: 'burning' });
  state = acknowledge(fight(state));
  assert.equal(burning(state), 0); assert.equal(burning(state, 'P2'), 1);
  assert.ok(state.players.P2.hand.some((card) => card.instanceId === 'source-burning'), 'Winning absorption transfers the actual source Card.');
  assert.equal(state.players.P2.pyroCharges, 1);

  state = setup(stack, 'attack-2'); state.players.P2.traitBlocked = true;
  assert.ok(modifySquare(state, cell('D4'), 'patch-of-flames'));
  state = acknowledge(fight(state)); assert.ok(isBurningSquare(state, cell('D4'))); assert.equal(state.players.P2.pyroCharges, 0);

  for (const cancelling of ['feint', 'blessed-might'] as const) {
    state = setup(stack, cancelling); assert.ok(modifySquare(state, cell('D4'), 'patch-of-flames'));
    state = acknowledge(fight(state)); assert.ok(isBurningSquare(state, cell('D4'))); assert.equal(state.players.P2.pyroCharges, 0, 'Normal Defend effect cancellation prevents absorption.');
  }
  state = setup(stack, 'attack-2'); state.players.P1.position = cell('B4'); state.players.P1.attackRange = 3;
  assert.ok(modifySquare(state, cell('B4'), 'patch-of-flames'));
  state = acknowledge(fight(state)); assert.ok(isBurningSquare(state, cell('B4'))); assert.equal(state.players.P2.pyroCharges, 0, 'Use defender Range, not attacker Range.');

  state = setup(stack, 'attack-2'); state.players.P2.pyroCharges = 2; state.players.P1.hp = 2;
  state.players.P2.deck = [{ instanceId: 'charge-draw', cardId: 'dragon-claws' }];
  assert.ok(modifySquare(state, cell('D4'), 'patch-of-flames'));
  state = acknowledge(fight(state)); assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.players.P1.hp, 0, 'A winning third Charge still discharges normally.');
  assert.equal(state.players.P2.discard.filter((card) => card.cardId === 'wall-of-fire').length, 1);
  assert.ok(state.players.P2.hand.some((card) => card.instanceId === 'charge-draw'), 'The third Charge draws before discharging.');

  // These attack movements formerly used Wall's removed pre-combat/departure effects.
  state = acknowledge(fight(setup(stack, 'pocket-lens')));
  assert.deepEqual(state.players.P1.position, cell('B4')); assert.equal(burning(state), 0);
  assert.equal(state.players.P2.pyroCharges, 0); assert.equal(Object.keys(state.squareModifications ?? {}).length, 0);
  state = acknowledge(fight(setup(stack, 'pyrodash')));
  assert.deepEqual(state.players.P1.position, cell('G4')); assert.equal(burning(state), 0);
  assert.equal(state.players.P2.pyroCharges, 0); assert.equal(Object.keys(state.squareModifications ?? {}).length, 0);
}

let state = setup(true, 'attack-2'); assert.ok(modifySquare(state, cell('D4'), 'patch-of-flames'));
state = acknowledge(fight(state, true)); assert.equal(state.players.P2.pyroCharges, 0); assert.ok(isBurningSquare(state, cell('D4')), 'Heated Debate cancels the winning reward.');
state = acknowledge(fight(setup(true, 'dance-through')));
assert.equal(state.phase, 'dance-through');
state = step(state, { type: 'move', playerId: 'P1', to: cell('C4') });
assert.equal(burning(state), 0, 'Manual combat movement has no departure guarantee.');
state = step(state, { type: 'end-dance', playerId: 'P1' });
assert.equal(Object.keys(state.squareModifications ?? {}).length, 0);
state = setup(true, 'lightbringer'); state = declare(state);
state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
assert.equal(state.phase, 'choosing-lightbringer-swap');
assert.equal(Object.keys(state.squareModifications ?? {}).length, 0, 'No pre-combat flames while waiting for a choice.');
state = step(state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
state = acknowledge(choices(state)); assert.equal(burning(state), 0);

// Execute the production Hand value formatter with an actual declared Attack.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const render = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'renderHand') as ts.FunctionDeclaration;
const formatter = render.body!.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(parsed) === 'handValueHtml'))!;
state = setup(); state.elevations = { E4: 1 }; state = declare(state);
const context = { viewer: state.players.P2, hasHeldExhaust: false, gameState: state, cardDefinition, cardBaseValue, defenseCardValueBonus, storedManaShieldDefenseBonus };
const format = runInNewContext(ts.transpileModule(formatter.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nhandValueHtml;', context);
assert.match(format(state.players.P2.hand[0]), />4<\/b>/);
console.log('Wall of Fire checks passed: unchanged DEF/HUD, strict wins versus ties/losses, existing-source absorption, no fire creation/departure guarantee, movement, cancellation, Range, Trait blocking and Charges.');
