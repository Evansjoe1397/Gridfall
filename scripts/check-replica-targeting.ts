import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, createInitialState } from '../shared/game.ts';

const resolveDefense = (state: any, playerId: 'P1' | 'P2') => {
  const result = applyCommand(state, { type: 'pass-defense', playerId });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.error);
  const deferred = result.state.combatReveal?.deferredAfterCombatState;
  return deferred ? JSON.parse(deferred) : result.state;
};

const lightbringerState = createHotseatTestState(true, 'merylin', 'spectre');
lightbringerState.phase = 'active'; lightbringerState.activePlayerId = 'P1';
lightbringerState.players.P1.position = { x: 2, y: 2 }; lightbringerState.players.P2.position = { x: 8, y: 7 };
lightbringerState.players.P1.merylinSummonActive = true;
lightbringerState.players.P1.hand = [{ instanceId: 'replica-lightbringer', cardId: 'lightbringer' }]; lightbringerState.players.P2.hand = [];
lightbringerState.objects = [
  { id: 'lightbringer-decoy', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 6, y: 6 } },
  { id: 'lightbringer-target', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 2 } },
];
const lightbringerAttack = applyCommand(lightbringerState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'replica-lightbringer', origin: 'spectre', targetKind: 'replica', targetId: 'lightbringer-target' });
assert.equal(lightbringerAttack.ok, true);
if (!lightbringerAttack.ok) throw new Error(lightbringerAttack.error);
assert.equal(lightbringerAttack.state.pendingAttack?.defenderReplicaId, 'lightbringer-target');
const lightbringerDefense = applyCommand(lightbringerAttack.state, { type: 'pass-defense', playerId: 'P2' });
assert.equal(lightbringerDefense.ok, true);
if (!lightbringerDefense.ok) throw new Error(lightbringerDefense.error);
const lightbringerSwap = applyCommand(lightbringerDefense.state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
assert.equal(lightbringerSwap.ok, true);
if (!lightbringerSwap.ok) throw new Error(lightbringerSwap.error);
assert.deepEqual(lightbringerSwap.state.players.P1.position, { x: 3, y: 2 });
assert.deepEqual(lightbringerSwap.state.objects.find((object) => object.id === 'lightbringer-target')?.position, { x: 2, y: 2 });
assert.deepEqual(lightbringerSwap.state.objects.find((object) => object.id === 'lightbringer-decoy')?.position, { x: 6, y: 6 });
assert.deepEqual(lightbringerSwap.state.players.P2.position, { x: 8, y: 7 });

const replicaVsReplicaState = createHotseatTestState(true, 'spectre', 'spectre');
replicaVsReplicaState.phase = 'active'; replicaVsReplicaState.activePlayerId = 'P1';
replicaVsReplicaState.players.P1.position = { x: 8, y: 0 }; replicaVsReplicaState.players.P2.position = { x: 8, y: 7 };
replicaVsReplicaState.players.P1.hand = [{ instanceId: 'replica-vs-replica-lightbringer', cardId: 'lightbringer' }]; replicaVsReplicaState.players.P2.hand = [];
replicaVsReplicaState.objects = [
  { id: 'attacking-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 2, y: 2 } },
  { id: 'attacked-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 2 } },
];
const replicaVsReplicaAttack = applyCommand(replicaVsReplicaState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'replica-vs-replica-lightbringer', origin: 'replica', targetKind: 'replica', targetId: 'attacked-replica' });
assert.equal(replicaVsReplicaAttack.ok, true);
if (!replicaVsReplicaAttack.ok) throw new Error(replicaVsReplicaAttack.error);
assert.equal(replicaVsReplicaAttack.state.pendingAttack?.attackerReplicaId, 'attacking-replica');
const replicaVsReplicaDefense = applyCommand(replicaVsReplicaAttack.state, { type: 'pass-defense', playerId: 'P2' });
assert.equal(replicaVsReplicaDefense.ok, true);
if (!replicaVsReplicaDefense.ok) throw new Error(replicaVsReplicaDefense.error);
const replicaVsReplicaSwap = applyCommand(replicaVsReplicaDefense.state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
assert.equal(replicaVsReplicaSwap.ok, true);
if (!replicaVsReplicaSwap.ok) throw new Error(replicaVsReplicaSwap.error);
assert.deepEqual(replicaVsReplicaSwap.state.objects.find((object) => object.id === 'attacking-replica')?.position, { x: 3, y: 2 });
assert.deepEqual(replicaVsReplicaSwap.state.objects.find((object) => object.id === 'attacked-replica')?.position, { x: 2, y: 2 });
assert.deepEqual(replicaVsReplicaSwap.state.players.P1.position, { x: 8, y: 0 });
assert.deepEqual(replicaVsReplicaSwap.state.players.P2.position, { x: 8, y: 7 });

const displaceState = createHotseatTestState(true, 'spectre', 'spectre');
displaceState.phase = 'active'; displaceState.activePlayerId = 'P1';
displaceState.players.P1.position = { x: 2, y: 2 }; displaceState.players.P2.position = { x: 8, y: 7 };
displaceState.players.P1.hand = [{ instanceId: 'replica-displace', cardId: 'displace' }]; displaceState.players.P2.hand = [];
displaceState.objects = [
  { id: 'displace-decoy', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 6, y: 6 } },
  { id: 'displace-target', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 2 } },
];
const displaceAttack = applyCommand(displaceState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'replica-displace', origin: 'spectre', targetKind: 'replica', targetId: 'displace-target' });
assert.equal(displaceAttack.ok, true);
if (!displaceAttack.ok) throw new Error(displaceAttack.error);
const displaced = resolveDefense(displaceAttack.state, 'P2');
assert.deepEqual(displaced.objects.find((object: any) => object.id === 'displace-target')?.position, { x: 4, y: 2 });
assert.deepEqual(displaced.objects.find((object: any) => object.id === 'displace-decoy')?.position, { x: 6, y: 6 });
assert.deepEqual(displaced.players.P2.position, { x: 8, y: 7 });

const kneeBlastState = createHotseatTestState(true, 'orkk', 'spectre');
kneeBlastState.phase = 'active'; kneeBlastState.activePlayerId = 'P1';
kneeBlastState.players.P1.position = { x: 2, y: 2 }; kneeBlastState.players.P1.rageStacks = 2; kneeBlastState.players.P2.position = { x: 8, y: 7 };
kneeBlastState.players.P1.hand = [{ instanceId: 'replica-knee-blast', cardId: 'knee-blast' }]; kneeBlastState.players.P2.hand = [];
kneeBlastState.objects = [
  { id: 'knee-blast-decoy', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 6, y: 6 } },
  { id: 'knee-blast-target', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 2 } },
];
const kneeBlastAttack = applyCommand(kneeBlastState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'replica-knee-blast', origin: 'spectre', targetKind: 'replica', targetId: 'knee-blast-target' });
assert.equal(kneeBlastAttack.ok, true);
if (!kneeBlastAttack.ok) throw new Error(kneeBlastAttack.error);
const kneeBlasted = resolveDefense(kneeBlastAttack.state, 'P2');
assert.deepEqual(kneeBlasted.objects.find((object: any) => object.id === 'knee-blast-target')?.position, { x: 5, y: 2 });
assert.deepEqual(kneeBlasted.objects.find((object: any) => object.id === 'knee-blast-decoy')?.position, { x: 6, y: 6 });
assert.deepEqual(kneeBlasted.players.P2.position, { x: 8, y: 7 });

const arcaneBarrierState = createHotseatTestState(true, 'spectre', 'magician');
arcaneBarrierState.phase = 'active'; arcaneBarrierState.activePlayerId = 'P1';
arcaneBarrierState.players.P1.position = { x: 8, y: 7 }; arcaneBarrierState.players.P2.position = { x: 2, y: 2 };
arcaneBarrierState.players.P1.hand = [{ instanceId: 'replica-barrier-attack', cardId: 'attack-2' }];
arcaneBarrierState.players.P2.hand = [{ instanceId: 'replica-arcane-barrier', cardId: 'arcane-barrier' }];
arcaneBarrierState.objects = [
  { id: 'barrier-attacking-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 3, y: 2 } },
];
const barrierAttack = applyCommand(arcaneBarrierState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'replica-barrier-attack', origin: 'replica', targetKind: 'player', targetId: 'P2' });
assert.equal(barrierAttack.ok, true);
if (!barrierAttack.ok) throw new Error(barrierAttack.error);
const barrierDefense = applyCommand(barrierAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'replica-arcane-barrier' });
assert.equal(barrierDefense.ok, true);
if (!barrierDefense.ok) throw new Error(barrierDefense.error);
const barrierResolved = barrierDefense.state.combatReveal?.deferredAfterCombatState ? JSON.parse(barrierDefense.state.combatReveal.deferredAfterCombatState) : barrierDefense.state;
assert.deepEqual(barrierResolved.objects.find((object: any) => object.id === 'barrier-attacking-replica')?.position, { x: 4, y: 2 });
assert.deepEqual(barrierResolved.players.P1.position, { x: 8, y: 7 });

const kykState = createInitialState();
kykState.players.P1.position = { x: 1, y: 1 }; kykState.players.P2.position = { x: 8, y: 7 };
kykState.objects = [
  { id: 'kyk-decoy', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 6, y: 6 } },
  { id: 'kyk-target', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 2, y: 1 } },
];
const kyk = kykState.players.P1.hand.find((card) => card.cardId === 'kyk');
assert.ok(kyk);
const beginKyk = applyCommand(kykState, { type: 'play-perk', playerId: 'P1', cardInstanceId: kyk.instanceId, destination: 'direct' });
assert.equal(beginKyk.ok, true);
if (!beginKyk.ok) throw new Error(beginKyk.error);
const targetKyk = applyCommand(beginKyk.state, { type: 'kyk-target', playerId: 'P1', objectId: 'kyk-target' });
assert.equal(targetKyk.ok, true);
if (!targetKyk.ok) throw new Error(targetKyk.error);
const resolveKyk = applyCommand(targetKyk.state, { type: 'kyk-direction', playerId: 'P1', to: { x: 4, y: 1 } });
assert.equal(resolveKyk.ok, true);
if (!resolveKyk.ok) throw new Error(resolveKyk.error);
assert.deepEqual(resolveKyk.state.objects.find((object) => object.id === 'kyk-target')?.position, { x: 5, y: 1 });
assert.deepEqual(resolveKyk.state.objects.find((object) => object.id === 'kyk-decoy')?.position, { x: 6, y: 6 });
assert.deepEqual(resolveKyk.state.players.P2.position, { x: 8, y: 7 });

console.log('Replica targeting checks passed.');
