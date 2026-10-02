import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createPipeTestState, createTrenchTestState, distance, effectiveMoveRange, isShallowWater, movementCost, movementPath, type BoardObject, type Cell, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};

assert.equal(cardDefinition({ instanceId: 'windwalker-description', cardId: 'windwalker-stance' }).levelEffects?.[2], 'Move between adjacent Squares for 1 MOV. May pass through enemies and Objects, but not Wall Objects. Finish on an unoccupied Square. Ignore negative movement effects.');
assert.equal(cardDefinition({ instanceId: 'windwalker-description', cardId: 'windwalker-stance' }).levelEffects?.[1], '+2 MOV, instead');
const windwalkerAt = (level: 1 | 2 | 3, movementRemaining: number, moveRange = 2): GameState => {
  const state = createPipeTestState(true, 'merylin', 'dummy');
  state.objects = state.objects.filter((object) => object.kind !== 'wooden-box');
  state.phase = 'active'; state.activePlayerId = 'P1';
  state.players.P1.freeMoveUsed = true;
  state.players.P1.moveRange = moveRange;
  state.players.P1.movementRemaining = movementRemaining;
  state.players.P1.movementSpentThisTurn = Math.max(0, moveRange - movementRemaining);
  state.players.P1.spellEcho[level - 1] = { instanceId: `windwalker-level-${level}`, cardId: 'windwalker-stance' };
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
};
for (const [before, after] of [[0, 1], [1, 2], [2, 2]] as const) {
  const used = windwalkerAt(1, before);
  assert.equal(used.players.P1.movementRemaining, after, `Level 1 restores spent MOV from ${before}/2 without exceeding 2/2.`);
  assert.equal(effectiveMoveRange(used.players.P1), 2, 'Level 1 does not extend maximum MOV.');
  assert.equal(used.players.P1.windwalkerMoveBonus ?? 0, 0);
}
assert.equal(windwalkerAt(1, 3, 4).players.P1.movementRemaining, 4, 'Level 1 respects an upgraded maximum MOV.');
for (const [before, after] of [[0, 2], [2, 4]] as const) {
  const used = windwalkerAt(2, before);
  assert.equal(used.players.P1.movementRemaining, after, `Level 2 adds exactly 2 MOV from ${before}/2.`);
  assert.equal(effectiveMoveRange(used.players.P1), 4, 'Level 2 extends maximum MOV by 2.');
  assert.equal(used.players.P1.windwalkerMoveBonus, 2);
}
const upgradedLevelTwo = windwalkerAt(2, 1, 4);
assert.equal(upgradedLevelTwo.players.P1.movementRemaining, 3);
assert.equal(effectiveMoveRange(upgradedLevelTwo.players.P1), 6);
const expiredLevelTwo = step(windwalkerAt(2, 0), { type: 'end-turn', playerId: 'P1' });
assert.equal(expiredLevelTwo.players.P1.windwalkerMoveBonus, 0, 'Level 2 bonus expires at the end of Merylin’s turn.');
assert.equal(effectiveMoveRange(expiredLevelTwo.players.P1), 2);
assert.equal(windwalkerAt(3, 0).players.P1.movementRemaining, 2, 'Level 3 inherits the Level 2 bonus rather than stacking Level 1 restoration.');

let state = createPipeTestState(true, 'merylin', 'dummy');
state.objects = state.objects.filter((object) => object.kind !== 'wooden-box');
state.phase = 'active'; state.activePlayerId = 'P1';
state.pipeTurnIndex = 0; state.pipeFloodUntil = { 1: 5, 2: 5 };
state.players.P1.position = cell('B5');
state.players.P2.position = cell('H7');
state.players.P1.freeMoveUsed = true;
state.players.P1.movementRemaining = 1;
state.players.P1.hexMovementPenalty = 1;
state.players.P1.hand = [{ instanceId: 'windwalker-pinned', cardId: 'pinned' }];
state.players.P1.spellEcho = [null, null, { instanceId: 'windwalker-level-three', cardId: 'windwalker-stance' }];
assert.equal(isShallowWater(state, cell('A6')), true);
assert.equal(isShallowWater(state, cell('G1')), true);
assert.equal(movementCost(state, state.players.P1, [cell('A6')]), 2, 'Entering Shallow Water normally costs 2 MOV.');

state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(state.players.P1.windwalkerUnrestrictedMovement, true);
assert.equal(effectiveMoveRange(state.players.P1), 4, 'Level 3 ignores Pinned and stolen MOV penalties.');
assert.equal(state.players.P1.movementRemaining, 4, 'Level 3 restores movement lost to active penalties.');
assert.deepEqual(movementPath(state, state.players.P1, cell('A6')), [cell('A6')], 'An adjacent Water Square is reached in one step.');
assert.equal(movementCost(state, state.players.P1, movementPath(state, state.players.P1, cell('A6'))), 1, 'Entering Shallow Water costs only 1 MOV.');
assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell('A5') }).ok, false, 'An occupied Column Square is not a legal destination.');
assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell('H7') }).ok, false, 'An occupied character Square is not a legal destination.');

state = step(state, { type: 'move', playerId: 'P1', to: cell('A6') });
assert.equal(state.players.P1.movementRemaining, 3);
state.players.P1.hand.push({ instanceId: 'windwalker-panic', cardId: 'panic' });
assert.equal(movementCost(state, state.players.P1, movementPath(state, state.players.P1, cell('B6'))), 1, 'Adjacent Water to Water ignores the exit surcharge.');
state = step(state, { type: 'move', playerId: 'P1', to: cell('B6') });
assert.equal(state.players.P1.movementRemaining, 2, 'Panic does not block Level 3 movement.');
state = step(state, { type: 'move', playerId: 'P1', to: cell('B5') });
assert.equal(state.players.P1.movementRemaining, 1, 'Leaving Water for an adjacent dry Square costs 1 MOV.');

state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.players.P1.windwalkerUnrestrictedMovement, false, 'Level 3 movement expires at turn end.');
assert.equal(effectiveMoveRange(state.players.P1), 2, 'Movement penalties apply again after Windwalker expires.');

const traversalState = (): GameState => {
  const ready = windwalkerAt(3, 2);
  ready.objects = []; ready.elevations = {};
  ready.players.P1.position = cell('B4');
  ready.players.P2.position = cell('H8');
  return ready;
};
const remote = traversalState();
const remotePath = movementPath(remote, remote.players.P1, cell('F4'));
assert.equal(remotePath.length, 4, 'A destination four Squares away requires four steps, not a teleport.');
let previous = remote.players.P1.position;
for (const next of remotePath) {
  assert.equal(distance(previous, next), 1, 'Every step in the route is adjacent.');
  previous = next;
}
assert.equal(movementCost(remote, remote.players.P1, remotePath), 4);
remote.players.P1.movementRemaining = 1;
assert.equal(applyCommand(remote, { type: 'move', playerId: 'P1', to: cell('F4') }).ok, false, 'One MOV cannot cross the board.');
remote.players.P1.movementRemaining = 4;
const remoteMoved = step(remote, { type: 'move', playerId: 'P1', to: cell('F4') });
assert.equal(remoteMoved.players.P1.movementRemaining, 0);
assert.deepEqual(remoteMoved.players.P1.visualMovement?.path, remotePath, 'The animation follows the actual adjacent-step route.');

const wall = (label: string, kind: BoardObject['kind'] = 'wall-pillar'): BoardObject => ({
  id: `wall-${kind}-${label}`, name: 'Obstacle', kind, hp: 999, maxHp: 999, position: cell(label),
});
const corridorState = (): GameState => {
  const ready = traversalState();
  ready.objects = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((column) => [wall(`${column}3`), wall(`${column}5`)]);
  ready.objects.push(wall('A4'));
  ready.players.P2.position = cell('C4');
  ready.objects.push({ id: 'transit-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('D4') });
  return ready;
};
const corridor = corridorState();
assert.deepEqual(movementPath(corridor, corridor.players.P1, cell('E4')), [cell('C4'), cell('D4'), cell('E4')], 'A route may pass through an enemy and a Wooden Box.');
const crossed = step(corridor, { type: 'move', playerId: 'P1', to: cell('E4') });
assert.equal(crossed.players.P1.movementRemaining, 1, 'Crossing occupied Squares still costs 1 MOV per adjacent step.');
assert.deepEqual(crossed.players.P2.position, cell('C4'));
assert.equal(crossed.players.P2.hp, corridor.players.P2.hp, 'Passing through an enemy causes no Damage.');
assert.equal(crossed.objects.find((object) => object.id === 'transit-box')?.hp, 3, 'Passing through a Box leaves it intact.');
for (const destination of ['C4', 'D4']) {
  assert.deepEqual(movementPath(corridor, corridor.players.P1, cell(destination)), [], 'An occupied Square cannot be a final destination.');
  assert.equal(applyCommand(corridor, { type: 'move', playerId: 'P1', to: cell(destination) }).ok, false);
}
const noExitMovement = corridorState();
noExitMovement.players.P1.movementRemaining = 2;
assert.equal(applyCommand(noExitMovement, { type: 'move', playerId: 'P1', to: cell('E4') }).ok, false, 'Merylin must have enough MOV to finish beyond the occupied Squares.');
const levelTwo = corridorState();
levelTwo.players.P1.windwalkerUnrestrictedMovement = false;
assert.deepEqual(movementPath(levelTwo, levelTwo.players.P1, cell('E4')), [], 'Without Level 3, the enemy and Box still block the route.');

for (const kind of ['wall-pillar', 'orkk-shield', 'tomb', 'spectre-replica', 'spirit-guardian', 'pipe-button'] as const) {
  const blocked = corridorState();
  blocked.players.P2.position = cell('H8');
  blocked.objects.push({ ...wall('C4', kind), guardianLevel: 2 });
  assert.deepEqual(movementPath(blocked, blocked.players.P1, cell('E4')), [], `${kind} cannot be crossed even with Level 3.`);
  assert.equal(applyCommand(blocked, { type: 'move', playerId: 'P1', to: cell('E4') }).ok, false);
}
const detour = traversalState();
detour.objects = [wall('C4', 'orkk-shield')];
const detourPath = movementPath(detour, detour.players.P1, cell('D4'));
assert.equal(detourPath.length, 2, 'Merylin may take an available route around a Shield.');
assert.equal(detourPath.some((position) => distance(position, cell('C4')) === 0), false);

const diagonal = traversalState();
diagonal.players.P1.position = cell('B2');
diagonal.objects = [wall('C2'), wall('B3', 'orkk-shield')];
diagonal.players.P1.movementRemaining = 1;
assert.notDeepEqual(movementPath(diagonal, diagonal.players.P1, cell('C3')), [cell('C3')], 'Two Wall Objects close a diagonal corner.');
assert.equal(applyCommand(diagonal, { type: 'move', playerId: 'P1', to: cell('C3') }).ok, false);
diagonal.objects = [{ id: 'corner-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('B3') }];
diagonal.players.P2.position = cell('C2');
assert.deepEqual(movementPath(diagonal, diagonal.players.P1, cell('C3')), [cell('C3')], 'Passable occupants do not close a diagonal corner.');
assert.equal(applyCommand(diagonal, { type: 'move', playerId: 'P1', to: cell('C3') }).ok, true);

for (const origin of ['C7', 'D5']) {
  const highground = createTrenchTestState(true, 'merylin', 'dummy');
  highground.phase = 'active'; highground.activePlayerId = 'P1'; highground.objects = [];
  highground.players.P1.position = cell(origin);
  highground.players.P2.position = cell('H8');
  highground.players.P1.freeMoveUsed = true;
  highground.players.P1.movementRemaining = 1;
  highground.players.P1.spellEcho = [null, null, { instanceId: `climb-${origin}`, cardId: 'windwalker-stance' }];
  const used = step(highground, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
  used.players.P1.movementRemaining = 1;
  const destination = cell(origin === 'C7' ? 'C6' : 'D6');
  assert.deepEqual(movementPath(used, used.players.P1, destination), [destination], 'Level 3 can climb from a Slide or Trench to adjacent High Ground.');
  const climbed = step(used, { type: 'move', playerId: 'P1', to: destination });
  assert.equal(climbed.players.P1.movementRemaining, 0, 'The ascent costs exactly 1 MOV.');
}

console.log('Windwalker Stance checks passed.');
