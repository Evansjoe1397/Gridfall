import assert from 'node:assert/strict';
import { applyCommand, createTrenchTestState, forecastMovement, type Cell } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
for (const obstacle of ['empty', 'box', 'blocked-box', 'wall', 'enemy', 'blocked-enemy', 'slide-immune'] as const) {
  const state = createTrenchTestState(false, 'magician', 'dummy');
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = [];
  state.players.P1.position = cell('C3'); state.players.P1.movementRemaining = 6;
  if (obstacle === 'slide-immune') state.players.P1.swiftformCanPassEnemies = true;
  state.players.P2.position = cell(obstacle.includes('enemy') ? 'C5' : 'H8');
  if (obstacle.includes('box') || obstacle === 'wall') state.objects.push({ id: 'obstacle', name: obstacle.includes('box') ? 'Wooden Box' : 'Wall', kind: obstacle.includes('box') ? 'wooden-box' : 'wall-pillar', hp: 3, maxHp: 3, position: cell('C5') });
  if (obstacle.startsWith('blocked')) state.objects.push({ id: 'blocker', name: 'Wall', kind: 'wall-pillar', hp: 3, maxHp: 3, position: cell('C6') });
  const before = structuredClone(state);
  const command = { type: 'move' as const, playerId: 'P1' as const, to: cell('C4') };
  const preview = forecastMovement(state, command)!;
  assert.ok(preview);
  assert.deepEqual(state, before, 'Forecast must leave the live state unchanged.');
  assert.deepEqual(forecastMovement(state, command), preview, 'Repeated hovering must be deterministic.');
  const actual = applyCommand(state, command);
  assert.ok(actual.ok);
  assert.deepEqual(preview.path, actual.state.players.P1.visualMovement!.path, obstacle);
  // Enemy pushes also stop here because C6 is forbidden High Ground from C5.
  assert.equal(preview.collision, obstacle === 'wall' || obstacle.includes('enemy'), obstacle);
  if (obstacle === 'box') assert.equal(preview.effects[0].label, 'Push');
  if (obstacle === 'blocked-box') assert.equal(preview.effects[0].label, 'Destroyed');
  if (obstacle === 'slide-immune') assert.deepEqual(preview.path, [cell('C4')]);
  if (obstacle.includes('enemy')) assert.match(preview.effects[0].label, /HP/);
}
console.log('Movement preview: slide routes, collisions, pushes, damage, and state isolation passed.');
