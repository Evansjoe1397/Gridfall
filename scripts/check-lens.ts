import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { applyCommand, createHotseatTestState, isStraightAttackLine, lensAttackFyrePoints, lensAttackTargets, pyrodashDirectionAt, summonLens, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';
import { createLens, disposeLens, orientLens } from '../src/lens-model.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(cardId: CardTypeId = 'arch-beam', stack = true): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell('B2'); state.players.P2.position = cell('E2');
  state.players.P1.hand = [{ instanceId: 'attack', cardId }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function place(state: GameState, label = 'C2'): string {
  assert.ok(summonLens(state, 'P1', cell(label)));
  return state.objects.find((object) => object.kind === 'lens')!.id;
}
function select(state: GameState): GameState {
  return step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects.find((object) => object.kind === 'lens')!.id });
}
function target(state: GameState, targetId = 'P2', targetKind: 'player' | 'replica' = 'player'): GameState {
  return step(state, { type: 'lens-target', playerId: 'P1', targetId, targetKind });
}
function defend(state: GameState, card: CardTypeId = 'defend-1'): GameState {
  state.players.P2.hand = [{ instanceId: 'defense', cardId: card }];
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selected = (state as any).combatStackSelections ?? {};
    state = step(state, { type: 'combat-stack-choice', playerId: selected.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const labels = (state: GameState) => state.players.P1.visualMovement?.path.map((at) => String.fromCharCode(64 + at.x) + (at.y + 1));
let state = setup();
assert.equal(state.objects.some((object) => object.kind === 'lens'), false, 'No Card or default board summons Lens yet.');
assert.equal(summonLens(state, 'P2', cell('C2')), false);
assert.equal(summonLens(state, 'P1', cell('B2')), false);
assert.equal(summonLens(state, 'P1', { x: 1.5, y: 1 }), false);
const first = place(state);
assert.equal(summonLens(state, 'P1', cell('D2')), false, 'Only one Lens across all Players.');
assert.equal(state.objects[0].hp, 1); assert.equal(state.objects[0].maxHp, 1);
assert.ok(isStraightAttackLine(cell('B2'), cell('D4'))); assert.ok(!isStraightAttackLine(cell('B2'), cell('D3')));

// Latest user correction: only maximum Range exactly 3 + adjacent Lens grants 2 FP at Range 2.
for (let range = 1; range <= 5; range++) for (let lensDistance = 1; lensDistance <= Math.min(range, 4); lensDistance++) {
  state = setup(); state.players.P1.position = cell('A2'); state.players.P1.attackRange = range;
  const lens = { x: 1 + lensDistance, y: 1 };
  assert.equal(lensAttackFyrePoints(state, state.players.P1, lens, { x: lens.x + 1, y: 1 }), Math.min(3, range - lensDistance + 2));
  assert.equal(lensAttackFyrePoints(state, state.players.P1, lens, { x: lens.x + 2, y: 1 }), range === 3 && lensDistance === 1 ? 2 : 1);
}
for (const stack of [false, true]) {
  state = setup('arch-beam', stack); place(state);
  const before = JSON.stringify(state); state = select(state);
  assert.equal(state.phase, 'choosing-lens-target'); assert.equal(state.players.P1.actionsRemaining, 2);
  assert.equal(state.players.P1.hand[0].instanceId, 'attack'); assert.equal(state.players.P1.discard.length, 0);
  assert.equal(lensAttackTargets(state)[0]?.id, 'P2');
  assert.equal(applyCommand(state, { type: 'lens-target', playerId: 'P2', targetId: 'P1', targetKind: 'player' }).ok, false);
  assert.equal(applyCommand(state, { type: 'end-turn', playerId: 'P1' }).ok, false);
  assert.equal(JSON.stringify(step(state, { type: 'cancel-targeting', playerId: 'P1' })), before, 'Cancel restores the exact prior game state.');
  state = target(state);
  assert.equal(state.phase, 'defending'); assert.equal(state.players.P1.actionsRemaining, 1);
  assert.equal(state.players.P1.discard[0].cardId, 'arch-beam'); assert.equal(state.pendingAttack?.fyrePoints, 1);
  assert.deepEqual(state.players.P1.position, cell('B2')); assert.deepEqual(state.pendingAttack?.attackerPosition, cell('B2'));
  assert.equal(state.objects.some((object) => object.kind === 'lens'), true);
  assert.deepEqual(state.objects.find((object) => object.kind === 'lens')?.lensFacing, { x: 2, y: 0 });
  state = defend(state); assert.equal(state.combatReveal?.attackTotal, 1);
  state = acknowledge(state); assert.ok(state.players.P2.hand.some((card) => card.cardId === 'burning'));
  assert.equal(state.objects.some((object) => object.kind === 'lens'), true);

  state = setup('arch-beam', stack); state.players.P2.position = cell('D2'); place(state);
  state = target(select(state)); assert.equal(state.pendingAttack?.fyrePoints, 3);
  state = defend(state); assert.equal(state.combatReveal?.attackTotal, 3);
  state = setup('arch-beam', stack); state.players.P1.attackRange = 3; place(state);
  state = target(select(state)); assert.equal(state.pendingAttack?.fyrePoints, 2);
  state = setup('arch-beam', stack); state.players.P1.attackRange = 4; place(state);
  state = target(select(state)); assert.equal(state.pendingAttack?.fyrePoints, 1, 'Range 4 does not meet the latest exact-3 requirement.');

  state = setup('dragon-claws', stack); place(state); state = select(state);
  assert.equal(state.objects.some((object) => object.kind === 'lens'), false); assert.equal(state.lensSelection, undefined);
  assert.equal(state.players.P1.actionsRemaining, 1); assert.ok(summonLens(state, 'P1', cell('C2')), 'Destroyed Lens can be summoned again later.');
  state = setup('arch-beam', stack); state.players.P1.attackRange = 3; place(state, 'D3');
  const offAxis = JSON.stringify(state); state = select(state); assert.equal(state.phase, 'confirming-lens-destruction');
  assert.equal(JSON.stringify(step(state, { type: 'cancel-targeting', playerId: 'P1' })), offAxis);
  state = step(state, { type: 'lens-destroy', playerId: 'P1' });
  assert.equal(state.objects.some((object) => object.kind === 'lens'), false); assert.equal(state.players.P1.actionsRemaining, 1);

  state = setup('pyrodash', stack); state.players.P2.position = cell('D2'); place(state);
  state = target(select(state)); state = acknowledge(defend(state));
  assert.deepEqual(labels(state), ['C2', 'D2', 'E2', 'F2', 'G2']);
  assert.equal(state.objects.some((object) => object.kind === 'lens'), true);
  assert.ok(state.players.P2.hand.some((card) => card.cardId === 'burning'));
  state = setup('pyrodash', stack); state.players.P1.attackRange = 3; place(state);
  state = acknowledge(defend(target(select(state)))); assert.deepEqual(labels(state), ['C2', 'D2', 'E2', 'F2']);
  state = setup('pyrodash', stack); state.players.P2.position = cell('C3'); place(state);
  state = acknowledge(defend(target(select(state)))); assert.deepEqual(labels(state), ['C2', 'C3', 'C4', 'C5', 'C6']);
  for (const direction of [{ x: 1, y: 0 }, { x: 1, y: 1 }]) {
    state = setup('pyrodash', stack); state.players.P1.attackRange = 3; state.players.P2.position = cell('E3'); place(state);
    state = acknowledge(defend(target(select(state))));
    assert.equal(state.phase, 'choosing-pyrodash-direction');
    assert.deepEqual(state.players.P1.position, cell('B2'), 'Choose outgoing direction before any movement.');
    assert.deepEqual(pyrodashDirectionAt(state, { x: 3 + direction.x, y: 1 + direction.y }), direction);
    assert.equal(applyCommand(state, { type: 'pyrodash-direction', playerId: 'P1', dx: -1, dy: 0 }).ok, false);
    state = step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: direction.x, dy: direction.y });
    assert.deepEqual(labels(state), direction.y ? ['C2', 'D3', 'E4'] : ['C2', 'D2', 'E2']);
  }
  state = setup('pyrodash', stack); place(state);
  state = acknowledge(defend(target(select(state)))); assert.deepEqual(labels(state), ['C2', 'D2'], 'Default Range 2 grants only 1 FP for an enemy 2 beyond Lens.');
  state = setup('pyrodash', stack); state.players.P2.position = cell('D2'); place(state);
  state = acknowledge(defend(target(select(state)), 'block')); assert.equal(state.players.P1.visualMovement, undefined, 'Block cancels magnified Pyrodash normally.');
}

// Both relay legs require LOS; only the outgoing leg determines second-target legality.
for (const label of ['D1', 'E3', 'C3', 'B4']) {
  state = setup(); state.players.P2.position = cell(label); place(state);
  state.objects[0].lensFacing = { x: -1, y: 0 };
  const choosing = select(state);
  const cancelled = step(choosing, { type: 'cancel-targeting', playerId: 'P1' });
  assert.deepEqual(cancelled.objects[0].lensFacing, { x: -1, y: 0 });
  state = target(choosing);
  assert.deepEqual(state.objects[0].lensFacing, { x: cell(label).x - 3, y: cell(label).y - 1 });
}
state = setup(); place(state);
state.players.P1.movementRemaining = 2; state.players.P1.freeMoveUsed = true;
state = step(state, { type: 'move', playerId: 'P1', to: cell('B3') });
const movedSnapshot = JSON.stringify(state);
state = step(select(state), { type: 'cancel-targeting', playerId: 'P1' });
assert.equal(JSON.stringify(state), movedSnapshot, 'Cancelling preserves real movement undo history.');
state = step(state, { type: 'cancel-movement', playerId: 'P1' });
assert.deepEqual(state.players.P1.position, cell('B2'));
state = setup(); state.players.P2.character = 'spectre'; state.players.P2.position = cell('H8'); place(state);
state.objects.push({ id: 'replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: cell('E2') });
state = target(select(state), 'replica', 'replica');
assert.equal(state.pendingAttack?.defenderReplicaId, 'replica'); assert.equal(state.pendingAttack?.fyrePoints, 1);
assert.deepEqual(state.objects.find((object) => object.kind === 'lens')?.lensFacing, { x: 2, y: 0 }, 'Face the replica body rather than its owner.');
state = setup(); state.players.P2.position = cell('D4'); place(state, 'D2');
state.objects.push({ id: 'wall', name: 'Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell('C3') });
state = target(select(state)); assert.equal(state.phase, 'defending', 'Caster-to-enemy direct LOS may be blocked when both Lens legs are clear.');
state = setup(); place(state, 'D2');
state.objects.push({ id: 'wall', name: 'Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell('C2') });
assert.equal(applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects[0].id }).ok, false);
state = setup(); place(state); state.players.P2.position = cell('C4');
state.objects.push({ id: 'wall', name: 'Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell('C3') });
state = select(state); assert.equal(lensAttackTargets(state).length, 0);
assert.equal(applyCommand(state, { type: 'lens-target', playerId: 'P1', targetId: 'P2', targetKind: 'player' }).ok, false);
state = setup(); place(state); state.players.P1.traitBlocked = true;
state = target(select(state)); assert.equal(state.pendingAttack?.fyrePoints, 0);

// Ordinary characters destroy Lens just like a Box.
state = setup('attack-2'); place(state); state.players.P1.character = 'shinobi'; state = select(state);
assert.equal(state.objects.length, 0); assert.equal(state.lensSelection, undefined);
// Lens is movable by both pulls and pushes through the generic Object handlers.
state = setup(); state.players.P1.position = cell('A2'); state.players.P2.position = cell('H7'); const pullId = place(state, 'E2');
state.phase = 'choosing-force-pull-target'; state.forcePull = { casterId: 'P1', level: 1, distance: 2, targetRange: 8, undo: null };
state = step(state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'object', targetId: pullId });
assert.deepEqual(state.objects.find((object) => object.id === pullId)?.position, cell('C2'));
state = setup(); state.players.P1.position = cell('A2'); state.players.P2.position = cell('H7'); const pushId = place(state);
state.phase = 'choosing-force-throw-direction'; state.forceThrow = { casterId: 'P1', level: 1, distance: 2, targetRange: 8, targetKind: 'object', targetId: pushId, undo: null };
state = step(state, { type: 'force-throw-direction', playerId: 'P1', to: cell('E2') });
assert.deepEqual(state.objects.find((object) => object.id === pushId)?.position, cell('E2'));

// Production board handler dispatches the selected second body, with no popup.
state = select((() => { const value = setup(); place(value); return value; })());
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const handler = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'onBoardClick')!;
const commands: GameCommand[] = [];
const click = runInNewContext(ts.transpileModule(handler.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nonBoardClick;', {
  gameState: state, suppressTouchBoardSelection: false, suppressNextBoardClick: false, pendingObjectAttackConfirmation: null,
  boardHitsAt: () => [{ object: { userData: { playerId: 'P2', cell: cell('E2') } } }],
  hitUserData: (hit: any, name: string) => hit.object.userData[name], lensAttackTargets,
  selection: { getSnapshot: () => ({ context: { selection: { kind: 'none' } } }) }, canLocalAct: () => true,
  dispatch: (command: GameCommand) => commands.push(command),
});
click({ button: 0 }); assert.equal(commands[0].type, 'lens-target'); assert.equal((commands[0] as any).targetId, 'P2');

const model = createLens(); const bounds = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
for (const direction of [{ x: 2, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 2 }, { x: -2, y: -1 }]) {
  orientLens(model, direction);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion);
  const expected = new THREE.Vector3(direction.x, 0, direction.y).normalize();
  assert.ok(normal.distanceTo(expected) < 1e-10, 'Lens glass normal points toward the attacked body.');
}
orientLens(model); assert.equal(model.rotation.y, 0);
assert.ok(model.getObjectByName('LensGlass')); assert.ok(model.getObjectByName('LensGoldRim')); assert.ok(model.getObjectByName('LensHitArea'));
assert.ok(bounds.x <= 1.2 && bounds.y <= 1.5 && bounds.z <= .8);
const geometry = (model.getObjectByName('LensGlass') as THREE.Mesh).geometry; let disposed = false;
geometry.addEventListener('dispose', () => disposed = true); disposeLens(model); assert.ok(disposed);
console.log('Lens checks passed: singleton summoning, Box interactions, selection/cancellation/destruction, confirmed FP rules, extended character combat/LOS, Pyrodash Lens reset/redirection, production targeting and model lifecycle.');
