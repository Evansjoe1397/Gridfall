import assert from 'node:assert/strict';
import { applyCommand, chainLightningCanTarget, createHotseatTestState, wizardActionEventForCommand, type BoardObject } from '../shared/game.ts';

function box(id: string, x: number, y: number): BoardObject {
  return { id, name: id, kind: 'wooden-box', position: { x, y }, hp: 3, maxHp: 3 };
}
function resolve(objects: BoardObject[], bounces = 5, bounceRange = 2) {
  const state = createHotseatTestState(true, 'magician', 2, 'dummy');
  state.elevations = {}; state.objects = objects;
  state.players.P1.position = { x: 2, y: 1 };
  state.players.P2.position = { x: 2, y: 3 };
  state.phase = 'choosing-chain-lightning-target';
  state.chainLightning = { casterId: 'P1', level: 3, bounces, bounceRange, undo: null };
  const hp = state.players.P2.hp;
  const result = applyCommand(state, { type: 'chain-lightning-target', playerId: 'P1', targetId: 'P2' });
  if (!result.ok) throw new Error(result.error);
  return { state: result.state, damage: hp - result.state.players.P2.hp };
}

for (const reverse of [false, true]) {
  const objects = [box('a', 1, 3), box('b', 3, 3), box('c', 2, 5)];
  const result = resolve(reverse ? objects.reverse() : objects);
  assert.equal(result.state.objects.length, 0, 'Destroy all three reachable Objects.');
  assert.equal(result.damage, 3, 'Hit the enemy initially and return twice.');
  assert.equal(result.state.spellProjectiles.length, 6, 'Use all five bounces.');
  assert.equal(new Set(result.state.spellProjectiles.filter((p) => p.targetId !== 'P2').map((p) => p.targetId)).size, 3);
}
const pillar = { ...box('pillar', 3, 3), kind: 'wall-pillar' as const };
const blocked = resolve([pillar, box('behind-wall', 4, 3)]);
assert.equal(blocked.state.spellProjectiles.length, 1, 'Do not bounce into pillars or through their blocked line of sight.');
assert.equal(blocked.state.objects.length, 2);
const outOfRange = resolve([box('far', 2, 5)], 1, 1);
assert.equal(outOfRange.state.spellProjectiles.length, 1);
const limited = resolve([box('near', 3, 3)], 1, 1);
assert.equal(limited.state.objects.length, 0);
assert.equal(limited.damage, 1, 'Never exceed the bounce budget to return to the enemy.');
console.log('Chain Lightning route checks passed.');

for (const kind of ['wooden-box', 'tomb', 'wall-pillar'] as const) {
  const state = createHotseatTestState(true, 'magician', 2, 'dummy');
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 1 };
  state.players.P2.position = { x: 3, y: 3 };
  state.objects = [{ ...box('initial-object', 2, 3), kind }];
  state.phase = 'choosing-chain-lightning-target';
  state.chainLightning = { casterId: 'P1', level: 1, bounces: 1, bounceRange: 1, undo: null };
  const command = { type: 'chain-lightning-target', playerId: 'P1', targetKind: 'object', targetId: 'initial-object' } as const;
  assert.equal(chainLightningCanTarget(state, 'P1', command.targetId, 'object'), true);
  assert.deepEqual(wizardActionEventForCommand(state, command)?.target, { x: 2, y: 3 }, 'The cast animation aims at the Object.');
  const hp = state.players.P2.hp;
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.equal(result.state.objects.some((object) => object.id === command.targetId), kind === 'wall-pillar', 'Columns survive; destructible Objects are destroyed.');
  assert.equal(result.state.players.P2.hp, hp - 1, 'Lightning bounces from the initial Object to the enemy.');
  assert.equal(result.state.spellProjectiles.length, 2);
  if (kind === 'wall-pillar') assert.equal(result.state.objects[0].hp, 3, 'Columns do not take Damage.');
}

const invalid = createHotseatTestState(true, 'magician', 2, 'dummy');
invalid.elevations = {};
invalid.players.P1.position = { x: 2, y: 1 };
invalid.phase = 'choosing-chain-lightning-target';
invalid.chainLightning = { casterId: 'P1', level: 1, bounces: 1, bounceRange: 1, undo: null };
invalid.objects = [box('far-object', 8, 7)];
assert.equal(applyCommand(invalid, { type: 'chain-lightning-target', playerId: 'P1', targetKind: 'object', targetId: 'far-object' }).ok, false, 'Initial Objects must be in Range.');
invalid.objects = [{ ...box('blocking-column', 2, 2), kind: 'wall-pillar' }, box('hidden-object', 2, 3)];
assert.equal(chainLightningCanTarget(invalid, 'P1', 'hidden-object', 'object'), false, 'Initial Objects require line of sight.');
console.log('Chain Lightning initial Object and Column checks passed.');
