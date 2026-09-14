import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type BoardObject, type Cell } from '../shared/game.ts';

function check(level: number, caster: Cell, enemy: Cell, blocker?: BoardObject) {
  const state = createHotseatTestState(true, 'orkk', 2, 'dummy');
  state.objects = blocker ? [blocker] : [];
  state.elevations = {};
  state.players.P1.position = caster;
  state.players.P2.position = enemy;
  state.players.P1.hand = [];
  state.players.P1.deck = [];
  state.players.P1.spellEcho = [null, null, null];
  state.players.P1.spellEcho[level - 1] = { instanceId: 'arow', cardId: 'arkane-arow' };
  const started = applyCommand(state, { type: 'use-echo-perk', playerId: 'P1', position: level as 1 | 2 | 3 });
  if (!started.ok) throw new Error(started.error);
  const result = applyCommand(started.state, { type: 'arkane-arow-target', playerId: 'P1', to: enemy });
  if (!result.ok) throw new Error(result.error);
  const blocked = Boolean(blocker) || enemy.x === 8 || enemy.x === 1 || enemy.y === 0 || enemy.y === 7;
  const expectedDamage = level === 1 ? 1 : 2 + Number(level === 3 && blocked);
  assert.equal(state.players.P2.hp - result.state.players.P2.hp, expectedDamage);
  const expectedPosition = level === 3 && !blocked
    ? { x: enemy.x + Math.sign(enemy.x - caster.x), y: enemy.y + Math.sign(enemy.y - caster.y) }
    : enemy;
  assert.deepEqual(result.state.players.P2.position, expectedPosition);
  if (blocker) assert.ok(result.state.objects.some((object) => object.id === blocker.id), 'The blocking Object remains intact.');
}

for (const level of [1, 2, 3]) {
  for (const kind of ['wooden-box', 'wall-pillar', 'orkk-shield'] as const) {
    check(level, { x: 2, y: 3 }, { x: 4, y: 3 }, {
      id: 'blocker', name: 'Blocking Object', kind, position: { x: 5, y: 3 }, hp: 3, maxHp: 3,
    });
  }
  check(level, { x: 6, y: 3 }, { x: 8, y: 3 });
  check(level, { x: 3, y: 3 }, { x: 1, y: 3 });
  check(level, { x: 4, y: 2 }, { x: 4, y: 0 });
  check(level, { x: 4, y: 5 }, { x: 4, y: 7 });
  check(level, { x: 2, y: 3 }, { x: 4, y: 3 });
}
console.log('Arkane Arow checks passed: Objects, Walls, all board edges, successful pushes, and levels 1–3.');
