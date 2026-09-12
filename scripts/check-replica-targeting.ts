import assert from 'node:assert/strict';
import { applyCommand, armDaWizPath, createHotseatTestState, createInitialState, shieldRecallEnemyCount } from '../shared/game.ts';

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

const arcaneShieldState = createHotseatTestState(true, 'spectre', 'orkk');
arcaneShieldState.phase = 'active'; arcaneShieldState.activePlayerId = 'P1';
arcaneShieldState.players.P1.position = { x: 8, y: 7 }; arcaneShieldState.players.P2.position = { x: 2, y: 2 };
arcaneShieldState.players.P2.shieldEquipped = true;
arcaneShieldState.players.P1.hand = [{ instanceId: 'arcane-shield-replica-attack', cardId: 'attack-2' }];
arcaneShieldState.players.P2.hand = [{ instanceId: 'arcane-shield-replica-defense', cardId: 'arcane-shield' }];
arcaneShieldState.objects = [{ id: 'arcane-shield-adjacent-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 3, y: 2 } }];
const arcaneShieldAttack = applyCommand(arcaneShieldState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'arcane-shield-replica-attack', origin: 'replica', targetKind: 'player', targetId: 'P2' });
assert.equal(arcaneShieldAttack.ok, true);
if (!arcaneShieldAttack.ok) throw new Error(arcaneShieldAttack.error);
const arcaneShieldDefense = applyCommand(arcaneShieldAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'arcane-shield-replica-defense' });
assert.equal(arcaneShieldDefense.ok, true);
if (!arcaneShieldDefense.ok) throw new Error(arcaneShieldDefense.error);
const arcaneShieldResolved = arcaneShieldDefense.state.combatReveal?.deferredAfterCombatState ? JSON.parse(arcaneShieldDefense.state.combatReveal.deferredAfterCombatState) : arcaneShieldDefense.state;
assert.equal(arcaneShieldResolved.damageLog.filter((event: any) => event.sourceKind === 'defense' && event.targetId === 'P1').reduce((total: number, event: any) => total + event.amount, 0), 1, 'Arcane Shield damages Spectre through an adjacent enemy replica.');
assert.match(arcaneShieldResolved.log.join('\n'), /Arcane Shield dealt 1 Damage to Spectre's Replica/, 'Arcane Shield reports the replica body it hit.');

const fireballReplicaState = createHotseatTestState(true, 'magician', 'spectre') as any;
fireballReplicaState.phase = 'choosing-fireball-target'; fireballReplicaState.activePlayerId = 'P1';
fireballReplicaState.players.P1.position = { x: 1, y: 1 }; fireballReplicaState.players.P2.position = { x: 8, y: 7 };
fireballReplicaState.fireball = { casterId: 'P1', undo: null, source: 'fireball' };
fireballReplicaState.objects = [{ id: 'fireball-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 1 } }];
const fireballReplica = applyCommand(fireballReplicaState, { type: 'fireball-target', playerId: 'P1', targetKind: 'replica', targetId: 'fireball-replica' });
assert.equal(fireballReplica.ok, true);
if (!fireballReplica.ok) throw new Error(fireballReplica.error);
assert.equal(fireballReplica.state.players.P2.hp, 18, 'Fireball aimed at a replica damages its owning Spectre.');
assert.equal(fireballReplica.state.players.P2.hand.some((card) => card.cardId === 'burning'), true, 'Fireball aimed at a replica applies Burning to its owning Spectre.');

const shieldReplicaState = createHotseatTestState(true, 'orkk', 'spectre') as any;
shieldReplicaState.players.P1.position = { x: 5, y: 1 }; shieldReplicaState.players.P2.position = { x: 2, y: 1 };
shieldReplicaState.players.P1.shieldEquipped = false;
shieldReplicaState.objects = [
  { id: 'multi-body-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 3, maxHp: 3, position: { x: 1, y: 1 }, heavy: true },
  { id: 'multi-body-replica-one', name: "Spectre's Replica 1", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 1 } },
  { id: 'multi-body-replica-two', name: "Spectre's Replica 2", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 4, y: 1 } },
];
const multiBodyShield = shieldReplicaState.objects[0];
const multiBodyPath = armDaWizPath(shieldReplicaState, multiBodyShield, shieldReplicaState.players.P1.position, 16);
assert.deepEqual(multiBodyPath, [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }], 'Shield recall paths may pass through enemy replicas.');
assert.equal(shieldRecallEnemyCount(shieldReplicaState, 'P1', multiBodyPath), 3, 'A Spectre and two replicas count as three independent shield-path enemies.');
shieldReplicaState.phase = 'choosing-arm-da-wiz-target';
shieldReplicaState.armDaWiz = { casterId: 'P1', level: 2, range: 16, canCreate: true, canRecall: true, undo: null };
const multiBodyRecall = applyCommand(shieldReplicaState, { type: 'arm-da-wiz-target', playerId: 'P1', objectId: 'multi-body-shield' });
assert.equal(multiBodyRecall.ok, true);
if (!multiBodyRecall.ok) throw new Error(multiBodyRecall.error);
assert.equal(multiBodyRecall.state.players.P2.hp, 17, 'A shield crossing Spectre and two replicas applies all three hits independently.');

const shieldBashReplicaState = createHotseatTestState(true, 'orkk', 'spectre');
shieldBashReplicaState.phase = 'active'; shieldBashReplicaState.activePlayerId = 'P1';
shieldBashReplicaState.players.P1.position = { x: 5, y: 1 }; shieldBashReplicaState.players.P2.position = { x: 4, y: 1 };
shieldBashReplicaState.players.P1.shieldEquipped = false;
shieldBashReplicaState.players.P1.hand = [{ instanceId: 'multi-body-shield-bash-card', cardId: 'shield-bash' }]; shieldBashReplicaState.players.P2.hand = [];
shieldBashReplicaState.objects = [
  { id: 'multi-body-shield-bash', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 3, maxHp: 3, position: { x: 1, y: 1 }, heavy: true },
  { id: 'shield-bash-replica-one', name: "Spectre's Replica 1", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 2, y: 1 } },
  { id: 'shield-bash-replica-two', name: "Spectre's Replica 2", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 1 } },
];
const shieldBashReplicaAttack = applyCommand(shieldBashReplicaState, { type: 'attack', playerId: 'P1', cardInstanceId: 'multi-body-shield-bash-card', targetKind: 'player', targetId: 'P2' });
assert.equal(shieldBashReplicaAttack.ok, true);
if (!shieldBashReplicaAttack.ok) throw new Error(shieldBashReplicaAttack.error);
const shieldBashReplicaResolved = resolveDefense(shieldBashReplicaAttack.state, 'P2');
assert.equal(shieldBashReplicaResolved.damageLog.filter((event: any) => event.sourceKind === 'attack' && event.collision && event.amount === 2).length, 3, 'Shield Bash hits Spectre and both crossed replicas independently.');
assert.equal(shieldBashReplicaResolved.objects.some((object: any) => object.id === 'multi-body-shield-bash'), false, 'Shield Bash finishes recalling the Shield after crossing replicas.');

const magicHandReplicaState = createHotseatTestState(true, 'magician', 'spectre') as any;
magicHandReplicaState.phase = 'choosing-magic-hand-target'; magicHandReplicaState.activePlayerId = 'P1';
magicHandReplicaState.players.P1.position = { x: 1, y: 1 }; magicHandReplicaState.players.P2.position = { x: 8, y: 7 };
magicHandReplicaState.magicHand = { casterId: 'P1', level: 1, distance: 3, consume: false, targetKind: null, targetId: null, undo: null };
magicHandReplicaState.objects = [{ id: 'magic-hand-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 1 } }];
const magicHandReplicaTarget = applyCommand(magicHandReplicaState, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'magic-hand-replica' });
assert.equal(magicHandReplicaTarget.ok, true);
if (!magicHandReplicaTarget.ok) throw new Error(magicHandReplicaTarget.error);
const magicHandReplicaMoved = applyCommand(magicHandReplicaTarget.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 4, y: 1 } });
assert.equal(magicHandReplicaMoved.ok, true);
if (!magicHandReplicaMoved.ok) throw new Error(magicHandReplicaMoved.error);
assert.deepEqual(magicHandReplicaMoved.state.objects.find((object) => object.id === 'magic-hand-replica')?.position, { x: 6, y: 1 }, 'Magic Hand moves a replica as a board body.');

const forcePullReplicaState = createHotseatTestState(true, 'shinobi', 'spectre') as any;
forcePullReplicaState.phase = 'choosing-force-pull-target'; forcePullReplicaState.activePlayerId = 'P1';
forcePullReplicaState.players.P1.position = { x: 1, y: 1 }; forcePullReplicaState.players.P2.position = { x: 8, y: 7 };
forcePullReplicaState.forcePull = { casterId: 'P1', level: 3, distance: 2, targetRange: 4, undo: null };
forcePullReplicaState.objects = [{ id: 'force-pull-replica', name: "Spectre's Replica", kind: 'spectre-replica', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 4, y: 1 } }];
const forcePulledReplica = applyCommand(forcePullReplicaState, { type: 'force-pull-target', playerId: 'P1', targetKind: 'object', targetId: 'force-pull-replica' });
assert.equal(forcePulledReplica.ok, true);
if (!forcePulledReplica.ok) throw new Error(forcePulledReplica.error);
assert.deepEqual(forcePulledReplica.state.objects.find((object) => object.id === 'force-pull-replica')?.position, { x: 2, y: 1 }, 'Force Pull moves a replica toward the caster.');
assert.equal(forcePulledReplica.state.players.P2.pinnedStacks, 1, 'Level 3 Force Pull applies its movement penalty through the targeted replica.');

console.log('Replica targeting checks passed.');
