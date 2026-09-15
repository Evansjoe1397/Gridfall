import assert from 'node:assert/strict';
import { CARDS, STARTING_DECKS, applyCommand, createHotseatTestState, effectiveMoveRange, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}

function settled(state: GameState): GameState {
  return state.combatReveal?.deferredAfterCombatState ? JSON.parse(state.combatReveal.deferredAfterCombatState) : state;
}

function setup(range: number, defense?: 'block' | 'devour'): GameState {
  const state = createHotseatTestState(true, 'wreckna', 2, defense === 'devour' ? 'spectre' : 'dummy');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 2 + range, y: 2 };
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = [];
    player.freeMoveUsed = true;
    player.movementRemaining = player.moveRange;
  }
  state.players.P1.hand = [{ instanceId: 'bone', cardId: 'bone-chill' }];
  if (defense) state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  if (range > 2) state.players.P1.dakkothRangeBonus = range - 2;
  if (defense === 'devour') state.objects.push({ id: 'friendly-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', position: { x: 8, y: 7 }, hp: 999, maxHp: 999 });
  return state;
}

function attack(state: GameState): GameState {
  return step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'bone', targetId: 'P2' });
}

function resolve(state: GameState, defense?: 'block' | 'devour'): GameState {
  const declared = attack(state);
  const defended = defense
    ? step(declared, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' })
    : step(declared, { type: 'pass-defense', playerId: 'P2' });
  return settled(defended);
}

const card = CARDS.find((entry) => entry.id === 'bone-chill');
assert.equal(card?.value, 3);
assert.equal(card?.effectText, 'Value is 4 if attacking range is melee. After combat: steal MOV from target equal to your attacking range (up to 2).');
assert.deepEqual(STARTING_DECKS.wreckna.attackFocus, ['finger-of-death', 'bone-chill']);
assert.equal(Object.values(STARTING_DECKS.wreckna).flat().includes('drain-strength'), false, 'Drain Strength is absent from Wreckna\'s deck choices.');

for (const range of [1, 2, 3]) {
  const initial = setup(range);
  const declared = attack(initial);
  assert.equal(declared.pendingAttack?.attackValue, range === 1 ? 4 : 3, `Range ${range} uses the correct Attack Value.`);
  assert.equal(declared.players.P1.hexMovementBonus ?? 0, 0, 'Bone Chill must not steal MOV before combat.');
  assert.equal(declared.players.P2.hexMovementPenalty ?? 0, 0, 'The target keeps its MOV until after combat.');
  const result = settled(step(declared, { type: 'pass-defense', playerId: 'P2' }));
  const stolen = Math.min(range, 2);
  assert.equal(result.players.P1.hexMovementBonus, stolen);
  assert.equal(result.players.P1.movementRemaining, initial.players.P1.moveRange + stolen);
  assert.equal(effectiveMoveRange(result.players.P1), initial.players.P1.moveRange + stolen);
  assert.equal(result.players.P2.hexMovementPenalty, stolen);
  assert.equal(result.players.P2.movementRemaining, initial.players.P2.moveRange - stolen);
  assert.equal(effectiveMoveRange(result.players.P2), initial.players.P2.moveRange - stolen);
}

const blockDeclared = attack(setup(1, 'block'));
const blockDefended = step(blockDeclared, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
assert.equal(blockDefended.combatReveal?.attackTotal, 3, 'Block cancels Bone Chill\'s melee Value bonus.');
const blocked = settled(blockDefended);
assert.equal(blocked.players.P1.hexMovementBonus ?? 0, 0, 'Block cancels Bone Chill\'s post-combat movement steal.');
assert.equal(blocked.players.P2.hexMovementPenalty ?? 0, 0);

const devoured = resolve(setup(1, 'devour'), 'devour');
assert.equal(devoured.players.P1.hexMovementBonus ?? 0, 0, 'Devour protects against Bone Chill\'s negative movement effect.');
assert.equal(devoured.players.P2.hexMovementPenalty ?? 0, 0);

const replica = setup(2);
replica.players.P2.position = { x: 8, y: 7 };
replica.objects = [{ id: 'enemy-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', position: { x: 4, y: 2 }, hp: 999, maxHp: 999 }];
const replicaDeclared = step(replica, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'bone', origin: 'spectre', targetKind: 'replica', targetId: 'enemy-replica' });
assert.equal(replicaDeclared.pendingAttack?.attackValue, 3);
const replicaResolved = settled(step(replicaDeclared, { type: 'pass-defense', playerId: 'P2' }));
assert.equal(replicaResolved.players.P1.hexMovementBonus, 2);
assert.equal(replicaResolved.players.P2.hexMovementPenalty, 2, 'Attacking a replica steals MOV from its owning character.');

const object = setup(1);
object.players.P2.position = { x: 8, y: 7 };
object.objects = [{ id: 'box', name: 'Box', kind: 'wooden-box', position: { x: 3, y: 2 }, hp: 4, maxHp: 4 }];
const objectResolved = step(object, { type: 'attack', playerId: 'P1', cardInstanceId: 'bone', targetKind: 'object', targetId: 'box' });
assert.equal(objectResolved.objects.some((entry) => entry.id === 'box'), false, 'Melee Bone Chill resolves at Value 4 against an Object.');
assert.equal(objectResolved.log.some((line) => line.includes('Bone Chill at resolved Value 4')), true);
assert.equal(objectResolved.players.P1.hexMovementBonus ?? 0, 0, 'Objects have no MOV to steal.');

console.log('Bone Chill checks passed: deck replacement, range scaling, post-combat MOV theft, blockers, replicas, and Objects.');
