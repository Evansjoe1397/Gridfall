import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { activeWrecknaPhylactery, applyCommand, cardDefinition, createHotseatTestState, effectiveAttackRange, pinnedCount, spiritGuardianEnemyPenalty, type GameCommand, type GameState } from '../shared/game.ts';
import { updateFlameWardVisuals, disposeFlameWardVisuals } from '../src/flame-ward-visuals.ts';
import { FireboltVisual } from '../src/fireboltVisuals.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(stack = true, count: 2 | 3 = 2): GameState {
  const state = createHotseatTestState(stack, 'fyrebanks', count, 'shinobi');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {} });
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.movementRemaining = 8; player.freeMoveUsed = true;
  }
  state.players.P1.position = cell('B2'); state.players.P2.position = cell('F2'); state.players.P1.hp = 10;
  if (count === 3) state.players.P3.position = cell('H7');
  state.players.P1.hand = [{ instanceId: 'ward', cardId: 'flame-ward' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function use(state: GameState, level: 1 | 2 | 3): GameState {
  if (level === 1) return step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'ward', destination: 'direct' });
  state.players.P1.spellEcho[level - 1] = state.players.P1.hand.shift()!;
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
}
function enemyTurn(state: GameState): GameState {
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  state.players.P2.movementRemaining = 8;
  return state;
}
const move = (label: string): GameCommand => ({ type: 'move', playerId: 'P2', to: cell(label) });
const burning = (state: GameState) => state.players.P2.hand.filter((card) => card.cardId === 'burning').length;
const shots = (state: GameState) => state.spellProjectiles.filter((event) => event.style === 'flame-ward');
assert.equal(cardDefinition({ instanceId: '', cardId: 'flame-ward' }).kind, 'perk');
for (const player of Object.values(createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks').players)) assert.equal([...player.hand, ...player.deck].some((card) => card.cardId === 'flame-ward'), true, 'flame-ward belongs to the base starting pool.');

for (const stack of [false, true]) for (const level of [1, 2, 3] as const) {
  let state = use(setup(stack), level);
  assert.equal(state.players.P1.actionsRemaining, 1); assert.equal(state.players.P1.perkUsed, true);
  assert.equal(effectiveAttackRange(state, state.players.P1), 2, 'Ward never grants Range on its caster turn.');
  state = enemyTurn(state);
  assert.equal(effectiveAttackRange(state, state.players.P1), level === 3 ? 3 : 2);
  const target = level === 3 ? 'E2' : 'D2';
  const hp = state.players.P2.hp;
  state = step(state, move(target));
  assert.equal(burning(state), 1); assert.equal(state.players.P2.hp, hp - Number(level >= 2));
  assert.equal(state.players.P1.pyroCharges, 0, 'Firing a Ward does not grant a Charge.');
  assert.equal(state.players.P1.flameWard?.triggered, true); assert.equal(shots(state).length, 1);
  assert.deepEqual(shots(state)[0].to, cell(target)); assert.equal(shots(state)[0].flameWardLevel, level);
  if (level >= 2) assert.ok(state.objectPushAnimations.some((event) => event.damage?.triggerAnimationId === shots(state)[0].id));
  const cancelled = step(state, { type: 'cancel-movement', playerId: 'P2' });
  assert.equal(burning(cancelled), 0); assert.equal(cancelled.players.P2.hp, hp);
  assert.equal(cancelled.players.P1.flameWard?.triggered, false); assert.equal(shots(cancelled).length, 0);
  state = step(cancelled, move(target));
  state = step(state, move('C2'));
  assert.equal(burning(state), 1); assert.equal(shots(state).length, 1, 'Ward triggers only once.');
  assert.equal(effectiveAttackRange(state, state.players.P1), level === 3 ? 3 : 2, 'Range persists after the shield fires.');
  state = step(state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(state.players.P1.flameWard, undefined); assert.equal(effectiveAttackRange(state, state.players.P1), 2);
  assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.hp, 10, 'Triggered Ward gives no expiry heal.');
}

for (const level of [1, 2, 3] as const) {
  let state = enemyTurn(use(setup(), level));
  state = step(state, move('F3')); assert.equal(burning(state), 0);
  state = step(state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(state.players.P1.pyroCharges, Number(level === 3));
  assert.equal(state.players.P1.hp, 10 + Number(level === 3));
  assert.equal(state.players.P1.hand.filter((card) => card.cardId === 'burning').length, 0, 'Expiry reward does not create Burning.');
}
let state = setup(); state.players.P1.pyroCharges = 2;
state = enemyTurn(use(state, 3)); state.players.P2.position = cell('C2');
const enemyHp = state.players.P2.hp;
state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.hp, 11);
assert.equal(state.players.P2.hp, enemyHp - 2); assert.equal(burning(state), 1);
assert.equal(state.spellProjectiles.at(-1)?.style, 'pyro-discharge', 'The expiry Charge uses the standard third-Charge discharge.');
state = setup(); state.players.P1.pyroCharges = 2;
state = step(enemyTurn(use(state, 3)), { type: 'end-turn', playerId: 'P2' });
assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.spellProjectiles.length, 0, 'Three Charges are spent even without a target.');
state = enemyTurn(use(setup(), 3)); state.players.P1.traitBlocked = true;
state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.hp, 10);

// Standing still, moving the caster, and rejected movement do not trigger a Ward.
state = use(setup(), 1); state.players.P2.position = cell('D2');
assert.equal(burning(state), 0);
state = step(state, { type: 'move', playerId: 'P1', to: cell('C2') });
assert.equal(shots(state).length, 0);
state = enemyTurn(state);
assert.equal(shots(state).length, 0);
assert.equal(applyCommand(state, move('Z2')).ok, false); assert.equal(shots(state).length, 0);
state = step(state, move('D3')); assert.equal(burning(state), 1, 'Moving within existing Range also triggers.');

// Direct line of sight is required; Ward does not use Absorb Flames routing.
state = enemyTurn(use(setup(), 1));
state.players.P1.attackRange = 6;
state.objects.push({ id: 'wall', kind: 'wall-pillar', name: 'Column', hp: 999, maxHp: 999, position: cell('C2') });
state = step(state, move('E2')); assert.equal(burning(state), 0);
state.objects = []; state = step(state, move('D2')); assert.equal(burning(state), 1);
state = enemyTurn(use(setup(), 1)); state.players.P1.attackRange = 6; state.elevations.C2 = 2;
state = step(state, move('E2')); assert.equal(burning(state), 0, 'Elevated sight blockers also prevent a shot.');

// Crossing a threatened Square triggers even when the route ends out of Range.
state = enemyTurn(use(setup(), 2)); state.players.P1.position = cell('D2'); state.players.P2.position = cell('H2');
state = step(state, move('A2')); assert.equal(shots(state).length, 1);
assert.notDeepEqual(shots(state)[0].to, state.players.P2.position); assert.equal(burning(state), 1);

// Forced movement on Fyrebanks' own turn is eligible without the Level 3 Range bonus.
state = use(setup(), 3); state.phase = 'choosing-force-pull-target';
state.forcePull = { casterId: 'P1', level: 1, distance: 2, targetRange: 8, undo: null };
state = step(state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
assert.equal(burning(state), 1); assert.deepEqual(shots(state)[0].to, cell('D2'));
// Transported replicas trigger the same character effect at the moving body.
state = enemyTurn(use(setup(), 2)); state.players.P2.character = 'spectre';
state.objects.push({ id: 'replica', kind: 'spectre-replica', ownerId: 'P2', name: 'Replica', hp: 999, maxHp: 999, position: cell('F3') });
state.activePlayerId = 'P1'; state.phase = 'choosing-force-pull-target';
state.forcePull = { casterId: 'P1', level: 1, distance: 2, targetRange: 8, undo: null };
state = step(state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'object', targetId: 'replica' });
assert.equal(shots(state)[0]?.targetId, 'replica'); assert.equal(burning(state), 1);

// Ordinary Burning acquisition during Dash must not gain a Pyro Charge.
state = enemyTurn(use(setup(), 2)); state.phase = 'dashing';
state = step(state, move('D2')); assert.equal(burning(state), 1);
assert.equal(state.players.P1.pyroCharges, 0);
// Lethal damage stops a multi-Square route on the triggering Square.
state = enemyTurn(use(setup(), 2)); state.players.P2.hp = 1;
state = step(state, move('C2')); assert.equal(state.phase, 'finished'); assert.equal(state.winner, 'P1');
assert.deepEqual(state.players.P2.position, cell('D2'));
assert.deepEqual(state.players.P2.visualMovement?.path.at(-1), cell('D2'));

state = enemyTurn(use(setup(true, 3), 3));
state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(state.activePlayerId, 'P3'); assert.ok(state.players.P1.flameWard);
assert.equal(effectiveAttackRange(state, state.players.P1), 3, 'The Range bonus lasts across every enemy turn.');
state = step(state, { type: 'end-turn', playerId: 'P3' });
assert.equal(state.activePlayerId, 'P1'); assert.equal(state.players.P1.pyroCharges, 1);
state = enemyTurn(use(setup(true, 3), 2)); state.players.P2.hp = 1; state.phase = 'dashing';
state = step(state, move('C2')); assert.equal(state.activePlayerId, 'P3');
assert.equal(state.phase, 'active'); assert.equal(state.players.P2.hp, 0, 'A defeated Dash mover cannot trap FFA in Dash.');

state = enemyTurn(use(setup(), 2)); state.players.P2.spectreShadowCloakActive = true;
const protectedHp = state.players.P2.hp; state = step(state, move('D2'));
assert.equal(state.players.P2.hp, protectedHp); assert.equal(burning(state), 0);
assert.equal(state.players.P1.flameWard?.triggered, true, 'Perk protection blocks the effects but still consumes the fired Ward.');
state = use(setup(), 2);
state.players.P1.perkUsed = false; state.players.P1.actionsRemaining = 2;
state.players.P1.spellEcho[2] = { instanceId: 'pull', cardId: 'force-pull' };
state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
state = step(state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
assert.equal(state.players.P1.flameWard?.triggered, true);
state = step(state, { type: 'undo-last-action', playerId: 'P1' });
assert.equal(state.players.P1.flameWard?.triggered, false); assert.equal(burning(state), 0);
assert.deepEqual(state.players.P2.position, cell('F2')); assert.equal(shots(state).length, 0);

// Execute the actual HUD composer, including its returned markup.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const fn = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'playerStatusIcons')!;
const code = ts.transpileModule(fn.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const hudState = use(setup(), 3);
const render = runInNewContext(code + '\nplayerStatusIcons;', { gameState: hudState, pinnedCount, activeWrecknaPhylactery, spiritGuardianEnemyPenalty, displayedStoicShell: (_id: string, shell: boolean) => shell, gameIcon: (name: string) => `<img data-icon="${name}">`, escapeHtml: (value: string) => value });
assert.match(render(hudState.players.P1), /flame-ward-charged/);
assert.match(render(hudState.players.P1), /line of sight/); assert.match(render(hudState.players.P1), /takes 1 Damage/);
assert.match(render(hudState.players.P1), /gain 1 Pyro Charge and restore 1 HP/);
hudState.players.P1.flameWard!.triggered = true;
assert.match(render(hudState.players.P1), /Shield already fired/);
assert.doesNotMatch(render(hudState.players.P1), /flame-ward-charged/);
delete hudState.players.P1.flameWard; assert.doesNotMatch(render(hudState.players.P1), /flame-ward-status/);

const root = new THREE.Group(); updateFlameWardVisuals(root, 1, 1000);
const shield = root.getObjectByName('FlameWardShield')!;
assert.equal(shield.getObjectByName('FlameWardBlueAura')!.visible, false);
const rotation = shield.rotation.y;
updateFlameWardVisuals(root, 3, 1500);
assert.notEqual(shield.rotation.y, rotation); assert.equal(shield.getObjectByName('FlameWardBlueAura')!.visible, true);
assert.ok(shield.position.y > 3, 'Shield floats above the wizard hat.');
let disposed = 0; shield.traverse((part) => { if (part instanceof THREE.Mesh) part.geometry.addEventListener('dispose', () => disposed++); });
updateFlameWardVisuals(root, 0, 1600); assert.equal(root.children.length, 0); assert.ok(disposed >= 3);
updateFlameWardVisuals(root, 3, 2000); disposeFlameWardVisuals(root); assert.equal(root.children.length, 0);
const fire = new FireboltVisual(new THREE.Vector3(0, 3.25, 0), new THREE.Vector3(2, 1.25, 0), 1000, 1, undefined, false, 3);
const launchShield = fire.group.getObjectByName('FlameWardShield')!;
assert.equal(launchShield.visible, true); fire.update(1100); assert.ok(launchShield.scale.x < 1);
fire.update(1300); assert.equal(launchShield.visible, false); assert.equal(fire.update(fire.impactAt + 1000), true); fire.dispose();
console.log('Flame Ward checks passed: levels, LOS, paths, forced movement/replicas, undo, expiry/healing/discharge, lethal movement, HUD and visuals.');
