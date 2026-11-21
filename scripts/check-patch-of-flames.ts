import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyCommand, createHotseatTestState, createPipeTestState, isBurningSquare, isShallowWater, modifySquare, movementPath, type Cell, type GameCommand, type GameState } from '../shared/game.ts';
import { PatchOfFlamesVisuals } from '../src/patch-of-flames.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(stack = true): GameState {
  const state = createHotseatTestState(stack, 'merylin', 2, 'shinobi');
  state.phase = 'active'; state.activePlayerId = 'P1';
  state.objects = []; state.elevations = {};
  state.players.P1.position = cell('B2'); state.players.P2.position = cell('G7');
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.freeMoveUsed = true; player.movementRemaining = 8;
  }
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
const burning = (state: GameState, id: 'P1' | 'P2' = 'P1') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
const ignite = (state: GameState, label: string) => assert.ok(modifySquare(state, cell(label), 'patch-of-flames'), label);
const move = (label: string): GameCommand => ({ type: 'move', playerId: 'P1', to: cell(label) });

function forcedEntry(stack: boolean): GameState {
  let state = setup(stack);
  state.activePlayerId = 'P2'; state.players.P2.position = cell('F2');
  ignite(state, 'D2');
  state.phase = 'choosing-force-pull-target';
  state.forcePull = { casterId: 'P2', level: 1, distance: 2, targetRange: 8, undo: null };
  state = step(state, { type: 'force-pull-target', playerId: 'P2', targetKind: 'player', targetId: 'P1' });
  assert.deepEqual(state.players.P1.position, cell('D2'));
  assert.equal(burning(state), 0, 'Forced arrival defers Burning.');
  return state;
}

for (const stack of [false, true]) {
  let visit = setup(stack);
  ignite(visit, 'C2');
  visit = step(visit, move('C2'));
  assert.equal(burning(visit), 1);
  visit = step(visit, move('B2'));
  assert.equal(burning(visit), 1, 'Separate move commands share the same visit.');
  visit = step(visit, move('C2'));
  assert.equal(burning(visit), 2, 'Re-entry starts a new visit.');
  visit = step(visit, { type: 'cancel-movement', playerId: 'P1' });
  assert.equal(burning(visit), 0, 'Undo restores the whole walking sequence and its visits.');
  visit = step(visit, move('C2'));
  visit = step(visit, { type: 'end-turn', playerId: 'P1' });
  assert.equal(burning(visit), 1, 'Ending on a paid voluntary visit adds nothing.');

  visit = forcedEntry(stack);
  visit = step(visit, { type: 'end-turn', playerId: 'P2' });
  assert.equal(burning(visit), 0, 'An unpaid forced visit survives the turn boundary without a turn-start Card.');
  const forcedHp = visit.players.P1.hp;
  visit = step(visit, { type: 'end-turn', playerId: 'P1' });
  assert.equal(burning(visit), 1);
  assert.equal(visit.players.P1.hp, forcedHp, 'Forced residence is paid after end-turn Damage.');

  visit = forcedEntry(stack);
  visit = step(visit, { type: 'end-turn', playerId: 'P2' });
  visit.players.P1.movementRemaining = 8;
  visit = step(visit, move('C2'));
  assert.equal(burning(visit), 1, 'Voluntary departure pays an unpaid forced visit.');
  visit = step(visit, move('D2'));
  assert.equal(burning(visit), 2, 'Voluntary return can burn again.');
  visit = step(visit, move('E2'));
  assert.equal(burning(visit), 2, 'The return visit is charged only once.');

  visit = forcedEntry(stack);
  visit.phase = 'choosing-force-pull-target';
  visit.forcePull = { casterId: 'P2', level: 1, distance: 1, targetRange: 8, undo: null };
  visit = step(visit, { type: 'force-pull-target', playerId: 'P2', targetKind: 'player', targetId: 'P1' });
  assert.equal(burning(visit), 1, 'Forced departure also pays an unpaid visit.');

  visit = setup(stack); ignite(visit, 'C2');
  visit = step(visit, move('C2'));
  visit.phase = 'choosing-force-pull-target'; visit.players.P2.position = cell('F2');
  visit.forcePull = { casterId: 'P1', level: 1, distance: 1, targetRange: 8, undo: null };
  // Use an enemy turn for the forced departure from a paid voluntary visit.
  visit.activePlayerId = 'P2'; visit.forcePull.casterId = 'P2';
  visit = step(visit, { type: 'force-pull-target', playerId: 'P2', targetKind: 'player', targetId: 'P1' });
  assert.equal(burning(visit), 1, 'Forced departure cannot charge a paid voluntary visit again.');

  visit = forcedEntry(stack);
  visit = step(visit, { type: 'end-turn', playerId: 'P2' });
  visit.players.P1.hand = Array.from({ length: 6 }, (_, i) => ({ instanceId: `forced-limit-${i}`, cardId: 'attack-2' }));
  visit = step(visit, { type: 'end-turn', playerId: 'P1' });
  assert.equal(visit.phase, 'choosing-end-discard'); assert.equal(burning(visit), 0);
  visit = step(visit, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'forced-limit-0' });
  visit = step(visit, { type: 'end-turn', playerId: 'P1' });
  assert.equal(burning(visit), 1, 'Forced residence waits for mandatory end-turn choices.');
  assert.equal(visit.players.P1.hp, forcedHp);

  for (const dash of [false, true]) for (const double of [false, true]) for (const blocked of [false, true]) {
    let rage = setup(stack);
    rage.players.P1.character = 'orkk'; rage.players.P1.rageStacks = 3;
    rage.players.P1.rageGainLocked = true; rage.players.P1.doubleRageUntilEnemyTurnEnd = double;
    rage.players.P1.traitBlocked = blocked; rage.players.P1.movementRemaining = 0;
    rage.players.P1.hand = Array.from({ length: 3 }, (_, i) => ({ instanceId: `rage-burning-${i}`, cardId: 'burning', sourcePlayerId: i === 0 ? 'P1' : 'P2' }));
    const hp = rage.players.P1.hp;
    rage = step(rage, { type: dash ? 'dash' : 'end-turn', playerId: 'P1' });
    assert.equal(rage.players.P1.hp, hp - 3, 'Burning still deals Damage per Card, including mixed sources.');
    assert.equal(rage.log.filter((line) => line.includes('Rage from taking damage')).length, blocked ? 0 : 1);
    assert.ok(!rage.log.some((line) => line.includes('gained 2 Rage from taking damage')), 'Burning grants at most 1 Rage, including Double!.');
    assert.equal(rage.players.P1.removedDeck?.filter((card) => card.cardId === 'burning').length ?? 0, dash ? 3 : 0);
  }

  let protectedRage = setup(stack);
  protectedRage.players.P1.character = 'orkk'; protectedRage.players.P1.spectreShadowCloakActive = true;
  protectedRage.players.P1.hand = [{ instanceId: 'prevented-burning', cardId: 'burning' }];
  protectedRage = step(protectedRage, { type: 'end-turn', playerId: 'P1' });
  assert.ok(!protectedRage.log.some((line) => line.includes('Rage from taking damage')), 'Prevented Burning Damage grants no Rage.');

  const terrain = setup(stack);
  // The overlay preserves Base, Draw, protected and elevated terrain.
  terrain.elevations.D4 = 1;
  for (const label of ['A4', 'D1', 'C4', 'D4', 'B2']) { ignite(terrain, label); assert.ok(isBurningSquare(terrain, cell(label))); }
  assert.equal(terrain.elevations.D4, 1);
  assert.equal(modifySquare(terrain, cell('A1'), 'patch-of-flames'), false, 'Columns cannot burn, even if their object is absent.');
  assert.equal(modifySquare(terrain, { x: 9, y: 0 }, 'patch-of-flames'), false);
  for (const water of ['water', 'shallow-water'] as const) {
    const wet = setup(stack);
    ignite(wet, 'B2');
    assert.ok(modifySquare(wet, cell('B2'), water));
    assert.equal(isBurningSquare(wet, cell('B2')), false);
    assert.ok(!wet.squareModifications!.B2.includes('patch-of-flames'), 'Water deletes fire immediately.');
    assert.equal(modifySquare(wet, cell('B2'), 'patch-of-flames'), false);
  }

  let state = setup(stack);
  ignite(state, 'B2'); ignite(state, 'C2');
  state = step(state, move('C2'));
  assert.equal(burning(state), 2, 'Leaving and entering fire are distinct interactions.');
  state = step(state, { type: 'cancel-movement', playerId: 'P1' });
  assert.equal(burning(state), 0, 'Cancelling movement restores the original Hand.');
  assert.deepEqual(state.players.P1.position, cell('B2'));
  assert.equal(burning(step(state, move('B3'))), 1, 'Leaving a Burning Square gives Burning.');

  state = setup(stack);
  const path = movementPath(state, state.players.P1, cell('D2'));
  assert.equal(path.length, 2);
  modifySquare(state, path[0], 'patch-of-flames');
  state = step(state, move('D2'));
  assert.equal(burning(state), 1, 'Entry and exit on an intermediate Square are one visit.');
  const invalid = applyCommand(state, move('I1'));
  assert.equal(invalid.ok, false);
  assert.equal(burning(state), 1, 'Rejected movement does not add statuses.');

  state = setup(stack);
  ignite(state, 'G7');
  const hp = state.players.P2.hp;
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(burning(state, 'P2'), 0, 'Standing on fire does not grant Burning at turn start.');
  assert.equal(state.players.P2.hp, hp, 'Receiving Burning does not itself deal Damage.');
  state = step(state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(state.players.P2.hp, hp, 'Stationary fire is paid after end-turn Damage.');
  assert.equal(burning(state, 'P2'), 1);

  state = setup(stack);
  ignite(state, 'C2');
  state.players.P1.hand = [{ instanceId: 'dash-cost', cardId: 'attack-2' }];
  state.players.P1.movementRemaining = 0;
  state = step(state, { type: 'dash', playerId: 'P1' });
  state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'dash-cost' });
  const dash = state;
  const dashHp = state.players.P1.hp;
  state = step(state, move('C2'));
  assert.equal(burning(state), 0, 'Dash does not give its Burning Card before turn completion.');
  assert.equal(state.pendingDashBurning?.P1, 1);
  const cancelled = step(state, { type: 'cancel-movement', playerId: 'P1' });
  assert.equal(cancelled.pendingDashBurning?.P1 ?? 0, 0, 'Dash movement cancellation removes queued Burning.');
  assert.equal(burning(step(cancelled, { type: 'cancel-dash', playerId: 'P1' })), 0);
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(state.activePlayerId, 'P2');
  assert.equal(burning(state), 1);
  assert.equal(state.players.P1.hp, dashHp, 'New Dash Burning does not deal Damage this turn.');
  assert.equal(state.pendingDashBurning?.P1, undefined);
  // Automatic Dash completion has the same ordering as manually ending it.
  const completed = step(step(dash, move('C2')), move('D2'));
  assert.equal(completed.activePlayerId, 'P2');
  assert.equal(burning(completed), 1);
  assert.equal(completed.players.P1.hp, dashHp);

  state = setup(stack);
  state.players.P1.hand = [{ instanceId: 'old-burning', cardId: 'burning' }];
  state.players.P1.movementRemaining = 0;
  for (let x = 1; x <= 8; x++) for (let y = 0; y < 8; y++) modifySquare(state, { x, y }, 'patch-of-flames');
  const oldBurningHp = state.players.P1.hp;
  state = step(state, { type: 'dash', playerId: 'P1' });
  assert.equal(state.activePlayerId, 'P2');
  assert.ok(burning(state) > 0, 'Random Burning Dash can pick up new environmental Burning.');
  assert.equal(state.players.P1.hp, oldBurningHp - 1, 'Only preexisting Burning deals Damage during random Dash.');

  state = setup(stack);
  state.phase = 'dashing';
  state.players.P1.hand = Array.from({ length: 6 }, (_, index) => ({ instanceId: `limit-${index}`, cardId: 'attack-2' }));
  ignite(state, 'C2');
  state = step(state, move('C2'));
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(state.phase, 'choosing-end-discard');
  assert.equal(burning(state), 0, 'End-turn choices finish before Dash Burning enters Hand.');
  state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'limit-0' });
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(state.activePlayerId, 'P2');
  assert.equal(burning(state), 1);
  assert.equal(state.players.P1.hp, dashHp);

  state = setup(stack);
  ignite(state, 'B2'); ignite(state, 'E2'); ignite(state, 'C2');
  state.phase = 'choosing-portal-target';
  (state as any).portal = { casterId: 'P1', source: 'portal' };
  state = step(state, { type: 'portal-teleport', playerId: 'P1', to: cell('E2') });
  assert.equal(burning(state), 2, 'Teleport touches endpoints, not intervening Squares.');

  state = setup(stack);
  state.players.P1.position = cell('B2'); state.players.P2.position = cell('F2');
  ignite(state, 'E2');
  state.phase = 'choosing-force-pull-target';
  state.forcePull = { casterId: 'P1', level: 1, distance: 2, targetRange: 8, undo: null };
  state = step(state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  assert.equal(burning(state, 'P2'), 1, 'Enemy pull pays once when leaving intermediate fire.');
  assert.deepEqual(state.players.P2.position, cell('D2'));

  state = setup(stack);
  state.players.P1.character = 'magician';
  state.players.P1.spellEcho[2] = { instanceId: 'push', cardId: 'magic-hand' };
  state.players.P2.position = cell('C2');
  ignite(state, 'D2');
  const beforePush = state;
  state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
  state = step(state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  state = step(state, { type: 'magic-hand-direction', playerId: 'P1', to: cell('E2') });
  assert.equal(burning(state, 'P2'), 1, 'Enemy push pays once per intermediate fire visit.');
  state = step(state, { type: 'undo-last-action', playerId: 'P1' });
  assert.equal(burning(state, 'P2'), 0, 'Undoing an enemy Perk removes its environmental Burning.');
  assert.deepEqual(state.players.P2.position, beforePush.players.P2.position);

  state = setup(stack);
  state.phase = 'choosing-shizzle-destination';
  state.shizzle = { casterId: 'P1', level: 1, stepsRemaining: 3, consume: false, enemyUnderfoot: null, started: false, undo: null };
  ignite(state, 'C2');
  state = step(state, { type: 'shizzle-destination', playerId: 'P1', to: cell('E2') });
  assert.equal(burning(state), 1, 'Card movement pays once per traversed Patch.');
}

let pipe = createPipeTestState(true, 'merylin', 'shinobi');
pipe.objects = pipe.objects.filter((object) => object.kind !== 'wooden-box');
pipe.players.P2.position = cell('B7');
assert.equal(modifySquare(pipe, cell('C3'), 'patch-of-flames'), false, 'Flood Buttons cannot burn.');
assert.equal(modifySquare(pipe, cell('A5'), 'patch-of-flames'), false, 'Pipe Columns cannot burn.');
ignite(pipe, 'B7');
pipe.players.P1.position = cell('B3'); pipe.players.P1.hand = [];
pipe = step(pipe, { type: 'press-pipe-button', playerId: 'P1', buttonId: 'pipe-button-1' });
assert.equal(isShallowWater(pipe, cell('B7')), true);
assert.equal(pipe.squareModifications?.B7, undefined, 'Flooding permanently deletes fire in the zone.');
assert.equal(modifySquare(pipe, cell('B7'), 'patch-of-flames'), false);
pipe.pipeFloodUntil = {};
assert.equal(isBurningSquare(pipe, cell('B7')), false, 'Draining never restores extinguished fire.');

let slide = createPipeTestState(true, 'merylin', 'shinobi');
slide.phase = 'active'; slide.objects = slide.objects.filter((object) => object.kind !== 'wooden-box');
slide.players.P1.position = cell('E7'); slide.players.P1.movementRemaining = 2; slide.players.P1.freeMoveUsed = true;
slide.players.P1.hand = [];
ignite(slide, 'D7');
slide = step(slide, move('D7'));
assert.deepEqual(slide.players.P1.position, cell('C7'));
assert.equal(burning(slide), 1, 'Automatic Slide does not charge again after voluntary entry.');

const visuals = new PatchOfFlamesVisuals();
const visualState = setup(); ignite(visualState, 'D4');
const position = () => new THREE.Vector3(2, 1.2, 3);
visuals.update(visualState, 1000, position);
assert.equal(visuals.group.children.length, 1);
assert.equal(visuals.group.children[0].children.length, 9);
assert.equal(visuals.group.children[0].position.y, 1.2, 'Flames follow the Square surface height.');
visuals.update(visualState, 2000, position);
assert.equal(visuals.group.children.length, 1, 'Updating a persistent flame does not duplicate it.');
modifySquare(visualState, cell('D4'), 'shallow-water');
visuals.update(visualState, 3000, position);
assert.equal(visuals.group.children.length, 0, 'Water removes its visual.');
ignite(visualState, 'B2'); visuals.update(visualState, 4000, position);
visuals.update(visualState, 5000, position, false);
assert.equal(visuals.group.children.length, 0, 'Leaving the match clears flame objects.');
let disposed = 0;
visuals.update(setup(), 6000, position);
const material = (visuals as any).material as THREE.ShaderMaterial;
const geometry = (visuals as any).geometry as THREE.BufferGeometry;
material.addEventListener('dispose', () => disposed++); geometry.addEventListener('dispose', () => disposed++);
visuals.dispose(); assert.equal(disposed, 2);
console.log('Patch of Flames: terrain, movement, undo, Dash timing, turn start, flooding and visual lifecycle passed.');
