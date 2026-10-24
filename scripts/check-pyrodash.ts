import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { applyCommand, cardDefinition, cellLabel, createHotseatTestState, modifySquare, pyrodashDirections, pyrodashDirectionAt, pyrodashRoute, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';
import { updatePyrodashVisuals, disposePyrodashVisuals } from '../src/pyrodash-visuals.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(stack = true): GameState {
  const state = createHotseatTestState(stack, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { activePlayerId: 'P1', phase: 'active', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell('B2'); state.players.P2.position = cell('C2');
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'pyrodash' }];
  state.players.P1.movementRemaining = 2;
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function fight(state: GameState, defense: CardTypeId = 'defend-1'): GameState {
  const heated = defense === 'heated-debate';
  if (heated) { state.players.P2.hand.push({ instanceId: 'heated', cardId: 'heated-debate' }); defense = 'defend-1'; }
  state.players.P2.hand.push({ instanceId: 'defense', cardId: defense });
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const submitted = (state as any).combatStackSelections ?? {};
    const playerId = submitted.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P2' ? 'heated' : null });
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const burn = (state: GameState, id: 'P1' | 'P2' = 'P2') => state.players[id].hand.push({ instanceId: `burn-${id}`, cardId: 'burning' });
const burning = (state: GameState, id: 'P1' | 'P2' = 'P2') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
function route(from: string, toward: string, fp = 3, state = setup()): GameState {
  state.players.P1.position = cell(from); state.players.P2.position = cell('G7');
  state.pyrodash = { playerId: 'P1', target: cell(toward), fp }; state.phase = 'choosing-pyrodash-direction';
  const direction = pyrodashDirections(cell(from), cell(toward))[0];
  return step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: direction.x, dy: direction.y });
}
const labels = (state: GameState) => state.players.P1.visualMovement?.path.map((at) => String.fromCharCode(64 + at.x) + (at.y + 1));
assert.equal(cardDefinition({ instanceId: '', cardId: 'pyrodash' }).value, 1);
assert.ok(createHotseatTestState(false, 'fyrebanks', 2, 'shinobi').players.P1.deck.some((card) => card.cardId === 'pyrodash'));
assert.deepEqual(pyrodashDirections(cell('B2'), cell('D3')), [{ x: 1, y: 0 }, { x: 1, y: 1 }]);
assert.deepEqual(pyrodashDirections(cell('D4'), cell('C1')), [{ x: 0, y: -1 }, { x: -1, y: -1 }]);
for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) {
  const directions = pyrodashDirections({ x: 4, y: 4 }, { x: 4 + x, y: 4 + y });
  assert.equal(directions.length, !x && !y ? 0 : !x || !y || Math.abs(x) === Math.abs(y) ? 1 : 2);
  for (const direction of directions) assert.ok(direction.x * x + direction.y * y > 0);
}
assert.deepEqual(labels(route('B2', 'C1')), ['C1', 'D2', 'E3'], 'User diagonal edge-reflection example.');
assert.deepEqual(labels(route('C2', 'C1')), ['C1', 'C2', 'C3'], 'User straight edge-reflection example.');
assert.deepEqual(labels(route('B2', 'A1')), ['A1', 'B2', 'C3'], 'A board corner reverses both components.');
let state = setup();
state.objects.push({ id: 'wall', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell('C2') });
assert.deepEqual(labels(route('B2', 'C2', 3, state)), ['A2', 'B2', 'A2']);
state = setup(); state.objects.push(...['C2', 'C3'].map((label) => ({ id: label, name: 'Box', kind: 'wooden-box' as const, hp: 1, maxHp: 1, position: cell(label) })));
state = route('B2', 'C3', 3, state); assert.deepEqual(labels(state), ['A3', 'B4', 'C5']);
assert.equal(state.objects.length, 2, 'Reflection never damages or destroys the obstacle.');
state = setup(); state.elevations.C2 = 1;
assert.deepEqual(labels(route('B2', 'C2', 3, state)), ['A2', 'B2', 'A2']);
state = setup(); for (const label of ['B2', 'C2', 'D2', 'E2']) state.elevations[label] = 1;
assert.deepEqual(labels(route('B2', 'C2', 3, state)), ['C2', 'D2', 'E2']);
state = setup(); state.elevations.B2 = 1;
assert.deepEqual(labels(route('B2', 'C2', 3, state)), ['C2', 'D2', 'E2'], 'Downhill travel is allowed.');

for (const stack of [false, true]) {
  state = fight(setup(stack));
  assert.deepEqual(state.players.P1.position, cell('B2')); assert.equal(burning(state), 0, 'No movement or Burning before acknowledgement.');
  state = acknowledge(state);
  assert.deepEqual(labels(state), ['C2', 'D2', 'E2']);
  assert.deepEqual(state.players.P1.position, cell('E2')); assert.equal(burning(state), 1);
  assert.equal(state.players.P2.hp, state.players.P2.maxHp, 'First pass applies Burning without Damage.');
  assert.equal(state.players.P1.actionsRemaining, 1); assert.equal(state.players.P1.movementRemaining, 2);
  assert.equal(state.phase, 'active'); assert.equal(state.activePlayerId, 'P1'); assert.equal(state.players.P1.pyroCharges, 0);
  assert.equal(applyCommand(state, { type: 'cancel-movement', playerId: 'P1' }).ok, false, 'Automatic Attack movement is committed.');
  state = setup(stack); burn(state); state = acknowledge(fight(state));
  assert.equal(burning(state), 1); assert.equal(state.players.P2.hp, state.players.P2.maxHp - 1);
  const event = state.objectPushAnimations.find((entry) => entry.damage?.triggerAnimationId === state.players.P1.visualMovement?.animationId);
  assert.equal(event?.damage?.triggerRouteProgress, 1 / 3, 'Damage is linked to crossing the enemy Square.');
  for (const defense of ['block', 'decisive-block', 'heated-debate'] as CardTypeId[]) {
    state = acknowledge(fight(setup(stack), defense));
    assert.deepEqual(state.players.P1.position, cell('B2')); assert.equal(burning(state), 0); assert.equal(state.pyrodash, undefined);
  }
  state = setup(stack); state.players.P1.traitBlocked = true;
  state = acknowledge(fight(state)); assert.equal(state.players.P1.visualMovement, undefined, 'Zero FP produces no Dash.');
  state = setup(stack); state.players.P1.attackRange = 3;
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  assert.equal(state.pendingAttack?.fyrePoints, 3); state.players.P1.attackRange = 1;
  state = step(state, { type: 'pass-defense', playerId: 'P2' });
  while (state.phase === 'choosing-combat-stack') state = step(state, { type: 'combat-stack-choice', playerId: (state as any).combatStackSelections?.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  state = acknowledge(state); assert.deepEqual(state.players.P1.position, cell('F2'), 'Captured FP survives a later Range change.');
}
state = setup(); state.players.P2.position = cell('D3');
state = acknowledge(fight(state));
assert.equal(state.phase, 'choosing-pyrodash-direction'); assert.equal(state.pyrodash?.fp, 1);
assert.equal(applyCommand(state, { type: 'pyrodash-direction', playerId: 'P2', dx: 1, dy: 0 }).ok, false);
assert.equal(applyCommand(state, { type: 'pyrodash-direction', playerId: 'P1', dx: -1, dy: 0 }).ok, false);
assert.equal(applyCommand(state, { type: 'end-turn', playerId: 'P1' }).ok, false);
const diagonal = step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: 1, dy: 1 });
assert.deepEqual(diagonal.players.P1.position, cell('C3'));
// Issue 920: choose a highlighted lane on the board, without a direction popup.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const renderer = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'renderFlurryModal')!;
const choices: GameCommand[] = []; let hidden = false;
const modal = { innerHTML: 'old dialog', classList: { add(value: string) { hidden = value === 'hidden'; } } };
const render = runInNewContext(ts.transpileModule(renderer.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nrenderFlurryModal;', { gameState: state, byId: () => modal });
render(); assert.equal(modal.innerHTML, ''); assert.equal(hidden, true);
assert.deepEqual(pyrodashDirectionAt(state, cell('C2')), { x: 1, y: 0 });
assert.deepEqual(pyrodashDirectionAt(state, cell('F6')), { x: 1, y: 1 });
assert.equal(pyrodashDirectionAt(state, cell('C4')), undefined);
assert.equal(pyrodashDirectionAt(state, cell('B2')), undefined);
const blockedLane = structuredClone(state);
blockedLane.objects.push({ id: 'lane-wall', name: 'Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell('D2') });
assert.ok(pyrodashDirectionAt(blockedLane, cell('D2')), 'The first obstacle is selectable as a heading.');
assert.equal(pyrodashDirectionAt(blockedLane, cell('E2')), undefined, 'No lane highlight beyond the first obstacle.');
const clickHandler = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'onBoardClick')!;
let clicked = cell('F6'); let localAct = true;
const click = runInNewContext(ts.transpileModule(clickHandler.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nonBoardClick;', {
  gameState: state, suppressTouchBoardSelection: false, suppressNextBoardClick: false, pendingObjectAttackConfirmation: null,
  boardHitsAt: () => [{ object: { userData: { cell: clicked } } }], selection: { getSnapshot: () => ({ context: { selection: { kind: 'none' } } }) },
  canLocalAct: () => localAct, pyrodashDirectionAt, dispatch: (command: GameCommand) => choices.push(command),
});
click({ button: 0 }); assert.equal(choices[0].type, 'pyrodash-direction'); assert.equal((choices[0] as any).dx, 1); assert.equal((choices[0] as any).dy, 1);
clicked = cell('C4'); click({ button: 0 }); assert.equal(choices.length, 1);
clicked = cell('C2'); localAct = false; click({ button: 0 }); assert.equal(choices.length, 1);
state = step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: 1, dy: 0 });
assert.deepEqual(state.players.P1.position, cell('C2'));

// Combat-only protections remain valid for the deferred movement effect.
state = setup(); burn(state); state.players.P1.hand.push({ instanceId: 'pin', cardId: 'pinned' });
state = acknowledge(fight(state, 'calmness'));
assert.equal(state.players.P2.hp, state.players.P2.maxHp); assert.deepEqual(state.players.P1.position, cell('E2'));
// Object attacks also run the movement after their Object effect, using captured FP.
state = setup(); state.players.P2.position = cell('G7');
state.objects.push({ id: 'box', name: 'Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: cell('C2') });
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'box' });
assert.deepEqual(state.players.P1.position, cell('D2')); assert.equal(state.objects.length, 0);
// A crossing remains free even when the enemy occupies the board edge.
state = setup(); state.players.P1.position = cell('B2'); state.players.P2.position = cell('A2'); state.players.P1.attackRange = 3;
state = acknowledge(fight(state));
assert.deepEqual(labels(state), ['A2', 'B2', 'C2', 'D2']); assert.equal(burning(state), 1);
state = setup(); state.players.P1.position = cell('B2'); state.players.P2.position = cell('C2'); state.players.P1.attackRange = 3;
state.objects.push({ id: 'stop', name: 'Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: cell('D2') });
state = acknowledge(fight(state));
assert.deepEqual(labels(state), ['C2', 'B2', 'A2', 'B2']); assert.equal(state.players.P2.hp, state.players.P2.maxHp);
// Ricocheting across the same enemy again uses their updated Burning status.
state = setup(); state.players.P1.attackRange = 3;
state.objects.push({ id: 'stop', name: 'Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: cell('E2') });
state = acknowledge(fight(state));
assert.deepEqual(labels(state), ['C2', 'D2', 'C2', 'B2', 'A2']);
assert.equal(burning(state), 1); assert.equal(state.players.P2.hp, state.players.P2.maxHp - 1);
assert.equal(state.objectPushAnimations.find((event) => event.damage?.triggerAnimationId === state.players.P1.visualMovement?.animationId)?.damage?.triggerRouteProgress, 3 / 5);
// A closed loop may end on the origin but still needs the full smoke animation.
state = setup(); state.objects.push({ id: 'stop', name: 'Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: cell('D2') });
state.players.P1.attackRange = 2; state.players.P2.position = cell('G7');
state.pyrodash = { playerId: 'P1', target: cell('C2'), fp: 2 }; state.phase = 'choosing-pyrodash-direction';
state = step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: 1, dy: 0 });
assert.deepEqual(state.players.P1.position, cell('B2')); assert.deepEqual(labels(state), ['C2', 'B2']); assert.ok(state.players.P1.visualMovement?.animationId);
state = setup(); modifySquare(state, cell('D2'), 'patch-of-flames');
state = acknowledge(fight(state)); assert.equal(burning(state, 'P1'), 2); assert.equal(state.pendingDashBurning?.P1, undefined);
state = setup(); state.players.P2.flameWard = { level: 2, triggered: false };
state = acknowledge(fight(state)); assert.equal(state.players.P1.hp, 17); assert.equal(burning(state, 'P1'), 1);
assert.equal(state.players.P2.flameWard?.triggered, true);
state = setup(); burn(state); state.players.P2.hp = 1;
state = acknowledge(fight(state)); assert.equal(state.phase, 'finished'); assert.equal(state.winner, 'P1');
assert.deepEqual(state.players.P1.position, cell('C2'));
// A fully blocked origin terminates without movement or an endless bounce loop.
state = setup(); for (const label of ['A1', 'A2', 'A3', 'B1', 'B3', 'C1', 'C2', 'C3']) state.objects.push({ id: label, name: 'Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell(label) });
state = route('B2', 'C2', 3, state); assert.deepEqual(state.players.P1.position, cell('B2'));
state = setup(); state.elevations.B2 = 1;
for (const label of ['B1', 'B3', 'C1', 'C3', 'D1', 'D2', 'D3']) state.elevations[label] = 1;
state.pyrodash = { playerId: 'P1', target: cell('C2'), fp: 3 }; state.phase = 'choosing-pyrodash-direction';
state = step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: 1, dy: 0 });
assert.deepEqual(state.players.P1.position, cell('B2')); assert.equal(burning(state), 1, 'An inescapable enemy pocket makes two passes and returns without stacking Characters.');
assert.equal(state.players.P2.hp, state.players.P2.maxHp - 1);

// Issue 1317's hypothetical Pipe loop: E5 high ground -> D5 enemy -> C5 Object.
for (const stack of [false, true]) for (const alreadyBurning of [false, true]) {
  state = setup(stack); state.players.P1.position = cell('E5'); state.players.P2.position = cell('D5');
  state.elevations.E5 = 1; state.players.P2.hp = 12;
  state.objects.push({ id: 'C5-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('C5') });
  if (alreadyBurning) burn(state);
  const before = JSON.stringify(state);
  const planned = pyrodashRoute(state, 'P1', -1, 0, 2);
  assert.equal(planned.loop, true); assert.equal(JSON.stringify(state), before, 'Preflight has no Damage, status or movement side effects.');
  assert.deepEqual(planned.path.map(cellLabel), ['D5', 'E5', 'D5', 'E5']);
  state = acknowledge(fight(state));
  assert.deepEqual(labels(state), ['D5', 'E5', 'D5', 'E5']); assert.deepEqual(state.players.P1.position, cell('E5'));
  assert.equal(burning(state), 1); assert.equal(state.players.P2.hp, 12 - 1 - (alreadyBurning ? 2 : 1), 'One combat Damage from High Ground, then at most two pass effects.');
  assert.equal(state.objects[0].hp, 3); assert.equal(state.players.P1.movementRemaining, 2);
}
state = setup(); state.players.P1.position = cell('E5'); state.players.P2.position = cell('D5'); state.elevations.E5 = 1;
state.objects.push({ id: 'stop', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('C5') });
state.players.P2.hp = 2; burn(state); state = acknowledge(fight(state));
assert.equal(state.phase, 'finished'); assert.deepEqual(state.players.P1.position, cell('E5'), 'Loop escape returns home even if a pass wins the match.');

// Issue 1093, client 1034/1042–1044: one remaining MOV + 2 Dash + 1 Burning.
state = setup(); state.players.P1.freeMoveUsed = true; state.players.P1.movementRemaining = 1; state.players.P1.pyroCharges = 1; burn(state, 'P1');
state = step(state, { type: 'dash', playerId: 'P1' });
assert.equal(state.players.P1.movementRemaining, 4); assert.equal(state.players.P1.hp, 17);
assert.equal(state.players.P1.discard.filter((card) => card.cardId === 'burning').length, 1);
assert.match(state.log.join('\n'), /1 remaining MOV \+ 2 normal Dash MOV = 3 MOV/);
assert.match(state.log.join('\n'), /1 Burning Card for \+1 bonus MOV \(4 total/);

const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
updatePyrodashVisuals(root, true, 1000); assert.equal(body.visible, false);
const smoke = root.getObjectByName('PyrodashSmoke')!; assert.equal(smoke.children.length, 18);
const first = smoke.children[0].position.clone(); updatePyrodashVisuals(root, true, 1300); assert.ok(!smoke.children[0].position.equals(first));
let disposed = 0; smoke.userData.geometry.addEventListener('dispose', () => disposed++);
for (const material of smoke.userData.materials) material.addEventListener('dispose', () => disposed++);
updatePyrodashVisuals(root, false, 1500); assert.equal(body.visible, true); assert.equal(disposed, 3); assert.equal(root.children.length, 1);
body.visible = false; updatePyrodashVisuals(root, true, 2000); disposePyrodashVisuals(root); assert.equal(body.visible, false);
console.log('Pyrodash checks passed: FP/cancellation, direction choices, user reflection examples, obstacles/elevation, free enemy Squares, statuses/Damage/protection, Objects, terrain/Ward interactions, lethal cleanup and smoke lifecycle.');
