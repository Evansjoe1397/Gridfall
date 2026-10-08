import assert from 'node:assert/strict';
import { applyCommand, armDaWizPath, armDaWizPreview, createHotseatTestState } from '../shared/game.ts';

for (const level of [1, 2, 3]) {
  const state = createHotseatTestState(true, 'orkk', 2, 'spectre');
  state.players.P1.position = { x: 5, y: 1 };
  state.players.P2.position = { x: 2, y: 1 };
  state.players.P2.hp = 20;
  state.objects = [
    { id: 'shield', name: 'Iron Shield', kind: 'orkk-shield', ownerId: 'P1', hp: 3, maxHp: 3, position: { x: 1, y: 1 } },
    { id: 'replica', name: 'Replica', kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 1 } },
  ];
  state.activePlayerId = 'P1';
  state.phase = 'choosing-arm-da-wiz-target';
  state.armDaWiz = { casterId: 'P1', level, range: 16, canCreate: true, canRecall: true, undo: null };
  const before = structuredClone(state);
  const preview = armDaWizPreview(state, 'shield');
  assert.ok(preview);
  assert.deepEqual(state, before, 'Hover must not mutate the match.');
  assert.deepEqual(armDaWizPreview(state, 'shield'), preview);
  assert.deepEqual(preview.path, armDaWizPath(state, state.objects[0], state.players.P1.position, 16));
  assert.equal(preview.hits.length, 2, 'Enemy tiles are highlighted for pulls at every level.');
  assert.deepEqual(preview.hits.map((hit) => hit.pathIndex), [0, 1]);
  assert.ok(preview.hits.every((hit) => hit.pulls));
  if (level === 1) assert.ok(preview.hits.every((hit) => hit.damage === 0));
  if (level >= 2) {
    assert.deepEqual(preview.hits.map((hit) => hit.pathIndex), [0, 1]);
    assert.ok(preview.hits.every((hit) => hit.damage === 1));
  }
  const actual = applyCommand(state, { type: 'arm-da-wiz-target', playerId: 'P1', objectId: 'shield' });
  assert.ok(actual.ok);
  assert.equal(before.players.P2.hp - actual.state.players.P2.hp, preview.hits.reduce((sum, hit) => sum + hit.damage, 0));
  state.armDaWiz.range = 1;
  assert.equal(armDaWizPreview(state, 'shield'), null, 'Unreachable shields have no preview.');
  assert.equal(armDaWizPreview(before, 'replica'), null, 'Only owned Iron Shields are eligible.');
}
console.log('Arm da Wiz preview: levels, paths, enemy/Replica damage, eligibility, and state isolation passed.');
