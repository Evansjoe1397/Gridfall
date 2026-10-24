import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { CARDS, CharacterIdSchema, applyCommand, cardDefinition, createHotseatTestState, createPipeTestState, createTrenchTestState, createBestOfThreeState, enablePerkMode, focusLensFyrePoints, FOCUS_LENS_DESCRIPTION, PYRO_CHARGES_DESCRIPTION, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';
import { createFyrebanks, updateFyrebanksAnimation } from '../src/fyrebanksModel.ts';
import { characterStatusCards } from '../src/character-status-cards.ts';

function setup(range = 2, distance = 1, stack = true, defense: CardTypeId = 'defend-1'): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.attackRange = range; state.players.P1.position = { x: 2, y: 1 };
  state.players.P2.position = { x: 2 + distance, y: 1 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'arch-beam' }];
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
    const selections = (state as any).combatStackSelections ?? {};
    const playerId = selections.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P2' ? 'heated' : null });
  }
  return state;
}
function acknowledged(state: GameState): GameState {
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
const burning = (state: GameState) => state.players.P2.hand.filter((card) => card.cardId === 'burning').length;
assert.equal(CharacterIdSchema.safeParse('fyrebanks').success, false, 'Online character selection rejects the Hotseat-only character.');
assert.equal(cardDefinition({ instanceId: '', cardId: 'arch-beam' }).value, 0);
assert.equal(cardDefinition({ instanceId: '', cardId: 'arch-beam' }).effectText, 'Before combat: +FP to Attack. Apply Burning to target after combat.');
assert.equal(CARDS.filter((card) => card.id === 'arch-beam').length, 1);
assert.deepEqual(characterStatusCards('fyrebanks').map((card) => card.id), ['burning']);

for (const create of [() => createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks'), () => createHotseatTestState(false, 'fyrebanks', 3), () => createPipeTestState(false, 'fyrebanks', 'fyrebanks'), () => createTrenchTestState(false, 'fyrebanks', 'fyrebanks')]) {
  const state = create(); const player = state.players.P1;
  assert.equal(player.name, 'Fyrebanks'); assert.equal(player.maxHp, 18); assert.equal(player.hp, 18);
  assert.equal(player.moveRange, 2); assert.equal(player.attackRange, 2);
  assert.deepEqual(player.hand.map((card) => card.cardId), ['block-with-flames', 'fire-shield', 'lens', 'counterflame', 'pocket-lens'], 'Hotseat starts with exactly the five newest Fyrebanks Cards.');
  assert.ok(player.deck.some((card) => card.cardId === 'arch-beam'), 'Earlier prototype Cards remain available from the Deck.');
  assert.notEqual(state.phase, 'choosing-focus', 'The incomplete character has no undefined opening Focus choices.');
  enablePerkMode(state); assert.equal(player.perkMode, undefined, 'No invented Perks are added to the incomplete character.');
}
const series = createBestOfThreeState('duel', { P1: ['fyrebanks', 'fyrebanks'], P2: ['fyrebanks', 'fyrebanks'] }, true);
assert.equal(series.players.P1.character, 'fyrebanks');

let cases = 0;
for (const stack of [false, true]) for (const range of [1, 2, 3, 4, 5]) for (let distance = 1; distance <= range; distance++) {
  const expected = Math.min(3, range - distance + 1);
  let state = setup(range, distance, stack);
  assert.equal(focusLensFyrePoints(state, state.players.P1, state.players.P2.position), expected);
  state = attack(state);
  assert.equal(state.pendingAttack?.fyrePoints, expected);
  assert.equal(state.pendingAttack?.attackValue, 0, 'The bonus belongs to the before-combat effect.');
  state = defend(state);
  assert.equal(state.combatReveal?.attackTotal, expected);
  assert.ok(state.combatReveal?.attackModifiers?.some((modifier) => modifier.value === expected && modifier.source === 'Arch Beam · Focus Lens FP'));
  assert.equal(burning(state), 0, 'After-combat Burning waits for acknowledgement.');
  state = acknowledged(state);
  assert.equal(burning(state), 1, 'Burning applies whether the Attack wins, ties, or loses.');
  assert.equal(state.pendingAttack, null, 'FP ends with this combat.');
  assert.equal((state.players.P1 as any).fyrePoints, undefined, 'There is no stored FP resource.');
  cases++;
}
for (const stack of [false, true]) {
  for (const defense of ['block', 'spellblock', 'decisive-block', 'tomb-block', 'da-blokk', 'blessed-block'] as CardTypeId[]) {
    const state = acknowledged(defend(attack(setup(3, 1, stack, defense))));
    assert.equal(burning(state), 0, `${defense} cancels Arch Beam's after-combat Burning.`);
    assert.ok(!state.log.some((entry) => entry.includes('Focus Lens applied')), `${defense} cancels Arch Beam's +FP effect.`);
  }
  let state = setup(3, 1, stack);
  state.players.P1.traitBlocked = true;
  state = defend(attack(state)); assert.equal(state.combatReveal?.attackTotal, 0);
  state = acknowledged(state); assert.equal(burning(state), 1, 'Blocking the Trait does not cancel the Card Burning effect.');

  state = setup(3, 1, stack);
  state.players.P1.hand.push({ instanceId: 'negative', cardId: 'exhaust' });
  state = defend(attack(state)); assert.equal(state.combatReveal?.attackTotal, 2, 'Exhaust still reduces the upgraded Attack.');

  state = attack(setup(2, 1, stack)); state.players.P1.attackRange = 5;
  state = defend(state); assert.equal(state.combatReveal?.attackTotal, 2, 'FP uses the maximum Range captured at declaration.');

  state = setup(3, 1, stack, 'defend-1');
  state.players.P1.hand.push({ instanceId: 'next', cardId: 'arch-beam' });
  state = acknowledged(defend(attack(state)));
  state.players.P2.position = { x: 5, y: 1 }; state.players.P2.hand.push({ instanceId: 'defense', cardId: 'defend-1' });
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'next', targetId: 'P2' });
  assert.equal(state.pendingAttack?.fyrePoints, 1, 'The next Attack recalculates FP with no carryover.');

  state = setup(3, 1, stack); state.players.P2.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
  state = defend(attack(state), true);
  assert.equal(state.combatReveal?.attackTotal, 3, 'Post-combat cancellation preserves the earlier FP bonus.');
  assert.equal(burning(acknowledged(state)), 0, 'Heated Debate cancels after-combat Burning.');
}
let invalid = setup(2, 3);
assert.equal(applyCommand(invalid, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }).ok, false);
assert.equal(focusLensFyrePoints(invalid, invalid.players.P1, invalid.players.P2.position), 0);
invalid = setup(); invalid.players.P1.onceUponRangeBonus = 1;
assert.equal(focusLensFyrePoints(invalid, invalid.players.P1, invalid.players.P2.position), 3, 'Effective maximum Range upgrades boost FP.');

const replica = setup(3, 3);
replica.players.P2.character = 'spectre';
replica.objects = [{ id: 'replica', kind: 'spectre-replica', name: 'Replica', hp: 999, maxHp: 999, ownerId: 'P2', position: { x: 3, y: 1 } }];
const declaredReplica = step(replica, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'replica', targetKind: 'replica', origin: 'spectre' });
assert.equal(declaredReplica.pendingAttack?.fyrePoints, 3, 'FP uses the targeted body, not the distant replica owner.');
assert.equal(defend(declaredReplica).combatReveal?.attackTotal, 3);
replica.players.P1.hand.push({ instanceId: 'exhaust', cardId: 'exhaust' });
const exhaustedReplica = step(replica, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'replica', targetKind: 'replica', origin: 'spectre' });
assert.equal(defend(exhaustedReplica).combatReveal?.attackTotal, 2, 'Exhaust applies before deferred FP on replica-targeted Attacks too.');

const model = createFyrebanks();
assert.ok(model.getObjectByName('RedRobe')); assert.ok(model.getObjectByName('MonocleRim')); assert.ok(model.getObjectByName('FocusLens'));
for (const pose of ['idle', 'attack', 'defend'] as const) updateFyrebanksAnimation(model, 1000, pose);
const bounds = new THREE.Box3().setFromObject(model);
assert.ok(bounds.max.y > 2.5 && bounds.max.y < 3.5, 'The board model has normal character dimensions.');

// Run the production trait composer to verify the badge, tooltip and combat-only FP display.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const composer = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'playerAbilityIcon')!;
const gameState = attack(setup(3));
const code = ts.transpileModule(composer.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const render = runInNewContext(code + '\nplayerAbilityIcon;', { gameState, CHARACTER_SELECT_INFO: { fyrebanks: { trait: 'Focus Lens' } }, FOCUS_LENS_DESCRIPTION, PYRO_CHARGES_DESCRIPTION, gameIcon: (name: string) => `<img data-icon="${name}">`, escapeHtml: (value: string) => value }) as (player: GameState['players']['P1']) => string;
assert.match(render(gameState.players.P1), /focus-lens/); assert.match(render(gameState.players.P1), /Focus Lens · 3 FP/);
gameState.pendingAttack = null; assert.match(render(gameState.players.P1), /No FP is stored/);
console.log(`Fyrebanks checks passed: Hotseat setup, ${cases} Range/distance combats, FP timing/cancellation, Burning, replicas, model and HUD.`);
