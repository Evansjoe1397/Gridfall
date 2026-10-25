import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, isBurningSquare, rayOfFirePath, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (x: number, y = 1) => ({ x, y });
function setup(): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', objects: [], elevations: {} });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell(2); state.players.P2.position = cell(4);
  state.players.P1.hp = 10; state.players.P2.hp = state.players.P2.maxHp = 30;
  state.players.P1.hand = [{ instanceId: 'perk', cardId: 'ray-of-fire' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function use(state: GameState, level: 1 | 2 | 3, insert = false): GameState {
  if (level === 1) return step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'perk', destination: insert ? 'echo' : 'direct' });
  state.players.P1.hand = []; state.players.P1.spellEcho[level - 1] = { instanceId: 'perk', cardId: 'ray-of-fire' };
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
}
const select = (state: GameState, to = cell(4)) => step(state, { type: 'ray-of-fire-square', playerId: 'P1', to });
const burnCount = (state: GameState, id: 'P1' | 'P2') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
const patchCount = (state: GameState) => Object.values(state.squareModifications ?? {}).filter((mods) => mods.includes('patch-of-flames')).length;
const definition = cardDefinition({ instanceId: '', cardId: 'ray-of-fire' });
assert.equal(definition.name, 'Ray of Fire'); assert.equal(definition.kind, 'perk'); assert.equal(definition.levelEffects?.length, 3);
for (const player of Object.values(createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks').players)) assert.equal([...player.hand, ...player.deck].some((card) => card.cardId === 'ray-of-fire'), true, 'ray-of-fire belongs to the base starting pool.');
for (const level of [1, 2, 3] as const) {
  let state = use(setup(), level);
  assert.equal(state.phase, 'choosing-ray-of-fire-square'); assert.equal(patchCount(state), 0, 'Wait for the player to choose a target.');
  assert.equal(state.players.P1.actionsRemaining, 1); assert.equal(state.players.P1.perkUsed, true);
  for (const command of [
    { type: 'ray-of-fire-square', playerId: 'P2', to: cell(3) },
    { type: 'ray-of-fire-square', playerId: 'P1', to: cell(5) },
    { type: 'end-turn', playerId: 'P1' },
  ] as GameCommand[]) assert.equal(applyCommand(state, command).ok, false);
  state = select(state);
  assert.equal(state.phase, 'active'); assert.equal(state.players.P1.rayOfFire, undefined);
  assert.equal(isBurningSquare(state, cell(2)), level === 1, 'Origin is created first, then absorbed at higher levels.');
  assert.ok(isBurningSquare(state, cell(3))); assert.ok(isBurningSquare(state, cell(4)));
  assert.equal(patchCount(state), level === 1 ? 3 : 2);
  assert.equal(state.players.P1.pyroCharges ?? 0, level >= 2 ? 1 : 0); assert.equal(burnCount(state, 'P1'), level >= 2 ? 1 : 0);
  assert.equal(state.players.P1.hp, level >= 2 ? 11 : 10);
  assert.equal(state.players.P2.hp, level === 3 ? 29 : 30); assert.equal(burnCount(state, 'P2'), level === 3 ? 1 : 0);
  assert.equal(state.players.P1.matchStats.perkDamage, level === 3 ? 1 : 0);
  assert.equal(applyCommand(state, { type: 'ray-of-fire-square', playerId: 'P1', to: cell(4) }).ok, false, 'Cannot replay the resolved effect.');
}

// Direct path handles horizontal/diagonal/off-axis/self endpoints and requires LOS/Range.
let state = setup(); state.players.P1.attackRange = 3;
assert.deepEqual(rayOfFirePath(state, 'P1', cell(5, 2)), [cell(2), cell(3), cell(4, 2), cell(5, 2)]);
assert.deepEqual(rayOfFirePath(state, 'P1', cell(4, 3)), [cell(2), cell(3, 2), cell(4, 3)]);
assert.deepEqual(rayOfFirePath(state, 'P1', cell(2)), [cell(2)]);
assert.equal(rayOfFirePath(state, 'P1', cell(6)), null); assert.equal(rayOfFirePath(state, 'P1', cell(0)), null);
state.objects.push({ id: 'column', kind: 'wall-pillar', name: 'Column', hp: 999, maxHp: 999, position: cell(3) });
assert.equal(rayOfFirePath(state, 'P1', cell(4)), null);
state = use(state, 1); assert.equal(applyCommand(state, { type: 'ray-of-fire-square', playerId: 'P1', to: cell(4) }).ok, false);
state = select(state, cell(3)); assert.ok(isBurningSquare(state, cell(2))); assert.ok(!isBurningSquare(state, cell(3)), 'Column cannot be ignited.');
state = setup(); state.elevations.C2 = 2; assert.equal(rayOfFirePath(state, 'P1', cell(4)), null, 'Higher intermediate ground blocks the direct ray.');

// Water cannot burn, but does not cancel the endpoint's separate Level 3 damage/status.
state = setup(); state.players.P2.position = cell(3, 2); state = select(use(state, 3), cell(3, 2));
assert.equal(isBurningSquare(state, cell(3, 2)), false); assert.equal(state.players.P2.hp, 29); assert.equal(burnCount(state, 'P2'), 1);
state = select(use(setup(), 1), cell(2)); assert.equal(patchCount(state), 1); assert.equal(burnCount(state, 'P1'), 0, 'Creating fire does not itself grant environmental Burning.');
state = select(use(setup(), 2), cell(2)); assert.equal(patchCount(state), 0); assert.equal(state.players.P1.pyroCharges, 1);

// Absorption precedes Level 3; it does not take the Burning applied afterward.
state = setup(); state.players.P2.hand.push({ instanceId: 'original', cardId: 'burning' }); state = select(use(state, 3));
assert.equal(burnCount(state, 'P2'), 2); assert.equal(state.players.P1.pyroCharges, 1);
state = setup(); state.players.P1.traitBlocked = true; state = select(use(state, 3));
assert.equal(patchCount(state), 3); assert.equal(state.players.P1.pyroCharges ?? 0, 0); assert.equal(state.players.P2.hp, 29); assert.equal(burnCount(state, 'P2'), 1);
state = setup(); state.players.P2.spectreShadowCloakActive = true; state = select(use(state, 3));
assert.equal(state.players.P2.hp, 30); assert.equal(burnCount(state, 'P2'), 0); assert.ok(isBurningSquare(state, cell(4)));
state = setup(); state.players.P1.pyroCharges = 2; state.players.P2.hp = 2; state = select(use(state, 3));
assert.equal(state.phase, 'finished'); assert.equal(state.winner, 'P1'); assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P1.rayOfFire, undefined);
assert.ok(!state.log.some((line) => line.startsWith('Ray of Fire dealt')), 'Lethal discharge stops later effects.');

// Replicas take their owner's effect; Objects survive the terrain Perk.
state = setup(); state.players.P2.character = 'spectre'; state.players.P2.position = cell(7, 5);
state.objects.push({ id: 'replica', kind: 'spectre-replica', name: 'Replica', ownerId: 'P2', hp: 999, maxHp: 999, position: cell(4) });
state = select(use(state, 3)); assert.equal(state.players.P2.hp, 29); assert.equal(burnCount(state, 'P2'), 1);
state = setup(); state.players.P2.position = cell(7, 5); state.objects.push({ id: 'box', kind: 'wooden-box', name: 'Box', hp: 3, maxHp: 3, position: cell(4) });
state = select(use(state, 3)); assert.equal(state.objects[0].hp, 3); assert.ok(isBurningSquare(state, cell(4)));

// Cancel before selection restores Hand/Actions/Echo; deterministic terrain can be undone.
for (const insert of [false, true]) {
  const initial = setup(); state = use(initial, 1, insert); state = step(state, { type: 'cancel-targeting', playerId: 'P1' });
  assert.deepEqual(state.players.P1.hand, initial.players.P1.hand); assert.deepEqual(state.players.P1.spellEcho, initial.players.P1.spellEcho);
  assert.equal(state.players.P1.actionsRemaining, 2); assert.equal(state.players.P1.perkUsed, false); assert.equal(patchCount(state), 0);
}
state = select(use(setup(), 2)); state = step(state, { type: 'undo-last-action', playerId: 'P1' });
assert.equal(patchCount(state), 0); assert.equal(state.players.P1.hp, 10); assert.equal(state.players.P1.pyroCharges ?? 0, 0);

console.log('Ray of Fire checks passed: levels, inclusive direct path, range/LOS/terrain, absorption order, endpoint effects/protection/replicas, lethal discharge, Objects, cancellation and undo.');
