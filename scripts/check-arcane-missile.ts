import assert from 'node:assert/strict';
import { applyCommand, arcaneMisslePath, createPipeTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.error}`);
  return result.state;
}
function setup(level: number): GameState {
  const state = createPipeTestState(true, 'magician', 2, 'merylin');
  state.phase = 'active'; state.activePlayerId = 'P1';
  state.players.P1.position = { x: 7, y: 0 };
  state.players.P2.position = { x: 4, y: 0 };
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; }
  state.players.P1.manaPoints = 2;
  state.players.P1.spellEcho = [null, null, null];
  state.players.P1.spellEcho[level - 1] = { instanceId: 'missile', cardId: 'arcane-missle' };
  return state;
}
for (const level of [1, 2]) {
  let state = setup(level);
  assert.ok(arcaneMisslePath(state, state.players.P1, state.players.P2, level), 'Dump reproduction: Logan at G1 can target Merylin at D1 within the printed Range 3.');
  const hp = state.players.P2.hp;
  state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
  state = step(state, { type: 'arcane-missle-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(state.players.P2.hp, hp - 1);
  assert.equal(state.spellProjectiles.at(-1)?.count, level);
  assert.equal(state.phase, 'active');
  assert.equal(state.players.P1.manaPoints, 3);

  state = setup(level);
  state.players.P1.attackRange = 6;
  state.players.P2.position = { x: 3, y: 0 };
  assert.equal(arcaneMisslePath(state, state.players.P1, state.players.P2, level), null, 'Printed Range 3 does not inherit a larger Attack Range.');
}
const obstacle = setup(2);
obstacle.objects = [{ id: 'wall', name: 'Column', kind: 'wall-pillar', position: { x: 6, y: 0 }, hp: 999, maxHp: 999 }];
assert.equal(arcaneMisslePath(obstacle, obstacle.players.P1, obstacle.players.P2, 1), null, 'Level 1 still requires direct line of sight.');
const route = arcaneMisslePath(obstacle, obstacle.players.P1, obstacle.players.P2, 2)!;
assert.ok(route);
assert.equal(route.length - 1, 3);
assert.ok(!route.some((cell) => cell.x === 6 && cell.y === 0), 'Level 2 maneuvers around the Column.');
const global = setup(3);
global.players.P2.position = { x: 1, y: 7 };
assert.ok(arcaneMisslePath(global, global.players.P1, global.players.P2, 3), 'Level 3 retains Global Range.');
let consume = setup(2);
consume.players.P1.manaMode = 'consume';
consume.players.P1.manaPoints = 0;
const hp = consume.players.P2.hp;
consume = step(consume, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
consume = step(consume, { type: 'arcane-missle-target', playerId: 'P1', targetId: 'P2' });
assert.equal(consume.players.P2.hp, hp - 3, 'Consume retains the same Range 3 and adds 2 Damage.');
console.log('Arcane Missile range checks passed.');
