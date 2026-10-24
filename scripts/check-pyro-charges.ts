import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { absorbFlames, addForcedStatusCard, applyCommand, createHotseatTestState, flameAbsorptionPath, flameAbsorptionSources, isBurningSquare, modifySquare, type Cell, type GameCommand, type GameState } from '../shared/game.ts';
import { updatePyroChargeVisuals, disposePyroChargeVisuals } from '../src/pyro-charge-visuals.ts';
import { FireboltVisual } from '../src/fireboltVisuals.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  state.phase = 'active'; state.objects = []; state.elevations = {}; state.spellProjectiles = []; state.objectPushAnimations = [];
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; player.freeMoveUsed = true; player.movementRemaining = 0; }
  state.players.P1.position = cell('B2'); state.players.P2.position = cell('D2');
  state.players.P1.hp = 10;
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function burn(state: GameState, id: 'P1' | 'P2', count = 1): void {
  for (let index = 0; index < count; index++) state.players[id].hand.push({ instanceId: `${id}-burning-${index}`, cardId: 'burning', sourcePlayerId: 'P2' });
}
const countBurning = (state: GameState, id: 'P1' | 'P2') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
const ignite = (state: GameState, label: string) => assert.ok(modifySquare(state, cell(label), 'patch-of-flames'));

// Taking Burning preserves its identity/source; absorption never discards or Removes it.
let state = setup(); burn(state, 'P2', 2);
const card = { ...state.players.P2.hand[0] };
assert.ok(absorbFlames(state, 'P1'));
assert.equal(state.players.P1.pyroCharges, 1); assert.equal(state.players.P1.hp, 11);
assert.equal(state.players.P1.matchStats?.hitPointsHealed, 1);
assert.equal(countBurning(state, 'P2'), 1);
assert.equal(state.players.P1.hand[0].instanceId, card.instanceId);
assert.equal(state.players.P1.hand[0].sourcePlayerId, card.sourcePlayerId);
assert.equal(state.players.P2.discard.length, 0); assert.equal(state.players.P2.removedDeck?.length ?? 0, 0);
assert.equal(state.spellProjectiles[0].style, 'absorb-flames');
assert.deepEqual(state.spellProjectiles[0].from, cell('D2')); assert.deepEqual(state.spellProjectiles[0].to, cell('B2'));

state = setup(); ignite(state, 'C2'); ignite(state, 'D2'); burn(state, 'P2');
assert.equal(flameAbsorptionSources(state, 'P1')[0].kind, 'square', 'A nearer Square wins over a farther enemy.');
assert.ok(absorbFlames(state, 'P1'));
assert.equal(isBurningSquare(state, cell('C2')), false); assert.ok(isBurningSquare(state, cell('D2')));
assert.equal(countBurning(state, 'P1'), 1); assert.equal(countBurning(state, 'P2'), 1);
assert.equal(flameAbsorptionSources(state, 'P1')[0].kind, 'enemy', 'Enemy wins a same-Square/same-distance tie.');
assert.ok(absorbFlames(state, 'P1')); assert.equal(countBurning(state, 'P2'), 0);

state = setup(); state.players.P2.position = cell('F2'); ignite(state, 'E2');
const untouched = JSON.stringify(state);
assert.equal(absorbFlames(state, 'P1'), false); assert.equal(JSON.stringify(state), untouched, 'No source means no mutation or charge/heal.');
assert.ok(absorbFlames(state, 'P1', 3), 'A Card may override absorption Range.');
assert.equal(state.players.P1.pyroCharges, 1);

// Closed diagonal corners force a longer route; its complete length must fit Range.
state = setup(); state.players.P1.position = cell('C3'); state.players.P2.position = cell('D4'); burn(state, 'P2');
state.objects = ['D3', 'C4'].map((label, index) => ({ id: `wall-${index}`, kind: 'wall-pillar', name: 'Column', hp: 999, maxHp: 999, position: cell(label) }));
assert.equal(flameAbsorptionPath(state, cell('C3'), cell('D4'), 1), null);
const bent = flameAbsorptionPath(state, cell('C3'), cell('D4'), 8)!;
assert.ok(bent.length > 2);
assert.equal(absorbFlames(state, 'P1', bent.length - 2), false);
assert.ok(absorbFlames(state, 'P1', bent.length - 1));
assert.deepEqual(state.spellProjectiles[0].path, bent.slice().reverse());

// Third charge: two Damage, Burning, correct source attribution and sequenced animation.
state = setup(); burn(state, 'P2', 3);
const enemyHp = state.players.P2.hp;
for (let index = 0; index < 3; index++) assert.ok(absorbFlames(state, 'P1'));
assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.hp, 13);
assert.equal(countBurning(state, 'P1'), 3); assert.equal(countBurning(state, 'P2'), 1);
assert.equal(state.players.P2.hp, enemyHp - 2);
assert.equal(state.players.P1.matchStats?.totalDamage, 2);
const discharge = state.spellProjectiles.find((event) => event.style === 'pyro-discharge')!;
assert.equal(discharge.targetId, 'P2'); assert.equal(discharge.damage, 2);
assert.equal(discharge.afterProjectileId, state.spellProjectiles.filter((event) => event.style === 'absorb-flames').at(-1)!.id);
assert.ok(state.objectPushAnimations.some((event) => event.damage?.triggerAnimationId === discharge.id));

state = setup(); state.players.P2.position = cell('G7'); state.players.P1.pyroCharges = 2; ignite(state, 'B2');
assert.ok(absorbFlames(state, 'P1'));
assert.equal(state.players.P1.pyroCharges, 0, 'All 3 Charges are spent even without a target.');
assert.equal(state.spellProjectiles.some((event) => event.style === 'pyro-discharge'), false);
assert.equal(state.players.P2.hp, state.players.P2.maxHp);

state = setup(); state.players.P1.hp = state.players.P1.maxHp; burn(state, 'P2');
assert.ok(absorbFlames(state, 'P1')); assert.equal(state.players.P1.hp, state.players.P1.maxHp); assert.equal(state.players.P1.pyroCharges, 1);
state.players.P1.traitBlocked = true;
const blocked = JSON.stringify(state); assert.equal(absorbFlames(state, 'P1'), false); assert.equal(JSON.stringify(state), blocked);

state = setup(); state.players.P2.position = cell('C2'); ignite(state, 'B3');
assert.equal(flameAbsorptionSources(state, 'P1')[0].kind, 'square', 'An enemy without Burning is not a source.');
modifySquare(state, cell('B3'), 'shallow-water');
assert.equal(absorbFlames(state, 'P1'), false, 'Extinguished fire cannot grant a Charge.');
burn(state, 'P2'); state.players.P2.hp = 0;
assert.equal(absorbFlames(state, 'P1'), false, 'Defeated enemies are not sources.');

// Discharge uses the nearest enemy, not necessarily the source of absorption;
// a Card's absorption Range override does not extend the discharge Attack Range.
state = setup();
state.players.P3 = { ...structuredClone(state.players.P2), id: 'P3', name: 'Nearest enemy', position: cell('C2') };
state.players.P2.position = cell('E2'); state.players.P1.pyroCharges = 2; burn(state, 'P2');
const p3Hp = state.players.P3.hp;
assert.ok(absorbFlames(state, 'P1', 3));
assert.equal(state.players.P3.hp, p3Hp - 2); assert.equal(state.players.P2.hp, state.players.P2.maxHp);
assert.equal(state.spellProjectiles.find((event) => event.style === 'pyro-discharge')?.targetId, 'P3');

// Regular Burning and Patch interactions cannot feed the charge/healing path.
state = setup(); addForcedStatusCard(state, state.players.P1, 'burning', 'hand', 'P2');
assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.hp, 10);
ignite(state, 'C2'); state.players.P1.movementRemaining = 1;
state = step(state, { type: 'move', playerId: 'P1', to: cell('C2') });
assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.hp, 10);
assert.equal(countBurning(state, 'P1'), 2);

// Fyrebanks chooses his Dash route and gains one MOV per Burning discarded.
for (const charges of [1, 2]) for (const count of [1, 2, 3]) {
  state = setup(); burn(state, 'P1', count);
  state.players.P1.pyroCharges = charges;
  state.players.P2.position = cell('G7');
  state = step(state, { type: 'dash', playerId: 'P1' });
  assert.equal(state.phase, 'dashing'); assert.deepEqual(state.players.P1.position, cell('B2'));
  assert.equal(state.players.P1.hp, 10 - count, 'Normal pre-Dash Burning Damage is retained.');
  assert.equal(state.players.P1.movementRemaining, 2 + count);
  assert.equal(countBurning(state, 'P1'), 0); assert.equal(state.players.P1.discard.filter((card) => card.cardId === 'burning').length, count);
  assert.equal(state.players.P1.pyroCharges, charges, 'Controlled Dash requires existing Charges but does not spend them.');
  ignite(state, 'C2');
  state = step(state, { type: 'move', playerId: 'P1', to: cell('C2') });
  assert.equal(countBurning(state, 'P1'), 0); assert.equal(state.pendingDashBurning?.P1, 1);
  const cancelled = step(state, { type: 'cancel-movement', playerId: 'P1' });
  assert.equal(cancelled.pendingDashBurning?.P1 ?? 0, 0); assert.equal(cancelled.players.P1.discard.length, count);
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(state.activePlayerId, 'P2'); assert.equal(countBurning(state, 'P1'), 1);
  assert.equal(state.players.P1.hp, 10 - count, 'New Patch Burning still arrives after turn-end Damage.');
}
for (const charges of [0, undefined]) {
  state = setup(); state.players.P1.pyroCharges = charges; burn(state, 'P1');
  state = step(state, { type: 'dash', playerId: 'P1' });
  assert.equal(state.activePlayerId, 'P2', 'Zero/missing Charges use ordinary random Burning Dash and end the turn.');
  assert.equal(state.players.P1.discard.length, 0, 'Uncharged Burning is Removed rather than discarded for bonus MOV.');
  assert.equal(state.players.P1.movementRemaining, 0);
}
state = setup(); state.players.P1.pyroCharges = 2; state.players.P1.traitBlocked = true; burn(state, 'P1');
assert.notEqual(step(state, { type: 'dash', playerId: 'P1' }).phase, 'dashing', 'A blocked Trait uses normal random Burning Dash.');
state = setup(); state.players.P1.pyroCharges = 1; burn(state, 'P1'); state.players.P2.position = cell('G7');
state = step(step(state, { type: 'dash', playerId: 'P1' }), { type: 'move', playerId: 'P1', to: cell('E2') });
assert.deepEqual(state.players.P1.position, cell('E2')); assert.equal(state.activePlayerId, 'P2', 'Spending all controlled Dash MOV ends the turn.');

state = setup(); burn(state, 'P2', 3);
for (let index = 0; index < 3; index++) assert.ok(absorbFlames(state, 'P1'));
assert.equal(state.players.P1.pyroCharges, 0);
state = step(state, { type: 'dash', playerId: 'P1' });
assert.notEqual(state.phase, 'dashing', 'Previously gained but discharged Charges do not qualify for controlled Dash.');

const root = new THREE.Group(); updatePyroChargeVisuals(root, 2, 1000);
const aura = root.getObjectByName('PyroChargeAura')!;
assert.equal(aura.children.filter((orb) => orb.visible).length, 2);
const positions = aura.children.map((orb) => orb.position.clone());
updatePyroChargeVisuals(root, 2, 1500);
assert.ok(aura.children.some((orb, index) => !orb.position.equals(positions[index])));
assert.notEqual(aura.children[0].position.y, aura.children[1].position.y, 'Each fireball has an independent irregular orbit.');
updatePyroChargeVisuals(root, 0, 2000); assert.equal(aura.visible, false);
updatePyroChargeVisuals(root, 3, 2500, false); assert.equal(aura.visible, false);
let disposed = 0; aura.userData.geometry.addEventListener('dispose', () => disposed++); aura.userData.material.addEventListener('dispose', () => disposed++);
disposePyroChargeVisuals(root); assert.equal(disposed, 2); assert.equal(root.children.length, 0);

const fire = new FireboltVisual(new THREE.Vector3(), new THREE.Vector3(3, 1, 0), 1000, .5, [new THREE.Vector3(), new THREE.Vector3(0, 1, 2), new THREE.Vector3(3, 1, 0)], true);
fire.update(500); assert.equal(fire.group.visible, false, 'Queued discharge visuals remain hidden until absorption arrives.');
fire.update(1300); assert.equal(fire.group.visible, true);
assert.equal(fire.update(fire.impactAt + 1000), true); fire.dispose();

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const renderer = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'renderFighter')!;
const output = { className: '', innerHTML: '', style: { setProperty() {} }, querySelector() { return null; } };
const hudState = setup(); hudState.players.P1.pyroCharges = 2;
const code = ts.transpileModule(renderer.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const render = runInNewContext(code + '\nrenderFighter;', { gameState: hudState, byId: () => output, playerUiColor: () => '#fff', combatImpactUiDeferred: () => false, playerAbilityIcon: () => '', playerStatusIcons: () => '', escapeHtml: (value: string) => value });
render('P1', 'p1Stats', 'left'); assert.match(output.innerHTML, /Pyro Charges: 2\/3/); assert.equal((output.innerHTML.match(/class="filled"/g) ?? []).length, 2);
console.log('Pyro Charges checks passed: routing, nearest/ties, transfer, healing, discharge/no target, controlled Dash, no incidental charges, HUD and visuals.');
