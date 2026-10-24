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

for (const stack of [false, true]) {
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
  assert.equal(burning(state), 2, 'Multi-step movement triggers entry and exit on an intermediate Square.');
  const invalid = applyCommand(state, move('I1'));
  assert.equal(invalid.ok, false);
  assert.equal(burning(state), 2, 'Rejected movement does not add statuses.');

  state = setup(stack);
  ignite(state, 'G7');
  const hp = state.players.P2.hp;
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(burning(state, 'P2'), 1, 'Turn start applies Burning even without movement.');
  assert.equal(state.players.P2.hp, hp, 'Receiving Burning does not itself deal Damage.');
  state = step(state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(state.players.P2.hp, hp - 1);

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
  assert.equal(burning(completed), 2);
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
  assert.equal(burning(state, 'P2'), 2, 'Enemy pull crosses fire.');
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
  assert.equal(burning(state, 'P2'), 2, 'Enemy push checks all intermediate Squares.');
  state = step(state, { type: 'undo-last-action', playerId: 'P1' });
  assert.equal(burning(state, 'P2'), 0, 'Undoing an enemy Perk removes its environmental Burning.');
  assert.deepEqual(state.players.P2.position, beforePush.players.P2.position);

  state = setup(stack);
  state.phase = 'choosing-shizzle-destination';
  state.shizzle = { casterId: 'P1', level: 1, stepsRemaining: 3, consume: false, enemyUnderfoot: null, started: false, undo: null };
  ignite(state, 'C2');
  state = step(state, { type: 'shizzle-destination', playerId: 'P1', to: cell('E2') });
  assert.equal(burning(state), 2, 'Card movement checks every traversed Square.');
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
assert.equal(burning(slide), 2, 'Automatic Slide applies entry and departure Burning.');

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
