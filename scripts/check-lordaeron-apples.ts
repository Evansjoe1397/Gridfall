import assert from 'node:assert/strict';
import { applyCommand, baseSquareAt, createHotseatTestState, type Cell, type GameCommand, type GameState } from '../shared/game.ts';
import { LORDAERON_ARENA } from '../shared/arenas.ts';
import { AppleObjects } from '../src/apple-objects.ts';
import * as THREE from 'three';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function setup(count: 2 | 3 = 3): GameState {
  const state = createHotseatTestState(true, 'magician', count, 'dummy');
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.freeMoveUsed = true; player.movementRemaining = 0;
  }
  state.players.P1.position = cell('B3'); state.players.P2.position = cell('E2');
  if (state.players.P3) state.players.P3.position = cell('H10');
  return state;
}
function destroyBox(state: GameState, square = 'B4'): GameState {
  state.objects.push({ id: 'box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell(square), respawnEligible: true });
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-2' }];
  return step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'box', targetKind: 'object' });
}

let state = destroyBox(setup());
assert.equal(state.objects.some((object) => object.id === 'box'), false);
assert.equal(state.appleObjects?.length, 1);
assert.deepEqual(state.appleObjects![0].position, cell('B4'));
state.players.P1.movementRemaining = 1;
const beforePickup = structuredClone(state);
state = step(state, { type: 'move', playerId: 'P1', to: cell('B4') });
assert.equal(state.appleObjects?.length, 0);
assert.equal(state.players.P1.movementRemaining, 1, 'One walking MOV is restored by the Apple');
const undone = step(state, { type: 'cancel-movement', playerId: 'P1' });
assert.deepEqual(undone.appleObjects, beforePickup.appleObjects, 'Undo restores the Apple');
assert.equal(undone.players.P1.appleMovementRemaining ?? 0, 0);
state = step(state, { type: 'move', playerId: 'P1', to: cell('B5') });
assert.equal(state.players.P1.movementRemaining, 0);
assert.equal(state.players.P1.appleMovementRemaining, 0, 'Apple movement is spent first');
assert.equal(destroyBox(setup(2)).appleObjects?.length ?? 0, 0, 'Other arenas never drop Apples');

// A forced enemy pickup expires at the active player's turn boundary, not the collector's.
state = setup();
state.players.P1.position = cell('B2'); state.players.P2.position = cell('D2');
state.players.P2.movementRemaining = 4;
state.appleObjects = [{ id: 'forced', kind: 'apple', position: cell('E2') }];
state.players.P1.spellEcho[2] = { instanceId: 'magic', cardId: 'magic-hand' };
state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
state = step(state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
state = step(state, { type: 'magic-hand-direction', playerId: 'P1', to: cell('E2') });
assert.equal(state.appleObjects?.length, 0);
assert.equal(state.players.P2.movementRemaining, 5);
assert.equal(state.players.P2.appleMovementRemaining, 1);
const declined = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(declined.players.P2.appleMovementRemaining ?? 0, 0);
assert.equal(declined.players.P2.movementRemaining, 0, 'No Apple MOV carries into the collector turn');

// A different inactive collector retains existing movement, losing only its temporary bonus.
state.players.P3.position = cell('H10');
state.players.P3.movementRemaining = 4; state.players.P3.appleMovementRemaining = 1;
state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.players.P3.movementRemaining, 3);
assert.equal(state.players.P3.appleMovementRemaining ?? 0, 0);

// Every entered path Square collects; the destination need not contain the Apple.
state = setup(); state.players.P1.movementRemaining = 2;
state.appleObjects = ['B4', 'B5'].map((square) => ({ id: square, kind: 'apple', position: cell(square) }));
state = step(state, { type: 'move', playerId: 'P1', to: cell('B5') });
assert.equal(state.appleObjects?.length, 0); assert.equal(state.players.P1.movementRemaining, 2);

// Slide landing collects normally and retains the free Slide step.
state = setup(); state.elevations = { D5: 1 };
state.players.P1.position = cell('D5'); state.players.P1.movementRemaining = 1;
state.appleObjects = [{ id: 'slide-apple', kind: 'apple', position: cell('B5') }];
state = step(state, { type: 'move', playerId: 'P1', to: cell('C5') });
assert.deepEqual(state.players.P1.position, cell('B5'));
assert.equal(state.appleObjects?.length, 0); assert.equal(state.players.P1.movementRemaining, 1);

// John's normal-form movement ledger receives the same usable point.
state = setup(); state.players.P1.character = 'john-christ';
state.players.P1.movementRemaining = 1; state.players.P1.johnCumulativeMovementRemaining = 1;
state.appleObjects = [{ id: 'john-apple', kind: 'apple', position: cell('B4') }];
state = step(state, { type: 'move', playerId: 'P1', to: cell('B4') });
assert.equal(state.players.P1.movementRemaining, 1); assert.equal(state.players.P1.johnCumulativeMovementRemaining, 1);

// Temporary movement survives the end-turn discard stage, then expires for every collector.
state = setup();
state.players.P3.movementRemaining = 5; state.players.P3.appleMovementRemaining = 1;
state.players.P1.hand = Array.from({ length: 6 }, (_, index) => ({ instanceId: `limit-${index}`, cardId: 'defend-1' }));
state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.phase, 'choosing-end-discard');
assert.equal(state.players.P3.appleMovementRemaining, 1);
state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'limit-0' });
assert.equal(state.players.P3.appleMovementRemaining, 1, 'The optional extra-discard stage still belongs to the current turn');
state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.players.P3.movementRemaining, 4); assert.equal(state.players.P3.appleMovementRemaining ?? 0, 0);

assert.deepEqual(LORDAERON_ARENA.bases.P1, ['A6', 'A7']);
assert.equal(LORDAERON_ARENA.startingSquares.P1, 'A6');
assert.equal(baseSquareAt(setup(), 'A6')?.ownerId, 'P1');
assert.equal(baseSquareAt(setup(), 'B7'), null);

const scene = new THREE.Scene(); const visuals = new AppleObjects();
const apples = [{ id: 'visual', position: cell('B4') }];
visuals.sync(scene, apples, (position) => new THREE.Vector3(position.x, 2, position.y));
assert.equal(scene.children.length, 1); assert.equal(scene.children[0].children.length, 3);
visuals.sync(scene, apples, () => new THREE.Vector3(3, 4, 5));
assert.equal(scene.children.length, 1); assert.equal(scene.children[0].position.y, 4);
visuals.sync(scene, [], () => new THREE.Vector3()); assert.equal(scene.children.length, 0);
console.log('Lordaeron Apples, movement expiry, undo, visuals and relocated Base checks passed.');
