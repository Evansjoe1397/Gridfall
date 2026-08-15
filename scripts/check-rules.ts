import assert from 'node:assert/strict';
import fc from 'fast-check';
import { arenaForPlayerCount, LORDAERON_ARENA, nagrandQuarter, NAGRAND_ARENA, randomNagrandBoxSpawns, randomTrenchBoxSpawns, THE_TRENCH_ARENA } from '../shared/arenas.ts';
import { ACTION_QUEST_POOL, STARTING_DECKS, applicableCombatCardInstanceIds, applyCommand as applyGameCommand, applyPinned, armDaWizPath, canAttackTargetSquare, cardDefinition, cellLabel, createHotseatTestState, createInitialState as createGameInitialState, createLordaeronMultiplayerState, createMultiplayerState, createTrenchTestState, dealDamage, distance, drawCards, effectiveMoveRange, hasLineOfSight, isCardRevealedToOpponents, isForbiddenSlideAscent, kykDirectionAllowed, markCharacterMoved, movementPath, orkkActionEventForCommand, removeCard, resolveMultiplayerCombatStack, revealCardToOpponent, shieldRecallEnemyCount, wizardActionEventForCommand, type CardTypeId, type LordaeronGameState } from '../shared/game.ts';

// Most historical rule checks focus on the final resolved card state. Preserve
// their concise form while production now holds after-combat effects until both
// acknowledgements. Timing-specific checks below use applyGameCommand directly.
const applyCommand = (source: any, command: any): any => {
  const result = applyGameCommand(source, command);
  const reveal = result.ok && (command.type === 'defend' || command.type === 'pass-defense') ? result.state.combatReveal : null;
  if (!reveal?.deferredAfterCombatState) return result;
  const resolved = JSON.parse(reveal.deferredAfterCombatState);
  resolved.combatReveal = reveal;
  return { ok: true, state: resolved };
};

const noCombatAcknowledgement = createGameInitialState();
assert.equal(applyGameCommand(noCombatAcknowledgement, { type: 'ack-combat', playerId: 'P1', combatExpiresAt: 123 }).ok, true, 'A delayed acknowledgement is idempotent after its combat result has already closed.');

const arcaneBarrierPushState = createGameInitialState('shinobi-vs-magician');
arcaneBarrierPushState.objects = [];
arcaneBarrierPushState.players.P1.position = { x: 2, y: 2 };
arcaneBarrierPushState.players.P2.position = { x: 3, y: 2 };
arcaneBarrierPushState.players.P1.hand = [{ instanceId: 'barrier-attack', cardId: 'attack-2' }];
arcaneBarrierPushState.players.P2.hand = [{ instanceId: 'barrier-defense', cardId: 'arcane-barrier' }];
const arcaneBarrierAttack = applyGameCommand(arcaneBarrierPushState, { type: 'attack', playerId: 'P1', cardInstanceId: 'barrier-attack', targetId: 'P2' });
assert.equal(arcaneBarrierAttack.ok, true);
if (arcaneBarrierAttack.ok) {
  const arcaneBarrierDefense = applyGameCommand(arcaneBarrierAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'barrier-defense' });
  assert.equal(arcaneBarrierDefense.ok, true);
  if (arcaneBarrierDefense.ok) {
    assert.deepEqual(arcaneBarrierDefense.state.players.P1.position, { x: 2, y: 2 }, 'Arcane Barrier waits for combat acknowledgement before moving the attacker.');
    const staleCombatAck = applyGameCommand(arcaneBarrierDefense.state, { type: 'ack-combat', playerId: 'P1', combatExpiresAt: arcaneBarrierDefense.state.combatReveal!.expiresAt - 1 });
    assert.equal(staleCombatAck.ok, true);
    if (staleCombatAck.ok) assert.deepEqual(staleCombatAck.state.combatReveal?.acknowledged, [], 'An acknowledgement token from an older combat cannot acknowledge the current result.');
    const firstAck = applyGameCommand(arcaneBarrierDefense.state, { type: 'ack-combat', playerId: 'P1' });
    assert.equal(firstAck.ok, true);
    if (firstAck.ok) {
      assert.deepEqual(firstAck.state.combatReveal?.acknowledged, ['P1'], 'Each player records an independent combat acknowledgement.');
      assert.deepEqual(firstAck.state.players.P1.position, { x: 2, y: 2 }, 'One acknowledgement does not apply deferred after-combat effects.');
      const duplicateAck = applyGameCommand(firstAck.state, { type: 'ack-combat', playerId: 'P1' });
      assert.equal(duplicateAck.ok, true);
      if (duplicateAck.ok) assert.deepEqual(duplicateAck.state.combatReveal?.acknowledged, ['P1'], 'One player cannot confirm combat twice for both players.');
      const secondAck = applyGameCommand(firstAck.state, { type: 'ack-combat', playerId: 'P2' });
      assert.equal(secondAck.ok, true);
      if (secondAck.ok) {
        assert.deepEqual(secondAck.state.players.P1.position, { x: 1, y: 2 }, 'Arcane Barrier pushes the adjacent attacker directly away from Logan after both acknowledgements.');
        assert.equal(secondAck.state.players.P1.visualMovementCause, 'enemy-ability', 'Arcane Barrier marks its forced movement so imported characters do not play walking animations.');
      }
    }
  }
}

const blockedBarrierState = createGameInitialState('shinobi-vs-magician');
blockedBarrierState.objects = [];
blockedBarrierState.players.P1.position = { x: 1, y: 2 };
blockedBarrierState.players.P2.position = { x: 2, y: 2 };
blockedBarrierState.players.P1.hand = [{ instanceId: 'blocked-barrier-attack', cardId: 'attack-2' }];
blockedBarrierState.players.P2.hand = [{ instanceId: 'blocked-barrier-defense', cardId: 'arcane-barrier' }];
const blockedBarrierAttackerHp = blockedBarrierState.players.P1.hp;
const blockedBarrierAttack = applyGameCommand(blockedBarrierState, { type: 'attack', playerId: 'P1', cardInstanceId: 'blocked-barrier-attack', targetId: 'P2' });
assert.equal(blockedBarrierAttack.ok, true);
if (blockedBarrierAttack.ok) {
  const blockedBarrierDefense = applyGameCommand(blockedBarrierAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'blocked-barrier-defense' });
  assert.equal(blockedBarrierDefense.ok, true);
  if (blockedBarrierDefense.ok) {
    const firstAck = applyGameCommand(blockedBarrierDefense.state, { type: 'ack-combat', playerId: 'P1' });
    const secondAck = firstAck.ok ? applyGameCommand(firstAck.state, { type: 'ack-combat', playerId: 'P2' }) : firstAck;
    assert.equal(secondAck.ok, true);
    if (secondAck.ok) {
      assert.deepEqual(secondAck.state.players.P1.position, { x: 1, y: 2 }, 'A board edge blocks Arcane Barrier movement.');
      assert.equal(secondAck.state.players.P1.hp, blockedBarrierAttackerHp - 1, 'Arcane Barrier deals 1 Damage when the attacker cannot be pushed.');
    }
  }
}

const createInitialState = () => {
  const state = createGameInitialState('shinobi-vs-orkk');
  state.objects = state.objects.filter((object) => object.kind !== 'wooden-box');
  return state;
};
const assertRandomNagrandBoxLayout = (labels: string[]) => {
  const locations = NAGRAND_ARENA.boxSpawnLocations!;
  assert.equal(labels.length, 4, 'Nagrand spawns exactly four randomized Wooden Boxes.');
  assert.equal(new Set(labels).size, 4, 'Nagrand Box spawn Squares are unique.');
  assert.deepEqual(labels.map(nagrandQuarter).sort(), [1, 2, 3, 4], 'Nagrand spawns exactly one Box in each arena quarter.');
  assert.equal(labels.filter((label) => locations.highground.includes(label)).length, 1, 'Nagrand spawns one Box on regular High Ground.');
  assert.equal(labels.filter((label) => locations.highgroundProtected.includes(label)).length, 1, 'Nagrand spawns one Box on Protected High Ground.');
  assert.equal(labels.filter((label) => locations.lowground.includes(label)).length, 2, 'Nagrand spawns two Boxes on the selected Low Ground Squares.');
};
const assertNagrandBoxLayout = (labels: string[]) => {
  assert.equal(labels.length, 6, 'Nagrand spawns two fixed and four randomized Wooden Boxes.');
  assert.equal(labels.filter((label) => label === 'E1').length, 1, 'Nagrand keeps its fixed E1 Box.');
  assert.equal(labels.filter((label) => label === 'D8').length, 1, 'Nagrand keeps its fixed D8 Box.');
  assertRandomNagrandBoxLayout(labels.filter((label) => !NAGRAND_ARENA.boxes.includes(label)));
};
for (let sample = 0; sample < 100; sample++) assertRandomNagrandBoxLayout(randomNagrandBoxSpawns());
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'rabbit-run')?.durationRounds, 5);
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'rabbit-run')?.reward, 'Portal Card');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'provocateur')?.durationRounds, 5);
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'provocateur')?.reward, 'Vicious Mockery Card');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'capture-the-flag')?.reward, 'The Banner');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'capture-the-flag')?.name, 'The Conqueror');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'tank-junior')?.durationRounds, 4);
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'tank-junior')?.reward, 'Mythril Helmet');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'the-elephant')?.durationRounds, 4);
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'the-elephant')?.reward, 'Boomerang');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'the-gambler')?.durationRounds, 3);
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'the-gambler')?.reward, 'Monarch Flush');

const captureFlagState = createGameInitialState() as any;
captureFlagState.activePlayerId = 'P1';
captureFlagState.players.P1.position = { x: 7, y: 3 };
captureFlagState.players.P1.movementRemaining = 1;
captureFlagState.objects = [];
captureFlagState.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['capture-the-flag'], currentQuest: { id: 'capture-the-flag', announcedRound: 1, endsAfterRound: 10, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {}, captureTheFlag: { flags: [
  { id: 'capture-flag-P1', ownerId: 'P1', homeSquares: [{ x: 1, y: 3 }, { x: 1, y: 4 }], homeAnchor: { x: 1, y: 3.5 }, status: 'home', carrierId: null, droppedAt: null, grabbedFromHome: false },
  { id: 'capture-flag-P2', ownerId: 'P2', homeSquares: [{ x: 8, y: 3 }, { x: 8, y: 4 }], homeAnchor: { x: 8, y: 3.5 }, status: 'home', carrierId: null, droppedAt: null, grabbedFromHome: false },
] } };
const capturedFlag = applyCommand(captureFlagState, { type: 'move', playerId: 'P1', to: { x: 8, y: 3 } });
assert.equal(capturedFlag.ok, true);
if (capturedFlag.ok) {
  const flags = (capturedFlag.state as any).questPhases.captureTheFlag.flags;
  assert.equal(flags.find((flag: any) => flag.ownerId === 'P2').carrierId, 'P1', 'Occupying either enemy Base Square grabs that Base Flag.');
  assert.equal(flags.find((flag: any) => flag.ownerId === 'P2').grabbedFromHome, true, 'A Base Flag records that its one home pickup was spent.');
  assert.equal(flags.find((flag: any) => flag.ownerId === 'P1').status, 'home', 'The other Base Flag remains independently available.');
  capturedFlag.state.players.P1.position = { x: 1, y: 3 };
  capturedFlag.state.players.P1.hand = [];
  const deliveredFlag = applyCommand(capturedFlag.state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(deliveredFlag.ok, true);
  if (deliveredFlag.ok) {
    const banner = deliveredFlag.state.players.P1.hand.find((card) => card.cardId === 'banner');
    assert.equal(banner?.revealedToOpponent, true, 'The Banner reward is public information.');
    assert.equal(effectiveMoveRange(deliveredFlag.state.players.P1), deliveredFlag.state.players.P1.moveRange + 1, 'The Banner grants +1 MOV while in Hand.');
  }
}

const droppedFlagState = createGameInitialState() as any;
droppedFlagState.objects = [];
droppedFlagState.questPhases = JSON.parse(JSON.stringify(captureFlagState.questPhases));
droppedFlagState.questPhases.captureTheFlag.flags[1].status = 'carried';
droppedFlagState.questPhases.captureTheFlag.flags[1].carrierId = 'P1';
droppedFlagState.questPhases.captureTheFlag.flags[1].grabbedFromHome = true;
droppedFlagState.players.P1.position = { x: 4, y: 2 };
dealDamage(droppedFlagState, droppedFlagState.players.P1, droppedFlagState.players.P1.hp, false, 'P2', 'attack');
assert.deepEqual(droppedFlagState.questPhases.captureTheFlag.flags[1].droppedAt, { x: 4, y: 2 }, 'A defeated carrier drops the enemy Flag on the exact death Square.');
assert.equal(droppedFlagState.questPhases.captureTheFlag.flags[1].status, 'dropped');
droppedFlagState.phase = 'active';
droppedFlagState.winner = null;
droppedFlagState.activePlayerId = 'P2';
droppedFlagState.players.P2.position = { x: 3, y: 2 };
droppedFlagState.players.P2.movementRemaining = 1;
const recoveredDroppedFlag = applyCommand(droppedFlagState, { type: 'move', playerId: 'P2', to: { x: 4, y: 2 } });
assert.equal(recoveredDroppedFlag.ok, true);
if (recoveredDroppedFlag.ok) assert.equal((recoveredDroppedFlag.state as any).questPhases.captureTheFlag.flags[1].carrierId, 'P2', 'Another character grabs a dropped Flag by occupying its exact Square.');

const bannerCombatState = createGameInitialState();
bannerCombatState.players.P1.position = { x: 2, y: 1 };
bannerCombatState.players.P2.position = { x: 3, y: 1 };
bannerCombatState.players.P1.hand = [
  { instanceId: 'banner-combat-attack', cardId: 'attack-2' },
  { instanceId: 'banner-combat-reward', cardId: 'banner', revealedToOpponent: true },
];
const bannerAttack = applyCommand(bannerCombatState, { type: 'attack', playerId: 'P1', cardInstanceId: 'banner-combat-attack', targetId: 'P2' });
assert.equal(bannerAttack.ok, true);
if (bannerAttack.ok) {
  assert.equal(bannerAttack.state.pendingAttack?.attackValue, 3, 'The Banner applies +1 to Combat.');
  assert.equal(bannerAttack.state.players.P1.hand.some((card) => card.cardId === 'banner'), false, 'The Banner is Removed after applying its Combat bonus.');
  assert.equal(bannerAttack.state.players.P1.discard.some((card) => card.cardId === 'banner'), false, 'Removed Banner does not enter the Discard Deck.');
}

const highgroundQuest = createInitialState() as any;
highgroundQuest.players.P1.position = { x: 4, y: 3 };
highgroundQuest.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['provocateur'], currentQuest: { id: 'provocateur', announcedRound: 1, endsAfterRound: 5, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: { P1: true } };
highgroundQuest.players.P1.hand = [];
const highgroundEnd = applyCommand(highgroundQuest, { type: 'end-turn', playerId: 'P1' });
assert.equal(highgroundEnd.ok, true);
if (highgroundEnd.ok) assert.equal((highgroundEnd.state as any).questPhases.currentQuest.progress.P1, 1, 'Provocateur counts a turn only when it starts and ends on High Ground.');

const mockeryCombat = createInitialState();
mockeryCombat.players.P1.position = { x: 2, y: 3 }; mockeryCombat.players.P2.position = { x: 3, y: 3 };
mockeryCombat.players.P1.hand = [{ instanceId: 'mockery-attack', cardId: 'attack-2' }, { instanceId: 'combat-mockery', cardId: 'vicious-mockery' }];
mockeryCombat.players.P2.hand = [{ instanceId: 'mockery-defense', cardId: 'defend-1' }];
const mockeryAttack = applyCommand(mockeryCombat, { type: 'attack', playerId: 'P1', cardInstanceId: 'mockery-attack', targetId: 'P2' });
assert.equal(mockeryAttack.ok, true);
const mockeryDefend = mockeryAttack.ok ? applyCommand(mockeryAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'mockery-defense' }) : mockeryAttack;
assert.equal(mockeryDefend.ok, true);
if (mockeryDefend.ok) {
  assert.equal(mockeryDefend.state.phase, 'choosing-vicious-mockery');
  const useMockery = applyCommand(mockeryDefend.state, { type: 'vicious-mockery-decision', playerId: 'P1', use: true });
  assert.equal(useMockery.ok, true);
  if (useMockery.ok) {
    assert.equal(useMockery.state.players.P2.hp, 22, 'Vicious Mockery adds +2 ATT before combat damage is resolved.');
    assert.equal([...useMockery.state.players.P1.hand, ...useMockery.state.players.P1.deck, ...useMockery.state.players.P1.discard].some((card) => card.cardId === 'vicious-mockery'), false, 'Used Vicious Mockery is Removed from the game.');
  }
}

const portalReward = createInitialState();
portalReward.players.P1.hand = [{ instanceId: 'reward-portal', cardId: 'portal' }];
const playPortal = applyCommand(portalReward, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'reward-portal', destination: 'direct' });
assert.equal(playPortal.ok, true);
if (playPortal.ok) {
  const usePortal = applyCommand(playPortal.state, { type: 'portal-teleport', playerId: 'P1', to: { x: 3, y: 3 } });
  assert.equal(usePortal.ok, true);
  if (usePortal.ok) {
    assert.deepEqual(usePortal.state.players.P1.position, { x: 3, y: 3 });
    assert.equal([...usePortal.state.players.P1.hand, ...usePortal.state.players.P1.deck, ...usePortal.state.players.P1.discard].some((card) => card.cardId === 'portal'), false, 'Portal is Removed from the game after use.');
  }
}

const discardedPortalState = createInitialState();
discardedPortalState.players.P1.freeMoveUsed = true;
discardedPortalState.players.P1.hand = [{ instanceId: 'discarded-portal', cardId: 'portal' }];
discardedPortalState.players.P1.deck = [{ instanceId: 'guard-draw-after-portal', cardId: 'attack-2' }];
const portalGuard = applyGameCommand(discardedPortalState, { type: 'guard', playerId: 'P1' });
assert.equal(portalGuard.ok, true);
if (portalGuard.ok) {
  const portalDiscarded = applyGameCommand(portalGuard.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'discarded-portal' });
  assert.equal(portalDiscarded.ok, true);
  if (portalDiscarded.ok) assert.equal([...portalDiscarded.state.players.P1.hand, ...portalDiscarded.state.players.P1.deck, ...portalDiscarded.state.players.P1.discard].some((card) => card.cardId === 'portal'), false, 'Portal is Removed from the game when Discarded.');
}

const impossibleGuardDiscardState = createInitialState();
impossibleGuardDiscardState.players.P1.freeMoveUsed = true;
impossibleGuardDiscardState.players.P1.hand = [{ instanceId: 'guard-headache-held', cardId: 'headache' }];
impossibleGuardDiscardState.players.P1.deck = [{ instanceId: 'guard-headache-drawn', cardId: 'headache' }];
const impossibleGuard = applyGameCommand(impossibleGuardDiscardState, { type: 'guard', playerId: 'P1' });
assert.equal(impossibleGuard.ok, true);
if (impossibleGuard.ok) {
  assert.equal(impossibleGuard.state.players.P1.hand.filter((card) => card.cardId === 'headache').length, 2, 'Guard completes its draw before checking whether the required discard is possible.');
  assert.equal(impossibleGuard.state.players.P1.hp, 0, 'A Player who cannot satisfy Guard\'s mandatory discard loses automatically.');
  assert.equal(impossibleGuard.state.phase, 'finished');
  assert.equal(impossibleGuard.state.winner, 'P2');
}

const impossibleOverstackState = createInitialState();
impossibleOverstackState.players.P1.hand = Array.from({ length: 6 }, (_, index) => ({ instanceId: `overstack-headache-${index}`, cardId: 'headache' as const }));
const impossibleOverstack = applyGameCommand(impossibleOverstackState, { type: 'end-turn', playerId: 'P1' });
assert.equal(impossibleOverstack.ok, true);
if (impossibleOverstack.ok) {
  assert.equal(impossibleOverstack.state.players.P1.hp, 0, 'A Player who cannot satisfy mandatory overstacking discards loses automatically.');
  assert.equal(impossibleOverstack.state.phase, 'finished');
  assert.equal(impossibleOverstack.state.winner, 'P2');
}

const blockedPortalState = createInitialState() as any;
blockedPortalState.phase = 'choosing-portal-target'; blockedPortalState.portal = { casterId: 'P1', undo: null };
blockedPortalState.players.P1.position = { x: 1, y: 1 }; blockedPortalState.players.P2.position = { x: 8, y: 7 };
blockedPortalState.objects = [{ id: 'portal-column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 1 } }];
assert.equal(applyCommand(blockedPortalState, { type: 'portal-teleport', playerId: 'P1', to: { x: 3, y: 1 } }).ok, false, 'Portal cannot land on a Square hidden behind a Wall Object.');

const ordinaryObjectPortalState = structuredClone(blockedPortalState);
ordinaryObjectPortalState.objects[0] = { id: 'portal-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 1 } };
assert.equal(applyCommand(ordinaryObjectPortalState, { type: 'portal-teleport', playerId: 'P1', to: { x: 3, y: 1 } }).ok, true, 'Ordinary Objects do not block visibility for Teleport abilities.');

const blockedPreparationState = createInitialState() as any;
blockedPreparationState.phase = 'choosing-preparation-teleport'; blockedPreparationState.preparation = { casterId: 'P1', consume: true, undo: null };
blockedPreparationState.players.P1.position = { x: 1, y: 1 }; blockedPreparationState.players.P2.position = { x: 8, y: 7 };
blockedPreparationState.objects = [{ id: 'preparation-column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 1 } }, { id: 'hidden-preparation-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 1 } }];
assert.equal(applyCommand(blockedPreparationState, { type: 'preparation-teleport', playerId: 'P1', objectId: 'hidden-preparation-box' }).ok, false, 'Preparation cannot swap with an Object outside the caster\'s current visibility.');

const shieldPreparationState = createInitialState() as any;
shieldPreparationState.phase = 'choosing-preparation-teleport'; shieldPreparationState.preparation = { casterId: 'P1', consume: true, undo: null };
shieldPreparationState.players.P1.position = { x: 1, y: 1 }; shieldPreparationState.players.P2.position = { x: 8, y: 7 };
shieldPreparationState.objects = [{ id: 'preparation-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 3, y: 1 } }];
const swappedShield = applyCommand(shieldPreparationState, { type: 'preparation-teleport', playerId: 'P1', objectId: 'preparation-shield' });
assert.equal(swappedShield.ok, true, 'Preparation Consume can target Da Orkk\'s unequipped Shield.');
if (swappedShield.ok) {
  assert.deepEqual(swappedShield.state.players.P1.position, { x: 3, y: 1 });
  assert.deepEqual(swappedShield.state.objects.find((object) => object.id === 'preparation-shield')?.position, { x: 1, y: 1 });
  assert.equal(swappedShield.state.objectPushAnimations.some((event) => event.objectId === 'preparation-shield' && event.teleport && cellLabel(event.from) === 'C2' && cellLabel(event.to) === 'A2'), true, 'Preparation emits a dual-square teleport animation event.');
}

const arcaneBoltConsumeState = createHotseatTestState(true, 'magician', 2, 'dummy');
arcaneBoltConsumeState.objects = [];
arcaneBoltConsumeState.players.P1.position = { x: 2, y: 2 };
arcaneBoltConsumeState.players.P2.position = { x: 3, y: 2 };
arcaneBoltConsumeState.players.P1.manaMode = 'consume';
arcaneBoltConsumeState.players.P1.movementRemaining = 0;
arcaneBoltConsumeState.players.P1.hand = [{ instanceId: 'consume-arcane-bolt', cardId: 'arcane-bolt' }];
const consumedArcaneBolt = applyCommand(arcaneBoltConsumeState, { type: 'attack', playerId: 'P1', cardInstanceId: 'consume-arcane-bolt', targetId: 'P2' });
assert.equal(consumedArcaneBolt.ok, true);
if (consumedArcaneBolt.ok) {
  assert.equal(consumedArcaneBolt.state.players.P1.movementRemaining, 0, 'Arcane Bolt Consume no longer grants MOV.');
  const resolvedConsumedArcaneBolt = applyCommand(consumedArcaneBolt.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(resolvedConsumedArcaneBolt.ok, true);
  if (resolvedConsumedArcaneBolt.ok) assert.equal(resolvedConsumedArcaneBolt.state.players.P1.arcaneBoltAttackBonus, 2, 'Arcane Bolt Consume upgrades its end-of-turn Attack bonus to +2 ATT.');
}
const rangedArcaneBoltState = structuredClone(arcaneBoltConsumeState);
rangedArcaneBoltState.players.P2.position = { x: 5, y: 2 };
assert.equal(applyCommand(rangedArcaneBoltState, { type: 'attack', playerId: 'P1', cardInstanceId: 'consume-arcane-bolt', targetId: 'P2' }).ok, false, 'Arcane Bolt Consume no longer grants Global Range.');

const manaBarrageConsumeState = createHotseatTestState(true, 'magician', 2, 'dummy');
manaBarrageConsumeState.objects = [];
manaBarrageConsumeState.players.P1.position = { x: 2, y: 2 };
manaBarrageConsumeState.players.P2.position = { x: 3, y: 2 };
manaBarrageConsumeState.players.P1.manaMode = 'consume';
manaBarrageConsumeState.players.P1.hand = [{ instanceId: 'consume-mana-barrage', cardId: 'mana-barrage' }];
manaBarrageConsumeState.players.P2.hand = [];
const consumedManaBarrageAttack = applyCommand(manaBarrageConsumeState, { type: 'attack', playerId: 'P1', cardInstanceId: 'consume-mana-barrage', targetId: 'P2' });
assert.equal(consumedManaBarrageAttack.ok, true);
if (consumedManaBarrageAttack.ok) {
  assert.equal(consumedManaBarrageAttack.state.pendingAttack?.attackValue, 2, 'Mana Barrage Consume retains the printed Attack Value.');
  const consumedManaBarrage = applyCommand(consumedManaBarrageAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(consumedManaBarrage.ok, true);
  if (consumedManaBarrage.ok) {
    assert.equal(consumedManaBarrage.state.players.P2.hp, 16, 'Mana Barrage Consume deals 2 Attack Damage plus 2 guaranteed after-combat Damage.');
    assert.equal(consumedManaBarrage.state.players.P2.hand.some((card) => card.cardId === 'exhaust'), false, 'Mana Barrage Consume no longer adds Exhaust.');
  }
}

const manaBarrageChoiceState = createHotseatTestState(true, 'magician', 2, 'dummy');
manaBarrageChoiceState.objects = [];
manaBarrageChoiceState.players.P1.position = { x: 2, y: 2 };
manaBarrageChoiceState.players.P2.position = { x: 3, y: 2 };
manaBarrageChoiceState.players.P1.manaPoints = 2;
manaBarrageChoiceState.players.P1.hand = [{ instanceId: 'choice-mana-barrage', cardId: 'mana-barrage' }];
manaBarrageChoiceState.players.P2.hand = [];
const manaBarrageChoiceAttack = applyCommand(manaBarrageChoiceState, { type: 'attack', playerId: 'P1', cardInstanceId: 'choice-mana-barrage', targetId: 'P2' });
assert.equal(manaBarrageChoiceAttack.ok, true);
if (manaBarrageChoiceAttack.ok) {
  const manaBarrageChoice = applyGameCommand(manaBarrageChoiceAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(manaBarrageChoice.ok, true);
  if (manaBarrageChoice.ok) {
    assert.equal(manaBarrageChoice.state.phase, 'choosing-mana-barrage');
    const spentMana = applyCommand(manaBarrageChoice.state, { type: 'mana-barrage-decision', playerId: 'P1', use: true });
    assert.equal(spentMana.ok, true);
    if (spentMana.ok) {
      assert.equal(spentMana.state.players.P1.manaPoints, 1, 'Mana Barrage immediately spends exactly 1 Mana during combat.');
      const resolvedManaBarrage = JSON.parse(spentMana.state.combatReveal!.deferredAfterCombatState!);
      assert.equal(resolvedManaBarrage.players.P1.manaPoints, 2, 'Normal spell resolution generates 1 Mana after the spent Mana Barrage resolves.');
      assert.equal(resolvedManaBarrage.players.P2.hp, 17, 'Mana Barrage deals its printed 2 combat Damage plus exactly 1 Mana-powered Damage.');
    }
  }
}

const grimoireConsumeState = createHotseatTestState(true, 'magician', 2, 'dummy');
grimoireConsumeState.objects = [];
grimoireConsumeState.players.P1.position = { x: 2, y: 2 };
grimoireConsumeState.players.P2.position = { x: 3, y: 2 };
grimoireConsumeState.players.P1.manaMode = 'consume';
grimoireConsumeState.players.P1.movementRemaining = 0;
grimoireConsumeState.players.P1.hand = [{ instanceId: 'consume-grimoire', cardId: 'grimoire-cleanse' }];
grimoireConsumeState.players.P2.hand = [{ instanceId: 'grimoire-drop-1', cardId: 'attack-2' }, { instanceId: 'grimoire-drop-2', cardId: 'defend-1' }];
const grimoireAttack = applyCommand(grimoireConsumeState, { type: 'attack', playerId: 'P1', cardInstanceId: 'consume-grimoire', targetId: 'P2' });
assert.equal(grimoireAttack.ok, true);
if (grimoireAttack.ok) {
  const grimoireWin = applyCommand(grimoireAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(grimoireWin.ok, true);
  if (grimoireWin.ok) {
    assert.equal(grimoireWin.state.phase, 'choosing-grimoire-discard', 'Winning with Grimoire Cleanse forces target discards.');
    const firstDiscard = applyCommand(grimoireWin.state, { type: 'grimoire-discard', playerId: 'P2', cardInstanceId: 'grimoire-drop-1' });
    assert.equal(firstDiscard.ok, true);
    if (firstDiscard.ok) {
      assert.equal(firstDiscard.state.players.P1.movementRemaining, 1, 'First Consume discard grants +1 MOV immediately.');
      const secondDiscard = applyCommand(firstDiscard.state, { type: 'grimoire-discard', playerId: 'P2', cardInstanceId: 'grimoire-drop-2' });
      assert.equal(secondDiscard.ok, true);
      if (secondDiscard.ok) assert.equal(secondDiscard.state.players.P1.movementRemaining, 2, 'Two discarded Cards grant +2 MOV in total.');
    }
  }
}

const losingGrimoireState = createHotseatTestState(true, 'magician', 2, 'dummy');
losingGrimoireState.objects = [];
losingGrimoireState.players.P1.position = { x: 2, y: 2 };
losingGrimoireState.players.P2.position = { x: 3, y: 2 };
losingGrimoireState.players.P1.hand = [{ instanceId: 'losing-grimoire', cardId: 'grimoire-cleanse' }];
losingGrimoireState.players.P2.hand = [{ instanceId: 'grimoire-counter', cardId: 'counterspell' }, { instanceId: 'safe-card-1', cardId: 'attack-2' }, { instanceId: 'safe-card-2', cardId: 'defend-1' }];
const losingGrimoireAttack = applyCommand(losingGrimoireState, { type: 'attack', playerId: 'P1', cardInstanceId: 'losing-grimoire', targetId: 'P2' });
assert.equal(losingGrimoireAttack.ok, true);
if (losingGrimoireAttack.ok) {
  const losingGrimoire = applyCommand(losingGrimoireAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'grimoire-counter' });
  assert.equal(losingGrimoire.ok, true);
  if (losingGrimoire.ok) {
    assert.notEqual(losingGrimoire.state.phase, 'choosing-grimoire-discard', 'Grimoire Cleanse does not force discards when it does not win combat.');
    assert.equal(losingGrimoire.state.players.P2.hand.length, 2);
  }
}

const blockedBlinkState = createInitialState() as any;
blockedBlinkState.phase = 'choosing-blink-teleport';
blockedBlinkState.players.P1.position = { x: 1, y: 1 }; blockedBlinkState.players.P2.position = { x: 8, y: 7 };
blockedBlinkState.objects = [{ id: 'blink-column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 1 } }];
blockedBlinkState.pendingAttack = { attackerId: 'P2', defenderId: 'P1', cardId: 'attack-2', cardInstanceId: 'blink-test-attack', attackValue: 2, returnToHandAfterCombat: false };
assert.equal(applyCommand(blockedBlinkState, { type: 'blink-teleport', playerId: 'P1', to: { x: 3, y: 1 } }).ok, false, 'Blink cannot land outside the defender\'s current visibility.');

const fireballReward = createInitialState();
fireballReward.players.P1.hand = [{ instanceId: 'reward-fireball', cardId: 'fireball' }];
fireballReward.players.P2.position = { x: 3, y: 3 };
const playFireball = applyCommand(fireballReward, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'reward-fireball', destination: 'direct' });
assert.equal(playFireball.ok, true);
if (playFireball.ok) {
  assert.equal(playFireball.state.phase, 'choosing-fireball-target');
  const hit = applyCommand(playFireball.state, { type: 'fireball-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(hit.ok, true);
  if (hit.ok) {
    assert.equal(hit.state.players.P2.hp, 22, 'Fireball deals 2 Damage.');
    assert.equal(hit.state.players.P2.hand.some((card) => card.cardId === 'burning' && card.sourcePlayerId === 'P1'), true, 'Fireball adds a revealed Burning Status Card to the target Hand.');
    assert.equal(hit.state.players.P1.matchStats?.perkDamage, 2, 'Direct Perk damage is tracked separately.');
    assert.equal(hit.state.players.P1.matchStats?.totalDamage, 2, 'Total Damage includes Perk damage.');
    assert.equal([...hit.state.players.P1.hand, ...hit.state.players.P1.deck, ...hit.state.players.P1.discard].some((card) => card.cardId === 'fireball'), false, 'Fireball is Removed rather than discarded after use.');
  }
}

const lethalFireballState = createInitialState();
lethalFireballState.players.P1.hand = [{ instanceId: 'lethal-fireball', cardId: 'fireball' }];
lethalFireballState.players.P2.position = { x: 3, y: 3 };
lethalFireballState.players.P2.hp = 2;
const playLethalFireball = applyCommand(lethalFireballState, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'lethal-fireball', destination: 'direct' });
assert.equal(playLethalFireball.ok, true);
if (playLethalFireball.ok) {
  const lethalHit = applyCommand(playLethalFireball.state, { type: 'fireball-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(lethalHit.ok, true);
  if (lethalHit.ok) {
    assert.equal(lethalHit.state.players.P2.hp, 0);
    assert.equal(lethalHit.state.phase, 'finished', 'Lethal Perk damage always opens the end-game state instead of returning to active play.');
    assert.equal(lethalHit.state.winner, 'P1', 'The Character dealing lethal Perk damage wins the match.');
  }
}

const burningTurnEnd = createInitialState();
burningTurnEnd.players.P1.hand = [];
burningTurnEnd.players.P2.hand = [{ instanceId: 'burning-turn-end', cardId: 'burning', revealedToOpponent: true, sourcePlayerId: 'P1' }];
const beginBurningHolderTurn = applyCommand(burningTurnEnd, { type: 'end-turn', playerId: 'P1' });
assert.equal(beginBurningHolderTurn.ok, true);
if (beginBurningHolderTurn.ok) {
  assert.equal(beginBurningHolderTurn.state.players.P2.hp, 24, 'Burning no longer deals Damage at the beginning of its holder\'s turn.');
  const finishBurningHolderTurn = applyCommand(beginBurningHolderTurn.state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(finishBurningHolderTurn.ok, true);
  if (finishBurningHolderTurn.ok) {
    assert.equal(finishBurningHolderTurn.state.players.P2.hp, 23, 'Burning deals 1 Damage at the end of its holder\'s turn.');
    assert.equal(finishBurningHolderTurn.state.players.P2.hand.some((card) => card.cardId === 'burning'), true, 'End-turn Burning Damage does not Remove the Status.');
  }
}

const burningDashState = createInitialState();
burningDashState.objects = [];
burningDashState.players.P1.position = { x: 2, y: 2 };
burningDashState.players.P2.position = { x: 8, y: 7 };
burningDashState.players.P1.freeMoveUsed = true;
burningDashState.players.P1.movementRemaining = 0;
burningDashState.players.P1.hand = [
  { instanceId: 'burning-dash-status', cardId: 'burning', revealedToOpponent: true, sourcePlayerId: 'P2' },
  { instanceId: 'burning-dash-cost', cardId: 'attack-2' },
];
const burningDashHpBefore = burningDashState.players.P1.hp;
const chooseBurningDash = applyCommand(burningDashState, { type: 'dash', playerId: 'P1' });
assert.equal(chooseBurningDash.ok, true);
if (chooseBurningDash.ok) {
  assert.equal(chooseBurningDash.state.players.P1.hp, burningDashHpBefore - 1, 'Burning Dash deals its 1 Damage before Burning is Removed and random movement begins.');
  assert.equal(chooseBurningDash.state.players.P1.hand.some((card) => card.cardId === 'burning'), false, 'Clicking Dash immediately Removes Burning without an additional discard.');
  assert.equal(chooseBurningDash.state.players.P1.hand.some((card) => card.instanceId === 'burning-dash-cost'), true, 'Burning replaces the normal additional Card discard cost.');
  assert.equal(chooseBurningDash.state.players.P1.visualMovement?.path.length, 2, 'Burning spends the complete Dash movement as random legal adjacent steps.');
  assert.equal(chooseBurningDash.state.activePlayerId, 'P2', 'The automatically resolved Burning Dash remains a Finishing Move and ends the turn.');
}

const tiedDamageQuest = createInitialState() as any;
tiedDamageQuest.turn = 3; tiedDamageQuest.activePlayerId = 'P2'; tiedDamageQuest.roundFirstPlayerId = 'P1'; tiedDamageQuest.players.P2.hand = [];
tiedDamageQuest.questPhases = { actionDamageByPlayer: { P1: 5, P2: 5 }, usedQuestIds: ['damage-contest'], currentQuest: { id: 'damage-contest', announcedRound: 1, endsAfterRound: 3, winners: [], progress: { P1: 5, P2: 5 } }, lastQuestWinners: [], progression: {}, phaseReward: null };
const resolveTie = applyCommand(tiedDamageQuest, { type: 'end-turn', playerId: 'P2' });
assert.equal(resolveTie.ok, true);
if (resolveTie.ok) {
  assert.deepEqual((resolveTie.state as any).questPhases.lastQuestWinners.sort(), ['P1', 'P2']);
  assert.equal(resolveTie.state.players.P1.hand.some((card) => card.cardId === 'fireball'), true);
  assert.equal(resolveTie.state.players.P2.hand.some((card) => card.cardId === 'fireball'), true, 'Every tied winner receives Fireball immediately.');
}

const tankJuniorRewardState = createInitialState() as any;
tankJuniorRewardState.turn = 4; tankJuniorRewardState.activePlayerId = 'P2'; tankJuniorRewardState.roundFirstPlayerId = 'P1'; tankJuniorRewardState.players.P2.hand = [];
tankJuniorRewardState.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['tank-junior'], currentQuest: { id: 'tank-junior', announcedRound: 1, endsAfterRound: 4, winners: [], progress: { P1: 7, P2: 3 } }, lastQuestWinners: [], progression: {}, phaseReward: null };
const resolveTankJunior = applyCommand(tankJuniorRewardState, { type: 'end-turn', playerId: 'P2' });
assert.equal(resolveTankJunior.ok, true);
if (resolveTankJunior.ok) {
  const helmet = resolveTankJunior.state.players.P1.hand.find((card) => card.cardId === 'mythril-helmet');
  assert.equal(Boolean(helmet), true, 'Tank Junior awards Mythril Helmet to the Player who blocked the most Damage.');
  assert.equal(helmet?.revealedToOpponent, true, 'Mythril Helmet is a revealed Status Card.');
}

const gamblerRewardState = createInitialState() as any;
gamblerRewardState.turn = 3; gamblerRewardState.activePlayerId = 'P2'; gamblerRewardState.roundFirstPlayerId = 'P1'; gamblerRewardState.players.P2.hand = [];
gamblerRewardState.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['the-gambler'], currentQuest: { id: 'the-gambler', announcedRound: 1, endsAfterRound: 3, winners: [], progress: { P1: 6, P2: 2 } }, lastQuestWinners: [], progression: {}, phaseReward: null };
const resolveGamblerReward = applyCommand(gamblerRewardState, { type: 'end-turn', playerId: 'P2' });
assert.equal(resolveGamblerReward.ok, true);
if (resolveGamblerReward.ok) assert.equal(resolveGamblerReward.state.players.P1.hand.some((card) => card.cardId === 'monarch-flush'), true, 'The Gambler awards Monarch Flush to its winner.');

const rabbitProgress = createInitialState() as any;
rabbitProgress.objects = [];
rabbitProgress.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['rabbit-run'], currentQuest: { id: 'rabbit-run', announcedRound: 1, endsAfterRound: 10, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null };
rabbitProgress.players.P1.movementRemaining = 2;
const rabbitMove = applyCommand(rabbitProgress, { type: 'move', playerId: 'P1', to: { x: 2, y: 3 } });
assert.equal(rabbitMove.ok, true);
if (rabbitMove.ok) {
  rabbitMove.state.phase = 'choosing-preparation-teleport';
  rabbitMove.state.preparation = { casterId: 'P1', consume: true, undo: null };
  rabbitMove.state.objects.push({ id: 'rabbit-swap-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 3 } });
  const rabbitTeleport = applyCommand(rabbitMove.state, { type: 'preparation-teleport', playerId: 'P1', objectId: 'rabbit-swap-box' });
  assert.equal(rabbitTeleport.ok, true);
  if (rabbitTeleport.ok) assert.equal((rabbitTeleport.state as any).questPhases.currentQuest.progress.P1, 2, 'Rabbit Run counts normal movement by distance and any teleport as exactly 1.');
}

const phaseBoundary = createHotseatTestState(true, 'shinobi') as any;
phaseBoundary.turn = 5;
phaseBoundary.activePlayerId = 'P3';
phaseBoundary.roundFirstPlayerId = 'P1';
phaseBoundary.players.P3.hand = [];
phaseBoundary.questPhases = {
  actionDamageByPlayer: {},
  usedQuestIds: ['damage-contest'],
  currentQuest: { id: 'damage-contest', announcedRound: 4, endsAfterRound: 99, winners: [], progress: { P1: 5, P2: 2, P3: 1 } },
  lastQuestWinners: [],
  progression: { P1: { initialFocus: 'attack', chosenFocusCard: 'cut-them-legs' } },
  phaseReward: null,
  turnStartedOnHighGround: {},
  captureTheFlag: null,
};
const phaseBoundaryResult = applyCommand(phaseBoundary, { type: 'end-turn', playerId: 'P3' });
assert.equal(phaseBoundaryResult.ok, true);
if (phaseBoundaryResult.ok) {
  assert.equal(phaseBoundaryResult.state.turn, 6, 'A new Round starts when play returns to the designated first Player.');
  assert.equal(phaseBoundaryResult.state.phase, 'choosing-phase-card', 'The Phase One reward begins as move 6 starts.');
  assert.equal((phaseBoundaryResult.state as any).questPhases.currentQuest.announcedRound, 6, 'A replacement Action Quest is announced precisely at the new Phase boundary.');
  assert.notEqual((phaseBoundaryResult.state as any).questPhases.currentQuest.id, 'damage-contest', 'The previous Action Quest resolves at the Phase boundary even if its stored end Round is later.');
  assert.deepEqual((phaseBoundaryResult.state as any).questPhases.lastQuestWinners, ['P1']);
  assert.equal(phaseBoundaryResult.state.players.P1.hand.some((card) => card.cardId === 'fireball'), true, 'The outgoing Quest awards its winner before the next Phase reward choice.');
  assert.equal((phaseBoundaryResult.state as any).questPhases.phaseReward.pendingPlayerIds.length, 1, 'Test Dummies do not receive player-only Phase choices.');
  const phaseCard = applyCommand(phaseBoundaryResult.state, { type: 'phase-card-choice', playerId: 'P1', cardId: 'not-a-shinobi' });
  assert.equal(phaseCard.ok, true, 'An Attack-focused Shinobi may select an available Defend Card at Phase One.');
  if (phaseCard.ok) {
    assert.equal(phaseCard.state.phase, 'choosing-phase-destination', 'The outgoing Action Quest winner receives the Phase reward destination choice.');
    const phaseCardDestination = applyCommand(phaseCard.state, { type: 'phase-card-destination', playerId: 'P1', destination: 'shuffle' });
    assert.equal(phaseCardDestination.ok, true);
    if (!phaseCardDestination.ok) throw new Error('Phase One destination choice unexpectedly failed.');
    assert.equal(phaseCardDestination.state.phase, 'active');
    assert.equal(phaseCardDestination.state.players.P1.deck.some((card) => card.cardId === 'not-a-shinobi'), true, 'The selected Phase Card can be shuffled into the Deck.');
    const phaseTwoState = phaseCardDestination.state as any;
    phaseTwoState.turn = 10;
    phaseTwoState.activePlayerId = 'P3';
    phaseTwoState.players.P3.hand = [];
    phaseTwoState.questPhases.currentQuest = null;
    phaseTwoState.questPhases.captureTheFlag = null;
    phaseTwoState.questPhases.lastQuestWinners = ['P1'];
    const phaseTwoBoundary = applyCommand(phaseTwoState, { type: 'end-turn', playerId: 'P3' });
    assert.equal(phaseTwoBoundary.ok, true);
    if (phaseTwoBoundary.ok) {
      const perkChoice = applyCommand(phaseTwoBoundary.state, { type: 'phase-card-choice', playerId: 'P1', cardId: 'swiftform' });
      assert.equal(perkChoice.ok, true);
      if (perkChoice.ok) {
        assert.equal(perkChoice.state.phase, 'choosing-phase-destination', 'The previous Quest winner chooses where to add a Phase Card.');
        const addToHand = applyCommand(perkChoice.state, { type: 'phase-card-destination', playerId: 'P1', destination: 'hand' });
        assert.equal(addToHand.ok, true);
        if (addToHand.ok) assert.equal(addToHand.state.players.P1.hand.some((card) => card.cardId === 'swiftform'), true, 'Winner may add the Phase reward directly to Hand.');
      }
    }
  }
}

const phaseThreeHandRemoval = createInitialState() as any;
phaseThreeHandRemoval.phase = 'choosing-phase-three-card';
phaseThreeHandRemoval.players.P1.hand = [{ instanceId: 'phase-three-hand', cardId: 'attack-2' }];
phaseThreeHandRemoval.players.P1.deck = [];
phaseThreeHandRemoval.players.P1.discard = [];
phaseThreeHandRemoval.questPhases = { actionDamageByPlayer: {}, usedQuestIds: [], currentQuest: null, lastQuestWinners: [], progression: {}, phaseReward: { phase: 3, pendingPlayerIds: ['P1'] } };
const removedPhaseThreeHand = applyCommand(phaseThreeHandRemoval, { type: 'phase-three-operation', playerId: 'P1', cardInstanceId: 'phase-three-hand', operation: 'remove' });
assert.equal(removedPhaseThreeHand.ok, true);
if (removedPhaseThreeHand.ok) {
  assert.equal(removedPhaseThreeHand.state.players.P1.hand.length, 0, 'Phase 3 may Remove a Card from Hand.');
  assert.equal(removedPhaseThreeHand.state.phase, 'choosing-phase-three-card', 'After Remove, the independent Duplicate action remains available.');
  assert.equal(removedPhaseThreeHand.state.questPhases.phaseReward.phaseThreeRemoved, true);
  const declineDuplicate = applyCommand(removedPhaseThreeHand.state, { type: 'phase-three-finish', playerId: 'P1' });
  assert.equal(declineDuplicate.ok, true, 'Cancel may decline the remaining Phase 3 action.');
  if (declineDuplicate.ok) assert.equal(declineDuplicate.state.phase, 'active');
}

const phaseThreeDiscardDuplicate = createInitialState() as any;
phaseThreeDiscardDuplicate.phase = 'choosing-phase-three-card';
phaseThreeDiscardDuplicate.players.P1.hand = [];
phaseThreeDiscardDuplicate.players.P1.deck = [];
phaseThreeDiscardDuplicate.players.P1.discard = [{ instanceId: 'phase-three-discard', cardId: 'defend-1' }];
phaseThreeDiscardDuplicate.questPhases = { actionDamageByPlayer: {}, usedQuestIds: [], currentQuest: null, lastQuestWinners: [], progression: {}, phaseReward: { phase: 3, pendingPlayerIds: ['P1'] } };
const duplicatedPhaseThreeDiscard = applyCommand(phaseThreeDiscardDuplicate, { type: 'phase-three-operation', playerId: 'P1', cardInstanceId: 'phase-three-discard', operation: 'duplicate' });
assert.equal(duplicatedPhaseThreeDiscard.ok, true);
if (duplicatedPhaseThreeDiscard.ok) {
  assert.equal(duplicatedPhaseThreeDiscard.state.players.P1.discard.some((card) => card.instanceId === 'phase-three-discard'), true, 'Duplicating preserves the selected original in Discard.');
  assert.equal(duplicatedPhaseThreeDiscard.state.players.P1.deck.some((card) => card.cardId === 'defend-1'), true, 'A non-winner Phase 3 duplicate from Discard is shuffled into Deck.');
  assert.equal(duplicatedPhaseThreeDiscard.state.phase, 'choosing-phase-three-card', 'After Duplicate, the independent Remove action remains available.');
  assert.equal(applyCommand(duplicatedPhaseThreeDiscard.state, { type: 'phase-three-operation', playerId: 'P1', cardInstanceId: 'phase-three-discard', operation: 'duplicate' }).ok, false, 'Duplicate can only be used once during Phase 3.');
  const removeAfterDuplicate = applyCommand(duplicatedPhaseThreeDiscard.state, { type: 'phase-three-operation', playerId: 'P1', cardInstanceId: 'phase-three-discard', operation: 'remove' });
  assert.equal(removeAfterDuplicate.ok, true);
  if (removeAfterDuplicate.ok) {
    assert.equal(removeAfterDuplicate.state.players.P1.discard.some((card) => card.instanceId === 'phase-three-discard'), false);
    assert.equal(removeAfterDuplicate.state.phase, 'active', 'Phase 3 finishes automatically after both actions are used.');
  }
}

const declinedPhaseThree = createInitialState() as any;
declinedPhaseThree.phase = 'choosing-phase-three-card';
declinedPhaseThree.questPhases = { actionDamageByPlayer: {}, usedQuestIds: [], currentQuest: null, lastQuestWinners: [], progression: {}, phaseReward: { phase: 3, pendingPlayerIds: ['P1'] } };
const declinedBothPhaseThreeActions = applyCommand(declinedPhaseThree, { type: 'phase-three-finish', playerId: 'P1' });
assert.equal(declinedBothPhaseThreeActions.ok, true, 'Cancel may decline both optional Phase 3 actions before either is used.');
if (declinedBothPhaseThreeActions.ok) assert.equal(declinedBothPhaseThreeActions.state.phase, 'active');
assert.equal(arenaForPlayerCount(3).id, 'lordaeron');
assert.equal(LORDAERON_ARENA.width, 8);
assert.equal(LORDAERON_ARENA.height, 11);
assert.deepEqual(LORDAERON_ARENA.pillars, ['B2', 'G10']);
assert.deepEqual(LORDAERON_ARENA.boxes, ['B3', 'D10', 'F5']);
assert.equal(LORDAERON_ARENA.highground.length, 8);
assert.equal(LORDAERON_ARENA.highgroundProtected.length, 16);
assert.deepEqual(LORDAERON_ARENA.bases.P1, ['B7', 'B8']);
assert.deepEqual(LORDAERON_ARENA.bases.P2, ['F2', 'G2']);
assert.deepEqual(LORDAERON_ARENA.bases.P3, ['G7', 'G8']);
const lordMultiplayer = createLordaeronMultiplayerState({ P1: 'magician', P2: 'orkk', P3: 'shinobi' }) as LordaeronGameState;
assert.equal(lordMultiplayer.phase, 'choosing-focus');
assert.equal(Object.keys(lordMultiplayer.players).length, 3);
const lordOpeningOrder = lordMultiplayer.lordaeronPlacement!.order;
assert.deepEqual(lordMultiplayer.objects.filter((object) => object.kind === 'wooden-box').map((object) => cellLabel(object.position)).sort(), ['B3', 'D10', 'F5'], 'Three-player multiplayer loads every Lordaeron box.');
let lordReady = lordMultiplayer as any;
for (const [playerId, cardId] of [['P1', 'mana-barrage'], ['P2', 'shield-bash'], ['P3', 'cut-them-legs']] as const) {
  const focusResult = applyCommand(lordReady, { type: 'choose-focus', playerId, focus: 'attack' });
  assert.equal(focusResult.ok, true);
  const cardResult = focusResult.ok ? applyCommand(focusResult.state, { type: 'choose-focus-card', playerId, cardId }) : focusResult;
  assert.equal(cardResult.ok, true);
  if (cardResult.ok) lordReady = cardResult.state;
}
assert.equal(lordReady.phase, 'choosing-base-placement');
assert.equal(lordReady.players.P1.hand.length, lordOpeningOrder[1] === 'P1' ? 4 : 3);
assert.equal(lordReady.players.P1.deck.length, lordOpeningOrder[1] === 'P1' ? 6 : 7);
assert.equal(lordReady.players.P1.hand.some((card: any) => card.cardId === 'preparation'), true);
assert.equal(
  lordOpeningOrder[1] === 'P1'
    ? lordReady.players.P1.hand.some((card: any) => card.cardId === 'mana-barrage')
    : lordReady.players.P1.deck.at(-1)?.cardId === 'mana-barrage',
  true,
  'The selected Focus Card stays on top unless P1 goes second and immediately draws it into Hand.',
);
const deploymentOrder = lordReady.lordaeronPlacement!.order;
const firstPlacement = applyCommand(lordReady, { type: 'place-character', playerId: deploymentOrder[0], to: { x: 2, y: 6 } });
assert.equal(firstPlacement.ok, true);
if (firstPlacement.ok) {
  const firstState = firstPlacement.state as LordaeronGameState;
  assert.equal(firstState.lordaeronPlacement!.availableBaseIds.length, 2);
  const secondPlacement = applyCommand(firstState, { type: 'place-character', playerId: deploymentOrder[1], to: { x: 6, y: 1 } });
  assert.equal(secondPlacement.ok, true);
  if (secondPlacement.ok) {
    const secondState = secondPlacement.state as LordaeronGameState;
    assert.equal(secondState.lordaeronPlacement!.availableBaseIds.length, 1);
    const thirdPlacement = applyCommand(secondState, { type: 'place-character', playerId: deploymentOrder[2], to: { x: 7, y: 6 } });
    assert.equal(thirdPlacement.ok, true);
    if (thirdPlacement.ok) {
      assert.equal(thirdPlacement.state.phase, 'active');
      assert.equal(thirdPlacement.state.activePlayerId, deploymentOrder[0]);
      assert.equal(Boolean((thirdPlacement.state as any).questPhases.currentQuest), true, 'The first Action Quest is announced when multiplayer deployment completes.');
      for (const player of Object.values(thirdPlacement.state.players)) {
        const goesSecond = player.id === lordOpeningOrder[1];
        assert.equal(player.hand.length, goesSecond ? 4 : 3, 'The Round 1 second Player receives one additional opening Card.');
        assert.equal(player.deck.length, goesSecond ? 6 : 7, 'Only the second Player draws an extra Card from the ten-Card starting Deck.');
      }
    }
  }
}
const multiplayerLogan = createMultiplayerState({ P1: 'magician', P2: 'magician' });
assert.equal(multiplayerLogan.players.P1.name, 'Long Hat Logan');
assert.equal(multiplayerLogan.players.P2.name, 'Long Hat Logan');
assert.equal(multiplayerLogan.phase, 'choosing-focus');
assert.equal(multiplayerLogan.players.P1.hand.length, 0);
assert.equal(multiplayerLogan.boardSize, NAGRAND_ARENA.height, 'A 1v1 multiplayer duel uses the 8x8 Nagrand Arena.');
const initialAttackFocus = applyCommand(multiplayerLogan, { type: 'choose-focus', playerId: 'P1', focus: 'attack' });
assert.equal(initialAttackFocus.ok, true);
if (initialAttackFocus.ok) {
  const backToFocus = applyCommand(initialAttackFocus.state, { type: 'back-focus-choice', playerId: 'P1' });
  assert.equal(backToFocus.ok, true);
  if (backToFocus.ok) {
    assert.equal(backToFocus.state.phase, 'choosing-focus', 'Back from the tenth-Card screen returns to Focus choice.');
    assert.equal((backToFocus.state as any).openingSetup.focusByPlayer.P1, undefined, 'Back clears the tentative Focus without advancing setup.');
    assert.deepEqual((backToFocus.state as any).openingSetup.pendingPlayerIds, ['P1', 'P2']);
    assert.equal(backToFocus.state.players.P1.deck.length, 0);
    assert.equal(backToFocus.state.players.P1.hand.length, 0);
  }
}
assert.equal(Object.keys(multiplayerLogan.players).length, 2, 'A Nagrand duel contains exactly two players.');
let completedDuelSetup: any = multiplayerLogan;
for (const playerId of ['P1', 'P2'] as PlayerId[]) {
  const focus = applyCommand(completedDuelSetup, { type: 'choose-focus', playerId, focus: 'attack' });
  assert.equal(focus.ok, true);
  const card = focus.ok ? applyCommand(focus.state, { type: 'choose-focus-card', playerId, cardId: 'mana-barrage' }) : focus;
  assert.equal(card.ok, true);
  if (card.ok) completedDuelSetup = card.state;
}
const duelFirstPlayerId = (completedDuelSetup as any).roundFirstPlayerId as PlayerId;
const duelSecondPlayerId = duelFirstPlayerId === 'P1' ? 'P2' : 'P1';
assert.equal(completedDuelSetup.players[duelFirstPlayerId].hand.length, 3, 'The first Player keeps the standard three-Card opening Hand.');
assert.equal(completedDuelSetup.players[duelSecondPlayerId].hand.length, 4, 'The Player going second in Round 1 draws one additional opening Card.');
assert.deepEqual(
  multiplayerLogan.objects.filter((object) => object.kind === 'wall-pillar').map((object) => cellLabel(object.position)).sort(),
  [...NAGRAND_ARENA.pillars].sort(),
  'Nagrand uses the shared pillar layout.'
);
assertNagrandBoxLayout(multiplayerLogan.objects.filter((object) => object.kind === 'wooden-box').map((object) => cellLabel(object.position)));
const multiplayerCombatStackState = createGameInitialState() as any;
multiplayerCombatStackState.simultaneousCombatStack = true;
multiplayerCombatStackState.objects = [];
multiplayerCombatStackState.players.P1.position = { x: 2, y: 2 };
multiplayerCombatStackState.players.P2.position = { x: 3, y: 2 };
multiplayerCombatStackState.players.P1.hand = [
  { instanceId: 'stack-attack', cardId: 'attack-3' },
  { instanceId: 'stack-attacker-banner', cardId: 'banner' },
  { instanceId: 'stack-attacker-mockery', cardId: 'vicious-mockery' },
];
multiplayerCombatStackState.players.P2.hand = [
  { instanceId: 'stack-defense', cardId: 'defend-1' },
  { instanceId: 'stack-defender-banner', cardId: 'banner' },
];
const multiplayerStackAttack = applyGameCommand(multiplayerCombatStackState, { type: 'attack', playerId: 'P1', cardInstanceId: 'stack-attack', targetId: 'P2' });
assert.equal(multiplayerStackAttack.ok, true);
if (multiplayerStackAttack.ok) {
  assert.equal(multiplayerStackAttack.state.players.P1.hand.some((card) => card.cardId === 'banner'), true, 'Multiplayer no longer auto-applies Banner before Defence is selected.');
  const multiplayerStackDefense = applyGameCommand(multiplayerStackAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'stack-defense' });
  assert.equal(multiplayerStackDefense.ok, true);
  if (multiplayerStackDefense.ok) {
    assert.equal(multiplayerStackDefense.state.phase, 'choosing-combat-stack', 'Multiplayer enters simultaneous private Combat Card selection after Attack and Defence reveal.');
    assert.equal(multiplayerStackDefense.state.combatReveal?.defendTotal, 1, 'Stage 2 reveals the current Defend Value before any optional Combat Card is selected.');
    const hotseatFirstChoice = applyGameCommand(multiplayerStackDefense.state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'stack-attacker-mockery' });
    assert.equal(hotseatFirstChoice.ok, true, 'Hotseat accepts one direct choice from the full list of the first Player\'s applicable Combat Cards.');
    if (hotseatFirstChoice.ok) {
      assert.equal(hotseatFirstChoice.state.phase, 'choosing-combat-stack');
      const hotseatSecondChoice = applyGameCommand(hotseatFirstChoice.state, { type: 'combat-stack-choice', playerId: 'P2', cardInstanceId: null });
      assert.equal(hotseatSecondChoice.ok, true, 'Hotseat provides the second Player with the same choose-one-or-none Combat Card stage.');
      if (hotseatSecondChoice.ok) assert.equal(hotseatSecondChoice.state.combatReveal?.attackTotal, 5, 'Both Hotseat choices resolve together after each Player locks one option.');
    }
    const tooManyCombatCards = resolveMultiplayerCombatStack(multiplayerStackDefense.state, {
      P1: ['stack-attacker-banner', 'stack-attacker-mockery'],
      P2: [],
    });
    assert.equal(tooManyCombatCards.ok, false, 'A Player cannot apply more than one Combat Card in an individual combat.');
    const multiplayerStackResolved = resolveMultiplayerCombatStack(multiplayerStackDefense.state, {
      P1: ['stack-attacker-mockery'],
      P2: ['stack-defender-banner'],
    });
    assert.equal(multiplayerStackResolved.ok, true);
    if (multiplayerStackResolved.ok) {
      assert.equal(multiplayerStackResolved.state.combatReveal?.attackTotal, 5, 'Joint reveal applies the attacker’s single selected Vicious Mockery.');
      assert.equal(multiplayerStackResolved.state.combatReveal?.defendTotal, 2, 'Joint reveal applies defender Banner to the final Defend Value.');
      assert.deepEqual(multiplayerStackResolved.state.combatReveal?.combatStackApplied?.P1, ['vicious-mockery']);
      assert.deepEqual(multiplayerStackResolved.state.combatReveal?.combatStackApplied?.P2, ['banner']);
      assert.equal(multiplayerStackResolved.state.players.P1.hand.some((card) => card.cardId === 'vicious-mockery'), false, 'The applied attacker Combat Card is Removed.');
      assert.equal(multiplayerStackResolved.state.players.P1.hand.some((card) => card.cardId === 'banner'), true, 'Unselected Combat Cards remain in Hand.');
      assert.equal(multiplayerStackResolved.state.players.P2.hand.some((card) => card.cardId === 'banner'), false, 'Applied defender Combat Cards are Removed together.');
    }
  }
}
const noCombatCardsState = createGameInitialState() as any;
noCombatCardsState.simultaneousCombatStack = true;
noCombatCardsState.objects = [];
noCombatCardsState.players.P1.position = { x: 2, y: 2 };
noCombatCardsState.players.P2.position = { x: 3, y: 2 };
noCombatCardsState.players.P1.hand = [{ instanceId: 'no-stack-attack', cardId: 'attack-2' }];
noCombatCardsState.players.P2.hand = [];
const noStackAttack = applyGameCommand(noCombatCardsState, { type: 'attack', playerId: 'P1', cardInstanceId: 'no-stack-attack', targetId: 'P2' });
const noStackDefense = noStackAttack.ok ? applyGameCommand(noStackAttack.state, { type: 'pass-defense', playerId: 'P2' }) : noStackAttack;
assert.equal(noStackDefense.ok, true);
if (noStackDefense.ok) assert.notEqual(noStackDefense.state.phase, 'choosing-combat-stack', 'Combat Stack questions are skipped when neither Player has an applicable Combat Card.');

const oneSidedCombatCardsState = createGameInitialState() as any;
oneSidedCombatCardsState.simultaneousCombatStack = true;
oneSidedCombatCardsState.objects = [];
oneSidedCombatCardsState.players.P1.position = { x: 2, y: 2 };
oneSidedCombatCardsState.players.P2.position = { x: 3, y: 2 };
oneSidedCombatCardsState.players.P1.hand = [{ instanceId: 'one-stack-attack', cardId: 'attack-2' }, { instanceId: 'one-stack-mockery', cardId: 'vicious-mockery' }];
oneSidedCombatCardsState.players.P2.hand = [];
const oneStackAttack = applyGameCommand(oneSidedCombatCardsState, { type: 'attack', playerId: 'P1', cardInstanceId: 'one-stack-attack', targetId: 'P2' });
const oneStackDefense = oneStackAttack.ok ? applyGameCommand(oneStackAttack.state, { type: 'pass-defense', playerId: 'P2' }) : oneStackAttack;
assert.equal(oneStackDefense.ok, true);
if (oneStackDefense.ok) {
  assert.equal(oneStackDefense.state.phase, 'choosing-combat-stack');
  assert.deepEqual((oneStackDefense.state as any).combatStackSelections.P2, [], 'A Player without applicable Combat Cards automatically submits no Card and is not prompted.');
}

const takeHitCombatCardState = createGameInitialState() as any;
takeHitCombatCardState.simultaneousCombatStack = true;
takeHitCombatCardState.objects = [];
takeHitCombatCardState.players.P1.position = { x: 2, y: 2 };
takeHitCombatCardState.players.P2.position = { x: 3, y: 2 };
takeHitCombatCardState.players.P1.hand = [{ instanceId: 'take-hit-attack', cardId: 'attack-2' }, { instanceId: 'take-hit-attacker-banner', cardId: 'banner' }];
takeHitCombatCardState.players.P2.hand = [{ instanceId: 'take-hit-defender-banner', cardId: 'banner' }];
const takeHitAttack = applyGameCommand(takeHitCombatCardState, { type: 'attack', playerId: 'P1', cardInstanceId: 'take-hit-attack', targetId: 'P2' });
const takeHitStack = takeHitAttack.ok ? applyGameCommand(takeHitAttack.state, { type: 'pass-defense', playerId: 'P2' }) : takeHitAttack;
assert.equal(takeHitStack.ok, true);
if (takeHitStack.ok) {
  assert.equal(takeHitStack.state.phase, 'choosing-combat-stack', 'The Attacker may still choose a Combat Card when the Defender takes the Hit.');
  assert.deepEqual(applicableCombatCardInstanceIds(takeHitStack.state, 'P1'), ['take-hit-attacker-banner']);
  assert.deepEqual(applicableCombatCardInstanceIds(takeHitStack.state, 'P2'), [], 'A Defender who takes the Hit cannot play a Combat Card.');
  assert.deepEqual((takeHitStack.state as any).combatStackSelections.P2, [], 'The Defender is automatically submitted with no Combat Card after taking the Hit.');
}

const zeroValueExhaustState = createGameInitialState() as any;
zeroValueExhaustState.simultaneousCombatStack = true;
zeroValueExhaustState.objects = [];
zeroValueExhaustState.players.P1.position = { x: 2, y: 2 };
zeroValueExhaustState.players.P2.position = { x: 3, y: 2 };
zeroValueExhaustState.players.P1.hand = [{ instanceId: 'zero-exhaust-attack', cardId: 'attack-2' }];
zeroValueExhaustState.players.P2.hand = [{ instanceId: 'zero-exhaust-defense', cardId: 'feed-the-spirit' }, { instanceId: 'zero-exhaust-status', cardId: 'exhaust' }];
const zeroExhaustAttack = applyGameCommand(zeroValueExhaustState, { type: 'attack', playerId: 'P1', cardInstanceId: 'zero-exhaust-attack', targetId: 'P2' });
const zeroExhaustDefense = zeroExhaustAttack.ok ? applyGameCommand(zeroExhaustAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'zero-exhaust-defense' }) : zeroExhaustAttack;
assert.equal(zeroExhaustDefense.ok, true);
if (zeroExhaustDefense.ok) assert.notEqual(zeroExhaustDefense.state.phase, 'choosing-combat-stack', 'Exhaust cannot be attached when the played Card already has a current Value of 0 or less.');

const blessingShieldVsBlockState = createGameInitialState() as any;
blessingShieldVsBlockState.simultaneousCombatStack = true;
blessingShieldVsBlockState.objects = [];
blessingShieldVsBlockState.players.P1.character = 'john-christ';
blessingShieldVsBlockState.players.P1.position = { x: 2, y: 2 };
blessingShieldVsBlockState.players.P2.position = { x: 3, y: 2 };
blessingShieldVsBlockState.players.P1.hand = [{ instanceId: 'shield-block-attack', cardId: 'attack-2' }, { instanceId: 'shield-block-blessing', cardId: 'blessing-shield' }];
blessingShieldVsBlockState.players.P2.hand = [{ instanceId: 'shield-block-defense', cardId: 'block' }];
const shieldBlockAttack = applyGameCommand(blessingShieldVsBlockState, { type: 'attack', playerId: 'P1', cardInstanceId: 'shield-block-attack', targetId: 'P2' });
const shieldBlockDefense = shieldBlockAttack.ok ? applyGameCommand(shieldBlockAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'shield-block-defense' }) : shieldBlockAttack;
assert.equal(shieldBlockDefense.ok, true);
if (shieldBlockDefense.ok) {
  const appliedShield = applyGameCommand(shieldBlockDefense.state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'shield-block-blessing' });
  assert.equal(appliedShield.ok, true);
  if (appliedShield.ok) {
    assert.equal(appliedShield.state.players.P1.pinnedStacks, 0, 'Blessing: Shield blocks Block’s post-reveal Pinned Status effect.');
    assert.equal(appliedShield.state.players.P1.hand.some((card) => card.instanceId === 'shield-block-blessing'), false, 'Block does not cancel the separately applied Blessing: Shield Combat Card.');
  }
}

const clampedDefenseState = createGameInitialState() as any;
clampedDefenseState.simultaneousCombatStack = true;
clampedDefenseState.objects = [];
clampedDefenseState.players.P1.position = { x: 2, y: 2 };
clampedDefenseState.players.P2.position = { x: 3, y: 2 };
clampedDefenseState.players.P1.hand = [{ instanceId: 'clamp-defense-attack', cardId: 'attack-2' }, { instanceId: 'clamp-defense-light', cardId: 'blessing-light' }];
clampedDefenseState.players.P2.hand = [{ instanceId: 'clamp-defense-zero', cardId: 'feed-the-spirit' }];
const clampDefenseAttack = applyGameCommand(clampedDefenseState, { type: 'attack', playerId: 'P1', cardInstanceId: 'clamp-defense-attack', targetId: 'P2' });
const clampDefenseChoice = clampDefenseAttack.ok ? applyGameCommand(clampDefenseAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'clamp-defense-zero' }) : clampDefenseAttack;
assert.equal(clampDefenseChoice.ok, true);
if (clampDefenseChoice.ok) {
  const clampDefenseResolved = applyGameCommand(clampDefenseChoice.state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'clamp-defense-light' });
  assert.equal(clampDefenseResolved.ok, true);
  if (clampDefenseResolved.ok) assert.equal(clampDefenseResolved.state.combatReveal?.defendTotal, 0, 'Final Defend Value is clamped to 0 after Combat Card penalties.');
}

const multiplayerTrenchJohn = createMultiplayerState({ P1: 'john-christ', P2: 'magician' }, 'trench');
assert.equal(multiplayerTrenchJohn.players.P1.character, 'john-christ', 'John Christ is available in multiplayer duels.');
assert.equal(multiplayerTrenchJohn.players.P1.name, 'John Christ');
assert.equal(multiplayerTrenchJohn.players.P1.maxHp, 14);
assert.equal((multiplayerTrenchJohn as any).arenaId, 'trench', 'The selected multiplayer arena is stored in shared state.');
assert.deepEqual(multiplayerTrenchJohn.players.P1.position, { x: 4, y: 0 }, 'The Trench multiplayer P1 starts at D1.');
assert.deepEqual(multiplayerTrenchJohn.players.P2.position, { x: 5, y: 7 }, 'The Trench multiplayer P2 starts at E8.');
assert.deepEqual(
  multiplayerTrenchJohn.objects.filter((object) => object.kind === 'wall-pillar').map((object) => cellLabel(object.position)).sort(),
  [...THE_TRENCH_ARENA.pillars].sort(),
  'The Trench multiplayer duel uses its four Columns.',
);
assert.equal(multiplayerTrenchJohn.objects.filter((object) => object.kind === 'wooden-box').length, 4, 'The Trench multiplayer duel spawns four Boxes.');
const duelHotseat = createHotseatTestState(false, 'magician', 2);
assert.equal(duelHotseat.boardSize, NAGRAND_ARENA.height, 'The 1v1 Test Room uses Nagrand Arena.');
assert.deepEqual(Object.keys(duelHotseat.players).sort(), ['P1', 'P2'], 'The 1v1 Test Room has one selected Character and one Test Dummy.');
assert.equal(duelHotseat.players.P2.character, 'dummy');
const characterDuelHotseat = createHotseatTestState(false, 'magician', 2, 'orkk') as any;
assert.equal(characterDuelHotseat.players.P1.character, 'magician', 'Hotseat Duel keeps the selected Player 1 Character.');
assert.equal(characterDuelHotseat.players.P2.character, 'orkk', 'Hotseat Duel supports a selected Character for Player 2.');
assert.equal(characterDuelHotseat.players.P2.name, 'Da Orkk');
assert.deepEqual(characterDuelHotseat.openingSetup?.pendingPlayerIds, ['P1', 'P2'], 'Both selected Characters complete the opening setup.');
const loganTestState = createHotseatTestState();
assert.equal(loganTestState.boardSize, 11);
assert.deepEqual(Object.keys(loganTestState.players).sort(), ['P1', 'P2', 'P3'], 'The FFA Test Room has one selected Character and two Test Dummies.');
assert.equal(loganTestState.objects.length, 5);
assert.deepEqual(loganTestState.objects.map((object) => cellLabel(object.position)).sort(), ['B2', 'B3', 'D10', 'F5', 'G10']);
assert.equal(loganTestState.players.P1.character, 'magician');
assert.equal(loganTestState.players.P1.name, 'Long Hat Logan');
assert.equal(loganTestState.players.P1.moveRange, 3, 'Long Hat Logan should have a base Movement Range of 3.');
assert.equal(loganTestState.players.P1.attackRange, 2, 'Long Hat Logan should have an Attack Range of 2.');
assert.equal(loganTestState.players.P1.maxHp, 18);
assert.equal(loganTestState.phase, 'choosing-focus');
assert.equal(loganTestState.players.P1.hand.length, 0);
assert.equal(loganTestState.players.P2.character, 'dummy');
assert.equal(loganTestState.players.P2.hand.length, 5);
assert.equal(loganTestState.players.P3.character, 'dummy');
assert.equal(loganTestState.players.P3.name, 'Test Dummy 2');
assert.equal(loganTestState.players.P3.hand.length, 5);
assert.equal(cellLabel(loganTestState.players.P3.position), 'G7');
assert.equal(loganTestState.players.P2.hand.every((instance) => ['attack-2', 'attack-3', 'light-the-saber', 'dance-through', 'force-disarm', 'cut-them-legs', 'hello-there', 'arcane-bolt', 'snowball-effect', 'mana-blast', 'mana-barrage', 'grimoire-cleanse'].includes(instance.cardId)), true);
const chainTest = createHotseatTestState(true);
chainTest.players.P1.position = { x: 1, y: 3 };
chainTest.players.P2.position = { x: 3, y: 3 };
chainTest.objects = [{ id: 'chain-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 4, y: 3 } }];
const chainCard = chainTest.players.P1.hand.find((card) => card.cardId === 'chain-lightning')!;
const startChain = applyCommand(chainTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: chainCard.instanceId, destination: 'direct' });
assert.equal(startChain.ok, true);
if (startChain.ok) {
  assert.equal(startChain.state.phase, 'choosing-chain-lightning-target');
  const resolveChain = applyCommand(startChain.state, { type: 'chain-lightning-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(resolveChain.ok, true);
  if (resolveChain.ok) {
    assert.equal(resolveChain.state.players.P2.hp, 19);
    assert.equal(resolveChain.state.objects.some((object) => object.id === 'chain-box'), false);
  }
}
const magicHandTest = createHotseatTestState(true);
magicHandTest.players.P1.position = { x: 1, y: 0 };
magicHandTest.objects.push({ id: 'magic-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 0 } });
magicHandTest.players.P1.manaMode = 'consume';
const magicCard = magicHandTest.players.P1.hand.find((card) => card.cardId === 'magic-hand')!;
const startMagic = applyCommand(magicHandTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: magicCard.instanceId, destination: 'direct' });
assert.equal(startMagic.ok, true);
if (startMagic.ok) {
  assert.deepEqual(
    wizardActionEventForCommand(startMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'magic-box' }),
    { playerId: 'P1', action: 'spell-targeted', spell: 'magic-hand', target: { x: 2, y: 0 }, hold: true, targetKind: 'object', targetId: 'magic-box' },
    'An accepted online Magic Hand target produces a semantic Wizard action event for every client.',
  );
  const targetMagic = applyCommand(startMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'magic-box' });
  assert.equal(targetMagic.ok, true);
  if (targetMagic.ok) {
    assert.deepEqual(
      wizardActionEventForCommand(targetMagic.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 5, y: 0 } }),
      { playerId: 'P1', action: 'spell-resolved', spell: 'magic-hand' },
      'Resolving Magic Hand produces a semantic completion event so every client releases the held Power pose.',
    );
    const resolveMagic = applyCommand(targetMagic.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 3, y: 0 } });
    assert.equal(resolveMagic.ok, true);
    if (resolveMagic.ok) {
      assert.deepEqual(resolveMagic.state.objects.find((object) => object.id === 'magic-box')?.position, { x: 5, y: 0 }, 'Level 1 Magic Hand throws an Object exactly 3 Squares.');
      assert.equal(resolveMagic.state.players.P1.actionsRemaining, 2, 'Magic Hand Consume refunds the Action spent to use it.');
    }
  }
}
const globalMagicHandTest = createHotseatTestState(true);
globalMagicHandTest.players.P1.position = { x: 1, y: 0 };
globalMagicHandTest.players.P2.position = { x: 4, y: 1 };
globalMagicHandTest.objects = [{ id: 'global-magic-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 6, y: 0 } }];
const globalMagicCard = globalMagicHandTest.players.P1.hand.find((card) => card.cardId === 'magic-hand')!;
const startGlobalMagic = applyCommand(globalMagicHandTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: globalMagicCard.instanceId, destination: 'direct' });
assert.equal(startGlobalMagic.ok, true);
if (startGlobalMagic.ok) {
  startGlobalMagic.state.magicHand!.level = 2;
  const targetGlobalMagic = applyCommand(startGlobalMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'global-magic-box' });
  assert.equal(targetGlobalMagic.ok, true, 'Magic Hand should target any visible Object at global Range.');
  if (targetGlobalMagic.ok) {
    const resolveGlobalMagic = applyCommand(targetGlobalMagic.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 7, y: 0 } });
    assert.equal(resolveGlobalMagic.ok, true);
    if (resolveGlobalMagic.ok) assert.deepEqual(resolveGlobalMagic.state.objects.find((object) => object.id === 'global-magic-box')?.position, { x: 8, y: 0 }, 'Level 2 Magic Hand has global targeting Range and throws 3 Squares until the board edge.');
  }
}
const collisionMagicHandTest = createHotseatTestState(true);
collisionMagicHandTest.players.P1.position = { x: 1, y: 0 };
collisionMagicHandTest.players.P2.position = { x: 4, y: 0 };
collisionMagicHandTest.objects = [{ id: 'collision-magic-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 0 } }];
const collisionMagicCard = collisionMagicHandTest.players.P1.hand.find((card) => card.cardId === 'magic-hand')!;
const startCollisionMagic = applyCommand(collisionMagicHandTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: collisionMagicCard.instanceId, destination: 'direct' });
assert.equal(startCollisionMagic.ok, true);
if (startCollisionMagic.ok && startCollisionMagic.state.magicHand) {
  startCollisionMagic.state.magicHand.level = 3;
  startCollisionMagic.state.magicHand.distance = 16;
  const targetCollisionMagic = applyCommand(startCollisionMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'collision-magic-box' });
  assert.equal(targetCollisionMagic.ok, true);
  if (targetCollisionMagic.ok) {
    const resolveCollisionMagic = applyCommand(targetCollisionMagic.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 3, y: 0 } });
    assert.equal(resolveCollisionMagic.ok, true);
    if (resolveCollisionMagic.ok) {
      assert.deepEqual(resolveCollisionMagic.state.objects.find((object) => object.id === 'collision-magic-box')?.position, { x: 3, y: 0 });
      assert.deepEqual(resolveCollisionMagic.state.players.P2.position, { x: 8, y: 0 }, 'Level 3 global push distance transfers the remaining momentum through a collision.');
      assert.equal(resolveCollisionMagic.state.players.P2.hp, 20, 'Magic Hand collisions deal no Damage to either the thrown entity or the struck entity.');
      assert.deepEqual(resolveCollisionMagic.state.players.P2.visualMovement?.path, [{ x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: 0 }], 'A kinetically pushed character receives a smooth multi-Square animation path.');
    }
  }
}

const kineticMagicHandTest = createHotseatTestState(true);
kineticMagicHandTest.players.P1.position = { x: 1, y: 1 };
kineticMagicHandTest.players.P2.position = { x: 8, y: 7 };
kineticMagicHandTest.objects = [
  { id: 'kinetic-source-box', name: 'Source Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 1 } },
  { id: 'kinetic-target-box', name: 'Target Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 4, y: 1 } },
];
const kineticMagicCard = kineticMagicHandTest.players.P1.hand.find((card) => card.cardId === 'magic-hand')!;
const startKineticMagic = applyCommand(kineticMagicHandTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: kineticMagicCard.instanceId, destination: 'direct' });
assert.equal(startKineticMagic.ok, true);
if (startKineticMagic.ok) {
  const targetKineticMagic = applyCommand(startKineticMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'kinetic-source-box' });
  assert.equal(targetKineticMagic.ok, true);
  if (targetKineticMagic.ok) {
    const resolveKineticMagic = applyCommand(targetKineticMagic.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 3, y: 1 } });
    assert.equal(resolveKineticMagic.ok, true);
    if (resolveKineticMagic.ok) {
      assert.deepEqual(resolveKineticMagic.state.objects.find((object) => object.id === 'kinetic-source-box')?.position, { x: 3, y: 1 });
      assert.deepEqual(resolveKineticMagic.state.objects.find((object) => object.id === 'kinetic-target-box')?.position, { x: 5, y: 1 }, 'A thrown Object transfers its remaining push distance to the Object it hits.');
      assert.equal(resolveKineticMagic.state.objectPushAnimations.filter((event) => ['kinetic-source-box', 'kinetic-target-box'].includes(event.objectId)).every((event) => (event.path?.length ?? 0) > 0), true, 'Every Object in a kinetic collision chain receives a smooth path animation.');
    }
  }
}

const enemyMagicHandTest = createHotseatTestState(true);
enemyMagicHandTest.players.P1.position = { x: 1, y: 2 };
enemyMagicHandTest.players.P2.position = { x: 4, y: 2 };
enemyMagicHandTest.objects = [];
const enemyMagicCard = enemyMagicHandTest.players.P1.hand.find((card) => card.cardId === 'magic-hand')!;
const startEnemyMagic = applyCommand(enemyMagicHandTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: enemyMagicCard.instanceId, destination: 'direct' });
assert.equal(startEnemyMagic.ok, true);
if (startEnemyMagic.ok && startEnemyMagic.state.magicHand) {
  assert.equal(applyCommand(startEnemyMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' }).ok, false, 'Magic Hand cannot target enemies below Level 3.');
  startEnemyMagic.state.magicHand.level = 3;
  startEnemyMagic.state.magicHand.distance = 16;
  const targetEnemyMagic = applyCommand(startEnemyMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  assert.equal(targetEnemyMagic.ok, true, 'Magic Hand Level 3 can target an enemy.');
  if (targetEnemyMagic.ok) {
    const resolveEnemyMagic = applyCommand(targetEnemyMagic.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 5, y: 2 } });
    assert.equal(resolveEnemyMagic.ok, true);
    if (resolveEnemyMagic.ok) {
      assert.deepEqual(resolveEnemyMagic.state.players.P2.position, { x: 8, y: 2 }, 'A Level 3 enemy target is pushed globally until the board edge.');
      assert.equal(resolveEnemyMagic.state.players.P2.hp, 20, 'Direct Magic Hand pushes deal no Damage.');
    }
  }
}
const shizzleTest = createHotseatTestState(true);
shizzleTest.players.P1.position = { x: 1, y: 0 };
shizzleTest.players.P2.position = { x: 5, y: 0 };
shizzleTest.objects = [{ id: 'shizzle-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 0 } }];
const shizzleCard = shizzleTest.players.P1.hand.find((card) => card.cardId === 'shizzle')!;
const startShizzle = applyCommand(shizzleTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: shizzleCard.instanceId, destination: 'direct' });
assert.equal(startShizzle.ok, true);
if (startShizzle.ok) {
  assert.equal(startShizzle.state.shizzle?.stepsRemaining, 2, 'Shizzle Level 1 has a maximum Dash distance of 2 Squares.');
  assert.equal(applyCommand(startShizzle.state, { type: 'shizzle-destination', playerId: 'P1', to: { x: 4, y: 0 } }).ok, false, 'Shizzle Level 1 cannot Dash 3 Squares.');
  const resolveShizzle = applyCommand(startShizzle.state, { type: 'shizzle-destination', playerId: 'P1', to: { x: 3, y: 0 } });
  assert.equal(resolveShizzle.ok, true);
  if (resolveShizzle.ok) {
    assert.deepEqual(resolveShizzle.state.players.P1.position, { x: 3, y: 0 });
    assert.deepEqual(resolveShizzle.state.players.P1.visualMovement?.path, [{ x: 2, y: 0 }, { x: 3, y: 0 }], 'Shizzle animation follows its true two-Square route through occupied Squares.');
    assert.equal(resolveShizzle.state.players.P2.hp, 20);
  }
}
const shizzleLevelThreeState = createHotseatTestState(true);
const shizzleLevelThreeCard = shizzleLevelThreeState.players.P1.hand.find((card) => card.cardId === 'shizzle')!;
shizzleLevelThreeState.players.P1.hand = shizzleLevelThreeState.players.P1.hand.filter((card) => card.instanceId !== shizzleLevelThreeCard.instanceId);
shizzleLevelThreeState.players.P1.spellEcho[2] = shizzleLevelThreeCard;
const startShizzleLevelThree = applyCommand(shizzleLevelThreeState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(startShizzleLevelThree.ok, true);
if (startShizzleLevelThree.ok) assert.equal(startShizzleLevelThree.state.shizzle?.stepsRemaining, 3, 'Shizzle Level 3 increases the maximum Dash distance by 1 Square, up to 3.');
const shizzleWallTest = createHotseatTestState(true);
shizzleWallTest.players.P1.position = { x: 1, y: 0 };
shizzleWallTest.players.P2.position = { x: 5, y: 0 };
shizzleWallTest.objects = [{ id: 'shizzle-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 2, y: 0 } }];
const shizzleWallCard = shizzleWallTest.players.P1.hand.find((card) => card.cardId === 'shizzle')!;
const startWallShizzle = applyCommand(shizzleWallTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: shizzleWallCard.instanceId, destination: 'direct' });
assert.equal(startWallShizzle.ok, true);
if (startWallShizzle.ok) assert.equal(applyCommand(startWallShizzle.state, { type: 'shizzle-destination', playerId: 'P1', to: { x: 3, y: 0 } }).ok, false, 'Shizzle must not pass through Da Orkk Shield Wall Objects.');
const shizzleConsumeTest = createHotseatTestState(true);
shizzleConsumeTest.players.P1.position = { x: 1, y: 0 };
shizzleConsumeTest.players.P2.position = { x: 5, y: 0 };
shizzleConsumeTest.players.P1.manaMode = 'consume';
shizzleConsumeTest.objects = [{ id: 'consume-shizzle-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 0 } }];
const shizzleConsumeCard = shizzleConsumeTest.players.P1.hand.find((card) => card.cardId === 'shizzle')!;
const startConsumeShizzle = applyCommand(shizzleConsumeTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: shizzleConsumeCard.instanceId, destination: 'direct' });
assert.equal(startConsumeShizzle.ok, true);
if (startConsumeShizzle.ok) {
  const throughBox = applyCommand(startConsumeShizzle.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 0 } });
  assert.equal(throughBox.ok, true, 'Shizzle Consume should pass through a wooden box.');
  if (throughBox.ok) assert.equal(applyCommand(throughBox.state, { type: 'move', playerId: 'P1', to: { x: 3, y: 0 } }).ok, true);
}
const loganManaState = createHotseatTestState(true);
loganManaState.activePlayerId = 'P3';
loganManaState.players.P1.manaPoints = 3;
const loganManaPrompt = applyCommand(loganManaState, { type: 'end-turn', playerId: 'P3' });
assert.equal(loganManaPrompt.ok, true);
if (loganManaPrompt.ok) {
  assert.equal(loganManaPrompt.state.turn, 2, 'A new Round begins when play returns to the first Player.');
  assert.equal(loganManaPrompt.state.phase, 'choosing-mana-mode');
  assert.equal(loganManaPrompt.state.pendingManaChoice, 'P1');
  const minimizedMana = applyCommand(loganManaPrompt.state, { type: 'minimize-mana-choice', playerId: 'P1' });
  assert.equal(minimizedMana.ok, true);
  if (minimizedMana.ok) {
    assert.equal(minimizedMana.state.phase, 'active', 'Minimizing Classic Wizardry exposes the Hand and battlefield.');
    assert.equal(minimizedMana.state.pendingManaChoice, 'P1', 'The Consume decision remains available before Logan acts.');
    const restoredConsume = applyCommand(minimizedMana.state, { type: 'mana-choice', playerId: 'P1', consume: true });
    assert.equal(restoredConsume.ok, true, 'Logan can restore and activate Consume before acting.');
    const usedFreeMovement = applyCommand(minimizedMana.state, { type: 'free-move', playerId: 'P1' });
    assert.equal(usedFreeMovement.ok, true);
    if (usedFreeMovement.ok) assert.equal(applyCommand(usedFreeMovement.state, { type: 'mana-choice', playerId: 'P1', consume: true }).ok, false, 'Free Movement + Draw closes the Consume opportunity.');
    const actionBeforeConsume = structuredClone(minimizedMana.state);
    actionBeforeConsume.players.P1.hand.push({ instanceId: 'consume-window-status', cardId: 'headache' });
    const spentAction = applyCommand(actionBeforeConsume, { type: 'remove-status', playerId: 'P1', cardInstanceId: 'consume-window-status' });
    assert.equal(spentAction.ok, true);
    if (spentAction.ok) assert.equal(applyCommand(spentAction.state, { type: 'mana-choice', playerId: 'P1', consume: true }).ok, false, 'Spending an Action closes the Consume opportunity.');
  }
  const consumeMana = applyCommand(loganManaPrompt.state, { type: 'mana-choice', playerId: 'P1', consume: true });
  assert.equal(consumeMana.ok, true);
  if (consumeMana.ok) {
    assert.equal(consumeMana.state.players.P1.manaPoints, 0);
    assert.equal(consumeMana.state.players.P1.manaMode, 'consume');
    assert.match(consumeMana.state.players.P1.manaConsumeEventId ?? '', /^mana-consume-/, 'Choosing Consume emits an authoritative Arcane beam animation event.');
    assert.equal(consumeMana.state.phase, 'active');
  }
}

const consumeVisualExpiry = createHotseatTestState(false, 'magician', 2, 'dummy');
consumeVisualExpiry.phase = 'active';
consumeVisualExpiry.players.P1.hand = [];
consumeVisualExpiry.players.P1.manaMode = 'consume';
consumeVisualExpiry.players.P1.manaPoints = 0;
consumeVisualExpiry.players.P1.manaConsumeEventId = 'consume-visual-expiry';
const consumeTurnEnd = applyCommand(consumeVisualExpiry, { type: 'end-turn', playerId: 'P1' });
assert.equal(consumeTurnEnd.ok, true);
if (consumeTurnEnd.ok) assert.equal(consumeTurnEnd.state.players.P1.manaMode, 'generate', 'Purple Consume orbs expire when Logan ends his turn.');

const roundCounterState = createHotseatTestState(true);
for (const player of Object.values(roundCounterState.players)) player.hand = [];
const afterFirstMove = applyCommand(roundCounterState, { type: 'end-turn', playerId: 'P1' });
assert.equal(afterFirstMove.ok, true);
if (afterFirstMove.ok) {
  assert.equal(afterFirstMove.state.turn, 1);
  const afterSecondMove = applyCommand(afterFirstMove.state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(afterSecondMove.ok, true);
  if (afterSecondMove.ok) {
    assert.equal(afterSecondMove.state.turn, 1);
    const afterThirdMove = applyCommand(afterSecondMove.state, { type: 'end-turn', playerId: 'P3' });
    assert.equal(afterThirdMove.ok, true);
    if (afterThirdMove.ok) assert.equal(afterThirdMove.state.turn, 2);
  }
}

const blinkDeckSearch = createHotseatTestState(true);
blinkDeckSearch.activePlayerId = 'P2';
blinkDeckSearch.players.P1.position = { x: 1, y: 0 };
blinkDeckSearch.players.P2.position = { x: 2, y: 0 };
blinkDeckSearch.players.P1.manaPoints = 0;
blinkDeckSearch.players.P1.hand = [{ instanceId: 'blink-defense', cardId: 'blink' }];
blinkDeckSearch.players.P1.deck = [
  { instanceId: 'blink-non-status-below', cardId: 'arcane-bolt' },
  { instanceId: 'blink-status-on-top', cardId: 'headache' },
];
blinkDeckSearch.players.P1.discard = [];
blinkDeckSearch.players.P2.hand = [{ instanceId: 'blink-test-attack', cardId: 'attack-2' }];
const blinkAttack = applyCommand(blinkDeckSearch, { type: 'attack', playerId: 'P2', cardInstanceId: 'blink-test-attack', targetId: 'P1' });
assert.equal(blinkAttack.ok, true);
if (blinkAttack.ok) {
  const blinkDefense = applyCommand(blinkAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: 'blink-defense' });
  assert.equal(blinkDefense.ok, true);
  if (blinkDefense.ok) {
    assert.equal(blinkDefense.state.players.P1.hp, 18, 'Blink blocks combat damage.');
    assert.deepEqual(blinkDefense.state.players.P1.deck.map((card) => card.cardId), ['headache'], 'Blink skips a Status Card on top while searching the Deck.');
    assert.equal(blinkDefense.state.players.P1.discard.some((card) => card.cardId === 'arcane-bolt'), true, 'Blink discards the first non-Status Card found below the top Status Card.');
  }
}

const blinkHandChoice = createHotseatTestState(true);
blinkHandChoice.activePlayerId = 'P2';
blinkHandChoice.players.P1.position = { x: 1, y: 0 };
blinkHandChoice.players.P2.position = { x: 2, y: 0 };
blinkHandChoice.players.P1.manaPoints = 0;
blinkHandChoice.players.P1.hand = [
  { instanceId: 'blink-choice-defense', cardId: 'blink' },
  { instanceId: 'blink-choice-one', cardId: 'spellblock' },
  { instanceId: 'blink-choice-two', cardId: 'counterspell' },
];
blinkHandChoice.players.P2.hand = [{ instanceId: 'blink-choice-attack', cardId: 'attack-2' }];
const blinkChoiceAttack = applyCommand(blinkHandChoice, { type: 'attack', playerId: 'P2', cardInstanceId: 'blink-choice-attack', targetId: 'P1' });
assert.equal(blinkChoiceAttack.ok, true);
if (blinkChoiceAttack.ok) {
  const blinkChoiceDefense = applyCommand(blinkChoiceAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: 'blink-choice-defense' });
  assert.equal(blinkChoiceDefense.ok, true);
  if (blinkChoiceDefense.ok) {
    assert.equal(blinkChoiceDefense.state.phase, 'choosing-blink-discard');
    assert.equal(blinkChoiceDefense.state.players.P1.hand.some((card) => card.instanceId === 'blink-choice-one'), true);
    const chosenBlinkDiscard = applyCommand(blinkChoiceDefense.state, { type: 'blink-discard', playerId: 'P1', cardInstanceId: 'blink-choice-two' });
    assert.equal(chosenBlinkDiscard.ok, true);
    if (chosenBlinkDiscard.ok) {
      assert.equal(chosenBlinkDiscard.state.players.P1.hand.some((card) => card.instanceId === 'blink-choice-one'), true);
      assert.equal(chosenBlinkDiscard.state.players.P1.discard.some((card) => card.instanceId === 'blink-choice-two'), true);
    }
  }
}

const defaultLineup = createGameInitialState();
assert.equal(defaultLineup.players.P1.name, 'Da Orkk');
assert.equal(defaultLineup.players.P1.character, 'orkk');
assert.equal(defaultLineup.players.P1.maxHp, 24, 'Da Orkk has 24 maximum Hit Points.');
assert.equal(defaultLineup.players.P1.shieldEquipped, true);
assert.equal(defaultLineup.players.P2.name, 'Obi Wan Shinobi');
assert.equal(defaultLineup.players.P2.character, 'shinobi');
assert.equal(defaultLineup.players.P2.hand.length, 15, 'Obi Wan Shinobi starts Nagrand Arena with all 15 unique Cards.');
assert.equal(defaultLineup.players.P2.deck.length, 0);
assert.deepEqual(defaultLineup.players.P1.position, { x: 1, y: 3 });
assert.deepEqual(defaultLineup.players.P2.position, { x: 8, y: 4 });
assert.equal(defaultLineup.objects.filter((object) => object.kind === 'wall-pillar').length, 8, 'Nagrand Arena starts with eight Wall Object pillars.');
assertNagrandBoxLayout(defaultLineup.objects.filter((object) => object.kind === 'wooden-box').map((object) => cellLabel(object.position)));
assert.deepEqual(Object.keys(defaultLineup.elevations).sort(), ['D4', 'D5', 'E4', 'E5']);
assert.equal(hasLineOfSight(defaultLineup, { x: 1, y: 2 }, { x: 5, y: 2 }), false, 'The C3 pillar blocks direct line of sight.');

const occupiedMovementState = createGameInitialState();
occupiedMovementState.activePlayerId = 'P1';
occupiedMovementState.players.P1.position = { x: 1, y: 1 };
occupiedMovementState.players.P1.movementRemaining = 6;
occupiedMovementState.players.P2.position = { x: 2, y: 1 };
occupiedMovementState.objects = [
  { id: 'movement-column', name: 'Wooden Pillar', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 0 } },
  { id: 'movement-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 2 } },
];
const movementAroundOccupiedSquares = applyCommand(occupiedMovementState, { type: 'move', playerId: 'P1', to: { x: 3, y: 1 } });
const occupiedRoute = movementPath(occupiedMovementState, occupiedMovementState.players.P1, { x: 3, y: 1 });
assert.equal(occupiedRoute.some((cell) => cell.x === 2 && cell.y === 0), false, 'The walking route never enters a Column-occupied Square.');
assert.equal(occupiedRoute.some((cell) => cell.x === 2 && cell.y === 1), false, 'The walking route never enters another character occupied Square.');
assert.equal(occupiedRoute.some((cell) => cell.x === 2 && cell.y === 2), false, 'The walking route never enters an ordinary Object occupied Square.');
assert.equal(movementAroundOccupiedSquares.ok, true, 'Normal movement can route around occupied Squares when enough movement remains.');
if (movementAroundOccupiedSquares.ok) {
  assert.equal(movementAroundOccupiedSquares.state.players.P1.movementRemaining, 2, 'Open diagonal corners shorten the valid route without entering occupied Squares.');
}

const shortestMovementState = createGameInitialState();
shortestMovementState.players.P1.position = { x: 2, y: 2 };
shortestMovementState.players.P2.position = { x: 8, y: 7 };
shortestMovementState.objects = [];
const diagonalStepCount = (origin: { x: number; y: number }, path: { x: number; y: number }[]) => path.reduce(
  (count, cell, index) => count + Number(cell.x !== (index === 0 ? origin.x : path[index - 1].x) && cell.y !== (index === 0 ? origin.y : path[index - 1].y)),
  0,
);
const straightShortestRoute = movementPath(shortestMovementState, shortestMovementState.players.P1, { x: 2, y: 0 });
assert.deepEqual(straightShortestRoute, [{ x: 2, y: 1 }, { x: 2, y: 0 }], 'Among equal two-step routes, movement chooses the straight route with no diagonal steps.');
const offsetShortestRoute = movementPath(shortestMovementState, shortestMovementState.players.P1, { x: 3, y: 0 });
assert.equal(offsetShortestRoute.length, 2, 'An offset destination still uses the minimum number of movement steps.');
assert.equal(diagonalStepCount(shortestMovementState.players.P1.position, offsetShortestRoute), 1, 'Equivalent shortest offset routes may differ, but use the same minimum diagonal count.');
const diagonalShortestRoute = movementPath(shortestMovementState, shortestMovementState.players.P1, { x: 4, y: 0 });
assert.equal(diagonalShortestRoute.length, 2, 'A fully diagonal destination remains reachable in two movement steps.');
assert.equal(diagonalStepCount(shortestMovementState.players.P1.position, diagonalShortestRoute), 2, 'Diagonal steps remain valid when every minimum-length route requires them.');

const shortestShieldRecallState = createGameInitialState();
shortestShieldRecallState.players.P1.position = { x: 4, y: 5 };
shortestShieldRecallState.players.P2.position = { x: 8, y: 7 };
shortestShieldRecallState.objects = [
  { id: 'shortest-route-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 4, y: 1 } },
  { id: 'shortest-route-blocker', name: 'Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 4, y: 2 } },
];
const shortestRouteShield = shortestShieldRecallState.objects[0];
const shortestShieldRoute = armDaWizPath(shortestShieldRecallState, shortestRouteShield, shortestShieldRecallState.players.P1.position, 16);
assert.equal(shortestShieldRoute.length, 4, 'Shield Recall minimizes movement steps before considering any tie-breaker.');
assert.equal(diagonalStepCount(shortestRouteShield.position, shortestShieldRoute), 2, 'Among equal-length Shield Recall routes, the route with fewer diagonal steps wins.');

const blockedMovementState = createGameInitialState();
blockedMovementState.activePlayerId = 'P1';
blockedMovementState.players.P1.position = { x: 1, y: 1 };
blockedMovementState.players.P1.movementRemaining = 3;
blockedMovementState.players.P2.position = { x: 2, y: 1 };
blockedMovementState.objects = [
  { id: 'blocking-column', name: 'Wooden Pillar', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 0 } },
  { id: 'blocking-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 2 } },
];
assert.equal(applyCommand(blockedMovementState, { type: 'move', playerId: 'P1', to: { x: 3, y: 1 } }).ok, false, 'Characters cannot move through Columns, Objects, or other characters without an explicit effect.');

const diagonalObjectMovementState = createGameInitialState();
diagonalObjectMovementState.players.P1.position = { x: 1, y: 1 };
diagonalObjectMovementState.players.P1.movementRemaining = 1;
diagonalObjectMovementState.players.P2.position = { x: 8, y: 7 };
diagonalObjectMovementState.objects = [{ id: 'diagonal-blocking-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 1 } }];
const diagonalRouteAroundObject = movementPath(diagonalObjectMovementState, diagonalObjectMovementState.players.P1, { x: 2, y: 2 });
assert.equal(diagonalRouteAroundObject.length, 1, 'A lone Object beside a diagonal does not close the corner.');
assert.equal(applyCommand(diagonalObjectMovementState, { type: 'move', playerId: 'P1', to: { x: 2, y: 2 } }).ok, true, 'One MOV may pass diagonally when the Object has nothing attached across that corner.');

const diagonalColumnMovementState = structuredClone(diagonalObjectMovementState);
diagonalColumnMovementState.objects[0] = { id: 'diagonal-blocking-column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 1 } };
diagonalColumnMovementState.players.P2.position = { x: 1, y: 2 };
assert.equal(applyCommand(diagonalColumnMovementState, { type: 'move', playerId: 'P1', to: { x: 2, y: 2 } }).ok, false, 'An Object and another entity on both sides of a diagonal close that corner in every Arena.');

const spiritStepwiseRefundState = createGameInitialState();
spiritStepwiseRefundState.objects = [{ id: 'spirit-diagonal-object', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 3 } }];
spiritStepwiseRefundState.players.P1.character = 'john-christ';
spiritStepwiseRefundState.players.P1.spiritForm = true;
spiritStepwiseRefundState.players.P1.position = { x: 2, y: 2 };
spiritStepwiseRefundState.players.P1.movementRemaining = 1;
spiritStepwiseRefundState.players.P2.position = { x: 8, y: 7 };
assert.equal(applyCommand(spiritStepwiseRefundState, { type: 'move', playerId: 'P1', to: { x: 4, y: 4 } }).ok, false, 'Spirit Form cannot borrow an intermediate occupied-Square refund to move beyond its current 1-Square radius.');
const spiritEnteredObject = applyCommand(spiritStepwiseRefundState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } });
assert.equal(spiritEnteredObject.ok, true);
if (spiritEnteredObject.ok) {
  assert.equal(spiritEnteredObject.state.players.P1.movementRemaining, 1, 'Entering the adjacent occupied Square spends 1 MOV and then refunds it.');
  const spiritContinuedAfterRefund = applyCommand(spiritEnteredObject.state, { type: 'move', playerId: 'P1', to: { x: 4, y: 4 } });
  assert.equal(spiritContinuedAfterRefund.ok, true, 'The earned refund becomes available for a separate subsequent diagonal step.');
  if (spiritContinuedAfterRefund.ok) assert.equal(spiritContinuedAfterRefund.state.players.P1.movementRemaining, 0);
}

const wallLineOfSightState = createGameInitialState();
wallLineOfSightState.objects = [{ id: 'los-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 3, y: 2 } }];
assert.equal(hasLineOfSight(wallLineOfSightState, { x: 1, y: 2 }, { x: 5, y: 2 }), false, 'A Shield Wall Object blocks line of sight like a Column.');
wallLineOfSightState.objects = [{ id: 'los-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 2 } }];
assert.equal(hasLineOfSight(wallLineOfSightState, { x: 1, y: 2 }, { x: 5, y: 2 }), true, 'An ordinary Object does not block line of sight.');

const homeDefenseState = createGameInitialState();
homeDefenseState.activePlayerId = 'P2';
homeDefenseState.players.P1.position = { x: 1, y: 3 };
homeDefenseState.players.P2.position = { x: 2, y: 3 };
homeDefenseState.players.P1.hand = [{ instanceId: 'home-defense', cardId: 'da-blokk' }];
homeDefenseState.players.P2.hand = [{ instanceId: 'home-attack', cardId: 'attack-3' }];
const homeAttack = applyCommand(homeDefenseState, { type: 'attack', playerId: 'P2', cardInstanceId: 'home-attack', targetId: 'P1' });
assert.equal(homeAttack.ok, true);
if (homeAttack.ok) {
  const homeDefense = applyCommand(homeAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: 'home-defense' });
  assert.equal(homeDefense.ok, true);
  if (homeDefense.ok) {
    assert.equal(homeDefense.state.combatReveal?.defendTotal, 3, 'A4 grants its owner +1 Defend Value in addition to Da Orkk\'s equipped Shield.');
    assert.deepEqual(homeDefense.state.combatReveal?.defendModifiers, [{ value: 1, source: 'equipped Shield' }, { value: 1, source: 'own Base' }], 'The after-combat screen receives a separate source line for each Defend modifier.');
    assert.equal(homeDefense.state.combatReveal?.combatWinnerId, 'P1', 'A tied combat is won by the defending Player.');
    assert.equal(homeDefense.state.combatReveal?.combatDamage, 0, 'The after-combat result reports actual resulting combat Damage.');
  }
}

const highGroundAttackState = createGameInitialState();
highGroundAttackState.activePlayerId = 'P2';
highGroundAttackState.players.P2.position = { x: 4, y: 3 };
highGroundAttackState.players.P1.position = { x: 3, y: 3 };
highGroundAttackState.players.P2.hand = [{ instanceId: 'high-attack', cardId: 'attack-2' }];
const highGroundAttack = applyCommand(highGroundAttackState, { type: 'attack', playerId: 'P2', cardInstanceId: 'high-attack', targetId: 'P1' });
assert.equal(highGroundAttack.ok, true);
if (highGroundAttack.ok) {
  assert.equal(highGroundAttack.state.pendingAttack?.attackValue, 3, 'High Ground attacking Low Ground grants +1 Attack Value.');
  assert.deepEqual(highGroundAttack.state.pendingAttack?.attackModifiers, [{ value: 1, source: 'High Ground advantage' }], 'Attack modifier sources are retained for the after-combat explanation.');
}

const protectedState = createGameInitialState();
protectedState.activePlayerId = 'P2';
protectedState.players.P2.position = { x: 5, y: 3 };
protectedState.players.P1.position = { x: 3, y: 3 };
protectedState.players.P2.attackRange = 2;
protectedState.players.P2.hand = [{ instanceId: 'protected-attack', cardId: 'attack-2' }];
const protectedAttack = applyCommand(protectedState, { type: 'attack', playerId: 'P2', cardInstanceId: 'protected-attack', targetId: 'P1' });
assert.equal(protectedAttack.ok, false, 'A non-adjacent High Ground attacker cannot attack a Highground Protection Square.');

const rangedHighGroundState = createGameInitialState();
rangedHighGroundState.activePlayerId = 'P2';
rangedHighGroundState.players.P2.position = { x: 4, y: 3 };
rangedHighGroundState.players.P2.attackRange = 2;
rangedHighGroundState.players.P1.position = { x: 1, y: 3 };
rangedHighGroundState.players.P2.hand = [{ instanceId: 'ranged-high-attack', cardId: 'attack-2' }];
const rangedHighGroundAttack = applyCommand(rangedHighGroundState, { type: 'attack', playerId: 'P2', cardInstanceId: 'ranged-high-attack', targetId: 'P1' });
assert.equal(rangedHighGroundAttack.ok, false, 'A ranged character on High Ground receives no Attack Range bonus.');

const rangedHighGroundValueState = createGameInitialState();
rangedHighGroundValueState.activePlayerId = 'P2';
rangedHighGroundValueState.players.P2.position = { x: 4, y: 3 };
rangedHighGroundValueState.players.P2.attackRange = 2;
rangedHighGroundValueState.players.P1.position = { x: 3, y: 3 };
rangedHighGroundValueState.players.P2.hand = [{ instanceId: 'ranged-high-value', cardId: 'attack-2' }];
const rangedHighGroundValueAttack = applyCommand(rangedHighGroundValueState, { type: 'attack', playerId: 'P2', cardInstanceId: 'ranged-high-value', targetId: 'P1' });
assert.equal(rangedHighGroundValueAttack.ok, true);
if (rangedHighGroundValueAttack.ok) {
  assert.equal(rangedHighGroundValueAttack.state.pendingAttack?.attackValue, 3, 'A ranged character receives the same +1 High Ground Attack Value bonus.');
  assert.deepEqual(rangedHighGroundValueAttack.state.pendingAttack?.attackModifiers, [{ value: 1, source: 'High Ground advantage' }]);
}

const meleeHighGroundRangeState = createGameInitialState();
meleeHighGroundRangeState.activePlayerId = 'P2';
meleeHighGroundRangeState.players.P2.position = { x: 4, y: 3 };
meleeHighGroundRangeState.players.P2.attackRange = 1;
meleeHighGroundRangeState.players.P1.position = { x: 2, y: 3 };
meleeHighGroundRangeState.players.P2.hand = [{ instanceId: 'melee-high-range', cardId: 'attack-2' }];
const meleeHighGroundRangeAttack = applyCommand(meleeHighGroundRangeState, { type: 'attack', playerId: 'P2', cardInstanceId: 'melee-high-range', targetId: 'P1' });
assert.equal(meleeHighGroundRangeAttack.ok, false, 'A melee character on High Ground does not gain Attack Range.');

const bonusDrawState = createGameInitialState();
bonusDrawState.players.P1.hand = [];
bonusDrawState.players.P2.position = { x: 4, y: 0 };
bonusDrawState.players.P2.hand = [];
bonusDrawState.players.P2.deck = [{ instanceId: 'nagrand-bonus-draw', cardId: 'light-the-saber' }];
const bonusDrawTurn = applyCommand(bonusDrawState, { type: 'end-turn', playerId: 'P1' });
assert.equal(bonusDrawTurn.ok, true);
if (bonusDrawTurn.ok) assert.equal(bonusDrawTurn.state.players.P2.hand.some((card) => card.instanceId === 'nagrand-bonus-draw'), true, 'Starting a turn on D1 draws one additional Card.');
assert.equal(defaultLineup.players.P1.hand.length, 15, 'Da Orkk starts the test game with all currently created unique Cards.');
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'encourage'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'kyk'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'arkane-arow'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'arm-da-wiz'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'consume-rage'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'fistbolt'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'chain-punchin'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'teef-strike'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'shield-bash'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'chip-cast'), false, 'Chip-cast is temporarily disabled in Da Orkk card pools.');
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'knee-blast'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'da-blokk'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'double'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'arcane-shield'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'countaspell'), true);
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'mana-baryer'), true);
assert.deepEqual(
  defaultLineup.players.P1.hand.filter((card) => ['da-blokk', 'double', 'arcane-shield', 'countaspell', 'mana-baryer'].includes(card.cardId)).map((card) => card.cardId),
  ['da-blokk', 'double', 'arcane-shield', 'countaspell', 'mana-baryer'],
  'Da Orkk starts the test game with all five created Defend Cards.',
);
assert.equal(defaultLineup.players.P1.deck.length, 0);

const boxTeleportState = createGameInitialState();
boxTeleportState.objects = [{ id: 'wooden-box-a4', name: 'Wooden Box', hp: 3, maxHp: 3, position: { x: 4, y: 0 } }];
const teleportedBox = applyCommand(boxTeleportState, { type: 'debug-teleport-object', playerId: 'P1', objectId: 'wooden-box-a4', to: { x: 2, y: 1 } });
assert.equal(teleportedBox.ok, true);
if (teleportedBox.ok) {
  assert.deepEqual(teleportedBox.state.objects.find((object) => object.id === 'wooden-box-a4')?.position, { x: 2, y: 1 });
  assert.equal(teleportedBox.state.objectPushAnimations.some((event) => event.objectId === 'wooden-box-a4' && event.teleport), true);
}
const occupiedBoxTeleport = applyCommand(boxTeleportState, { type: 'debug-teleport-object', playerId: 'P1', objectId: 'wooden-box-a4', to: boxTeleportState.players.P2.position });
assert.equal(occupiedBoxTeleport.ok, false, 'The test Box cannot teleport onto a character.');

const encourageOne = createGameInitialState();
encourageOne.players.P1.deck = [{ instanceId: 'encourage-deck-draw', cardId: 'attack-2' }];
const encourageCard = encourageOne.players.P1.hand.find((card) => card.cardId === 'encourage')!;
assert.deepEqual(
  orkkActionEventForCommand(encourageOne, { type: 'play-perk', playerId: 'P1', cardInstanceId: encourageCard.instanceId, destination: 'direct' }),
  { playerId: 'P1', action: 'perk-used', cardId: 'encourage' },
  'An accepted online Encourage command produces a semantic Orkk action event without exposing an animation name.',
);
assert.deepEqual(
  orkkActionEventForCommand(encourageOne, { type: 'arkane-arow-target', playerId: 'P1', to: { x: 4, y: 3 } }),
  { playerId: 'P1', action: 'shield-thrown', target: { x: 4, y: 3 } },
  'An accepted online Arcane Throw command produces a semantic Shield action event for every client.',
);
const playedEncourage = applyCommand(encourageOne, { type: 'play-perk', playerId: 'P1', cardInstanceId: encourageCard.instanceId, destination: 'direct' });
assert.equal(playedEncourage.ok, true);
if (playedEncourage.ok) assert.equal(playedEncourage.state.players.P1.hand.some((card) => card.instanceId === 'encourage-deck-draw'), true, 'EncouRAGE level 1 draws from Deck.');

const encourageThree = createGameInitialState();
encourageThree.players.P1.hand = [];
encourageThree.players.P1.deck = [{ instanceId: 'encourage-three-deck', cardId: 'attack-2' }];
encourageThree.players.P1.discard = [{ instanceId: 'encourage-three-discard', cardId: 'defend-1' }];
encourageThree.players.P1.spellEcho[2] = { instanceId: 'encourage-three', cardId: 'encourage' };
const resolvedEncourageThree = applyCommand(encourageThree, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(resolvedEncourageThree.ok, true);
if (resolvedEncourageThree.ok) {
  assert.equal(resolvedEncourageThree.state.players.P1.rageStacks, 1);
  assert.equal(resolvedEncourageThree.state.players.P1.hand.some((card) => card.instanceId === 'encourage-three-deck'), true);
  assert.equal(resolvedEncourageThree.state.players.P1.hand.some((card) => card.instanceId === 'encourage-three-discard'), true);
  assert.equal(resolvedEncourageThree.state.players.P1.discard.length, 0);
}

const consumeOne = createGameInitialState();
consumeOne.players.P1.hp = 23;
consumeOne.players.P1.rageStacks = 3;
const consumeCard = consumeOne.players.P1.hand.find((card) => card.cardId === 'consume-rage')!;
const consumedOne = applyCommand(consumeOne, { type: 'play-perk', playerId: 'P1', cardInstanceId: consumeCard.instanceId, destination: 'direct' });
assert.equal(consumedOne.ok, true);
if (consumedOne.ok) {
  assert.equal(consumedOne.state.players.P1.hp, 24, 'Consume Rage level 1 heals 1 HP.');
  assert.equal(consumedOne.state.players.P1.rageStacks, 2, 'Consume Rage level 1 consumes 1 Rage.');
  assert.deepEqual((consumedOne.state as any).damageLog?.at(-1), { eventType: 'healing', turn: 1, targetId: 'P1', sourceId: 'P1', sourceKind: 'perk', amount: 1, hpAfter: 24, collision: false }, 'Restored HP is recorded as a distinct healing entry in the Damage Log.');
  assert.equal(consumedOne.state.objectPushAnimations.some((event) => event.healing?.playerId === 'P1' && event.healing.amount === 1), true, 'Consume Rage emits a +1 healing visual event.');
}

const consumeTwo = createGameInitialState();
consumeTwo.players.P1.hp = 22;
consumeTwo.players.P1.rageStacks = 2;
consumeTwo.players.P1.hand = [];
consumeTwo.players.P1.spellEcho[1] = { instanceId: 'consume-two', cardId: 'consume-rage' };
const consumedTwo = applyCommand(consumeTwo, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(consumedTwo.ok, true);
if (consumedTwo.ok) {
  assert.equal(consumedTwo.state.players.P1.hp, 24, 'Consume Rage level 2 heals 2 HP total.');
  assert.equal(consumedTwo.state.players.P1.rageStacks, 1, 'Consume Rage level 2 consumes 1 Rage.');
  assert.equal(consumedTwo.state.objectPushAnimations.some((event) => event.healing?.playerId === 'P1' && event.healing.amount === 2), true, 'Consume Rage emits a +2 healing visual event.');
}

const consumeInsufficient = createGameInitialState();
consumeInsufficient.players.P1.hp = 22;
consumeInsufficient.players.P1.rageStacks = 0;
const insufficientCard = consumeInsufficient.players.P1.hand.find((card) => card.cardId === 'consume-rage')!;
const consumedInsufficient = applyCommand(consumeInsufficient, { type: 'play-perk', playerId: 'P1', cardInstanceId: insufficientCard.instanceId, destination: 'direct' });
assert.equal(consumedInsufficient.ok, true, 'Consume Rage may still be cast without enough Rage.');
if (consumedInsufficient.ok) {
  assert.equal(consumedInsufficient.state.players.P1.hp, 22, 'Insufficient Rage provides no healing.');
  assert.equal(consumedInsufficient.state.players.P1.rageStacks, 0, 'Insufficient Rage is not consumed.');
  assert.equal(consumedInsufficient.state.objectPushAnimations.some((event) => event.healing), false, 'Failed Consume Rage emits no healing visual.');
  assert.equal(consumedInsufficient.state.players.P1.discard.some((card) => card.cardId === 'consume-rage'), true, 'The cast Perk is still discarded normally.');
}

const consumeThree = createGameInitialState();
consumeThree.players.P1.hp = 22;
consumeThree.players.P1.rageStacks = 2;
consumeThree.players.P1.position = { x: 2, y: 1 };
consumeThree.players.P2.position = { x: 3, y: 2 };
consumeThree.players.P1.hand = [
  { instanceId: 'consume-three-pinned', cardId: 'pinned', revealedToOpponent: true },
  { instanceId: 'consume-three-headache', cardId: 'headache', revealedToOpponent: true },
  { instanceId: 'consume-three-exhaust', cardId: 'exhaust', revealedToOpponent: true },
  { instanceId: 'consume-three-burning', cardId: 'burning', revealedToOpponent: true },
  { instanceId: 'consume-three-banner', cardId: 'banner', revealedToOpponent: true },
];
consumeThree.players.P1.pinnedStacks = 1;
consumeThree.players.P1.spellEcho[2] = { instanceId: 'consume-three', cardId: 'consume-rage' };
const consumedThree = applyCommand(consumeThree, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(consumedThree.ok, true);
if (consumedThree.ok) {
  assert.equal(consumedThree.state.players.P1.hp, 24, 'Consume Rage level 3 includes the level 2 +1 HP bonus.');
  assert.equal(consumedThree.state.players.P1.rageStacks, 1, 'Consume Rage level 3 consumes 1 Rage.');
  assert.equal(consumedThree.state.players.P2.hand.some((card) => card.cardId === 'exhaust'), true, 'Consume Rage level 3 adds Exhaust to adjacent enemies.');
  assert.equal(consumedThree.state.players.P1.hand.some((card) => ['pinned', 'headache', 'exhaust', 'burning'].includes(card.cardId)), false, 'Consume Rage level 3 removes every negative Status Card, including Burning.');
  assert.equal(consumedThree.state.players.P1.pinnedStacks, 0);
  assert.equal(consumedThree.state.players.P1.hand.some((card) => card.cardId === 'banner'), true, 'Consume Rage level 3 preserves positive Status Cards.');
}

const exhaustCombat = createGameInitialState();
exhaustCombat.players.P1.position = { x: 2, y: 1 };
exhaustCombat.players.P2.position = { x: 3, y: 1 };
exhaustCombat.players.P1.hand = [{ instanceId: 'exhaust-attack', cardId: 'attack-3' }, { instanceId: 'attacker-exhaust', cardId: 'exhaust', revealedToOpponent: true }];
exhaustCombat.players.P2.hand = [{ instanceId: 'exhaust-defend', cardId: 'defend-1' }];
const exhaustAttack = applyCommand(exhaustCombat, { type: 'attack', playerId: 'P1', cardInstanceId: 'exhaust-attack', targetId: 'P2' });
assert.equal(exhaustAttack.ok, true);
if (exhaustAttack.ok) {
  assert.equal(exhaustAttack.state.pendingAttack?.attackValue, 2, 'Exhaust in Hand passively gives an Attack Card -1 Value.');
  const chooseDefense = applyCommand(exhaustAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'exhaust-defend' });
  assert.equal(chooseDefense.ok, true);
  if (chooseDefense.ok) {
    assert.equal(chooseDefense.state.phase, 'choosing-exhaust');
    const attached = applyCommand(chooseDefense.state, { type: 'exhaust-decision', playerId: 'P1', use: true });
    assert.equal(attached.ok, true);
    if (attached.ok) {
      assert.equal(attached.state.players.P1.hand.some((card) => card.cardId === 'exhaust'), false, 'Attached Exhaust is Removed rather than discarded.');
      assert.equal(attached.state.players.P2.hp, 20, 'Attaching Exhaust changes the played Attack from -1 to -3 Value before resolution.');
    }
  }
}

assert.equal(kykDirectionAllowed({ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }), true);
assert.equal(kykDirectionAllowed({ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 }), false, 'A cardinally adjacent Object cannot be pushed back through Da Orkk.');
assert.equal(kykDirectionAllowed({ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 3 }), true, 'A diagonally adjacent Object can be pushed diagonally outward.');
assert.equal(kykDirectionAllowed({ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }), false, 'A diagonal Object has only its one outward direction.');

const kykOne = createGameInitialState();
kykOne.players.P1.position = { x: 1, y: 1 };
kykOne.players.P2.position = { x: 4, y: 1 };
kykOne.objects = [{ id: 'kyk-box', name: 'Wooden Box', hp: 3, maxHp: 3, position: { x: 2, y: 1 } }];
const kykCard = kykOne.players.P1.hand.find((card) => card.cardId === 'kyk')!;
const beginKyk = applyCommand(kykOne, { type: 'play-perk', playerId: 'P1', cardInstanceId: kykCard.instanceId, destination: 'direct' });
assert.equal(beginKyk.ok, true);
if (beginKyk.ok) {
  const targetKyk = applyCommand(beginKyk.state, { type: 'kyk-target', playerId: 'P1', objectId: 'kyk-box' });
  assert.equal(targetKyk.ok, true);
  if (targetKyk.ok) {
    const resolveKyk = applyCommand(targetKyk.state, { type: 'kyk-direction', playerId: 'P1', to: { x: 4, y: 1 } });
    assert.equal(resolveKyk.ok, true);
    if (resolveKyk.ok) {
      assert.equal(resolveKyk.state.players.P2.hp, 19);
      assert.deepEqual(resolveKyk.state.objects.find((object) => object.id === 'kyk-box')?.position, { x: 3, y: 1 });
    }
  }
}

const kykThree = createGameInitialState();
kykThree.players.P1.position = { x: 1, y: 1 };
kykThree.players.P2.position = { x: 4, y: 1 };
kykThree.players.P1.hand = [];
kykThree.players.P1.spellEcho[2] = { instanceId: 'kyk-three', cardId: 'kyk' };
kykThree.objects = [{ id: 'kyk-three-box', name: 'Wooden Box', hp: 3, maxHp: 3, position: { x: 2, y: 1 } }];
const beginKykThree = applyCommand(kykThree, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(beginKykThree.ok, true);
if (beginKykThree.ok) {
  const targetKykThree = applyCommand(beginKykThree.state, { type: 'kyk-target', playerId: 'P1', objectId: 'kyk-three-box' });
  assert.equal(targetKykThree.ok, true);
  if (targetKykThree.ok) {
    const resolveKykThree = applyCommand(targetKykThree.state, { type: 'kyk-direction', playerId: 'P1', to: { x: 4, y: 1 } });
    assert.equal(resolveKykThree.ok, true);
    if (resolveKykThree.ok) {
      assert.equal(resolveKykThree.state.players.P2.hp, 17);
      assert.equal(resolveKykThree.state.objects.some((object) => object.id === 'kyk-three-box'), false);
      assert.equal(resolveKykThree.state.objectPushAnimations.some((event) => event.objectId === 'kyk-three-box' && event.removeOnComplete), true);
    }
  }
}

const directShieldLine = createGameInitialState();
directShieldLine.players.P1.position = { x: 4, y: 3 };
directShieldLine.players.P2.position = { x: 4, y: 1 };
directShieldLine.objects = [];
const directShieldCard = directShieldLine.players.P1.hand.find((card) => card.cardId === 'arkane-arow')!;
const beginDirectShield = applyCommand(directShieldLine, { type: 'play-perk', playerId: 'P1', cardInstanceId: directShieldCard.instanceId, destination: 'direct' });
assert.equal(beginDirectShield.ok, true);
if (beginDirectShield.ok) {
  const resolveDirectShield = applyCommand(beginDirectShield.state, { type: 'arkane-arow-target', playerId: 'P1', to: { x: 4, y: 1 } });
  assert.equal(resolveDirectShield.ok, true);
  if (resolveDirectShield.ok) {
    assert.deepEqual(resolveDirectShield.state.objects.find((object) => object.kind === 'orkk-shield')?.position, { x: 4, y: 2 }, 'A D4-to-B4 throw collides at B4 and stops directly behind it at C4.');
    assert.equal(resolveDirectShield.state.objectPushAnimations.some((event) => event.damage?.playerId === 'P2' && event.damage.collision && event.damage.amount === 1), true, 'High Ground no longer increases direct Perk or Object collision Damage.');
    const collisionAnimation = resolveDirectShield.state.objectPushAnimations.find((event) => event.id.includes('-arkane-arow-'))!;
    assert.deepEqual(collisionAnimation.collisionAt, { x: 4, y: 1 }, 'The Shield animation records the actual collision Square separately from its landing Square.');
    assert.equal(collisionAnimation.collisionTargetKind, 'player');
    assert.equal(collisionAnimation.collisionTargetId, 'P2');
    assert.equal(resolveDirectShield.state.objectPushAnimations.some((event) => event.damage?.triggerAnimationId === collisionAnimation.id), true, 'Collision Damage waits for the matching Shield impact animation.');
  }
}

const shieldPassThroughPlayer = createGameInitialState();
shieldPassThroughPlayer.players.P1.position = { x: 1, y: 3 };
shieldPassThroughPlayer.players.P2.position = { x: 3, y: 3 };
shieldPassThroughPlayer.objects = [];
const passThroughShieldCard = shieldPassThroughPlayer.players.P1.hand.find((card) => card.cardId === 'arkane-arow')!;
const beginPassThroughShield = applyCommand(shieldPassThroughPlayer, { type: 'play-perk', playerId: 'P1', cardInstanceId: passThroughShieldCard.instanceId, destination: 'direct' });
assert.equal(beginPassThroughShield.ok, true);
if (beginPassThroughShield.ok) {
  const resolvePassThroughShield = applyCommand(beginPassThroughShield.state, { type: 'arkane-arow-target', playerId: 'P1', to: { x: 4, y: 3 } });
  assert.equal(resolvePassThroughShield.ok, true);
  if (resolvePassThroughShield.ok) {
    assert.equal(resolvePassThroughShield.state.players.P2.hp, 19, 'A Shield crossing a Player-occupied Square collides and deals the card\'s Level 1 damage.');
    const landedShield = resolvePassThroughShield.state.objects.find((object) => object.kind === 'orkk-shield')!;
    assert.deepEqual(landedShield.position, { x: 2, y: 3 }, 'The Shield stops adjacent to the Player it collided with instead of continuing to the selected Square.');
    assert.equal(distance(landedShield.position, resolvePassThroughShield.state.players.P2.position), 1);
  }
}

const arkaneLevelTwoDamage = createGameInitialState();
arkaneLevelTwoDamage.players.P1.position = { x: 1, y: 3 };
arkaneLevelTwoDamage.players.P2.position = { x: 3, y: 3 };
arkaneLevelTwoDamage.players.P1.hand = [];
arkaneLevelTwoDamage.players.P1.spellEcho[1] = { instanceId: 'arkane-level-two-damage', cardId: 'arkane-arow' };
arkaneLevelTwoDamage.objects = [];
const beginArkaneLevelTwoDamage = applyCommand(arkaneLevelTwoDamage, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(beginArkaneLevelTwoDamage.ok, true);
if (beginArkaneLevelTwoDamage.ok) {
  assert.equal(beginArkaneLevelTwoDamage.state.arkaneArow?.range, 4, 'ARKANE AROW Level 2 increases throw Range to 4.');
  const resolveArkaneLevelTwoDamage = applyCommand(beginArkaneLevelTwoDamage.state, { type: 'arkane-arow-target', playerId: 'P1', to: { x: 5, y: 3 } });
  assert.equal(resolveArkaneLevelTwoDamage.ok, true);
  if (resolveArkaneLevelTwoDamage.ok) {
    assert.equal(resolveArkaneLevelTwoDamage.state.players.P2.hp, 18, 'ARKANE AROW Level 2 deals 2 collision Damage.');
  }
}

const directArmRecall = createGameInitialState();
directArmRecall.players.P1.position = { x: 4, y: 3 };
directArmRecall.players.P2.position = { x: 4, y: 2 };
directArmRecall.players.P1.shieldEquipped = false;
directArmRecall.players.P1.hand = [];
directArmRecall.players.P1.spellEcho[2] = { instanceId: 'direct-arm-three', cardId: 'arm-da-wiz' };
directArmRecall.objects = [{ id: 'direct-recall-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 4, y: 0 } }];
const beginDirectRecall = applyCommand(directArmRecall, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(beginDirectRecall.ok, true);
if (beginDirectRecall.ok) {
  const chooseDirectRecall = applyCommand(beginDirectRecall.state, { type: 'arm-da-wiz-choice', playerId: 'P1', choice: 'recall' });
  assert.equal(chooseDirectRecall.ok, true);
  if (chooseDirectRecall.ok) {
    const resolveDirectRecall = applyCommand(chooseDirectRecall.state, { type: 'arm-da-wiz-target', playerId: 'P1', objectId: 'direct-recall-shield' });
    assert.equal(resolveDirectRecall.ok, true);
    if (resolveDirectRecall.ok) {
      assert.equal(resolveDirectRecall.state.players.P1.shieldEquipped, true, 'Arm da Wiz authoritatively equips the recalled Shield on Da Orkk.');
      assert.equal(resolveDirectRecall.state.objects.some((object) => object.kind === 'orkk-shield' && object.ownerId === 'P1'), false, 'An equipped recalled Shield no longer remains as a Board Object.');
      assert.equal(resolveDirectRecall.state.players.P2.hp, 19, 'Level 3 keeps the Level 2 collision Damage without the former adjacent Damage.');
      assert.equal(resolveDirectRecall.state.players.P1.rageStacks, 3, 'Level 3 gains 1 base Rage plus 2 Rage for the crossed enemy.');
      assert.deepEqual(resolveDirectRecall.state.players.P2.position, { x: 4, y: 2 }, 'Arm da Wiz no longer moves an enemy passed through by the Shield.');
      assert.equal(distance(resolveDirectRecall.state.players.P2.position, directArmRecall.players.P2.position), 0, 'The enemy remains on its original Square.');
      assert.equal(distance(resolveDirectRecall.state.players.P2.position, resolveDirectRecall.state.players.P1.position), 1);
    }
  }
}

function ensureCardInHand(state: ReturnType<typeof createInitialState>, playerId: 'P1' | 'P2', cardId: CardTypeId) {
  const player = state.players[playerId];
  const existing = player.hand.find((card) => card.cardId === cardId);
  if (existing) return existing;
  const index = player.deck.findIndex((card) => card.cardId === cardId);
  const [card] = player.deck.splice(index, 1);
  player.hand.push(card);
  return card;
}

const fistboltState = createGameInitialState();
fistboltState.players.P1.position = { x: 2, y: 1 };
fistboltState.players.P2.position = { x: 3, y: 1 };
fistboltState.players.P2.hand = [];
const fistboltCard = ensureCardInHand(fistboltState, 'P1', 'fistbolt');
const fistboltAttack = applyCommand(fistboltState, { type: 'attack', playerId: 'P1', cardInstanceId: fistboltCard.instanceId, targetId: 'P2' });
assert.equal(fistboltAttack.ok, true);
if (fistboltAttack.ok) {
  assert.equal(fistboltAttack.state.pendingAttack?.attackValue, 3, 'Fistbolt generates 1 Rage for +1 Attack Value when Orkk had none.');
  assert.equal(fistboltAttack.state.players.P1.rageStacks, 1, 'The full Rage total remains available until combat resolves.');
  const fistboltCombat = applyCommand(fistboltAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(fistboltCombat.ok, true);
  if (fistboltCombat.ok) assert.equal(fistboltCombat.state.players.P1.rageStacks, 1, 'Fistbolt generates 1 Rage after the combat Rage cost resolves.');
}

const chainShielded = createGameInitialState();
chainShielded.players.P1.position = { x: 2, y: 1 };
chainShielded.players.P2.position = { x: 3, y: 1 };
chainShielded.players.P2.hand = [];
const shieldedChainCard = ensureCardInHand(chainShielded, 'P1', 'chain-punchin');
const shieldedChainAttack = applyCommand(chainShielded, { type: 'attack', playerId: 'P1', cardInstanceId: shieldedChainCard.instanceId, targetId: 'P2' });
assert.equal(shieldedChainAttack.ok, true);
if (shieldedChainAttack.ok) {
  const shieldedChainResult = applyCommand(shieldedChainAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(shieldedChainResult.ok, true);
  if (shieldedChainResult.ok) {
    assert.equal(shieldedChainResult.state.players.P1.shieldEquipped, false, 'Chain Punchin drops an equipped Shield after combat.');
    assert.equal(shieldedChainResult.state.objects.some((object) => object.kind === 'orkk-shield' && object.ownerId === 'P1'), true);
    assert.equal(shieldedChainResult.state.players.P1.actionsRemaining, 1, 'Shielded Chain Punchin does not generate an extra Action.');
    assert.equal(shieldedChainResult.state.players.P1.rageStacks, 0, 'Chain Punchin no longer generates Rage after combat.');
  }
}

const chainUnshielded = createGameInitialState();
chainUnshielded.players.P1.position = { x: 2, y: 1 };
chainUnshielded.players.P2.position = { x: 3, y: 1 };
chainUnshielded.players.P1.shieldEquipped = false;
chainUnshielded.players.P2.hand = [];
const unshieldedChainCard = ensureCardInHand(chainUnshielded, 'P1', 'chain-punchin');
const unshieldedChainAttack = applyCommand(chainUnshielded, { type: 'attack', playerId: 'P1', cardInstanceId: unshieldedChainCard.instanceId, targetId: 'P2' });
assert.equal(unshieldedChainAttack.ok, true);
if (unshieldedChainAttack.ok) {
  const unshieldedChainResult = applyCommand(unshieldedChainAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(unshieldedChainResult.ok, true);
  if (unshieldedChainResult.ok) {
    assert.equal(unshieldedChainResult.state.players.P1.actionsRemaining, 2, 'Unshielded Chain Punchin refunds an extra Action after combat.');
    assert.equal(unshieldedChainResult.state.players.P1.rageStacks, 0);
  }
}

const teefStrikeState = createGameInitialState();
teefStrikeState.players.P1.position = { x: 2, y: 1 };
teefStrikeState.players.P2.position = { x: 3, y: 1 };
teefStrikeState.players.P2.hand = [];
const teefStrikeCard = ensureCardInHand(teefStrikeState, 'P1', 'teef-strike');
const teefStrikeAttack = applyCommand(teefStrikeState, { type: 'attack', playerId: 'P1', cardInstanceId: teefStrikeCard.instanceId, targetId: 'P2' });
assert.equal(teefStrikeAttack.ok, true);
if (teefStrikeAttack.ok) {
  const teefStrikeResult = applyCommand(teefStrikeAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(teefStrikeResult.ok, true);
  if (teefStrikeResult.ok) {
    const exhaust = teefStrikeResult.state.players.P2.hand.find((card) => card.cardId === 'exhaust');
    assert.ok(exhaust, 'Teef Strike adds Exhaust after combat.');
    assert.equal(exhaust.revealedToOpponent, true, 'Status Cards remain revealed to opponents.');
  }
}

const shieldBashState = createGameInitialState();
shieldBashState.players.P1.position = { x: 4, y: 3 };
shieldBashState.players.P2.position = { x: 3, y: 2 };
shieldBashState.players.P1.shieldEquipped = false;
shieldBashState.players.P1.rageStacks = 0;
shieldBashState.players.P2.hand = [];
shieldBashState.objects = [
  { id: 'shield-bash-far-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 8, y: 7 } },
  { id: 'shield-bash-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 1, y: 0 } },
];
const shieldBashCard = ensureCardInHand(shieldBashState, 'P1', 'shield-bash');
const shieldBashAttack = applyCommand(shieldBashState, { type: 'attack', playerId: 'P1', cardInstanceId: shieldBashCard.instanceId, targetId: 'P2' });
assert.equal(shieldBashAttack.ok, true);
if (shieldBashAttack.ok) {
  const shieldBashCombatDamage = shieldBashAttack.state.pendingAttack?.attackValue ?? 0;
  const shieldBashTargetHp = shieldBashAttack.state.players.P2.hp;
  const shieldBashResult = applyCommand(shieldBashAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(shieldBashResult.ok, true);
  if (shieldBashResult.ok) {
    assert.equal(shieldBashResult.state.players.P2.hp, shieldBashTargetHp - shieldBashCombatDamage - 2, 'Shield Bash deals its combat Damage and 2 more when the recalled Shield passes through the enemy.');
    assert.equal(shieldBashResult.state.players.P1.shieldEquipped, true, 'Shield Bash equips the recalled Shield after combat.');
    assert.equal(shieldBashResult.state.objects.some((object) => object.id === 'shield-bash-shield'), false);
    assert.equal(shieldBashResult.state.objects.some((object) => object.id === 'shield-bash-far-shield'), true, 'When optimal routes cross equal enemy counts, Shield Bash recalls the nearest Shield.');
    const shieldBashAnimation = shieldBashResult.state.objectPushAnimations.find((event) => event.objectId === 'shield-bash-shield');
    assert.equal(shieldBashAnimation?.path?.some((cell) => cell.x === 3 && cell.y === 2), true, 'Shield Bash animates through the occupied enemy Square.');
    assert.equal(shieldBashAnimation?.equipPlayerId, 'P1');
    assert.equal(shieldBashAnimation?.collided, false, 'Crossing an enemy during Shield Bash Recall does not turn the flight into a terminal collision bounce.');
    const shieldBashDamage = shieldBashResult.state.objectPushAnimations.find((event) => event.damage?.playerId === 'P2' && event.damage.amount === 2 && event.damage.collision);
    assert.equal(shieldBashDamage?.damage?.triggerAnimationId, shieldBashAnimation?.id, 'Shield Bash damage waits for the returning Shield to cross the enemy.');
    assert.equal(typeof shieldBashDamage?.damage?.triggerRouteProgress, 'number');
  }
}

const enemyPriorityShieldBashState = createGameInitialState();
enemyPriorityShieldBashState.players.P1.position = { x: 4, y: 3 };
enemyPriorityShieldBashState.players.P2.position = { x: 3, y: 2 };
enemyPriorityShieldBashState.players.P1.shieldEquipped = false;
enemyPriorityShieldBashState.players.P2.hand = [];
enemyPriorityShieldBashState.objects = [
  { id: 'closer-empty-route-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 4, y: 1 } },
  { id: 'farther-enemy-route-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 1, y: 1 } },
];
const enemyPriorityShieldBashCard = ensureCardInHand(enemyPriorityShieldBashState, 'P1', 'shield-bash');
const enemyPriorityShieldBashAttack = applyCommand(enemyPriorityShieldBashState, { type: 'attack', playerId: 'P1', cardInstanceId: enemyPriorityShieldBashCard.instanceId, targetId: 'P2' });
assert.equal(enemyPriorityShieldBashAttack.ok, true);
if (enemyPriorityShieldBashAttack.ok) {
  const enemyPriorityShieldBashResult = applyCommand(enemyPriorityShieldBashAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(enemyPriorityShieldBashResult.ok, true);
  if (enemyPriorityShieldBashResult.ok) {
    assert.equal(enemyPriorityShieldBashResult.state.objects.some((object) => object.id === 'farther-enemy-route-shield'), false, 'Automatic Shield Recall prioritizes the Shield whose optimal route crosses more enemies.');
    assert.equal(enemyPriorityShieldBashResult.state.objects.some((object) => object.id === 'closer-empty-route-shield'), true, 'A closer Shield remains on the Board when a farther Shield crosses more enemies.');
  }
}

const equippedShieldBashState = createGameInitialState();
equippedShieldBashState.players.P1.position = { x: 4, y: 3 };
equippedShieldBashState.players.P2.position = { x: 3, y: 2 };
equippedShieldBashState.players.P1.shieldEquipped = true;
equippedShieldBashState.players.P1.rageStacks = 0;
equippedShieldBashState.players.P2.hand = [];
const equippedShieldBashCard = ensureCardInHand(equippedShieldBashState, 'P1', 'shield-bash');
const equippedShieldBashAttack = applyCommand(equippedShieldBashState, { type: 'attack', playerId: 'P1', cardInstanceId: equippedShieldBashCard.instanceId, targetId: 'P2' });
assert.equal(equippedShieldBashAttack.ok, true);
if (equippedShieldBashAttack.ok) {
  const equippedShieldBashResult = applyCommand(equippedShieldBashAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(equippedShieldBashResult.ok, true);
  if (equippedShieldBashResult.ok) {
    assert.equal(equippedShieldBashResult.state.players.P1.rageStacks, 1, 'Shield Bash generates 1 Rage after combat when the Shield was already equipped.');
    assert.equal(equippedShieldBashResult.state.players.P1.shieldEquipped, true, 'Shield Bash leaves an already equipped Shield equipped.');
  }
}

const kneeBlastState = createGameInitialState();
kneeBlastState.players.P1.position = { x: 5, y: 1 };
kneeBlastState.players.P2.position = { x: 6, y: 1 };
kneeBlastState.players.P1.rageStacks = 3;
kneeBlastState.players.P2.hand = [];
kneeBlastState.objects = [];
const kneeBlastCard = ensureCardInHand(kneeBlastState, 'P1', 'knee-blast');
const kneeBlastAttack = applyCommand(kneeBlastState, { type: 'attack', playerId: 'P1', cardInstanceId: kneeBlastCard.instanceId, targetId: 'P2' });
assert.equal(kneeBlastAttack.ok, true);
if (kneeBlastAttack.ok) {
  const kneeBlastResult = applyCommand(kneeBlastAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(kneeBlastResult.ok, true);
  if (kneeBlastResult.ok) {
    assert.deepEqual(kneeBlastResult.state.players.P2.position, { x: 8, y: 1 }, 'Knee Blast pushes directly away from Da Orkk until the Board edge interrupts its Rage distance.');
    assert.equal(kneeBlastResult.state.players.P2.hand.some((card) => card.cardId === 'headache'), true, 'Colliding with the Board edge adds Headache.');
    assert.equal(kneeBlastResult.state.players.P2.hp, 14, 'Knee Blast collision itself causes no additional damage.');
  }
}

assert.equal(distance({ x: 1, y: 0 }, { x: 2, y: 1 }), 1, 'An adjacent diagonal costs 1 square.');
assert.equal(distance({ x: 1, y: 0 }, { x: 3, y: 2 }), 2, 'Two diagonal steps cost 2 squares.');
const shinobiLoadout = createGameInitialState('shinobi-vs-orkk');
assert.equal(shinobiLoadout.players.P1.attackRange, 1, 'Shinobi has melee Attack Range.');
assert.equal(shinobiLoadout.players.P2.pinnedStacks, 0);
assert.equal(shinobiLoadout.players.P2.name, 'Da Orkk');
assert.equal(shinobiLoadout.players.P2.hp, 24);
assert.equal(shinobiLoadout.players.P2.maxHp, 24);
assert.equal(shinobiLoadout.players.P2.moveRange, 3);
assert.equal(shinobiLoadout.players.P2.attackRange, 1, 'Melee range reaches adjacent squares, including diagonals.');
assert.equal(shinobiLoadout.players.P2.hand.length, 15, 'Da Orkk receives all currently created unique Cards for testing.');
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'consume-rage'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'encourage'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'kyk'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'arkane-arow'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'arm-da-wiz'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'fistbolt'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'chain-punchin'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'teef-strike'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'shield-bash'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'chip-cast'), false, 'Chip-cast is temporarily disabled in Da Orkk card pools.');
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'knee-blast'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'da-blokk'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'double'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'arcane-shield'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'countaspell'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'mana-baryer'), true);
assert.equal(shinobiLoadout.players.P2.deck.length, 0);
assert.equal(shinobiLoadout.players.P2.shieldEquipped, true);
assert.equal(shinobiLoadout.objects.filter((object) => object.kind === 'wall-pillar').length, 8);
assertNagrandBoxLayout(shinobiLoadout.objects.filter((object) => object.kind === 'wooden-box').map((object) => cellLabel(object.position)));
assert.equal(shinobiLoadout.players.P1.hand.length, 3, 'Shinobi must draw the top three shuffled unique cards for the opening Hand.');
assert.equal(shinobiLoadout.players.P1.deck.length, 12);
assert.equal(new Set([...shinobiLoadout.players.P1.hand, ...shinobiLoadout.players.P1.deck].map((card) => card.cardId)).size, 15, 'Every unique Shinobi card must exist exactly once across the opening Hand and Deck.');
for (const cardId of ['light-the-saber', 'dance-through', 'force-disarm', 'cut-them-legs', 'hello-there'] as const) {
  const meleeAttackState = createGameInitialState('shinobi-vs-orkk');
  meleeAttackState.objects = [];
  meleeAttackState.players.P1.position = { x: 2, y: 1 };
  meleeAttackState.players.P2.position = { x: 4, y: 1 };
  meleeAttackState.players.P1.hand = [{ instanceId: `melee-${cardId}`, cardId }];
  const rangedAttempt = applyCommand(meleeAttackState, { type: 'attack', playerId: 'P1', cardInstanceId: `melee-${cardId}`, targetId: 'P2' });
  assert.equal(rangedAttempt.ok, false, `${cardId} cannot attack a target 2 Squares away.`);
}
const diagonalMeleeState = createGameInitialState('shinobi-vs-orkk');
diagonalMeleeState.objects = [];
diagonalMeleeState.players.P1.position = { x: 2, y: 1 };
diagonalMeleeState.players.P2.position = { x: 3, y: 2 };
diagonalMeleeState.players.P1.hand = [{ instanceId: 'diagonal-melee', cardId: 'light-the-saber' }];
assert.equal(applyCommand(diagonalMeleeState, { type: 'attack', playerId: 'P1', cardInstanceId: 'diagonal-melee', targetId: 'P2' }).ok, true, 'Melee Attack Range includes diagonally adjacent Squares.');

fc.assert(fc.property(fc.constantFrom('attack-2' as CardTypeId, 'attack-3' as CardTypeId), fc.boolean(), (cardId, defend) => {
  const initial = createInitialState();
  initial.players.P1.position = { x: 2, y: 1 };
  initial.players.P2.position = { x: 3, y: 1 };
  initial.players.P2.shieldEquipped = false;
  initial.players.P1.hand = [{ instanceId: 'test-attack', cardId }];
  initial.players.P2.hand = defend ? [{ instanceId: 'test-defense', cardId: 'defend-1' }] : [];
  const attacked = applyCommand(initial, { type: 'attack', playerId: 'P1', cardInstanceId: 'test-attack', targetId: 'P2' });
  assert.equal(attacked.ok, true);
  if (!attacked.ok) return;
  assert.equal(attacked.state.players.P1.hand.length, 0);
  assert.equal(attacked.state.players.P1.discard.at(-1)?.instanceId, 'test-attack');
  const response = defend
    ? { type: 'defend', playerId: 'P2', cardInstanceId: 'test-defense' }
    : { type: 'pass-defense', playerId: 'P2' };
  const resolved = applyCommand(attacked.state, response);
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  const attackValue = cardId === 'attack-2' ? 2 : 3;
  assert.equal(resolved.state.players.P2.hp, initial.players.P2.maxHp - attackValue + (defend ? 1 : 0));
  if (defend) assert.equal(resolved.state.players.P2.discard.at(-1)?.instanceId, 'test-defense');
}));

const recycling = createInitialState().players.P1;
recycling.deck = [];
recycling.hand = [];
recycling.discard = [
  { instanceId: 'recycle-1', cardId: 'attack-2' },
  { instanceId: 'recycle-2', cardId: 'defend-1' },
];
assert.equal(drawCards(recycling, 1), 1);
assert.equal(recycling.hand.length, 1);
assert.equal(recycling.deck.length, 1);
assert.equal(recycling.discard.length, 0);

let handLimitState = createInitialState();
handLimitState.players.P1.hand = Array.from({ length: 7 }, (_, index) => ({ instanceId: `limit-${index}`, cardId: 'attack-2' as const }));
const requestedEnd = applyCommand(handLimitState, { type: 'end-turn', playerId: 'P1' });
assert.equal(requestedEnd.ok, true);
if (requestedEnd.ok) {
  assert.equal(requestedEnd.state.phase, 'choosing-end-discard');
  assert.equal(requestedEnd.state.activePlayerId, 'P1');
  const firstDiscard = applyCommand(requestedEnd.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'limit-0' });
  assert.equal(firstDiscard.ok, true);
  if (firstDiscard.ok) {
    assert.equal(firstDiscard.state.phase, 'choosing-end-discard');
    const secondDiscard = applyCommand(firstDiscard.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'limit-1' });
    assert.equal(secondDiscard.ok, true);
    if (secondDiscard.ok) {
      assert.equal(secondDiscard.state.players.P1.hand.length, 5);
      assert.equal(secondDiscard.state.activePlayerId, 'P1', 'Reaching five cards must not force the discard phase to end.');
      assert.equal(secondDiscard.state.phase, 'choosing-end-discard');
      const optionalDiscard = applyCommand(secondDiscard.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'limit-2' });
      assert.equal(optionalDiscard.ok, true);
      if (optionalDiscard.ok) {
        assert.equal(optionalDiscard.state.players.P1.hand.length, 4, 'The player may voluntarily discard below five cards.');
        const finishDiscarding = applyCommand(optionalDiscard.state, { type: 'end-turn', playerId: 'P1' });
        assert.equal(finishDiscarding.ok, true);
        if (finishDiscarding.ok) assert.equal(finishDiscarding.state.activePlayerId, 'P2');
      }
    }
  }
}

let dashState = createInitialState();
dashState.players.P1.freeMoveUsed = true;
dashState.players.P1.movementRemaining = 1;
dashState.players.P1.hand = [{ instanceId: 'dash-cost', cardId: 'attack-2' }];
assert.equal(revealCardToOpponent(dashState, 'P1', 'dash-cost'), true);
const choseDash = applyCommand(dashState, { type: 'dash', playerId: 'P1' });
assert.equal(choseDash.ok, true);
if (choseDash.ok) {
  const paidDash = applyCommand(choseDash.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'dash-cost' });
  assert.equal(paidDash.ok, true);
  if (paidDash.ok) {
    assert.equal(paidDash.state.phase, 'dashing');
    assert.equal(paidDash.state.players.P1.movementRemaining, 3);
    const blockedAttack = applyCommand(paidDash.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'missing', targetId: 'P2' });
    assert.equal(blockedAttack.ok, false);
    const cancelled = applyCommand(paidDash.state, { type: 'cancel-dash', playerId: 'P1' });
    assert.equal(cancelled.ok, true);
    if (cancelled.ok) {
      assert.equal(cancelled.state.phase, 'active');
      assert.equal(cancelled.state.players.P1.movementRemaining, 1);
      assert.equal(cancelled.state.players.P1.hand[0]?.instanceId, 'dash-cost');
      assert.equal(cancelled.state.players.P1.hand[0]?.revealedToOpponent, true);
    }
  }
}

let perkState = createInitialState();
perkState.players.P1.hand = [{ instanceId: 'perk-hand', cardId: 'echo-pulse' }];
perkState.players.P1.deck = [{ instanceId: 'perk-draw', cardId: 'attack-2' }];
const placedPerk = applyCommand(perkState, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'perk-hand', destination: 'echo' });
assert.equal(placedPerk.ok, true);
if (placedPerk.ok) {
  assert.equal(placedPerk.state.players.P1.spellEcho[0]?.instanceId, 'perk-hand');
  assert.equal(placedPerk.state.players.P1.hand[0]?.instanceId, 'perk-draw');
  assert.equal(placedPerk.state.players.P1.actionsRemaining, 1);
  const secondPerkThisTurn = applyCommand(placedPerk.state, { type: 'use-echo-perk', playerId: 'P1', position: 1 });
  assert.equal(secondPerkThisTurn.ok, false);
}

let echoLevelState = createInitialState();
echoLevelState.players.P1.hp = 15;
echoLevelState.players.P1.deck = [{ instanceId: 'level-draw', cardId: 'defend-1' }];
echoLevelState.players.P1.spellEcho = [
  { instanceId: 'echo-one', cardId: 'echo-pulse' },
  { instanceId: 'echo-two', cardId: 'echo-pulse' },
  { instanceId: 'echo-three', cardId: 'echo-pulse' },
];
const levelThree = applyCommand(echoLevelState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(levelThree.ok, true);
if (levelThree.ok) {
  assert.deepEqual(levelThree.state.players.P1.spellEcho.map((card) => card?.instanceId), ['echo-three', 'echo-one', 'echo-two']);
  assert.equal(levelThree.state.players.P1.hp, 17);
  assert.equal(levelThree.state.players.P1.actionsRemaining, 2);
  assert.equal(levelThree.state.players.P1.hand.some((card) => card.instanceId === 'level-draw'), true);
}

let traitState = createInitialState();
const stationaryEnd = applyCommand(traitState, { type: 'end-turn', playerId: 'P1' });
assert.equal(stationaryEnd.ok, true);
if (stationaryEnd.ok) {
  assert.equal(stationaryEnd.state.players.P1.lightsaberBuff, true);
  assert.equal(effectiveMoveRange(stationaryEnd.state.players.P1), 3, 'Lightsaber grants Shinobi +1 MOV while empowered.');
  stationaryEnd.state.players.P2.hand = [];
  const dummyEnd = applyCommand(stationaryEnd.state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(dummyEnd.ok, true);
  if (dummyEnd.ok) {
    dummyEnd.state.players.P1.position = { x: 2, y: 1 };
    dummyEnd.state.players.P2.position = { x: 3, y: 1 };
    dummyEnd.state.players.P1.hand = [{ instanceId: 'buffed-attack', cardId: 'attack-2' }];
    const buffedAttack = applyCommand(dummyEnd.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'buffed-attack', targetId: 'P2' });
    assert.equal(buffedAttack.ok, true);
    if (buffedAttack.ok) assert.equal(buffedAttack.state.pendingAttack?.attackValue, 3);
  }
}
let nonShinobiTraitState = createInitialState();
nonShinobiTraitState.players.P1.character = 'orkk';
nonShinobiTraitState.players.P1.name = 'Da Orkk';
nonShinobiTraitState.players.P1.lightsaberBuff = true;
nonShinobiTraitState.players.P1.lightsaberStacks = 2;
assert.equal(effectiveMoveRange(nonShinobiTraitState.players.P1), 2, 'An invalid Lightsaber flag cannot grant MOV to a non-Shinobi character.');
const nonShinobiEnd = applyCommand(nonShinobiTraitState, { type: 'end-turn', playerId: 'P1' });
assert.equal(nonShinobiEnd.ok, true);
if (nonShinobiEnd.ok) {
  assert.equal(nonShinobiEnd.state.players.P1.lightsaberBuff, false, 'Lightsaber must never persist on a non-Shinobi character.');
  assert.equal(nonShinobiEnd.state.players.P1.lightsaberStacks, 0, 'Lightsaber duration stacks must be cleared from a non-Shinobi character.');
}
const movementCauseState = createInitialState();
markCharacterMoved(movementCauseState.players.P1, 'own-card');
assert.equal(movementCauseState.players.P1.movedThisTurn, false);
markCharacterMoved(movementCauseState.players.P1, 'enemy-ability');
assert.equal(movementCauseState.players.P1.movedThisTurn, true);

const pinnedState = createInitialState();
pinnedState.players.P2.hand = [];
pinnedState.players.P1.freeMoveUsed = true;
pinnedState.players.P1.movementRemaining = 2;
assert.equal(applyPinned(pinnedState.players.P1, 2), 2);
assert.equal(effectiveMoveRange(pinnedState.players.P1), 0);
assert.equal(pinnedState.players.P1.movementRemaining, 0, 'Pinned immediately cuts unspent movement when received during the affected Character\'s turn.');
const pinnedTurnEnd = applyCommand(pinnedState, { type: 'end-turn', playerId: 'P1' });
assert.equal(pinnedTurnEnd.ok, true);
if (pinnedTurnEnd.ok) {
  assert.equal(pinnedTurnEnd.state.players.P1.pinnedStacks, 2, 'Pinned gained during the holder\'s turn survives that turn end.');
  const opponentTurnEnd = applyCommand(pinnedTurnEnd.state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(opponentTurnEnd.ok, true);
  if (opponentTurnEnd.ok) {
    const nextHolderTurnEnd = applyCommand(opponentTurnEnd.state, { type: 'end-turn', playerId: 'P1' });
    assert.equal(nextHolderTurnEnd.ok, true);
    if (nextHolderTurnEnd.ok) {
      assert.equal(nextHolderTurnEnd.state.players.P1.pinnedStacks, 1, 'Pinned is eligible for removal at the end of the holder\'s next turn.');
    }
  }
}

const immediateLightsaberMovement = createInitialState();
immediateLightsaberMovement.players.P1.hand = [];
immediateLightsaberMovement.players.P1.spellEcho[1] = { instanceId: 'immediate-lightsaber', cardId: 'higround-advantage' };
immediateLightsaberMovement.players.P1.freeMoveUsed = true;
immediateLightsaberMovement.players.P1.movementRemaining = 0;
const gainedImmediateLightsaber = applyCommand(immediateLightsaberMovement, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(gainedImmediateLightsaber.ok, true);
if (gainedImmediateLightsaber.ok) {
  assert.equal(gainedImmediateLightsaber.state.players.P1.lightsaberBuff, true);
  assert.equal(gainedImmediateLightsaber.state.players.P1.movementRemaining, 1, 'Lightsaber immediately adds its +1 MOV to unspent movement when gained during Shinobi\'s turn.');
}

let lightSaberLoss = createInitialState();
lightSaberLoss.players.P2.pinnedStacks = 0;
lightSaberLoss.players.P1.position = { x: 2, y: 1 };
lightSaberLoss.players.P2.position = { x: 3, y: 1 };
lightSaberLoss.players.P2.hand = [{ instanceId: 'saber-defense', cardId: 'defend-1' }];
const lightSaberCard = ensureCardInHand(lightSaberLoss, 'P1', 'light-the-saber');
const lightSaberLossHandSize = lightSaberLoss.players.P1.hand.length;
const saberAttack = applyCommand(lightSaberLoss, { type: 'attack', playerId: 'P1', cardInstanceId: lightSaberCard.instanceId, targetId: 'P2' });
assert.equal(saberAttack.ok, true);
if (saberAttack.ok && saberAttack.state.pendingAttack) {
  saberAttack.state.pendingAttack.attackValue = 1;
  const lostCombat = applyCommand(saberAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'saber-defense' });
  assert.equal(lostCombat.ok, true);
  if (lostCombat.ok) {
    assert.equal(lostCombat.state.players.P2.pinnedStacks, 1);
    assert.equal(lostCombat.state.players.P2.hp, 24);
    assert.equal(lostCombat.state.players.P1.hand.length, lightSaberLossHandSize - 1);
    assert.equal(lostCombat.state.players.P1.discard.some((card) => card.cardId === 'light-the-saber'), true);
  }
}

let lightSaberWin = createInitialState();
lightSaberWin.players.P2.pinnedStacks = 0;
lightSaberWin.players.P1.position = { x: 2, y: 1 };
lightSaberWin.players.P2.position = { x: 3, y: 1 };
const winningCard = ensureCardInHand(lightSaberWin, 'P1', 'light-the-saber');
const winningAttack = applyCommand(lightSaberWin, { type: 'attack', playerId: 'P1', cardInstanceId: winningCard.instanceId, targetId: 'P2' });
assert.equal(winningAttack.ok, true);
if (winningAttack.ok) {
  const wonCombat = applyCommand(winningAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(wonCombat.ok, true);
  if (wonCombat.ok) {
    assert.equal(wonCombat.state.players.P2.pinnedStacks, 1);
    assert.equal(wonCombat.state.players.P2.hp, 22);
    assert.equal(wonCombat.state.players.P1.hand.some((card) => card.instanceId === winningCard.instanceId), false);
    assert.equal(wonCombat.state.players.P1.discard.some((card) => card.instanceId === winningCard.instanceId), true);
  }
}

let danceState = createInitialState();
danceState.players.P2.pinnedStacks = 0;
danceState.players.P1.position = { x: 1, y: 0 };
danceState.players.P2.position = { x: 2, y: 1 };
const danceCard = ensureCardInHand(danceState, 'P1', 'dance-through');
const danceAttack = applyCommand(danceState, { type: 'attack', playerId: 'P1', cardInstanceId: danceCard.instanceId, targetId: 'P2' });
assert.equal(danceAttack.ok, true);
if (danceAttack.ok) {
  const danceCombat = applyCommand(danceAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(danceCombat.ok, true);
  if (danceCombat.ok) {
    assert.equal(danceCombat.state.phase, 'dance-through');
    const cancelledDance = applyCommand(structuredClone(danceCombat.state), { type: 'end-dance', playerId: 'P1' });
    assert.equal(cancelledDance.ok, true, 'Dance Through should be cancellable before its movement is spent.');
    if (cancelledDance.ok) assert.equal(cancelledDance.state.phase, 'active');
    const enteredEnemy = applyCommand(danceCombat.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 1 } });
    assert.equal(enteredEnemy.ok, true);
    if (enteredEnemy.ok) {
      assert.equal(enteredEnemy.state.players.P2.hp, 22);
      assert.equal(enteredEnemy.state.danceThrough?.stepsRemaining, 2);
      const illegalStop = applyCommand(enteredEnemy.state, { type: 'end-dance', playerId: 'P1' });
      assert.equal(illegalStop.ok, false);
      const leftEnemy = applyCommand(enteredEnemy.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 2 } });
      assert.equal(leftEnemy.ok, true);
      if (leftEnemy.ok) {
        assert.equal(leftEnemy.state.players.P2.hp, 22);
        assert.equal(leftEnemy.state.players.P2.pinnedStacks, 1);
        assert.equal(leftEnemy.state.players.P1.movedThisTurn, false);
        const illegalFinalOverlap = applyCommand(leftEnemy.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 1 } });
        assert.equal(illegalFinalOverlap.ok, false);
        const finalStep = applyCommand(leftEnemy.state, { type: 'move', playerId: 'P1', to: { x: 1, y: 2 } });
        assert.equal(finalStep.ok, true);
        if (finalStep.ok) assert.equal(finalStep.state.phase, 'active');
      }
    }
  }
}

let disarmChoiceState = createInitialState();
disarmChoiceState.players.P2.pinnedStacks = 0;
disarmChoiceState.players.P1.position = { x: 2, y: 1 };
disarmChoiceState.players.P2.position = { x: 3, y: 1 };
disarmChoiceState.players.P2.hand = [
  { instanceId: 'forced-attack', cardId: 'attack-3' },
  { instanceId: 'kept-defense', cardId: 'defend-1' },
];
const disarmCard = ensureCardInHand(disarmChoiceState, 'P1', 'force-disarm');
const disarmAttack = applyCommand(disarmChoiceState, { type: 'attack', playerId: 'P1', cardInstanceId: disarmCard.instanceId, targetId: 'P2' });
assert.equal(disarmAttack.ok, true);
if (disarmAttack.ok) {
  const disarmCombat = applyCommand(disarmAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(disarmCombat.ok, true);
  if (disarmCombat.ok) {
    assert.equal(disarmCombat.state.phase, 'choosing-force-disarm-discard');
    assert.equal(disarmCombat.state.players.P2.pinnedStacks, 0);
    const forcedDiscard = applyCommand(disarmCombat.state, { type: 'force-disarm-discard', playerId: 'P2', cardInstanceId: 'forced-attack' });
    assert.equal(forcedDiscard.ok, true);
    if (forcedDiscard.ok) assert.equal(forcedDiscard.state.players.P2.discard[0]?.instanceId, 'forced-attack');
  }
}

let disarmLossState = createInitialState();
disarmLossState.players.P2.pinnedStacks = 0;
disarmLossState.players.P1.position = { x: 2, y: 1 };
disarmLossState.players.P2.position = { x: 3, y: 1 };
disarmLossState.players.P2.hand = [
  { instanceId: 'disarm-defense', cardId: 'defend-1' },
  { instanceId: 'revealed-perk', cardId: 'echo-pulse' },
];
const losingDisarmCard = ensureCardInHand(disarmLossState, 'P1', 'force-disarm');
const losingDisarm = applyCommand(disarmLossState, { type: 'attack', playerId: 'P1', cardInstanceId: losingDisarmCard.instanceId, targetId: 'P2' });
assert.equal(losingDisarm.ok, true);
if (losingDisarm.ok) {
  const defendedDisarm = applyCommand(losingDisarm.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'disarm-defense' });
  assert.equal(defendedDisarm.ok, true);
if (defendedDisarm.ok) {
    assert.equal(defendedDisarm.state.players.P2.hp, 24);
    assert.equal(defendedDisarm.state.players.P2.pinnedStacks, 0);
    assert.equal(defendedDisarm.state.players.P2.hand[0]?.revealedToOpponent, true);
    assert.equal(defendedDisarm.state.players.P2.hand.at(-1)?.cardId, 'exhaust');
    assert.equal(defendedDisarm.state.players.P2.hand.at(-1)?.revealedToOpponent, true);
    assert.equal(defendedDisarm.state.phase, 'active');
  }
}

let cutWinState = createInitialState();
cutWinState.players.P2.pinnedStacks = 0;
cutWinState.players.P1.position = { x: 2, y: 1 };
cutWinState.players.P2.position = { x: 3, y: 1 };
const cutCard = ensureCardInHand(cutWinState, 'P1', 'cut-them-legs');
const cutAttack = applyCommand(cutWinState, { type: 'attack', playerId: 'P1', cardInstanceId: cutCard.instanceId, targetId: 'P2' });
assert.equal(cutAttack.ok, true);
if (cutAttack.ok) {
  const cutCombat = applyCommand(cutAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(cutCombat.ok, true);
  if (cutCombat.ok) {
    assert.equal(cutCombat.state.players.P2.hp, 21);
    assert.equal(cutCombat.state.players.P2.pinnedStacks, 1);
    assert.equal(cutCombat.state.players.P1.hand.some((card) => card.instanceId === cutCard.instanceId), true);
    assert.equal(cutCombat.state.players.P1.actionsRemaining, 1);
  }
}

let cutLossState = createInitialState();
cutLossState.players.P2.pinnedStacks = 0;
cutLossState.players.P1.position = { x: 2, y: 1 };
cutLossState.players.P2.position = { x: 3, y: 1 };
cutLossState.players.P2.hand = [{ instanceId: 'cut-defense', cardId: 'defend-1' }];
const losingCutCard = ensureCardInHand(cutLossState, 'P1', 'cut-them-legs');
const losingCut = applyCommand(cutLossState, { type: 'attack', playerId: 'P1', cardInstanceId: losingCutCard.instanceId, targetId: 'P2' });
assert.equal(losingCut.ok, true);
if (losingCut.ok && losingCut.state.pendingAttack) {
  losingCut.state.pendingAttack.attackValue = 1;
  const cutDefended = applyCommand(losingCut.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'cut-defense' });
  assert.equal(cutDefended.ok, true);
  if (cutDefended.ok) {
    assert.equal(cutDefended.state.players.P2.hp, 24);
    assert.equal(cutDefended.state.players.P2.pinnedStacks, 1);
    assert.equal(cutDefended.state.players.P1.hand.some((card) => card.instanceId === losingCutCard.instanceId), false);
    assert.equal(cutDefended.state.players.P1.discard.some((card) => card.instanceId === losingCutCard.instanceId), true);
  }
}

let helloLossState = createInitialState();
helloLossState.players.P1.position = { x: 2, y: 1 };
helloLossState.players.P2.position = { x: 3, y: 1 };
helloLossState.players.P2.pinnedStacks = 2;
helloLossState.players.P2.hand = [{ instanceId: 'hello-defense', cardId: 'defend-1' }];
const helloCard = ensureCardInHand(helloLossState, 'P1', 'hello-there');
const helloAttack = applyCommand(helloLossState, { type: 'attack', playerId: 'P1', cardInstanceId: helloCard.instanceId, targetId: 'P2' });
assert.equal(helloAttack.ok, true);
if (helloAttack.ok) {
  const helloDefended = applyCommand(helloAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'hello-defense' });
  assert.equal(helloDefended.ok, true);
  if (helloDefended.ok) {
    assert.equal(helloDefended.state.players.P2.hp, 20);
    assert.equal(helloDefended.state.players.P2.pinnedStacks, 2);
    assert.equal(helloDefended.state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 1);
    assert.equal(helloDefended.state.players.P2.hand.find((card) => card.cardId === 'headache')?.revealedToOpponent, true);
  }
}

let helloNoPinnedState = createInitialState();
helloNoPinnedState.players.P2.pinnedStacks = 0;
helloNoPinnedState.players.P1.position = { x: 2, y: 1 };
helloNoPinnedState.players.P2.position = { x: 3, y: 1 };
const plainHelloCard = ensureCardInHand(helloNoPinnedState, 'P1', 'hello-there');
const plainHello = applyCommand(helloNoPinnedState, { type: 'attack', playerId: 'P1', cardInstanceId: plainHelloCard.instanceId, targetId: 'P2' });
assert.equal(plainHello.ok, true);
if (plainHello.ok) {
  const plainHelloCombat = applyCommand(plainHello.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(plainHelloCombat.ok, true);
  if (plainHelloCombat.ok) {
    assert.equal(plainHelloCombat.state.players.P2.hp, 23);
    assert.equal(plainHelloCombat.state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 1);
  }
}

let blockState = createInitialState();
blockState.players.P2.pinnedStacks = 0;
blockState.activePlayerId = 'P2';
blockState.players.P1.position = { x: 2, y: 1 };
blockState.players.P2.position = { x: 3, y: 1 };
const blockCard = ensureCardInHand(blockState, 'P1', 'block');
blockState.players.P1.hand = [blockCard];
blockState.players.P2.hand = [{ instanceId: 'blocked-cut', cardId: 'cut-them-legs' }];
const blockedAttack = applyCommand(blockState, { type: 'attack', playerId: 'P2', cardInstanceId: 'blocked-cut', targetId: 'P1' });
assert.equal(blockedAttack.ok, true);
if (blockedAttack.ok) {
  const blockCombat = applyCommand(blockedAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: blockCard.instanceId });
  assert.equal(blockCombat.ok, true);
if (blockCombat.ok) {
    assert.equal(blockCombat.state.players.P1.hp, 19);
    assert.equal(blockCombat.state.players.P1.pinnedStacks, 0);
    assert.equal(blockCombat.state.players.P2.hp, 24);
    assert.equal(blockCombat.state.players.P2.pinnedStacks, 1);
    assert.equal(blockCombat.state.players.P2.hand.some((card) => card.instanceId === 'blocked-cut'), false);
    assert.equal(blockCombat.state.players.P2.discard.some((card) => card.instanceId === 'blocked-cut'), true);
    assert.equal(blockCombat.state.phase, 'active');
  }
}

let lethalFlurryState = createInitialState();
lethalFlurryState.activePlayerId = 'P2';
lethalFlurryState.players.P1.position = { x: 2, y: 1 };
lethalFlurryState.players.P2.position = { x: 3, y: 1 };
lethalFlurryState.players.P2.hp = 1;
lethalFlurryState.players.P2.hand = [{ instanceId: 'lethal-flurry-attack', cardId: 'attack-3' }];
const lethalFlurryCard = ensureCardInHand(lethalFlurryState, 'P1', 'flurry-defensive-strikes');
lethalFlurryState.players.P1.hand = [lethalFlurryCard];
const lethalFlurryAttack = applyCommand(lethalFlurryState, { type: 'attack', playerId: 'P2', cardInstanceId: 'lethal-flurry-attack', targetId: 'P1' });
assert.equal(lethalFlurryAttack.ok, true);
if (lethalFlurryAttack.ok) {
  const lethalFlurry = applyCommand(lethalFlurryAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: lethalFlurryCard.instanceId });
  assert.equal(lethalFlurry.ok, true);
  if (lethalFlurry.ok) {
    assert.equal(lethalFlurry.state.players.P2.hp, 0);
    assert.equal(lethalFlurry.state.players.P1.hp, 20);
    assert.equal(lethalFlurry.state.winner, 'P1');
    assert.equal(lethalFlurry.state.players.P1.matchStats?.defensiveRetaliationDamage, 1, 'Defend-card retaliation is tracked separately.');
    assert.equal(lethalFlurry.state.players.P1.matchStats?.totalDamage, 1, 'Defensive retaliation contributes to Total Damage.');
  }
}

let rangedFlurryState = createInitialState();
rangedFlurryState.activePlayerId = 'P2';
rangedFlurryState.players.P1.position = { x: 2, y: 1 };
rangedFlurryState.players.P2.position = { x: 4, y: 1 };
rangedFlurryState.players.P2.attackRange = 2;
rangedFlurryState.players.P2.hand = [{ instanceId: 'ranged-flurry-attack', cardId: 'attack-3' }];
const rangedFlurryCard = ensureCardInHand(rangedFlurryState, 'P1', 'flurry-defensive-strikes');
rangedFlurryState.players.P1.hand = [rangedFlurryCard];
const rangedFlurryAttack = applyCommand(rangedFlurryState, { type: 'attack', playerId: 'P2', cardInstanceId: 'ranged-flurry-attack', targetId: 'P1' });
assert.equal(rangedFlurryAttack.ok, true);
if (rangedFlurryAttack.ok) {
  const rangedFlurry = applyCommand(rangedFlurryAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: rangedFlurryCard.instanceId });
  assert.equal(rangedFlurry.ok, true);
  if (rangedFlurry.ok) {
    assert.equal(rangedFlurry.state.players.P2.hp, 24, 'Flurry does not deal pre-combat damage to a non-adjacent Attacker.');
    assert.equal(rangedFlurry.state.phase, 'active', 'Flurry does not offer its optional payment when the Attacker has no Card left to discard.');
  }
}

let flurryChoiceState = createInitialState();
flurryChoiceState.activePlayerId = 'P2';
flurryChoiceState.players.P1.position = { x: 2, y: 1 };
flurryChoiceState.players.P2.position = { x: 3, y: 1 };
const flurryDefence = ensureCardInHand(flurryChoiceState, 'P1', 'flurry-defensive-strikes');
ensureCardInHand(flurryChoiceState, 'P1', 'double-jump');
flurryChoiceState.players.P2.hand = [
  { instanceId: 'flurry-attack', cardId: 'attack-3' },
  { instanceId: 'enemy-choice-1', cardId: 'attack-2' },
  { instanceId: 'enemy-choice-2', cardId: 'defend-1' },
  { instanceId: 'enemy-choice-3', cardId: 'echo-pulse' },
];
const flurryAttack = applyCommand(flurryChoiceState, { type: 'attack', playerId: 'P2', cardInstanceId: 'flurry-attack', targetId: 'P1' });
assert.equal(flurryAttack.ok, true);
if (flurryAttack.ok) {
  const flurryCombat = applyCommand(flurryAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: flurryDefence.instanceId });
  assert.equal(flurryCombat.ok, true);
  if (flurryCombat.ok) {
    assert.equal(flurryCombat.state.players.P2.hp, 23);
    assert.equal(flurryCombat.state.players.P1.hp, 18);
    assert.equal(flurryCombat.state.phase, 'flurry-offer');
    const paidFlurry = applyCommand(flurryCombat.state, { type: 'flurry-pay', playerId: 'P1', cardInstanceId: '' });
    assert.equal(paidFlurry.ok, true);
    if (paidFlurry.ok) {
      assert.equal(paidFlurry.state.phase, 'choosing-flurry-enemy-discard');
      assert.equal(paidFlurry.state.players.P1.hp, 17);
      const firstEnemyDiscard = applyCommand(paidFlurry.state, { type: 'flurry-enemy-discard', playerId: 'P2', cardInstanceId: 'enemy-choice-1' });
      assert.equal(firstEnemyDiscard.ok, true);
      if (firstEnemyDiscard.ok) {
        assert.equal(firstEnemyDiscard.state.players.P2.hand.length, 2);
        assert.equal(firstEnemyDiscard.state.phase, 'active', 'Flurry now forces exactly one enemy Card discard.');
      }
    }
  }
}

let calmPinnedState = createInitialState();
calmPinnedState.activePlayerId = 'P2';
calmPinnedState.players.P1.position = { x: 2, y: 1 };
calmPinnedState.players.P2.position = { x: 3, y: 1 };
calmPinnedState.players.P1.lightsaberBuff = true;
calmPinnedState.players.P1.pinnedStacks = 2;
calmPinnedState.players.P2.pinnedStacks = 2;
calmPinnedState.players.P2.hand = [{ instanceId: 'calm-attack', cardId: 'cut-them-legs' }];
ensureCardInHand(calmPinnedState, 'P1', 'calmness');
const calmCard = calmPinnedState.players.P1.hand.find((card) => card.cardId === 'calmness')!;
const calmAttack = applyCommand(calmPinnedState, { type: 'attack', playerId: 'P2', cardInstanceId: 'calm-attack', targetId: 'P1' });
assert.equal(calmAttack.ok, true);
if (calmAttack.ok) {
  const calmCombat = applyCommand(calmAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: calmCard.instanceId });
  assert.equal(calmCombat.ok, true);
  if (calmCombat.ok) {
    assert.equal(calmCombat.state.players.P1.hp, 20);
    assert.equal(calmCombat.state.players.P1.lightsaberBuff, false);
    assert.equal(calmCombat.state.players.P1.pinnedStacks, 0);
    assert.equal(calmCombat.state.players.P2.pinnedStacks, 2);
    calmCombat.state.players.P2.hand.push({ instanceId: 'next-combat-attack', cardId: 'light-the-saber' });
    const nextAttack = applyCommand(calmCombat.state, { type: 'attack', playerId: 'P2', cardInstanceId: 'next-combat-attack', targetId: 'P1' });
    assert.equal(nextAttack.ok, true);
    if (nextAttack.ok) {
      const nextCombat = applyCommand(nextAttack.state, { type: 'pass-defense', playerId: 'P1' });
      assert.equal(nextCombat.ok, true);
      if (nextCombat.ok) assert.equal(nextCombat.state.players.P1.pinnedStacks, 1);
    }
  }
}

let calmUnpinnedState = createInitialState();
calmUnpinnedState.players.P2.pinnedStacks = 0;
calmUnpinnedState.activePlayerId = 'P2';
calmUnpinnedState.players.P1.position = { x: 2, y: 1 };
calmUnpinnedState.players.P2.position = { x: 3, y: 1 };
calmUnpinnedState.players.P2.hand = [{ instanceId: 'uncalm-attack', cardId: 'attack-3' }];
ensureCardInHand(calmUnpinnedState, 'P1', 'calmness');
const unpinnedCalmCard = calmUnpinnedState.players.P1.hand.find((card) => card.cardId === 'calmness')!;
const unpinnedCalmAttack = applyCommand(calmUnpinnedState, { type: 'attack', playerId: 'P2', cardInstanceId: 'uncalm-attack', targetId: 'P1' });
assert.equal(unpinnedCalmAttack.ok, true);
if (unpinnedCalmAttack.ok) {
  const unpinnedCalmCombat = applyCommand(unpinnedCalmAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: unpinnedCalmCard.instanceId });
  assert.equal(unpinnedCalmCombat.ok, true);
  if (unpinnedCalmCombat.ok) {
    assert.equal(unpinnedCalmCombat.state.players.P1.hp, 17);
    assert.equal(unpinnedCalmCombat.state.players.P2.pinnedStacks, 0);
  }
}

let calmHelloState = createInitialState();
calmHelloState.activePlayerId = 'P2';
calmHelloState.players.P1.position = { x: 2, y: 1 };
calmHelloState.players.P2.position = { x: 3, y: 1 };
calmHelloState.players.P1.pinnedStacks = 2;
calmHelloState.players.P2.pinnedStacks = 1;
calmHelloState.players.P2.hand = [{ instanceId: 'calm-hello', cardId: 'hello-there' }];
ensureCardInHand(calmHelloState, 'P1', 'calmness');
const helloCalmCard = calmHelloState.players.P1.hand.find((card) => card.cardId === 'calmness')!;
const calmHelloAttack = applyCommand(calmHelloState, { type: 'attack', playerId: 'P2', cardInstanceId: 'calm-hello', targetId: 'P1' });
assert.equal(calmHelloAttack.ok, true);
if (calmHelloAttack.ok) {
  const calmHelloCombat = applyCommand(calmHelloAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: helloCalmCard.instanceId });
  assert.equal(calmHelloCombat.ok, true);
  if (calmHelloCombat.ok) {
    assert.equal(calmHelloCombat.state.players.P1.hp, 20);
    assert.equal(calmHelloCombat.state.players.P1.pinnedStacks, 0);
    assert.equal(calmHelloCombat.state.players.P2.pinnedStacks, 1);
    assert.equal(calmHelloCombat.state.players.P1.hand.some((card) => card.cardId === 'headache'), false, 'Calmness must prevent Hello There from applying Headache.');
  }
}

let notShinobiState = createInitialState();
notShinobiState.activePlayerId = 'P2';
notShinobiState.players.P1.position = { x: 2, y: 1 };
notShinobiState.players.P2.position = { x: 3, y: 1 };
notShinobiState.players.P1.pinnedStacks = 2;
notShinobiState.players.P1.lightsaberBuff = false;
notShinobiState.players.P2.hand = [{ instanceId: 'not-shinobi-attack', cardId: 'cut-them-legs' }];
ensureCardInHand(notShinobiState, 'P1', 'not-a-shinobi');
const notShinobiCard = notShinobiState.players.P1.hand.find((card) => card.cardId === 'not-a-shinobi')!;
const notShinobiAttack = applyCommand(notShinobiState, { type: 'attack', playerId: 'P2', cardInstanceId: 'not-shinobi-attack', targetId: 'P1' });
assert.equal(notShinobiAttack.ok, true);
if (notShinobiAttack.ok) {
  const notShinobiCombat = applyCommand(notShinobiAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: notShinobiCard.instanceId });
  assert.equal(notShinobiCombat.ok, true);
  if (notShinobiCombat.ok) {
    assert.equal(notShinobiCombat.state.players.P1.pinnedStacks, 0, 'The cleanse and combat immunity must leave Shinobi without debuffs.');
    assert.equal(notShinobiCombat.state.players.P1.lightsaberBuff, false, 'The simplified Defence card no longer applies Lightsaber.');
    notShinobiCombat.state.players.P2.hand.push({ instanceId: 'later-debuff-attack', cardId: 'light-the-saber' });
    const laterAttack = applyCommand(notShinobiCombat.state, { type: 'attack', playerId: 'P2', cardInstanceId: 'later-debuff-attack', targetId: 'P1' });
    assert.equal(laterAttack.ok, true);
    if (laterAttack.ok) {
      const laterCombat = applyCommand(laterAttack.state, { type: 'pass-defense', playerId: 'P1' });
      assert.equal(laterCombat.ok, true);
      if (laterCombat.ok) assert.equal(laterCombat.state.players.P1.pinnedStacks, 1, 'Debuff immunity must expire after the original combat.');
    }
  }
}

let doubleJumpState = createInitialState();
doubleJumpState.activePlayerId = 'P2';
doubleJumpState.players.P1.position = { x: 2, y: 1 };
doubleJumpState.players.P2.position = { x: 3, y: 1 };
doubleJumpState.players.P2.pinnedStacks = 2;
doubleJumpState.players.P2.hand = [{ instanceId: 'double-jump-attack', cardId: 'attack-3' }];
const doubleJumpCard = ensureCardInHand(doubleJumpState, 'P1', 'double-jump');

const pinnedCardState = createInitialState();
pinnedCardState.players.P1.hand = [];
pinnedCardState.players.P2.hand = [];
pinnedCardState.players.P1.pinnedStacks = 0;
applyPinned(pinnedCardState.players.P1, 3);
assert.equal(pinnedCardState.players.P1.hand.filter((card) => card.cardId === 'pinned').length, 3);
assert.equal(effectiveMoveRange(pinnedCardState.players.P1), 0);
const pinnedCardTurnEnd = applyCommand(pinnedCardState, { type: 'end-turn', playerId: 'P1' });
assert.equal(pinnedCardTurnEnd.ok, true);
if (pinnedCardTurnEnd.ok) {
  assert.equal(pinnedCardTurnEnd.state.players.P1.hand.filter((card) => card.cardId === 'pinned').length, 3, 'New Pinned Cards cannot be removed at the end of the turn in which they were obtained.');
  assert.equal(pinnedCardTurnEnd.state.players.P1.discard.some((card) => card.cardId === 'pinned'), false);
  const pinnedOpponentTurnEnd = applyCommand(pinnedCardTurnEnd.state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(pinnedOpponentTurnEnd.ok, true);
  if (pinnedOpponentTurnEnd.ok) {
    const pinnedNextTurnEnd = applyCommand(pinnedOpponentTurnEnd.state, { type: 'end-turn', playerId: 'P1' });
    assert.equal(pinnedNextTurnEnd.ok, true);
    if (pinnedNextTurnEnd.ok) assert.equal(pinnedNextTurnEnd.state.players.P1.hand.filter((card) => card.cardId === 'pinned').length, 2, 'One eligible Pinned Card is Removed at the end of the holder\'s next turn.');
  }
}

const pinnedOverstackState = createInitialState();
pinnedOverstackState.players.P1.hand = [];
pinnedOverstackState.players.P1.pinnedStacks = 0;
applyPinned(pinnedOverstackState.players.P1, 7);
const pinnedOverstackEnd = applyCommand(pinnedOverstackState, { type: 'end-turn', playerId: 'P1' });
assert.equal(pinnedOverstackEnd.ok, true);
if (pinnedOverstackEnd.ok) {
  assert.equal(pinnedOverstackEnd.state.phase, 'finished');
  assert.equal(pinnedOverstackEnd.state.winner, 'P2', 'A player who cannot discard enough non-Status cards must lose.');
  assert.equal(pinnedOverstackEnd.state.players.P1.hp, 0);
}

const headacheState = createInitialState();
headacheState.players.P1.hand = [{ instanceId: 'headache-test', cardId: 'headache', revealedToOpponent: true }];
const discardableHeadacheState = structuredClone(headacheState);
discardableHeadacheState.players.P1.freeMoveUsed = true;
const choseHeadacheDash = applyCommand(discardableHeadacheState, { type: 'dash', playerId: 'P1' });
assert.equal(choseHeadacheDash.ok, false, 'Dash is unavailable when the Hand contains no eligible payment Card.');
const removedHeadache = applyCommand(headacheState, { type: 'remove-status', playerId: 'P1', cardInstanceId: 'headache-test' });
assert.equal(removedHeadache.ok, true);
if (removedHeadache.ok) {
  assert.equal(removedHeadache.state.players.P1.actionsRemaining, 1);
  assert.equal(removedHeadache.state.players.P1.hand.some((card) => card.cardId === 'headache'), false);
  assert.equal(removedHeadache.state.players.P1.discard.some((card) => card.cardId === 'headache'), false, 'Removed Headache must not enter the Discard pile.');
}
const doubleJumpAttack = applyCommand(doubleJumpState, { type: 'attack', playerId: 'P2', cardInstanceId: 'double-jump-attack', targetId: 'P1' });
assert.equal(doubleJumpAttack.ok, true);
if (doubleJumpAttack.ok) {
  const doubleJumpCombat = applyCommand(doubleJumpAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: doubleJumpCard.instanceId });
  assert.equal(doubleJumpCombat.ok, true);
  if (doubleJumpCombat.ok) {
    assert.equal(doubleJumpCombat.state.players.P1.hp, 20, 'Two attacker Pinned stacks must raise Double Jump to 4 Defence Value.');
    assert.equal(doubleJumpCombat.state.phase, 'double-jump');
    const jumpOntoEnemy = applyCommand(doubleJumpCombat.state, { type: 'move', playerId: 'P1', to: { x: 3, y: 1 } });
    assert.equal(jumpOntoEnemy.ok, true);
    if (jumpOntoEnemy.ok) {
      assert.equal(jumpOntoEnemy.state.doubleJump?.stepsRemaining, 1);
      const illegalOccupiedFinish = applyCommand(jumpOntoEnemy.state, { type: 'move', playerId: 'P1', to: { x: 3, y: 1 } });
      assert.equal(illegalOccupiedFinish.ok, false);
      const jumpAway = applyCommand(jumpOntoEnemy.state, { type: 'move', playerId: 'P1', to: { x: 4, y: 1 } });
      assert.equal(jumpAway.ok, true);
      if (jumpAway.ok) {
        assert.equal(jumpAway.state.players.P2.pinnedStacks, 3);
        assert.equal(jumpAway.state.players.P1.movedThisTurn, false);
        assert.equal(jumpAway.state.phase, 'active');
      }
    }
  }
}

let highgroundState = createInitialState();
highgroundState.players.P1.position = { x: 2, y: 1 };
highgroundState.players.P2.position = { x: 3, y: 1 };
const highgroundCard = ensureCardInHand(highgroundState, 'P1', 'higround-advantage');
highgroundState.players.P1.hand = highgroundState.players.P1.hand.filter((card) => card.instanceId !== highgroundCard.instanceId);
highgroundState.players.P1.spellEcho[2] = highgroundCard;
highgroundState.players.P1.hand.push({ instanceId: 'highground-return-attack', cardId: 'attack-2' });
const highgroundLevelThree = applyCommand(highgroundState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(highgroundLevelThree.ok, true);
if (highgroundLevelThree.ok) {
  assert.equal(highgroundLevelThree.state.players.P1.lightsaberBuff, true);
  assert.equal(highgroundLevelThree.state.players.P1.lightsaberStacks, 1);
  assert.equal(highgroundLevelThree.state.players.P1.highgroundAdvantageBuff, true);
  const highgroundAttack = applyCommand(highgroundLevelThree.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'highground-return-attack', targetId: 'P2' });
  assert.equal(highgroundAttack.ok, true);
  if (highgroundAttack.ok) {
    assert.equal(highgroundAttack.state.players.P1.highgroundAdvantageBuff, false, 'Highground status is consumed as soon as an Attack is used.');
    const highgroundCombat = applyCommand(highgroundAttack.state, { type: 'pass-defense', playerId: 'P2' });
    assert.equal(highgroundCombat.ok, true);
    if (highgroundCombat.ok) assert.equal(highgroundCombat.state.players.P1.hand.some((card) => card.instanceId === 'highground-return-attack'), true);
  }
}
const stackedLightsaberState = createInitialState();
stackedLightsaberState.players.P1.lightsaberBuff = true;
stackedLightsaberState.players.P1.lightsaberStacks = 1;
markCharacterMoved(stackedLightsaberState.players.P1, 'voluntary');
assert.equal(stackedLightsaberState.players.P1.lightsaberStacks, 0);
assert.equal(stackedLightsaberState.players.P1.lightsaberMovementProtection, true);
const protectedLightsaberEnd = applyCommand(stackedLightsaberState, { type: 'end-turn', playerId: 'P1' });
assert.equal(protectedLightsaberEnd.ok, true);
if (protectedLightsaberEnd.ok) assert.equal(protectedLightsaberEnd.state.players.P1.lightsaberBuff, true);

const echoAdvanceState = createInitialState();
echoAdvanceState.players.P1.spellEcho = [
  { instanceId: 'advance-one', cardId: 'higround-advantage' },
  { instanceId: 'advance-two', cardId: 'echo-pulse' },
  null,
];
const echoAdvanceEnd = applyCommand(echoAdvanceState, { type: 'end-turn', playerId: 'P1' });
assert.equal(echoAdvanceEnd.ok, true);
if (echoAdvanceEnd.ok) assert.deepEqual(echoAdvanceEnd.state.players.P1.spellEcho.map((card) => card?.instanceId ?? null), [null, 'advance-one', 'advance-two']);
const usedPerkEchoState = createInitialState();
usedPerkEchoState.players.P1.perkUsed = true;
usedPerkEchoState.players.P1.spellEcho = [{ instanceId: 'used-perk-one', cardId: 'higround-advantage' }, null, null];
const usedPerkEchoEnd = applyCommand(usedPerkEchoState, { type: 'end-turn', playerId: 'P1' });
assert.equal(usedPerkEchoEnd.ok, true);
if (usedPerkEchoEnd.ok) assert.deepEqual(usedPerkEchoEnd.state.players.P1.spellEcho.map((card) => card?.instanceId ?? null), ['used-perk-one', null, null]);
const fullEchoState = createInitialState();
fullEchoState.players.P1.spellEcho = [
  { instanceId: 'full-one', cardId: 'higround-advantage' },
  { instanceId: 'full-two', cardId: 'echo-pulse' },
  { instanceId: 'full-three', cardId: 'higround-advantage' },
];
const fullEchoEnd = applyCommand(fullEchoState, { type: 'end-turn', playerId: 'P1' });
assert.equal(fullEchoEnd.ok, true);
if (fullEchoEnd.ok) assert.deepEqual(fullEchoEnd.state.players.P1.spellEcho.map((card) => card?.instanceId), ['full-one', 'full-two', 'full-three']);

const forceThrowState = createInitialState();
forceThrowState.players.P1.position = { x: 2, y: 1 };
forceThrowState.players.P2.position = { x: 3, y: 1 };
forceThrowState.objects = [{ id: 'test-crate', name: 'Test Crate', hp: 3, maxHp: 3, position: { x: 4, y: 1 } }];
const forceThrowCard = ensureCardInHand(forceThrowState, 'P1', 'force-throw');
forceThrowState.players.P1.hand = forceThrowState.players.P1.hand.filter((card) => card.instanceId !== forceThrowCard.instanceId);
forceThrowState.players.P1.spellEcho[2] = forceThrowCard;
const forceThrowLevelThree = applyCommand(forceThrowState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(forceThrowLevelThree.ok, true);
if (forceThrowLevelThree.ok) {
  assert.equal(forceThrowLevelThree.state.phase, 'choosing-force-throw-target');
  const forceTarget = applyCommand(forceThrowLevelThree.state, { type: 'force-throw-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  assert.equal(forceTarget.ok, true);
  if (forceTarget.ok) {
    const illegalPull = applyCommand(forceTarget.state, { type: 'force-throw-direction', playerId: 'P1', to: { x: 2, y: 1 } });
    assert.equal(illegalPull.ok, false);
    const forcePush = applyCommand(forceTarget.state, { type: 'force-throw-direction', playerId: 'P1', to: { x: 4, y: 1 } });
    assert.equal(forcePush.ok, true);
    if (forcePush.ok) {
      assert.equal(forcePush.state.players.P2.hp, 23, 'A Level 3 Force Throw target takes 1 Damage when colliding with anything.');
      assert.equal(forcePush.state.objects[0].hp, 3, 'Test Objects are indestructible.');
      assert.equal(forcePush.state.phase, 'active');
    }
  }
}
const forceEnemyCollision = createHotseatTestState(true, 'shinobi', 3);
forceEnemyCollision.objects = [];
forceEnemyCollision.players.P1.position = { x: 1, y: 1 };
forceEnemyCollision.players.P2.position = { x: 2, y: 1 };
forceEnemyCollision.players.P3.position = { x: 3, y: 1 };
forceEnemyCollision.phase = 'choosing-force-throw-target';
forceEnemyCollision.forceThrow = { casterId: 'P1', level: 3, distance: 3, targetRange: 4, targetKind: null, targetId: null, undo: null };
const forceEnemyTarget = applyCommand(forceEnemyCollision, { type: 'force-throw-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
assert.equal(forceEnemyTarget.ok, true);
if (forceEnemyTarget.ok) {
  const forceEnemyPush = applyCommand(forceEnemyTarget.state, { type: 'force-throw-direction', playerId: 'P1', to: { x: 5, y: 1 } });
  assert.equal(forceEnemyPush.ok, true);
  if (forceEnemyPush.ok) {
    assert.equal(forceEnemyPush.state.players.P2.hp, 19, 'The pushed enemy takes 1 collision Damage.');
    assert.equal(forceEnemyPush.state.players.P3.hp, 19, 'The enemy Player struck by another enemy also takes 1 collision Damage.');
  }
}
const directForceState = createInitialState();
directForceState.players.P1.position = { x: 2, y: 0 };
directForceState.objects = [{ id: 'direct-force-object', name: 'Training Object', hp: 3, maxHp: 3, position: { x: 3, y: 0 } }];
const directForceCard = ensureCardInHand(directForceState, 'P1', 'force-throw');
const directForcePlay = applyCommand(directForceState, { type: 'play-perk', playerId: 'P1', cardInstanceId: directForceCard.instanceId, destination: 'direct' });
assert.equal(directForcePlay.ok, true);
if (directForcePlay.ok) {
  assert.equal(directForcePlay.state.players.P1.discard.some((card) => card.instanceId === directForceCard.instanceId), true);
  assert.equal(directForcePlay.state.phase, 'choosing-force-throw-target');
  assert.equal(directForcePlay.state.forceThrow?.targetRange, 4, 'Level 1 Force Throw has Range 4.');
  const cancelledForce = applyCommand(directForcePlay.state, { type: 'cancel-targeting', playerId: 'P1' });
  assert.equal(cancelledForce.ok, true);
  if (cancelledForce.ok) {
    assert.equal(cancelledForce.state.players.P1.hand.some((card) => card.instanceId === directForceCard.instanceId), true);
    assert.equal(cancelledForce.state.players.P1.actionsRemaining, 2);
    assert.equal(cancelledForce.state.players.P1.perkUsed, false);
  }
  const directTarget = applyCommand(directForcePlay.state, { type: 'force-throw-target', playerId: 'P1', targetKind: 'object', targetId: 'direct-force-object' });
  assert.equal(directTarget.ok, true);
  if (directTarget.ok) {
    const cancelledDirection = applyCommand(directTarget.state, { type: 'cancel-targeting', playerId: 'P1' });
    assert.equal(cancelledDirection.ok, true);
    if (cancelledDirection.ok) {
      assert.equal(cancelledDirection.state.phase, 'active');
      assert.equal(cancelledDirection.state.forceThrow, null);
      assert.equal(cancelledDirection.state.players.P1.hand.some((card) => card.instanceId === directForceCard.instanceId), true);
      assert.equal(cancelledDirection.state.players.P1.actionsRemaining, 2);
      assert.equal(cancelledDirection.state.players.P1.perkUsed, false);
    }
    const directPush = applyCommand(directTarget.state, { type: 'force-throw-direction', playerId: 'P1', to: { x: 4, y: 1 } });
    assert.equal(directPush.ok, true);
    if (directPush.ok) assert.deepEqual(directPush.state.objects[0].position, { x: 6, y: 3 });
  }
}
const forcePullState = createInitialState();
forcePullState.players.P1.position = { x: 1, y: 0 };
forcePullState.players.P2.position = { x: 3, y: 2 };
const forcePullCard = ensureCardInHand(forcePullState, 'P1', 'force-pull');
const forcePullPlay = applyCommand(forcePullState, { type: 'play-perk', playerId: 'P1', cardInstanceId: forcePullCard.instanceId, destination: 'direct' });
assert.equal(forcePullPlay.ok, true);
if (forcePullPlay.ok) {
  assert.equal(forcePullPlay.state.phase, 'choosing-force-pull-target');
  assert.equal(forcePullPlay.state.forcePull?.targetRange, 4, 'Level 1 Force Pull has Range 4.');
  const pulled = applyCommand(forcePullPlay.state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  assert.equal(pulled.ok, true);
  if (pulled.ok) {
    assert.deepEqual(pulled.state.players.P2.position, { x: 2, y: 1 });
    assert.equal(pulled.state.players.P2.hp, 24, 'Force Pull movement must not deal collision damage.');
  }
  const cancelledPull = applyCommand(forcePullPlay.state, { type: 'cancel-targeting', playerId: 'P1' });
  assert.equal(cancelledPull.ok, true);
  if (cancelledPull.ok) {
    assert.equal(cancelledPull.state.players.P1.hand.some((card) => card.instanceId === forcePullCard.instanceId), true);
    assert.equal(cancelledPull.state.players.P1.actionsRemaining, 2);
  }
}
const naturalObjectPullState = createInitialState();
naturalObjectPullState.players.P1.position = { x: 1, y: 1 };
naturalObjectPullState.players.P2.position = { x: 8, y: 7 };
naturalObjectPullState.objects = [{ id: 'natural-pull-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 5, y: 2 } }];
const naturalObjectPullCard = ensureCardInHand(naturalObjectPullState, 'P1', 'force-pull');
const naturalObjectPullPlay = applyCommand(naturalObjectPullState, { type: 'play-perk', playerId: 'P1', cardInstanceId: naturalObjectPullCard.instanceId, destination: 'direct' });
assert.equal(naturalObjectPullPlay.ok, true);
if (naturalObjectPullPlay.ok) {
  const naturalObjectPull = applyCommand(naturalObjectPullPlay.state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'object', targetId: 'natural-pull-box' });
  assert.equal(naturalObjectPull.ok, true);
  if (naturalObjectPull.ok) assert.deepEqual(naturalObjectPull.state.objects[0].position, { x: 4, y: 2 }, 'Force Pull follows the natural line toward the caster instead of taking an equal-distance diagonal step.');
}
const levelThreePullState = createInitialState();
levelThreePullState.players.P1.position = { x: 1, y: 0 };
levelThreePullState.players.P2.position = { x: 4, y: 3 };
levelThreePullState.objects = [];
const levelThreePullCard = ensureCardInHand(levelThreePullState, 'P1', 'force-pull');
levelThreePullState.players.P1.hand = levelThreePullState.players.P1.hand.filter((card) => card.instanceId !== levelThreePullCard.instanceId);
levelThreePullState.players.P1.spellEcho[2] = levelThreePullCard;
const levelThreePullPlay = applyCommand(levelThreePullState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(levelThreePullPlay.ok, true);
if (levelThreePullPlay.ok) {
  assert.equal(levelThreePullPlay.state.forcePull?.targetRange, 5, 'Higher-level Force Pull adds 1 Range to its new Range 4 base.');
  const pulled = applyCommand(levelThreePullPlay.state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  assert.equal(pulled.ok, true);
  if (pulled.ok) {
    assert.deepEqual(pulled.state.players.P2.position, { x: 2, y: 1 });
    assert.equal(pulled.state.players.P2.hand.filter((card) => card.cardId === 'pinned').length, 1);
  }
}
const swiftformState = createInitialState();
swiftformState.players.P1.position = { x: 1, y: 0 };
swiftformState.players.P2.position = { x: 2, y: 1 };
const swiftformCard = ensureCardInHand(swiftformState, 'P1', 'swiftform');
swiftformState.players.P1.hand = swiftformState.players.P1.hand.filter((card) => card.instanceId !== swiftformCard.instanceId);
swiftformState.players.P1.spellEcho[2] = swiftformCard;
const swiftformPlay = applyCommand(swiftformState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(swiftformPlay.ok, true);
if (swiftformPlay.ok) {
  assert.equal(effectiveMoveRange(swiftformPlay.state.players.P1), 4);
  const swiftformMove = applyCommand(swiftformPlay.state, { type: 'free-move', playerId: 'P1' });
  assert.equal(swiftformMove.ok, true);
  if (swiftformMove.ok) {
    const enteredEnemySquare = applyCommand(swiftformMove.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 1 } });
    assert.equal(enteredEnemySquare.ok, true, 'Swiftform must allow Shinobi to enter an enemy-occupied square when movement remains.');
    if (!enteredEnemySquare.ok) throw new Error('Swiftform enemy-square entry failed.');
    assert.equal(enteredEnemySquare.state.players.P1.swiftformEnemyUnderfoot, 'P2');
    const illegalEndOnEnemy = applyCommand(enteredEnemySquare.state, { type: 'end-turn', playerId: 'P1' });
    assert.equal(illegalEndOnEnemy.ok, false, 'Shinobi cannot end the turn on an enemy-occupied square.');
    const passedEnemy = applyCommand(enteredEnemySquare.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 2 } });
    assert.equal(passedEnemy.ok, true);
    if (passedEnemy.ok) {
      assert.equal(passedEnemy.state.players.P2.hand.filter((card) => card.cardId === 'pinned').length, 1);
      const enteredSameEnemyAgain = applyCommand(passedEnemy.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 1 } });
      assert.equal(enteredSameEnemyAgain.ok, true);
      if (!enteredSameEnemyAgain.ok) throw new Error('Second Swiftform pass entry failed.');
      const leftSameEnemyAgain = applyCommand(enteredSameEnemyAgain.state, { type: 'move', playerId: 'P1', to: { x: 1, y: 1 } });
      assert.equal(leftSameEnemyAgain.ok, true);
      if (!leftSameEnemyAgain.ok) throw new Error('Second Swiftform pass exit failed.');
      assert.equal(leftSameEnemyAgain.state.players.P2.hand.filter((card) => card.cardId === 'pinned').length, 1, 'Swiftform may apply Pinned only once per enemy per turn.');
      const swiftformEnd = applyCommand(leftSameEnemyAgain.state, { type: 'end-turn', playerId: 'P1' });
      assert.equal(swiftformEnd.ok, true);
      if (swiftformEnd.ok) assert.equal(swiftformEnd.state.players.P1.lightsaberBuff, true, 'Swiftform level 3 must grant Lightsaber even after movement.');
    }
  }
}
const mindTricksState = createInitialState();
const mindTricksCard = ensureCardInHand(mindTricksState, 'P1', 'mind-tricks');
const mindTricksPlay = applyCommand(mindTricksState, { type: 'play-perk', playerId: 'P1', cardInstanceId: mindTricksCard.instanceId, destination: 'direct' });
assert.equal(mindTricksPlay.ok, true);
if (mindTricksPlay.ok) {
  const cancelledMindTricks = applyCommand(mindTricksPlay.state, { type: 'cancel-targeting', playerId: 'P1' });
  assert.equal(cancelledMindTricks.ok, true);
  if (cancelledMindTricks.ok) assert.equal(cancelledMindTricks.state.players.P1.hand.some((card) => card.instanceId === mindTricksCard.instanceId), true);
  const noDiscardMindTricks = applyCommand(mindTricksPlay.state, { type: 'mind-tricks-finish', playerId: 'P1' });
  assert.equal(noDiscardMindTricks.ok, true);
  if (noDiscardMindTricks.ok) assert.equal(noDiscardMindTricks.state.phase, 'active');
}
const mindTricksLevelThree = createInitialState();
const mindLevelThreeCard = ensureCardInHand(mindTricksLevelThree, 'P1', 'mind-tricks');
mindTricksLevelThree.players.P1.hand = [{ instanceId: 'mind-payment-1', cardId: 'attack-2' }, { instanceId: 'mind-payment-2', cardId: 'attack-3' }];
mindTricksLevelThree.players.P1.spellEcho[2] = mindLevelThreeCard;
mindTricksLevelThree.players.P2.hand = [{ instanceId: 'mind-enemy-1', cardId: 'attack-2' }, { instanceId: 'mind-enemy-2', cardId: 'defend-1' }];
const mindLevelThreePlay = applyCommand(mindTricksLevelThree, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(mindLevelThreePlay.ok, true);
if (mindLevelThreePlay.ok) {
  const paidMind = applyCommand(mindLevelThreePlay.state, { type: 'mind-tricks-discard', playerId: 'P1', cardInstanceId: 'mind-payment-1' });
  assert.equal(paidMind.ok, true);
  if (paidMind.ok) {
    assert.equal(paidMind.state.players.P1.hand.some((card) => card.instanceId === 'mind-payment-1'), true, 'A card revealed for Mind Tricks must remain in Shinobi\'s Hand.');
    assert.equal(paidMind.state.players.P1.hand.find((card) => card.instanceId === 'mind-payment-1')?.revealedToOpponent, true);
    assert.equal(paidMind.state.players.P1.discard.some((card) => card.instanceId === 'mind-payment-1'), false);
    const tooLateToCancel = applyCommand(paidMind.state, { type: 'cancel-targeting', playerId: 'P1' });
    assert.equal(tooLateToCancel.ok, false);
    const finishMind = applyCommand(paidMind.state, { type: 'mind-tricks-finish', playerId: 'P1' });
    assert.equal(finishMind.ok, true);
    if (finishMind.ok) {
      assert.equal(finishMind.state.players.P2.deck.some((card) => card.cardId === 'headache'), true);
      const enemyDiscard = applyCommand(finishMind.state, { type: 'mind-tricks-enemy-discard', playerId: 'P2', cardInstanceId: 'mind-enemy-1' });
      assert.equal(enemyDiscard.ok, true);
      if (enemyDiscard.ok) assert.equal(enemyDiscard.state.phase, 'active');
    }
  }
}
const harmlessEdgeState = createInitialState();
harmlessEdgeState.players.P1.position = { x: 6, y: 1 };
harmlessEdgeState.players.P2.position = { x: 7, y: 1 };
harmlessEdgeState.objects = [];
harmlessEdgeState.phase = 'choosing-force-throw-target';
harmlessEdgeState.forceThrow = { casterId: 'P1', level: 3, distance: 3, targetRange: 2, targetKind: null, targetId: null, undo: null };
const edgeTarget = applyCommand(harmlessEdgeState, { type: 'force-throw-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
assert.equal(edgeTarget.ok, true);
if (edgeTarget.ok) {
  const edgePush = applyCommand(edgeTarget.state, { type: 'force-throw-direction', playerId: 'P1', to: { x: 8, y: 1 } });
  assert.equal(edgePush.ok, true);
  if (edgePush.ok) { assert.equal(edgePush.state.players.P2.hp, 23, 'A pushed enemy takes 1 Damage when colliding with the board edge.'); assert.deepEqual(edgePush.state.players.P2.position, { x: 8, y: 1 }); }
}

const orkkCombat = createInitialState();
orkkCombat.players.P1.position = { x: 2, y: 1 };
orkkCombat.players.P2.position = { x: 3, y: 1 };
orkkCombat.players.P1.hand = [{ instanceId: 'orkk-test-attack', cardId: 'attack-3' }];
orkkCombat.players.P2.hand = [{ instanceId: 'orkk-test-defense', cardId: 'defend-1' }];
const attackOrkk = applyCommand(orkkCombat, { type: 'attack', playerId: 'P1', cardInstanceId: 'orkk-test-attack', targetId: 'P2' });
assert.equal(attackOrkk.ok, true);
if (attackOrkk.ok) {
  const defendOrkk = applyCommand(attackOrkk.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'orkk-test-defense' });
  assert.equal(defendOrkk.ok, true);
  if (defendOrkk.ok) {
    assert.equal(defendOrkk.state.players.P2.hp, 23, 'Equipped Shield adds +1 to Da Orkk Defend Cards.');
    assert.equal(defendOrkk.state.players.P2.rageStacks, 1, 'Damage received during an enemy turn continues to generate Rage.');
  }
}

const ragePerCombat = createInitialState();
ragePerCombat.players.P1.position = { x: 2, y: 1 };
ragePerCombat.players.P2.position = { x: 3, y: 1 };
ragePerCombat.players.P1.hand = [
  { instanceId: 'multi-damage-combat', cardId: 'hello-there' },
  { instanceId: 'second-combat', cardId: 'attack-2' },
];
ragePerCombat.players.P2.hand = [{ instanceId: 'orkk-pinned', cardId: 'pinned', revealedToOpponent: true }];
const multiDamageAttack = applyCommand(ragePerCombat, { type: 'attack', playerId: 'P1', cardInstanceId: 'multi-damage-combat', targetId: 'P2' });
assert.equal(multiDamageAttack.ok, true);
if (multiDamageAttack.ok) {
  const resolvedMultiDamage = applyCommand(multiDamageAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(resolvedMultiDamage.ok, true);
  if (resolvedMultiDamage.ok) {
    assert.equal(resolvedMultiDamage.state.players.P2.rageStacks, 1, 'Several Damage instances from one card effect generate only 1 Rage in total.');
    const secondAttack = applyCommand(resolvedMultiDamage.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'second-combat', targetId: 'P2' });
    assert.equal(secondAttack.ok, true);
    if (secondAttack.ok) {
      const resolvedSecond = applyCommand(secondAttack.state, { type: 'pass-defense', playerId: 'P2' });
      assert.equal(resolvedSecond.ok, true);
      if (resolvedSecond.ok) assert.equal(resolvedSecond.state.players.P2.rageStacks, 2, 'The next action during the same turn can generate Rage again.');
    }
  }
}

const daBlokkState = createInitialState();
daBlokkState.players.P1.position = { x: 2, y: 1 };
daBlokkState.players.P2.position = { x: 3, y: 1 };
daBlokkState.players.P1.hand = [{ instanceId: 'da-blokk-attack', cardId: 'cut-them-legs' }];
daBlokkState.players.P2.hand = [{ instanceId: 'da-blokk-defense', cardId: 'da-blokk' }];
const attackDaBlokk = applyCommand(daBlokkState, { type: 'attack', playerId: 'P1', cardInstanceId: 'da-blokk-attack', targetId: 'P2' });
assert.equal(attackDaBlokk.ok, true);
if (attackDaBlokk.ok) {
  const defendDaBlokk = applyCommand(attackDaBlokk.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'da-blokk-defense' });
  assert.equal(defendDaBlokk.ok, true);
  if (defendDaBlokk.ok) {
    assert.equal(defendDaBlokk.state.players.P2.hp, 23, 'Da Blokk has 2 total Defence while the Shield is equipped.');
    assert.equal(defendDaBlokk.state.players.P2.rageStacks, 2, 'Damage Rage plus Da Blokk additional Rage generates 2 total stacks.');
    assert.equal(defendDaBlokk.state.players.P2.hand.some((card) => card.cardId === 'pinned'), false, 'Da Blokk cancels the Attack Card effect through the universal cancellation rule.');
  }
}

const doubleRageState = createInitialState();
doubleRageState.players.P1.position = { x: 2, y: 1 };
doubleRageState.players.P2.position = { x: 3, y: 1 };
doubleRageState.players.P1.hand = [{ instanceId: 'double-first-attack', cardId: 'attack-3' }, { instanceId: 'double-second-attack', cardId: 'attack-2' }];
doubleRageState.players.P2.hand = [{ instanceId: 'double-defense', cardId: 'double' }];
const attackDouble = applyCommand(doubleRageState, { type: 'attack', playerId: 'P1', cardInstanceId: 'double-first-attack', targetId: 'P2' });
assert.equal(attackDouble.ok, true);
if (attackDouble.ok) {
  const defendDouble = applyCommand(attackDouble.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'double-defense' });
  assert.equal(defendDouble.ok, true);
  if (defendDouble.ok) {
    assert.equal(defendDouble.state.players.P2.rageStacks, 2, 'Double! doubles damage Rage during its combat.');
    assert.equal(defendDouble.state.players.P2.doubleRageUntilEnemyTurnEnd, true);
    const secondDoubleAttack = applyCommand(defendDouble.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'double-second-attack', targetId: 'P2' });
    assert.equal(secondDoubleAttack.ok, true);
    if (secondDoubleAttack.ok) {
      const secondDoubleResult = applyCommand(secondDoubleAttack.state, { type: 'pass-defense', playerId: 'P2' });
      assert.equal(secondDoubleResult.ok, true);
      if (secondDoubleResult.ok) {
        assert.equal(secondDoubleResult.state.players.P2.rageStacks, 4, 'Double! remains active for another enemy Combat in the same turn.');
        const endedDoubleTurn = applyCommand(secondDoubleResult.state, { type: 'end-turn', playerId: 'P1' });
        assert.equal(endedDoubleTurn.ok, true);
        if (endedDoubleTurn.ok) assert.equal(endedDoubleTurn.state.players.P2.doubleRageUntilEnemyTurnEnd, false, 'Double! expires at the end of the attacking Player\'s turn.');
      }
    }
  }
}

const ownTurnRageState = createInitialState();
ownTurnRageState.activePlayerId = 'P2';
ownTurnRageState.players.P2.position = { x: 3, y: 1 };
ownTurnRageState.players.P1.position = { x: 2, y: 1 };
ownTurnRageState.players.P2.rageStacks = 1;
ownTurnRageState.players.P2.hand = [{ instanceId: 'own-turn-rage-attack', cardId: 'attack-2' }];
ownTurnRageState.players.P1.hand = [{ instanceId: 'own-turn-rage-counter', cardId: 'counterspell' }];
ownTurnRageState.players.P1.manaPoints = 2;
const ownTurnRageAttack = applyCommand(ownTurnRageState, { type: 'attack', playerId: 'P2', cardInstanceId: 'own-turn-rage-attack', targetId: 'P1' });
assert.equal(ownTurnRageAttack.ok, true);
if (ownTurnRageAttack.ok) {
  const ownTurnRageCounter = applyCommand(ownTurnRageAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: 'own-turn-rage-counter' });
  assert.equal(ownTurnRageCounter.ok, true);
  if (ownTurnRageCounter.ok) {
    assert.equal(ownTurnRageCounter.state.players.P2.hp, ownTurnRageState.players.P2.maxHp - 1, 'Counterspell deals exactly 1 Damage when Logan has any stored Mana, regardless of the stored amount.');
    assert.equal(ownTurnRageCounter.state.players.P2.deck.at(-1)?.cardId, 'headache', 'Counterspell still places Headache on top of the attacker\'s Deck.');
    assert.equal(ownTurnRageCounter.state.players.P2.rageStacks, 1, 'Own-turn Damage adds 1 Rage before the Attack removes exactly 1 after combat.');
    const ownTurnRageEnd = applyCommand(ownTurnRageCounter.state, { type: 'end-turn', playerId: 'P2' });
    assert.equal(ownTurnRageEnd.ok, true);
    if (ownTurnRageEnd.ok) assert.equal(ownTurnRageEnd.state.players.P2.rageStacks, 0, 'Rage gained during Da Orkk\'s turn is still reduced by 1 at that turn\'s end.');
  }
}

const arcaneShieldEquipped = createInitialState();
arcaneShieldEquipped.players.P1.position = { x: 2, y: 1 };
arcaneShieldEquipped.players.P2.position = { x: 3, y: 1 };
arcaneShieldEquipped.players.P1.hand = [{ instanceId: 'arcane-shield-attack', cardId: 'attack-2' }];
arcaneShieldEquipped.players.P2.hand = [{ instanceId: 'arcane-shield-defense', cardId: 'arcane-shield' }];
const attackEquippedArcaneShield = applyCommand(arcaneShieldEquipped, { type: 'attack', playerId: 'P1', cardInstanceId: 'arcane-shield-attack', targetId: 'P2' });
assert.equal(attackEquippedArcaneShield.ok, true);
if (attackEquippedArcaneShield.ok) {
  const defendEquippedArcaneShield = applyCommand(attackEquippedArcaneShield.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'arcane-shield-defense' });
  assert.equal(defendEquippedArcaneShield.ok, true);
  if (defendEquippedArcaneShield.ok) {
    assert.equal(defendEquippedArcaneShield.state.players.P2.shieldEquipped, true, 'Arcane Shield leaves a Shield equipped when combat began.');
    assert.equal(defendEquippedArcaneShield.state.objects.some((object) => object.kind === 'orkk-shield' && object.ownerId === 'P2'), false, 'Arcane Shield does not drop an equipped Shield onto the Board.');
  }
}

const arcaneShieldUnequipped = createInitialState();
arcaneShieldUnequipped.players.P1.position = { x: 3, y: 2 };
arcaneShieldUnequipped.players.P2.position = { x: 4, y: 3 };
arcaneShieldUnequipped.players.P2.shieldEquipped = false;
arcaneShieldUnequipped.players.P1.hand = [{ instanceId: 'arcane-rage-attack', cardId: 'attack-2' }];
arcaneShieldUnequipped.players.P2.hand = [{ instanceId: 'arcane-rage-defense', cardId: 'arcane-shield' }];
arcaneShieldUnequipped.objects = [
  { id: 'arcane-far-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 8, y: 7 } },
  { id: 'arcane-existing-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } },
];
const attackUnequippedArcaneShield = applyCommand(arcaneShieldUnequipped, { type: 'attack', playerId: 'P1', cardInstanceId: 'arcane-rage-attack', targetId: 'P2' });
assert.equal(attackUnequippedArcaneShield.ok, true);
if (attackUnequippedArcaneShield.ok) {
  const defendUnequippedArcaneShield = applyCommand(attackUnequippedArcaneShield.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'arcane-rage-defense' });
  assert.equal(defendUnequippedArcaneShield.ok, true);
  if (defendUnequippedArcaneShield.ok) {
    assert.equal(defendUnequippedArcaneShield.state.players.P2.hp, 24);
    assert.equal(defendUnequippedArcaneShield.state.players.P1.hp, 18, 'Arcane Shield deals 2 Damage when its recall path crosses the enemy.');
    assert.equal(defendUnequippedArcaneShield.state.players.P2.rageStacks, 0, 'Arcane Shield no longer generates Rage when the Shield began unequipped.');
    assert.equal(defendUnequippedArcaneShield.state.players.P2.shieldEquipped, true, 'Arcane Shield recalls and equips an unequipped Shield.');
    assert.equal(defendUnequippedArcaneShield.state.objects.some((object) => object.id === 'arcane-existing-shield'), false, 'The recalled Shield is removed from the Board.');
    assert.equal(defendUnequippedArcaneShield.state.objects.some((object) => object.id === 'arcane-far-shield'), true, 'When optimal routes cross equal enemy counts, Arcane Shield recalls the nearest Shield.');
    const arcaneAnimation = defendUnequippedArcaneShield.state.objectPushAnimations.find((event) => event.objectId === 'arcane-existing-shield');
    assert.equal(arcaneAnimation?.path?.some((cell) => cell.x === 3 && cell.y === 2), true, 'Arcane Shield animation passes through the enemy-occupied Square.');
    assert.equal(arcaneAnimation?.equipPlayerId, 'P2');
    assert.deepEqual(defendUnequippedArcaneShield.state.players.P1.position, { x: 3, y: 2 }, 'Arcane Shield damages crossed enemies without pulling them.');
    const arcaneShieldDamage = defendUnequippedArcaneShield.state.objectPushAnimations.find((event) => event.damage?.playerId === 'P1' && event.damage.amount === 2);
    assert.equal(arcaneShieldDamage?.damage?.triggerAnimationId, arcaneAnimation?.id, 'Arcane Shield damage waits for its recall animation to cross the enemy.');
    assert.equal(typeof arcaneShieldDamage?.damage?.triggerRouteProgress, 'number');
  }
}

const countaSpellState = createInitialState();
countaSpellState.players.P1.position = { x: 2, y: 1 };
countaSpellState.players.P2.position = { x: 3, y: 1 };
countaSpellState.players.P2.rageStacks = 2;
countaSpellState.players.P1.hand = [{ instanceId: 'countaspell-attack', cardId: 'attack-3' }];
countaSpellState.players.P1.discard = [];
countaSpellState.players.P2.hand = [{ instanceId: 'countaspell-defense', cardId: 'countaspell' }];
const attackCountaSpell = applyCommand(countaSpellState, { type: 'attack', playerId: 'P1', cardInstanceId: 'countaspell-attack', targetId: 'P2' });
assert.equal(attackCountaSpell.ok, true);
if (attackCountaSpell.ok) {
  const defendCountaSpell = applyCommand(attackCountaSpell.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'countaspell-defense' });
  assert.equal(defendCountaSpell.ok, true);
  if (defendCountaSpell.ok) {
    const headaches = defendCountaSpell.state.players.P1.discard.filter((card) => card.cardId === 'headache');
    assert.equal(headaches.length, 2, 'CountaSpell adds one Headache per Rage Stack after combat.');
    assert.equal(headaches.every((card) => card.revealedToOpponent), true, 'Generated Status Cards are public information.');
  }
}

const manaBaryerEquipped = createInitialState();
manaBaryerEquipped.players.P1.position = { x: 2, y: 1 };
manaBaryerEquipped.players.P2.position = { x: 3, y: 1 };
manaBaryerEquipped.players.P1.hand = [{ instanceId: 'mana-equipped-attack', cardId: 'attack-3' }];
manaBaryerEquipped.players.P2.hand = [{ instanceId: 'mana-equipped-defense', cardId: 'mana-baryer' }];
const attackManaEquipped = applyCommand(manaBaryerEquipped, { type: 'attack', playerId: 'P1', cardInstanceId: 'mana-equipped-attack', targetId: 'P2' });
assert.equal(attackManaEquipped.ok, true);
if (attackManaEquipped.ok) {
  const defendManaEquipped = applyCommand(attackManaEquipped.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'mana-equipped-defense' });
  assert.equal(defendManaEquipped.ok, true);
  if (defendManaEquipped.ok) {
    assert.equal(defendManaEquipped.state.players.P2.hp, 24, 'Mana Baryer has 5 Defend Value while Shield is equipped.');
    assert.equal(defendManaEquipped.state.combatReveal?.defendTotal, 5, 'Mana Baryer transforms to 5 DEF without adding the general equipped-Shield bonus again.');
  }
}

const manaBaryerRecall = createInitialState();
manaBaryerRecall.players.P1.position = { x: 3, y: 2 };
manaBaryerRecall.players.P2.position = { x: 4, y: 3 };
manaBaryerRecall.players.P2.shieldEquipped = false;
manaBaryerRecall.players.P1.hand = [{ instanceId: 'mana-recall-attack', cardId: 'attack-3' }];
manaBaryerRecall.players.P2.hand = [{ instanceId: 'mana-recall-defense', cardId: 'mana-baryer' }];
manaBaryerRecall.objects = [
  { id: 'mana-far-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 8, y: 7 } },
  { id: 'mana-recall-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } },
];
const attackManaRecall = applyCommand(manaBaryerRecall, { type: 'attack', playerId: 'P1', cardInstanceId: 'mana-recall-attack', targetId: 'P2' });
assert.equal(attackManaRecall.ok, true);
if (attackManaRecall.ok) {
  const defendManaRecall = applyCommand(attackManaRecall.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'mana-recall-defense' });
  assert.equal(defendManaRecall.ok, true);
  if (defendManaRecall.ok) {
    assert.equal(defendManaRecall.state.players.P2.hp, 23, 'Unequipped Mana Baryer uses only its base 2 Defend Value.');
    assert.equal(defendManaRecall.state.players.P1.hp, 18, 'Mana Baryer deals 2 damage when its recall path crosses the attacker.');
    assert.equal(defendManaRecall.state.players.P2.shieldEquipped, true);
    assert.equal(defendManaRecall.state.objects.some((object) => object.id === 'mana-recall-shield'), false);
    assert.equal(defendManaRecall.state.objects.some((object) => object.id === 'mana-far-shield'), true, 'When optimal routes cross equal enemy counts, Mana Baryer recalls the nearest Shield.');
    const manaAnimation = defendManaRecall.state.objectPushAnimations.find((event) => event.objectId === 'mana-recall-shield');
    assert.equal(manaAnimation?.path?.some((cell) => cell.x === 3 && cell.y === 2), true, 'Mana Baryer animation retains the walkable path through the enemy Square.');
    assert.equal(manaAnimation?.equipPlayerId, 'P2');
    const manaDamageAnimation = defendManaRecall.state.objectPushAnimations.find((event) => event.damage?.playerId === 'P1');
    assert.equal(manaDamageAnimation?.damage?.triggerAnimationId, manaAnimation?.id, 'Mana Baryer damage waits until the recalled Shield reaches the crossed enemy.');
  }
}

const rageAttack = createInitialState();
rageAttack.activePlayerId = 'P2';
rageAttack.players.P2.position = { x: 3, y: 1 };
rageAttack.players.P1.position = { x: 2, y: 1 };
rageAttack.players.P2.rageStacks = 3;
rageAttack.players.P2.hand = [{ instanceId: 'rage-attack', cardId: 'attack-2' }];
const spentRage = applyCommand(rageAttack, { type: 'attack', playerId: 'P2', cardInstanceId: 'rage-attack', targetId: 'P1' });
assert.equal(spentRage.ok, true);
if (spentRage.ok) {
  assert.equal(spentRage.state.pendingAttack?.attackValue, 5);
  assert.equal(spentRage.state.players.P2.rageStacks, 3, 'All Rage augments the Attack before combat.');
  const resolvedRageAttack = applyCommand(spentRage.state, { type: 'pass-defense', playerId: 'P1' });
  assert.equal(resolvedRageAttack.ok, true);
  if (resolvedRageAttack.ok) assert.equal(resolvedRageAttack.state.players.P2.rageStacks, 0, 'Every Rage Stack applied to the Attack is consumed when combat resolves.');
}

const unshieldedStart = createInitialState();
unshieldedStart.players.P2.shieldEquipped = false;
const startedOrkkTurn = applyCommand(unshieldedStart, { type: 'end-turn', playerId: 'P1' });
assert.equal(startedOrkkTurn.ok, true);
if (startedOrkkTurn.ok) assert.equal(startedOrkkTurn.state.players.P2.rageStacks, 1, 'An unshielded Da Orkk with no Rage gains 1 at turn start.');

const arkaneDirect = createInitialState();
arkaneDirect.activePlayerId = 'P2';
arkaneDirect.players.P2.position = { x: 1, y: 3 };
arkaneDirect.objects = [];
const arkaneCard = ensureCardInHand(arkaneDirect, 'P2', 'arkane-arow');
const startArkane = applyCommand(arkaneDirect, { type: 'play-perk', playerId: 'P2', cardInstanceId: arkaneCard.instanceId, destination: 'direct' });
assert.equal(startArkane.ok, true);
if (startArkane.ok) {
  assert.equal(startArkane.state.phase, 'choosing-arkane-arow-target');
  const cancelArkane = applyCommand(startArkane.state, { type: 'cancel-targeting', playerId: 'P2' });
  assert.equal(cancelArkane.ok, true);
  if (cancelArkane.ok) assert.equal(cancelArkane.state.players.P2.hand.some((card) => card.cardId === 'arkane-arow'), true, 'Escape restores ARKANE AROW before a target is selected.');
  const landShield = applyCommand(startArkane.state, { type: 'arkane-arow-target', playerId: 'P2', to: { x: 3, y: 1 } });
  assert.equal(landShield.ok, true);
  if (landShield.ok) {
    assert.equal(landShield.state.players.P2.shieldEquipped, false);
    assert.deepEqual(landShield.state.objects.find((object) => object.kind === 'orkk-shield')?.position, { x: 3, y: 1 });
  }
}

const arkaneLevelThree = createInitialState();
arkaneLevelThree.activePlayerId = 'P2';
arkaneLevelThree.players.P2.position = { x: 7, y: 1 };
arkaneLevelThree.players.P1.position = { x: 8, y: 1 };
arkaneLevelThree.objects = [];
arkaneLevelThree.players.P2.hand = [];
arkaneLevelThree.players.P2.spellEcho[2] = { instanceId: 'arkane-level-three', cardId: 'arkane-arow' };
const useArkaneThree = applyCommand(arkaneLevelThree, { type: 'use-echo-perk', playerId: 'P2', position: 3 });
assert.equal(useArkaneThree.ok, true);
if (useArkaneThree.ok) {
  const blockedPush = applyCommand(useArkaneThree.state, { type: 'arkane-arow-target', playerId: 'P2', to: { x: 8, y: 1 } });
  assert.equal(blockedPush.ok, true);
  if (blockedPush.ok) {
    assert.equal(blockedPush.state.phase, 'active', 'An ARKANE AROW used from Spell Echo clears its targeting phase after the Shield is thrown.');
    assert.equal(blockedPush.state.arkaneArow, null, 'Resolved Spell Echo Shield targeting cannot remain active and intercept later board input.');
    assert.equal(blockedPush.state.players.P1.hp, 17, 'Level 3 includes Level 2 collision Damage plus 1 when the enemy cannot be pushed past the Board edge.');
    assert.deepEqual(blockedPush.state.players.P1.position, { x: 8, y: 1 });
    const stoppedShield = blockedPush.state.objects.find((object) => object.kind === 'orkk-shield')!;
    assert.equal(distance(stoppedShield.position, { x: 8, y: 1 }), 1, 'The Shield stops adjacent to its enemy collision Square.');
    assert.equal(Object.values(blockedPush.state.players).some((player) => player.position.x === stoppedShield.position.x && player.position.y === stoppedShield.position.y), false, 'The thrown Shield cannot finish on a character-occupied Square.');
    const shieldAnimation = blockedPush.state.objectPushAnimations.at(-1)!;
    assert.deepEqual(shieldAnimation.to, stoppedShield.position, 'The Shield animation always terminates on its authoritative landing Square.');
    assert.equal([shieldAnimation.from, shieldAnimation.to, ...(shieldAnimation.path ?? [])].every((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y)), true, 'The Shield animation contains only usable route points.');
  }
}

const arkaneLevelThreePush = createInitialState();
arkaneLevelThreePush.activePlayerId = 'P2';
arkaneLevelThreePush.players.P2.position = { x: 4, y: 3 };
arkaneLevelThreePush.players.P1.position = { x: 5, y: 3 };
arkaneLevelThreePush.objects = [];
arkaneLevelThreePush.players.P2.hand = [];
arkaneLevelThreePush.players.P2.spellEcho[2] = { instanceId: 'arkane-level-three-push', cardId: 'arkane-arow' };
const useArkaneThreePush = applyCommand(arkaneLevelThreePush, { type: 'use-echo-perk', playerId: 'P2', position: 3 });
assert.equal(useArkaneThreePush.ok, true);
if (useArkaneThreePush.ok) {
  const pushedEnemy = applyCommand(useArkaneThreePush.state, { type: 'arkane-arow-target', playerId: 'P2', to: { x: 5, y: 3 } });
  assert.equal(pushedEnemy.ok, true);
  if (pushedEnemy.ok) {
    const shieldAnimation = pushedEnemy.state.objectPushAnimations.find((event) => event.id.includes('-arkane-arow-') && event.objectId);
    assert.deepEqual(pushedEnemy.state.players.P1.position, { x: 6, y: 3 });
    assert.equal(pushedEnemy.state.players.P1.visualMovement?.triggerAnimationId, shieldAnimation?.id, 'Level 3 enemy movement waits for the Shield impact animation.');
    assert.deepEqual(pushedEnemy.state.players.P1.visualMovement?.from, { x: 5, y: 3 });
  }
}

const armCreate = createInitialState();
armCreate.activePlayerId = 'P2';
armCreate.players.P2.shieldEquipped = false;
armCreate.players.P1.position = { x: 3, y: 0 };
armCreate.objects = [
  { id: 'out-of-range-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } },
  { id: 'shield-block-a2', name: 'Wall', hp: 999, maxHp: 999, position: { x: 2, y: 0 } },
  { id: 'shield-block-b1', name: 'Wall', hp: 999, maxHp: 999, position: { x: 1, y: 1 } },
  { id: 'shield-block-b2', name: 'Wall', hp: 999, maxHp: 999, position: { x: 2, y: 1 } },
];
const armCreateCard = ensureCardInHand(armCreate, 'P2', 'arm-da-wiz');
const beginCreate = applyCommand(armCreate, { type: 'play-perk', playerId: 'P2', cardInstanceId: armCreateCard.instanceId, destination: 'direct' });
assert.equal(beginCreate.ok, true);
if (beginCreate.ok) {
  assert.equal(beginCreate.state.armDaWiz?.canCreate, true);
  const createdShield = applyCommand(beginCreate.state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'create' });
  assert.equal(createdShield.ok, true);
  if (createdShield.ok) {
    assert.equal(createdShield.state.players.P2.shieldEquipped, true, 'Arm da Wiz creates and equips a new Shield when the old Shield is unreachable.');
    assert.equal(createdShield.state.objects.some((object) => object.id === 'out-of-range-shield'), true, 'Creating a Shield keeps every old Shield on the Board.');
  }
}

const armRecall = createInitialState();
armRecall.activePlayerId = 'P2';
armRecall.players.P2.shieldEquipped = false;
armRecall.players.P2.position = { x: 8, y: 7 };
armRecall.players.P1.position = { x: 2, y: 1 };
armRecall.objects = [
  { id: 'recall-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } },
  { id: 'unselected-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 7, y: 0 } },
];
const armRecallCard = ensureCardInHand(armRecall, 'P2', 'arm-da-wiz');
const beginRecall = applyCommand(armRecall, { type: 'play-perk', playerId: 'P2', cardInstanceId: armRecallCard.instanceId, destination: 'direct' });
assert.equal(beginRecall.ok, true);
if (beginRecall.ok) {
  const chooseRecall = applyCommand(beginRecall.state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'recall' });
  assert.equal(chooseRecall.ok, true);
  if (chooseRecall.ok) {
    const recalled = applyCommand(chooseRecall.state, { type: 'arm-da-wiz-target', playerId: 'P2', objectId: 'recall-shield' });
    assert.equal(recalled.ok, true);
    if (recalled.ok) {
      assert.equal(recalled.state.players.P1.hp, 20, 'Level 1 Shield recall passes through enemies without damage.');
      assert.equal(recalled.state.players.P2.shieldEquipped, true);
      assert.equal(recalled.state.objects.some((object) => object.id === 'recall-shield'), false);
      assert.equal(recalled.state.objects.some((object) => object.id === 'unselected-shield'), true, 'Arm da Wiz removes only the selected Shield and keeps all unselected Shields on the Board.');
      const recallAnimation = recalled.state.objectPushAnimations.find((event) => event.objectId === 'recall-shield');
      assert.equal(recallAnimation?.removeOnComplete, true);
      assert.equal(recallAnimation?.path?.length, 7, 'Level 1 recalls the Shield globally and preserves the full route for animation.');
    }
  }
}

const enemyPreferredRecall = createInitialState();
enemyPreferredRecall.activePlayerId = 'P2';
enemyPreferredRecall.players.P2.shieldEquipped = false;
enemyPreferredRecall.players.P2.position = { x: 4, y: 3 };
enemyPreferredRecall.players.P1.position = { x: 2, y: 1 };
enemyPreferredRecall.objects = [{ id: 'enemy-preferred-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 1 } }];
const enemyPreferredCard = ensureCardInHand(enemyPreferredRecall, 'P2', 'arm-da-wiz');
const beginEnemyPreferredRecall = applyCommand(enemyPreferredRecall, { type: 'play-perk', playerId: 'P2', cardInstanceId: enemyPreferredCard.instanceId, destination: 'direct' });
assert.equal(beginEnemyPreferredRecall.ok, true);
if (beginEnemyPreferredRecall.ok) {
  const chooseEnemyPreferredRecall = applyCommand(beginEnemyPreferredRecall.state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'recall' });
  assert.equal(chooseEnemyPreferredRecall.ok, true);
  if (chooseEnemyPreferredRecall.ok) {
    const recalledThroughEnemy = applyCommand(chooseEnemyPreferredRecall.state, { type: 'arm-da-wiz-target', playerId: 'P2', objectId: 'enemy-preferred-shield' });
    assert.equal(recalledThroughEnemy.ok, true);
    if (recalledThroughEnemy.ok) {
      const preferredAnimation = recalledThroughEnemy.state.objectPushAnimations.find((event) => event.objectId === 'enemy-preferred-shield');
      assert.equal(preferredAnimation?.path?.length, 3, 'Shield recall keeps the minimum three-step Chebyshev route.');
      assert.deepEqual(preferredAnimation?.path?.[0], { x: 2, y: 1 }, 'Among equal shortest routes, Shield recall prefers the enemy-occupied Square.');
      assert.deepEqual(preferredAnimation?.path, [{ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 3 }], 'After crossing an enemy, Recall keeps the straight diagonal instead of introducing an equal-length zigzag.');
      assert.deepEqual(recalledThroughEnemy.state.players.P1.position, { x: 3, y: 2 }, 'The crossed enemy follows the next Square of the straight Recall route.');
    }
  }
}

const enemyExtendedRecall = createInitialState();
enemyExtendedRecall.activePlayerId = 'P2';
enemyExtendedRecall.players.P2.shieldEquipped = false;
enemyExtendedRecall.players.P2.position = { x: 4, y: 3 };
enemyExtendedRecall.players.P1.position = { x: 1, y: 2 };
enemyExtendedRecall.objects = [{ id: 'enemy-extended-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 1 } }];
const enemyExtendedCard = ensureCardInHand(enemyExtendedRecall, 'P2', 'arm-da-wiz');
const beginEnemyExtendedRecall = applyCommand(enemyExtendedRecall, { type: 'play-perk', playerId: 'P2', cardInstanceId: enemyExtendedCard.instanceId, destination: 'direct' });
assert.equal(beginEnemyExtendedRecall.ok, true);
if (beginEnemyExtendedRecall.ok) {
  const chooseEnemyExtendedRecall = applyCommand(beginEnemyExtendedRecall.state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'recall' });
  assert.equal(chooseEnemyExtendedRecall.ok, true);
  if (chooseEnemyExtendedRecall.ok) {
    const recalledWithExtension = applyCommand(chooseEnemyExtendedRecall.state, { type: 'arm-da-wiz-target', playerId: 'P2', objectId: 'enemy-extended-shield' });
    assert.equal(recalledWithExtension.ok, true);
    if (recalledWithExtension.ok) {
      const extendedAnimation = recalledWithExtension.state.objectPushAnimations.find((event) => event.objectId === 'enemy-extended-shield');
      assert.equal(extendedAnimation?.path?.length, 3, 'Shield Recall never extends the minimum route by 1 Square solely to cross an enemy.');
      assert.equal(extendedAnimation?.path?.some((cell) => cell.x === 1 && cell.y === 2), false, 'An enemy outside every shortest route does not influence Shield Recall.');
      assert.equal(shieldRecallEnemyCount(recalledWithExtension.state, 'P2', extendedAnimation?.path ?? []), 0, 'Only enemies on the chosen shortest route count as crossed.');
    }
  }
}

const turningRecallPull = createInitialState();
turningRecallPull.activePlayerId = 'P2';
turningRecallPull.players.P2.shieldEquipped = false;
turningRecallPull.players.P2.position = { x: 2, y: 3 };
turningRecallPull.players.P1.position = { x: 4, y: 3 };
turningRecallPull.objects = [
  { id: 'turning-recall-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 5, y: 3 } },
  { id: 'direct-pull-blocker', name: 'Wall', hp: 999, maxHp: 999, position: { x: 3, y: 3 } },
];
const turningRecallCard = ensureCardInHand(turningRecallPull, 'P2', 'arm-da-wiz');
const beginTurningRecall = applyCommand(turningRecallPull, { type: 'play-perk', playerId: 'P2', cardInstanceId: turningRecallCard.instanceId, destination: 'direct' });
assert.equal(beginTurningRecall.ok, true);
if (beginTurningRecall.ok) {
  const chooseTurningRecall = applyCommand(beginTurningRecall.state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'recall' });
  assert.equal(chooseTurningRecall.ok, true);
  if (chooseTurningRecall.ok) {
    const resolvedTurningRecall = applyCommand(chooseTurningRecall.state, { type: 'arm-da-wiz-target', playerId: 'P2', objectId: 'turning-recall-shield' });
    assert.equal(resolvedTurningRecall.ok, true);
    if (resolvedTurningRecall.ok) {
      assert.deepEqual(resolvedTurningRecall.state.players.P1.position, { x: 4, y: 3 }, 'A crossed enemy does not follow a turning Shield route diagonally when its direct Square toward Da Orkk is blocked.');
    }
  }
}

const armLevelThree = createInitialState();
armLevelThree.activePlayerId = 'P2';
armLevelThree.players.P2.shieldEquipped = false;
armLevelThree.players.P2.position = { x: 4, y: 3 };
armLevelThree.players.P1.position = { x: 3, y: 2 };
armLevelThree.players.P2.hand = [];
armLevelThree.players.P2.spellEcho[2] = { instanceId: 'arm-level-three', cardId: 'arm-da-wiz' };
armLevelThree.objects = [
  { id: 'recall-three', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } },
  { id: 'route-block-1', name: 'Wall', hp: 999, maxHp: 999, position: { x: 1, y: 1 } },
  { id: 'route-block-2', name: 'Wall', hp: 999, maxHp: 999, position: { x: 2, y: 0 } },
];
const beginArmThree = applyCommand(armLevelThree, { type: 'use-echo-perk', playerId: 'P2', position: 3 });
assert.equal(beginArmThree.ok, true);
if (beginArmThree.ok) {
  const chooseArmThree = applyCommand(beginArmThree.state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'recall' });
  assert.equal(chooseArmThree.ok, true);
  if (chooseArmThree.ok) {
    const recalledThree = applyCommand(chooseArmThree.state, { type: 'arm-da-wiz-target', playerId: 'P2', objectId: 'recall-three' });
    assert.equal(recalledThree.ok, true);
    if (recalledThree.ok) {
      assert.equal(recalledThree.state.players.P1.hp, 19, 'Level 3 retains the Level 2 pass-through Damage.');
      assert.equal(recalledThree.state.players.P2.rageStacks, 3, 'Level 3 gains 1 base Rage and 2 Rage for the crossed enemy.');
      assert.deepEqual(recalledThree.state.players.P1.position, { x: 3, y: 2 }, 'Arm da Wiz does not move an enemy whose pull destination is blocked.');
    }
  }
}

const armLevelTwo = createInitialState();
armLevelTwo.activePlayerId = 'P2';
armLevelTwo.players.P2.shieldEquipped = false;
armLevelTwo.players.P2.position = { x: 4, y: 3 };
armLevelTwo.players.P1.position = { x: 2, y: 1 };
armLevelTwo.players.P2.hand = [];
armLevelTwo.players.P2.spellEcho[1] = { instanceId: 'arm-level-two', cardId: 'arm-da-wiz' };
armLevelTwo.objects = [
  { id: 'recall-two', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } },
  { id: 'route-two-block-1', name: 'Wall', hp: 999, maxHp: 999, position: { x: 1, y: 1 } },
  { id: 'route-two-block-2', name: 'Wall', hp: 999, maxHp: 999, position: { x: 2, y: 0 } },
];
const beginArmTwo = applyCommand(armLevelTwo, { type: 'use-echo-perk', playerId: 'P2', position: 2 });
assert.equal(beginArmTwo.ok, true);
if (beginArmTwo.ok) {
  const chooseArmTwo = applyCommand(beginArmTwo.state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'recall' });
  assert.equal(chooseArmTwo.ok, true);
  if (chooseArmTwo.ok) {
    const recalledTwo = applyCommand(chooseArmTwo.state, { type: 'arm-da-wiz-target', playerId: 'P2', objectId: 'recall-two' });
    assert.equal(recalledTwo.ok, true);
    if (recalledTwo.ok) {
      assert.equal(recalledTwo.state.players.P1.hp, 19, 'Level 2 deals exactly 1 damage when the Shield path passes through an enemy-occupied Square.');
      assert.deepEqual(recalledTwo.state.players.P1.position, { x: 3, y: 2 }, 'Every Shield recall pulls a passed enemy 1 Square along the route toward Da Orkk.');
      const recallAnimation = recalledTwo.state.objectPushAnimations.find((event) => event.objectId === 'recall-two')!;
      const recallDamageAnimation = recalledTwo.state.objectPushAnimations.find((event) => event.damage?.playerId === 'P1' && event.damage.collision && event.damage.amount === 1);
      assert.equal(recallDamageAnimation?.damage?.triggerAnimationId, recallAnimation.id, 'Arm da Wiz Damage waits for the matching Recall animation.');
      assert.equal((recallDamageAnimation?.damage?.triggerRouteProgress ?? 0) > 0 && (recallDamageAnimation?.damage?.triggerRouteProgress ?? 0) < 1, true, 'Arm da Wiz Damage is timed to the crossed enemy Square rather than either end of the Recall.');
    }
  }
}

const matchStatsMovement = createInitialState();
matchStatsMovement.objects = [];
matchStatsMovement.players.P1.position = { x: 1, y: 0 };
matchStatsMovement.players.P2.position = { x: 8, y: 7 };
matchStatsMovement.players.P1.movementRemaining = 2;
const trackedMove = applyCommand(matchStatsMovement, { type: 'move', playerId: 'P1', to: { x: 3, y: 0 } });
assert.equal(trackedMove.ok, true);
if (trackedMove.ok) assert.equal(trackedMove.state.players.P1.matchStats?.squaresMoved, 2, 'Match statistics count resolved non-teleport movement distance.');

const matchStatsCombat = createInitialState();
matchStatsCombat.objects = [];
matchStatsCombat.players.P1.position = { x: 2, y: 2 };
matchStatsCombat.players.P2.position = { x: 3, y: 2 };
matchStatsCombat.players.P1.hand = [{ instanceId: 'stats-attack', cardId: 'attack-3' }];
matchStatsCombat.players.P2.hand = [{ instanceId: 'stats-defend', cardId: 'defend-1' }];
const statsAttack = applyCommand(matchStatsCombat, { type: 'attack', playerId: 'P1', cardInstanceId: 'stats-attack', targetId: 'P2' });
assert.equal(statsAttack.ok, true);
if (statsAttack.ok) {
  const statsDefend = applyCommand(statsAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'stats-defend' });
  assert.equal(statsDefend.ok, true);
  if (statsDefend.ok) {
    assert.equal(statsDefend.state.players.P1.matchStats?.attackDamage, 1, 'Combat damage is attributed to Attack Cards.');
    assert.equal(statsDefend.state.players.P1.matchStats?.totalDamage, 1, 'Total Damage includes Attack damage.');
    assert.equal(statsDefend.state.players.P2.matchStats?.combatDamageBlocked, 2, 'Defence records combat Damage blocked, including the equipped Shield bonus.');
  }
}

const helmetCombatState = createInitialState();
helmetCombatState.objects = [];
helmetCombatState.players.P1.position = { x: 2, y: 2 };
helmetCombatState.players.P2.position = { x: 3, y: 2 };
helmetCombatState.players.P1.hand = [{ instanceId: 'helmet-attack', cardId: 'attack-3' }];
helmetCombatState.players.P2.hand = [
  { instanceId: 'helmet-defend', cardId: 'defend-1' },
  { instanceId: 'helmet-status', cardId: 'mythril-helmet', revealedToOpponent: true },
];
const helmetAttack = applyCommand(helmetCombatState, { type: 'attack', playerId: 'P1', cardInstanceId: 'helmet-attack', targetId: 'P2' });
assert.equal(helmetAttack.ok, true);
if (helmetAttack.ok) {
  const helmetDefend = applyCommand(helmetAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'helmet-defend' });
  assert.equal(helmetDefend.ok, true);
  if (helmetDefend.ok) {
    assert.equal(helmetDefend.state.phase, 'choosing-mythril-helmet');
    const helmetApplied = applyCommand(helmetDefend.state, { type: 'mythril-helmet-decision', playerId: 'P2', use: true });
    assert.equal(helmetApplied.ok, true);
    if (helmetApplied.ok) {
      assert.equal(helmetApplied.state.players.P2.hp, 24, 'Mythril Helmet negates all combat Damage.');
      assert.equal(helmetApplied.state.players.P2.hand.some((card) => card.cardId === 'mythril-helmet'), false, 'Applied Mythril Helmet is Removed from the Deck.');
    }
  }
}

const calmnessTankQuest = createInitialState() as any;
calmnessTankQuest.objects = [];
calmnessTankQuest.players.P1.position = { x: 2, y: 2 };
calmnessTankQuest.players.P2.position = { x: 3, y: 2 };
calmnessTankQuest.players.P1.pinnedStacks = 1;
calmnessTankQuest.players.P2.pinnedStacks = 2;
calmnessTankQuest.players.P1.hand = [{ instanceId: 'tank-hello', cardId: 'hello-there' }];
calmnessTankQuest.players.P2.hand = [{ instanceId: 'tank-calmness', cardId: 'calmness' }];
calmnessTankQuest.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['tank-junior'], currentQuest: { id: 'tank-junior', announcedRound: 1, endsAfterRound: 4, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null };
const tankHelloAttack = applyCommand(calmnessTankQuest, { type: 'attack', playerId: 'P1', cardInstanceId: 'tank-hello', targetId: 'P2' });
assert.equal(tankHelloAttack.ok, true);
if (tankHelloAttack.ok) {
  const tankCalmnessDefend = applyCommand(tankHelloAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'tank-calmness' });
  assert.equal(tankCalmnessDefend.ok, true);
  if (tankCalmnessDefend.ok) {
    assert.equal(tankCalmnessDefend.state.players.P2.hp, 24, 'Calmness prevents both Attack Value damage and Hello There effect damage.');
    assert.equal(tankCalmnessDefend.state.players.P2.matchStats?.combatDamageBlocked, 5, 'Blocked Damage includes 1 Attack Value and 4 prevented effect Damage.');
    assert.equal((tankCalmnessDefend.state as any).questPhases.currentQuest.progress.P2, 5, 'Tank Junior receives the same complete blocked-Damage score.');
  }
}

const helmetDiscardState = createInitialState();
helmetDiscardState.phase = 'choosing-end-discard';
helmetDiscardState.players.P1.hand = [{ instanceId: 'discardable-helmet', cardId: 'mythril-helmet', revealedToOpponent: true }];
const discardHelmet = applyCommand(helmetDiscardState, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'discardable-helmet' });
assert.equal(discardHelmet.ok, true, 'Mythril Helmet can be discarded during normal finishing and overstack flows.');
if (discardHelmet.ok) assert.equal(discardHelmet.state.players.P1.discard.some((card) => card.cardId === 'mythril-helmet'), true);

const matchStatsHealing = createInitialState();
matchStatsHealing.players.P1.hp = 15;
matchStatsHealing.players.P1.spellEcho[2] = { instanceId: 'stats-heal', cardId: 'echo-pulse' };
const trackedHealing = applyCommand(matchStatsHealing, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(trackedHealing.ok, true);
if (trackedHealing.ok) assert.equal(trackedHealing.state.players.P1.matchStats?.hitPointsHealed, 2, 'Only HP actually restored is tracked.');

const objectAttackState = createInitialState() as any;
objectAttackState.objects = [{ id: 'elephant-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
objectAttackState.players.P1.position = { x: 1, y: 3 };
objectAttackState.players.P1.hand = [{ instanceId: 'object-attack', cardId: 'attack-2' }];
objectAttackState.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['the-elephant'], currentQuest: { id: 'the-elephant', announcedRound: 1, endsAfterRound: 4, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null, objectEffectsThisTurn: {}, objectRespawns: [] };
const attackedObject = applyCommand(objectAttackState, { type: 'attack', playerId: 'P1', cardInstanceId: 'object-attack', targetId: 'elephant-box', targetKind: 'object' });
assert.equal(attackedObject.ok, true);
if (attackedObject.ok) {
  assert.equal(attackedObject.state.objects.some((object) => object.id === 'elephant-box'), false, 'A non-Wall Object is destroyed when a direct Attack resolves above 0.');
  assert.equal((attackedObject.state as any).questPhases.currentQuest.progress.P1, 1, 'The Elephant credits the destroying Player.');
  assert.equal((attackedObject.state as any).questPhases.objectRespawns.length, 1, 'Destroyed Objects schedule one replacement in 1-3 Rounds.');
  assert.equal((attackedObject.state as any).questPhases.objectRespawns[0].dueRound >= attackedObject.state.turn + 1 && (attackedObject.state as any).questPhases.objectRespawns[0].dueRound <= attackedObject.state.turn + 3, true, 'Each destroyed Box receives an independently randomized 1-3 Round replacement delay.');
  const respawnState = attackedObject.state as any;
  respawnState.turn = 1; respawnState.activePlayerId = 'P2'; respawnState.roundFirstPlayerId = 'P1'; respawnState.players.P2.hand = [];
  respawnState.questPhases.objectRespawns = [{ dueRound: 2 }, { dueRound: 2 }];
  const respawnRound = applyCommand(respawnState, { type: 'end-turn', playerId: 'P2' });
  assert.equal(respawnRound.ok, true);
  if (respawnRound.ok) {
    const replacement = respawnRound.state.objects.find((object) => object.id.startsWith('respawn-box-'));
    assert.equal(Boolean(replacement), true, 'A due replacement Box spawns at the next Round boundary.');
    assert.equal(respawnRound.state.objects.filter((object) => object.id.startsWith('respawn-box-')).length, 1, 'No more than one due Box respawns at the beginning of a turn.');
    assert.equal((respawnRound.state as any).questPhases.objectRespawns.length, 1, 'Additional due Boxes remain queued for a later turn.');
    assert.equal(respawnRound.state.objectPushAnimations.some((event) => event.objectId === replacement?.id && event.parachute), true, 'Replacement Boxes spawn with a parachute descent event.');
  }
}

const orkkBoxAttackState = createHotseatTestState(true, 'orkk', 2);
orkkBoxAttackState.players.P1.position = { x: 1, y: 3 };
orkkBoxAttackState.objects = [{ id: 'orkk-animation-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
orkkBoxAttackState.players.P1.hand = [{ instanceId: 'orkk-box-attack', cardId: 'attack-2' }];
const orkkBoxAttack = applyCommand(orkkBoxAttackState, { type: 'attack', playerId: 'P1', cardInstanceId: 'orkk-box-attack', targetId: 'orkk-animation-box', targetKind: 'object' });
assert.equal(orkkBoxAttack.ok, true);
if (orkkBoxAttack.ok) assert.equal(orkkBoxAttack.state.objectPushAnimations.some((event) => event.objectId === 'orkk-animation-box' && event.destroy && event.attackAnimationPlayerId === 'P1'), true, 'An Orkk Attack delays the Box destruction visual until its Base UUID impact frame.');

const arcaneBoltBoxState = createHotseatTestState(true, 'magician', 2, 'dummy');
arcaneBoltBoxState.objects = [{ id: 'arcane-bolt-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
arcaneBoltBoxState.players.P1.position = { x: 1, y: 3 };
arcaneBoltBoxState.players.P1.hand = [{ instanceId: 'arcane-bolt-box-attack', cardId: 'arcane-bolt' }];
const arcaneBoltBox = applyCommand(arcaneBoltBoxState, { type: 'attack', playerId: 'P1', cardInstanceId: 'arcane-bolt-box-attack', targetId: 'arcane-bolt-box', targetKind: 'object' });
assert.equal(arcaneBoltBox.ok, true);
if (arcaneBoltBox.ok) {
  assert.equal(arcaneBoltBox.state.players.P1.arcaneBoltAttackBonus, 1, 'Arcane Bolt applies its +1 ATT effect after attacking a Box.');
  assert.equal(arcaneBoltBox.state.players.P1.manaPoints, 1, 'Attacking a Box still resolves Logan\'s normal post-spell Mana generation.');
}

const manaBarrageBoxState = createHotseatTestState(true, 'magician', 2, 'dummy');
manaBarrageBoxState.objects = [{ id: 'mana-barrage-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
manaBarrageBoxState.players.P1.position = { x: 1, y: 3 };
manaBarrageBoxState.players.P1.manaPoints = 1;
manaBarrageBoxState.players.P1.manaMode = 'consume';
manaBarrageBoxState.players.P1.hand = [
  { instanceId: 'mana-barrage-box-attack', cardId: 'mana-barrage' },
  { instanceId: 'mana-barrage-box-exhaust-1', cardId: 'exhaust' },
  { instanceId: 'mana-barrage-box-exhaust-2', cardId: 'exhaust' },
];
const manaBarrageBox = applyCommand(manaBarrageBoxState, { type: 'attack', playerId: 'P1', cardInstanceId: 'mana-barrage-box-attack', targetId: 'mana-barrage-box', targetKind: 'object' });
assert.equal(manaBarrageBox.ok, true);
if (manaBarrageBox.ok) assert.equal(manaBarrageBox.state.objects.some((object) => object.id === 'mana-barrage-box'), false, 'Mana Barrage Consume applies its guaranteed 2 Damage after Object combat even when Exhaust reduces the initial Attack Value to 0.');

const kneeBlastBoxState = createHotseatTestState(true, 'orkk', 2, 'dummy');
kneeBlastBoxState.objects = [{ id: 'knee-blast-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
kneeBlastBoxState.players.P1.position = { x: 1, y: 3 };
kneeBlastBoxState.players.P1.rageStacks = 2;
kneeBlastBoxState.players.P1.hand = [
  { instanceId: 'knee-blast-box-attack', cardId: 'knee-blast' },
  ...Array.from({ length: 5 }, (_, index) => ({ instanceId: `knee-blast-box-exhaust-${index}`, cardId: 'exhaust' as const })),
];
const kneeBlastBox = applyCommand(kneeBlastBoxState, { type: 'attack', playerId: 'P1', cardInstanceId: 'knee-blast-box-attack', targetId: 'knee-blast-box', targetKind: 'object' });
assert.equal(kneeBlastBox.ok, true);
if (kneeBlastBox.ok) {
  assert.deepEqual(kneeBlastBox.state.objects.find((object) => object.id === 'knee-blast-box')?.position, { x: 4, y: 3 }, 'Knee Blast applies its Rage-based after-combat push when the Box survives a 0-Value Attack.');
  assert.equal(kneeBlastBox.state.players.P1.rageStacks, 2, 'Da Orkk retains every Rage Stack applied to an Attack Card used against an Object.');
}

const snowballBoxState = createHotseatTestState(true, 'magician', 2, 'dummy');
snowballBoxState.objects = [{ id: 'snowball-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
snowballBoxState.players.P1.position = { x: 1, y: 3 };
snowballBoxState.players.P1.manaMode = 'consume';
snowballBoxState.players.P1.deck = [{ instanceId: 'snowball-box-draw', cardId: 'attack-2' }];
snowballBoxState.players.P1.hand = [{ instanceId: 'snowball-box-attack', cardId: 'snowball-effect' }];
const snowballBox = applyCommand(snowballBoxState, { type: 'attack', playerId: 'P1', cardInstanceId: 'snowball-box-attack', targetId: 'snowball-box', targetKind: 'object' });
assert.equal(snowballBox.ok, true);
if (snowballBox.ok) {
  assert.equal(snowballBox.state.phase, 'choosing-snowball-discard', 'Snowball Effect begins its after-combat Consume discard after fighting a Box.');
  assert.equal(snowballBox.state.players.P1.hand.some((card) => card.instanceId === 'snowball-box-draw'), true, 'Snowball Effect draws its after-combat Card against a Box.');
}

const danceBoxState = createHotseatTestState(true, 'shinobi', 2, 'dummy');
danceBoxState.objects = [{ id: 'dance-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
danceBoxState.players.P1.position = { x: 1, y: 3 };
danceBoxState.players.P1.hand = [{ instanceId: 'dance-box-attack', cardId: 'dance-through' }];
const danceBox = applyCommand(danceBoxState, { type: 'attack', playerId: 'P1', cardInstanceId: 'dance-box-attack', targetId: 'dance-box', targetKind: 'object' });
assert.equal(danceBox.ok, true);
if (danceBox.ok) {
  assert.equal(danceBox.state.phase, 'dance-through', 'Dance Through begins its movement effect after attacking a Box.');
  assert.equal(danceBox.state.danceThrough?.stepsRemaining, 3);
}

const chainPunchBoxState = createHotseatTestState(true, 'orkk', 2, 'dummy');
chainPunchBoxState.objects = [{ id: 'chain-punch-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
chainPunchBoxState.players.P1.position = { x: 1, y: 3 };
chainPunchBoxState.players.P1.shieldEquipped = false;
chainPunchBoxState.players.P1.hand = [{ instanceId: 'chain-punch-box-attack', cardId: 'chain-punchin' }];
const chainPunchBox = applyCommand(chainPunchBoxState, { type: 'attack', playerId: 'P1', cardInstanceId: 'chain-punch-box-attack', targetId: 'chain-punch-box', targetKind: 'object' });
assert.equal(chainPunchBox.ok, true);
if (chainPunchBox.ok) assert.equal(chainPunchBox.state.players.P1.actionsRemaining, 2, 'Chain Punchin restores an Action after attacking a Box while the Shield is unequipped.');

const cutLegsBoxState = createHotseatTestState(true, 'shinobi', 2, 'dummy');
cutLegsBoxState.objects = [{ id: 'cut-legs-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
cutLegsBoxState.players.P1.position = { x: 1, y: 3 };
cutLegsBoxState.players.P1.hand = [{ instanceId: 'cut-legs-box-attack', cardId: 'cut-them-legs' }];
const cutLegsBox = applyCommand(cutLegsBoxState, { type: 'attack', playerId: 'P1', cardInstanceId: 'cut-legs-box-attack', targetId: 'cut-legs-box', targetKind: 'object' });
assert.equal(cutLegsBox.ok, true);
if (cutLegsBox.ok) assert.equal(cutLegsBox.state.players.P1.hand.some((card) => card.instanceId === 'cut-legs-box-attack'), true, 'Cut Them Legs returns to Hand after winning an Object combat.');

const repeatedObjectEffectState = createInitialState() as any;
repeatedObjectEffectState.objects = [{ id: 'twice-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 4, y: 3 } }];
repeatedObjectEffectState.players.P1.position = { x: 1, y: 3 };
repeatedObjectEffectState.players.P2.position = { x: 8, y: 7 };
repeatedObjectEffectState.phase = 'choosing-force-pull-target';
repeatedObjectEffectState.forcePull = { casterId: 'P1', level: 1, distance: 1, targetRange: 4, undo: null };
const firstObjectEffect = applyCommand(repeatedObjectEffectState, { type: 'force-pull-target', playerId: 'P1', targetKind: 'object', targetId: 'twice-box' });
assert.equal(firstObjectEffect.ok, true);
if (firstObjectEffect.ok) {
  assert.equal(firstObjectEffect.state.objects.some((object) => object.id === 'twice-box'), true, 'One push or pull effect does not destroy an Object.');
  firstObjectEffect.state.phase = 'choosing-force-pull-target';
  firstObjectEffect.state.forcePull = { casterId: 'P1', level: 1, distance: 1, targetRange: 4, undo: null };
  const secondObjectEffect = applyCommand(firstObjectEffect.state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'object', targetId: 'twice-box' });
  assert.equal(secondObjectEffect.ok, true);
  if (secondObjectEffect.ok) {
    assert.equal(secondObjectEffect.state.objects.some((object) => object.id === 'twice-box'), false, 'A second indirect Object effect destroys that Object even when The Elephant is not active.');
    assert.equal((secondObjectEffect.state as any).questPhases.objectRespawns.length, 1, 'Indirect destruction outside The Elephant still schedules a replacement Box.');
  }
}

const wallAttackState = createInitialState();
wallAttackState.players.P1.position = { x: 1, y: 1 };
wallAttackState.players.P1.hand = [{ instanceId: 'wall-attack', cardId: 'attack-3' }];
wallAttackState.objects = [{ id: 'immune-column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 1 } }];
assert.equal(applyCommand(wallAttackState, { type: 'attack', playerId: 'P1', cardInstanceId: 'wall-attack', targetId: 'immune-column', targetKind: 'object' }).ok, false, 'Wall Objects remain immune to direct Attack Cards.');

const boomerangState = createInitialState();
boomerangState.objects = [{ id: 'boomerang-wall', name: 'Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 4, y: 2 } }];
boomerangState.players.P1.position = { x: 2, y: 2 };
boomerangState.players.P2.position = { x: 5, y: 2 };
boomerangState.players.P1.hand = [{ instanceId: 'reward-boomerang', cardId: 'boomerang' }];
boomerangState.players.P1.deck = [{ instanceId: 'boomerang-draw', cardId: 'attack-2' }];
const beginBoomerangPlay = applyCommand(boomerangState, { type: 'play-free-action', playerId: 'P1', cardInstanceId: 'reward-boomerang' });
assert.equal(beginBoomerangPlay.ok, true);
if (beginBoomerangPlay.ok) {
  assert.equal(beginBoomerangPlay.state.phase, 'choosing-boomerang-target');
  const cancelBoomerang = applyCommand(beginBoomerangPlay.state, { type: 'cancel-targeting', playerId: 'P1' });
  assert.equal(cancelBoomerang.ok, true);
  if (cancelBoomerang.ok) assert.equal(cancelBoomerang.state.players.P1.hand.some((card) => card.cardId === 'boomerang'), true, 'Escape cancellation leaves Boomerang in Hand.');
  const resolvedBoomerang = applyCommand(beginBoomerangPlay.state, { type: 'boomerang-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(resolvedBoomerang.ok, true);
  if (resolvedBoomerang.ok) {
    assert.equal(resolvedBoomerang.state.players.P2.hp, 23, 'Boomerang deals 1 Damage as a Free Action.');
    assert.deepEqual((resolvedBoomerang.state as any).damageLog?.at(-1), { eventType: 'damage', turn: 1, targetId: 'P2', sourceId: 'P1', sourceKind: 'other', amount: 1, hpAfter: 23, collision: false }, 'Every dealt Damage instance is recorded with its target, source, turn, amount, and resulting HP.');
    assert.equal(resolvedBoomerang.state.players.P1.actionsRemaining, 2, 'Boomerang consumes no Action.');
    assert.equal(resolvedBoomerang.state.players.P1.discard.some((card) => card.cardId === 'boomerang'), false, 'Played Boomerang never remains in Discard.');
    assert.equal(resolvedBoomerang.state.players.P1.deck.at(-1)?.cardId, 'boomerang', 'Boomerang is placed on top of the Deck.');
    assert.equal(resolvedBoomerang.state.spellProjectiles.at(-1)?.style, 'boomerang', 'Boomerang emits its wide-arc flight animation event.');
    assert.equal(resolvedBoomerang.state.players.P1.hand.length, 0, 'Playing Boomerang does not draw a replacement Card.');
  }
}

const boomerangPenaltyState = createInitialState();
boomerangPenaltyState.players.P1.hand = [];
boomerangPenaltyState.players.P1.deck = [{ instanceId: 'deck-boomerang', cardId: 'boomerang' }];
assert.equal(effectiveMoveRange(boomerangPenaltyState.players.P1), 1, 'Boomerang applies -1 MOV while outside Hand.');
boomerangPenaltyState.players.P1.hand.push(boomerangPenaltyState.players.P1.deck.pop()!);
assert.equal(effectiveMoveRange(boomerangPenaltyState.players.P1), 2, 'Boomerang applies no MOV penalty while in Hand.');
boomerangPenaltyState.players.P1.hand = [];
assert.equal(effectiveMoveRange(boomerangPenaltyState.players.P1), 2, 'A Boomerang Removed from the game applies no MOV penalty.');

const boomerangDrawMovement = createInitialState();
boomerangDrawMovement.players.P1.hand = [];
boomerangDrawMovement.players.P1.deck = [{ instanceId: 'drawn-boomerang', cardId: 'boomerang' }];
boomerangDrawMovement.players.P1.discard = [];
boomerangDrawMovement.players.P1.freeMoveUsed = true;
boomerangDrawMovement.players.P1.movementRemaining = 1;
assert.equal(drawCards(boomerangDrawMovement.players.P1, 1), 1);
assert.equal(boomerangDrawMovement.players.P1.hand.some((card) => card.cardId === 'boomerang'), true);
assert.equal(boomerangDrawMovement.players.P1.movementRemaining, 2, 'Drawing Boomerang immediately restores the 1 MOV previously lost while it was outside Hand.');

const meleeBoomerangState = createInitialState();
meleeBoomerangState.players.P1.position = { x: 2, y: 2 };
meleeBoomerangState.players.P2.position = { x: 3, y: 2 };
meleeBoomerangState.players.P1.hand = [{ instanceId: 'melee-boomerang', cardId: 'boomerang' }];
const beginMeleeBoomerang = applyCommand(meleeBoomerangState, { type: 'play-free-action', playerId: 'P1', cardInstanceId: 'melee-boomerang' });
assert.equal(beginMeleeBoomerang.ok, true);
if (beginMeleeBoomerang.ok) {
  const resolvedMeleeBoomerang = applyCommand(beginMeleeBoomerang.state, { type: 'boomerang-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(resolvedMeleeBoomerang.ok, true);
  if (resolvedMeleeBoomerang.ok) {
    assert.equal(resolvedMeleeBoomerang.state.players.P2.hp, 22, 'Boomerang automatically deals 2 Damage at melee Range 1.');
    assert.equal(resolvedMeleeBoomerang.state.players.P1.actionsRemaining, 1, 'Melee Boomerang automatically spends 1 Action.');
    assert.equal([...resolvedMeleeBoomerang.state.players.P1.hand, ...resolvedMeleeBoomerang.state.players.P1.deck, ...resolvedMeleeBoomerang.state.players.P1.discard].some((card) => card.cardId === 'boomerang'), false, 'Melee Boomerang is Removed from the game.');
    assert.equal(effectiveMoveRange(resolvedMeleeBoomerang.state.players.P1), 2, 'Removed melee Boomerang causes no MOV penalty.');
  }
}

const movementUndoState = createInitialState();
movementUndoState.objects = [];
movementUndoState.players.P1.position = { x: 2, y: 2 };
movementUndoState.players.P2.position = { x: 8, y: 7 };
movementUndoState.players.P1.movementRemaining = 3;
const movementUndoMoved = applyGameCommand(movementUndoState, { type: 'move', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(movementUndoMoved.ok, true);
if (movementUndoMoved.ok) {
  assert.ok(movementUndoMoved.state.movementUndo, 'Spending movement creates a movement cancellation snapshot.');
  const movementUndone = applyGameCommand(movementUndoMoved.state, { type: 'cancel-movement', playerId: 'P1' });
  assert.equal(movementUndone.ok, true);
  if (movementUndone.ok) {
    assert.deepEqual(movementUndone.state.players.P1.position, { x: 2, y: 2 }, 'Cancel movement restores the position before movement began.');
    assert.equal(movementUndone.state.players.P1.movementRemaining, 3, 'Cancel movement restores spent MOV.');
    assert.equal(movementUndone.state.movementUndo, null, 'A restored movement cannot be cancelled repeatedly.');
  }
  movementUndoMoved.state.players.P1.actionsRemaining -= 1;
  assert.equal(applyGameCommand(movementUndoMoved.state, { type: 'cancel-movement', playerId: 'P1' }).ok, false, 'Movement cannot be reverted after an Action was used.');
}

const dashMovementUndoState = createInitialState();
dashMovementUndoState.objects = [];
dashMovementUndoState.players.P1.position = { x: 2, y: 2 };
dashMovementUndoState.players.P2.position = { x: 8, y: 7 };
dashMovementUndoState.players.P1.freeMoveUsed = true;
dashMovementUndoState.players.P1.hand = [{ instanceId: 'dash-undo-cost', cardId: 'attack-2' }];
const dashUndoStarted = applyGameCommand(dashMovementUndoState, { type: 'dash', playerId: 'P1' });
const dashUndoPaid = dashUndoStarted.ok ? applyGameCommand(dashUndoStarted.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'dash-undo-cost' }) : dashUndoStarted;
const dashUndoMoved = dashUndoPaid.ok ? applyGameCommand(dashUndoPaid.state, { type: 'move', playerId: 'P1', to: { x: 3, y: 2 } }) : dashUndoPaid;
assert.equal(dashUndoMoved.ok, true);
if (dashUndoMoved.ok) {
  const dashMovementUndone = applyGameCommand(dashUndoMoved.state, { type: 'cancel-movement', playerId: 'P1' });
  assert.equal(dashMovementUndone.ok, true, 'Dash movement can be reverted before its movement is exhausted.');
  if (dashMovementUndone.ok) {
    assert.equal(dashMovementUndone.state.phase, 'dashing');
    assert.deepEqual(dashMovementUndone.state.players.P1.position, { x: 2, y: 2 });
    assert.equal(dashMovementUndone.state.players.P1.movementRemaining, 2, 'Dash rollback restores all additional movement to its pre-movement amount.');
  }
}

const gamblerCombatState = createInitialState() as any;
gamblerCombatState.objects = [];
gamblerCombatState.players.P1.position = { x: 2, y: 2 };
gamblerCombatState.players.P2.position = { x: 3, y: 2 };
gamblerCombatState.players.P1.hand = [{ instanceId: 'gambler-attack', cardId: 'attack-2' }];
gamblerCombatState.players.P2.hand = [{ instanceId: 'gambler-defend', cardId: 'defend-1' }];
gamblerCombatState.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['the-gambler'], currentQuest: { id: 'the-gambler', announcedRound: 1, endsAfterRound: 3, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null };
const gamblerAttack = applyCommand(gamblerCombatState, { type: 'attack', playerId: 'P1', cardInstanceId: 'gambler-attack', targetId: 'P2' });
assert.equal(gamblerAttack.ok, true);
if (gamblerAttack.ok) {
  assert.equal((gamblerAttack.state as any).questPhases.currentQuest.progress.P1, 1, 'An Attack Card played into its owner\'s Discard scores for The Gambler.');
  const gamblerDefend = applyCommand(gamblerAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'gambler-defend' });
  assert.equal(gamblerDefend.ok, true);
  if (gamblerDefend.ok) assert.equal((gamblerDefend.state as any).questPhases.currentQuest.progress.P2, 1, 'A Defend Card played during an enemy Attack scores for its owner.');
}

const gamblerRemovedState = createInitialState() as any;
gamblerRemovedState.players.P1.hand = [{ instanceId: 'removed-monarch', cardId: 'monarch-flush' }];
gamblerRemovedState.players.P2.hand = [{ instanceId: 'hidden-opponent-card', cardId: 'attack-2' }];
gamblerRemovedState.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['the-gambler'], currentQuest: { id: 'the-gambler', announcedRound: 1, endsAfterRound: 3, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null };
const playedMonarch = applyCommand(gamblerRemovedState, { type: 'play-free-action', playerId: 'P1', cardInstanceId: 'removed-monarch' });
assert.equal(playedMonarch.ok, true);
if (playedMonarch.ok) {
  assert.equal(playedMonarch.state.players.P1.actionsRemaining, 2, 'Monarch Flush consumes no Action.');
  assert.equal(playedMonarch.state.players.P2.hand[0].revealedToOpponent, true, 'Monarch Flush reveals every opponent Hand.');
  assert.equal([...playedMonarch.state.players.P1.hand, ...playedMonarch.state.players.P1.deck, ...playedMonarch.state.players.P1.discard].some((card) => card.cardId === 'monarch-flush'), false, 'Monarch Flush is Removed from the game after play.');
  assert.equal((playedMonarch.state as any).questPhases.currentQuest.progress.P1 ?? 0, 0, 'Removed Cards do not score for The Gambler.');
}

const gamblerBoomerangDiscard = createInitialState() as any;
gamblerBoomerangDiscard.phase = 'choosing-end-discard';
gamblerBoomerangDiscard.players.P1.hand = [{ instanceId: 'gambler-boomerang', cardId: 'boomerang' }];
gamblerBoomerangDiscard.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['the-gambler'], currentQuest: { id: 'the-gambler', announcedRound: 1, endsAfterRound: 3, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null };
const redirectedBoomerang = applyCommand(gamblerBoomerangDiscard, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'gambler-boomerang' });
assert.equal(redirectedBoomerang.ok, true);
if (redirectedBoomerang.ok) {
  assert.equal(redirectedBoomerang.state.players.P1.discard.some((card) => card.cardId === 'boomerang'), false);
  assert.equal((redirectedBoomerang.state as any).questPhases.currentQuest?.progress.P1 ?? 0, 0, 'Boomerang redirected into the Deck does not count as a discard.');
}

const johnSetupState = createHotseatTestState(false, 'john-christ', 2, 'dummy');
assert.deepEqual(STARTING_DECKS['john-christ'].defaults, ['cleanse', 'blessed-light', 'repent', 'blessed-block', 'feed-the-spirit', 'thorns', 'blessed-prayer', 'fear-the-justice', 'inner-peace']);
assert.equal(STARTING_DECKS['john-christ'].reserve, 'blessed-prayer');
assert.deepEqual(STARTING_DECKS['john-christ'].attackFocus, ['enforce', 'blessed-might']);
assert.deepEqual(STARTING_DECKS['john-christ'].defendFocus, ['blessed-swiftness', 'resurrection']);
assert.deepEqual(STARTING_DECKS['john-christ'].perkPhase, ['mind-blast', 'spirit-guardian']);
assert.equal(johnSetupState.phase, 'choosing-focus', 'John follows the standard opening Focus setup.');
const johnAttackFocus = applyGameCommand(johnSetupState, { type: 'choose-focus', playerId: 'P1', focus: 'attack' });
assert.equal(johnAttackFocus.ok, true);
if (!johnAttackFocus.ok) throw new Error(johnAttackFocus.error);
const johnFocusCard = applyGameCommand(johnAttackFocus.state, { type: 'choose-focus-card', playerId: 'P1', cardId: 'enforce' });
assert.equal(johnFocusCard.ok, true);
if (!johnFocusCard.ok) throw new Error(johnFocusCard.error);
const johnState = johnFocusCard.state;
const john = johnState.players.P1;
assert.equal(john.maxHp, 14);
assert.equal(john.moveRange, 3);
assert.equal(john.attackRange, 3);
assert.equal(john.hand.length, 3, 'John starts with the standard three-Card opening Hand.');
assert.equal(john.hand.some((card) => card.cardId === 'blessed-prayer'), true, 'Blessed Prayer is always John\'s reserve Card in the opening Hand.');
assert.equal(john.deck.at(-1)?.cardId, 'enforce', 'John places the selected Attack Focus Card on top of his Deck.');
const johnOpeningIds = [...john.hand, ...john.deck].map((card) => card.cardId);
for (const cardId of ['cleanse', 'blessed-light', 'repent', 'blessed-block', 'feed-the-spirit', 'thorns', 'blessed-prayer', 'fear-the-justice', 'inner-peace', 'enforce'] as CardTypeId[]) assert.equal(johnOpeningIds.includes(cardId), true, `${cardId} belongs to John's opening Deck after Attack Focus.`);
for (const excluded of ['blessed-might', 'blessed-swiftness', 'resurrection', 'mind-blast', 'spirit-guardian'] as CardTypeId[]) assert.equal(johnOpeningIds.includes(excluded), false, `${excluded} remains sidelined for a later Focus or Phase choice.`);
const johnPhaseRewardState = structuredClone(johnState) as any;
johnPhaseRewardState.phase = 'choosing-phase-card';
johnPhaseRewardState.questPhases = { actionDamageByPlayer: {}, usedQuestIds: [], currentQuest: null, lastQuestWinners: ['P1'], progression: { P1: { initialFocus: 'attack', chosenFocusCard: 'enforce' } }, phaseReward: { phase: 1, pendingPlayerIds: ['P1'] }, turnStartedOnHighGround: {}, captureTheFlag: null, objectEffectsThisTurn: {}, objectRespawns: [] };
const johnPhaseOneChoice = applyGameCommand(johnPhaseRewardState, { type: 'phase-card-choice', playerId: 'P1', cardId: 'blessed-swiftness' });
assert.equal(johnPhaseOneChoice.ok, true, 'John can select a newer Defend Card during the Phase 1 reward without command validation rejecting its Card ID.');
if (johnPhaseOneChoice.ok) {
  assert.equal(johnPhaseOneChoice.state.phase, 'choosing-phase-destination');
  const johnPhaseDestination = applyGameCommand(johnPhaseOneChoice.state, { type: 'phase-card-destination', playerId: 'P1', destination: 'hand' });
  assert.equal(johnPhaseDestination.ok, true);
  if (johnPhaseDestination.ok) assert.equal(johnPhaseDestination.state.players.P1.hand.some((card) => card.cardId === 'blessed-swiftness'), true, 'Phase 1 winner can add Blessed Swiftness directly to Hand.');
}
john.movementRemaining = 3;
john.stoicShell = true;
john.stoicShellStacks = 2;
dealDamage(johnState, john, 2);
assert.equal(john.hp, 12);
assert.equal(john.spiritForm, true);
assert.equal(john.attackRange, 1, 'Spirit Form gives John Christ melee Attack Range 1.');
assert.equal(john.movementRemaining, 1, 'Entering Spirit Form caps unspent movement at 1.');
assert.equal(john.stoicShell, false, 'HP Damage removes Stoic Shell.');
assert.equal(john.stoicShellStacks, 0, 'HP Damage removes every Stoic Shell Stack at once.');
johnState.objects = [];
john.position = { x: 2, y: 2 };
johnState.players.P2.position = { x: 4, y: 2 };
john.hand = [{ instanceId: 'spirit-range-test', cardId: 'attack-2' }];
assert.equal(applyGameCommand(johnState, { type: 'attack', playerId: 'P1', cardInstanceId: 'spirit-range-test', targetId: 'P2' }).ok, false, 'Spirit Form cannot attack a target two Squares away.');
johnState.players.P2.position = { x: 7, y: 7 };
johnState.objects = [{ id: 'spirit-column', name: 'Arena Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 3, y: 2 } }];
john.movementRemaining = 1;
const spiritOntoColumn = applyGameCommand(johnState, { type: 'move', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(spiritOntoColumn.ok, true, 'Spirit Form can move through Wall Objects such as Arena Columns.');
if (!spiritOntoColumn.ok) throw new Error(spiritOntoColumn.error);
assert.equal(spiritOntoColumn.state.players.P1.movementRemaining, 1, 'Entering an Object-occupied Square in Spirit Form refunds the spent MOV.');
assert.equal(spiritOntoColumn.state.players.P1.spiritObjectUnderfoot, 'spirit-column');
assert.equal(applyGameCommand(spiritOntoColumn.state, { type: 'end-turn', playerId: 'P1' }).ok, false, 'Spirit Form cannot end its turn while sharing a Square with an Object.');
const spiritPastColumn = applyGameCommand(spiritOntoColumn.state, { type: 'move', playerId: 'P1', to: { x: 4, y: 2 } });
assert.equal(spiritPastColumn.ok, true, 'Spirit Form can continue beyond an occupied Object Square.');
if (!spiritPastColumn.ok) throw new Error(spiritPastColumn.error);
assert.equal(spiritPastColumn.state.players.P1.movementRemaining, 0);
assert.equal(spiritPastColumn.state.players.P1.spiritObjectUnderfoot, null);
const johnSpiritEnd = applyGameCommand(spiritPastColumn.state, { type: 'end-turn', playerId: 'P1' });
assert.equal(johnSpiritEnd.ok, true);
if (johnSpiritEnd.ok) {
  assert.equal(johnSpiritEnd.state.players.P1.spiritForm, false);
  assert.equal(johnSpiritEnd.state.players.P1.attackRange, 3, 'Leaving Spirit Form restores John Christ’s Attack Range to 3.');
}

const johnOverlapState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
johnOverlapState.objects = [];
johnOverlapState.players.P1.position = { x: 2, y: 2 };
johnOverlapState.players.P2.position = { x: 3, y: 2 };
johnOverlapState.players.P1.spiritForm = true;
johnOverlapState.players.P1.movementRemaining = 1;
const johnEnteredEnemy = applyGameCommand(johnOverlapState, { type: 'move', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(johnEnteredEnemy.ok, true);
if (johnEnteredEnemy.ok) {
  assert.equal(johnEnteredEnemy.state.players.P1.movementRemaining, 1, 'Entering an enemy Square refunds its spent Movement.');
  assert.equal(johnEnteredEnemy.state.players.P1.spiritEnemyUnderfoot, 'P2');
  assert.equal(johnEnteredEnemy.state.players.P2.spiritSiphonedMovement, 1, 'The first Spirit Form crossing siphons 1 MOV from that enemy.');
  assert.equal(effectiveMoveRange(johnEnteredEnemy.state.players.P2), 1, 'The siphoned enemy has -1 MOV until the end of their turn.');
  assert.deepEqual(johnEnteredEnemy.state.players.P1.spiritSiphonedEnemyIds, ['P2'], 'John tracks enemies already siphoned this turn.');
  assert.equal(applyGameCommand(johnEnteredEnemy.state, { type: 'end-turn', playerId: 'P1' }).ok, false, 'Spirit Form cannot end its turn on an occupied Square.');
  const johnLeftEnemy = applyGameCommand(johnEnteredEnemy.state, { type: 'move', playerId: 'P1', to: { x: 4, y: 2 } });
  assert.equal(johnLeftEnemy.ok, true);
  if (johnLeftEnemy.ok) {
    assert.equal(johnLeftEnemy.state.players.P1.movementRemaining, 0);
    assert.equal(johnLeftEnemy.state.players.P1.spiritEnemyUnderfoot, null);
    johnLeftEnemy.state.players.P1.movementRemaining = 1;
    const johnCrossedSameEnemyAgain = applyGameCommand(johnLeftEnemy.state, { type: 'move', playerId: 'P1', to: { x: 3, y: 2 } });
    assert.equal(johnCrossedSameEnemyAgain.ok, true);
    if (johnCrossedSameEnemyAgain.ok) assert.equal(johnCrossedSameEnemyAgain.state.players.P2.spiritSiphonedMovement, 1, 'Spirit Form can siphon each enemy only once per turn.');
  }
}

const siphonExpiryState = createHotseatTestState(true, 'dummy', 2, 'john-christ');
siphonExpiryState.players.P1.spiritSiphonedMovement = 1;
assert.equal(effectiveMoveRange(siphonExpiryState.players.P1), 1);
const siphonExpired = applyGameCommand(siphonExpiryState, { type: 'end-turn', playerId: 'P1' });
assert.equal(siphonExpired.ok, true);
if (siphonExpired.ok) {
  assert.equal(siphonExpired.state.players.P1.spiritSiphonedMovement, 0, 'The siphoned MOV penalty expires when the affected character ends their turn.');
  assert.equal(effectiveMoveRange(siphonExpired.state.players.P1), 2);
}

const cumulativeSpiritState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
cumulativeSpiritState.objects = [{ id: 'cumulative-box-one', name: 'Wooden Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: { x: 4, y: 2 } }];
cumulativeSpiritState.players.P1.position = { x: 2, y: 2 };
cumulativeSpiritState.players.P2.position = { x: 7, y: 7 };
cumulativeSpiritState.players.P1.spiritForm = true;
cumulativeSpiritState.players.P1.attackRange = 1;
cumulativeSpiritState.players.P1.hand = [{ instanceId: 'cumulative-pinned', cardId: 'pinned', revealedToOpponent: true }, { instanceId: 'cumulative-attack-one', cardId: 'attack-2' }];
cumulativeSpiritState.players.P1.pinnedStacks = 1;
const cumulativeFreeMove = applyGameCommand(cumulativeSpiritState, { type: 'free-move', playerId: 'P1' });
assert.equal(cumulativeFreeMove.ok, true);
if (!cumulativeFreeMove.ok) throw new Error(cumulativeFreeMove.error);
assert.equal(cumulativeFreeMove.state.players.P1.movementRemaining, 1, 'Spirit Form has at most 1 immediately spendable MOV.');
assert.equal(cumulativeFreeMove.state.players.P1.johnCumulativeMovementRemaining, 2, 'Pinned reduces John\'s cumulative movement from 3 to 2 before affecting Spirit movement.');
const cumulativeSpiritMove = applyGameCommand(cumulativeFreeMove.state, { type: 'move', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(cumulativeSpiritMove.ok, true);
if (!cumulativeSpiritMove.ok) throw new Error(cumulativeSpiritMove.error);
assert.equal(cumulativeSpiritMove.state.players.P1.spiritMovementDepleted, true);
removeCard(cumulativeSpiritMove.state.players.P1, 'cumulative-pinned');
assert.equal(cumulativeSpiritMove.state.players.P1.johnCumulativeMovementRemaining, 3, 'Removing Pinned restores the cumulative pool before Spirit Form movement is settled.');
const cumulativeFirstExit = applyGameCommand(cumulativeSpiritMove.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'cumulative-attack-one', targetId: 'cumulative-box-one', targetKind: 'object' });
assert.equal(cumulativeFirstExit.ok, true);
if (!cumulativeFirstExit.ok) throw new Error(cumulativeFirstExit.error);
assert.equal(cumulativeFirstExit.state.players.P1.spiritForm, false);
assert.equal(cumulativeFirstExit.state.players.P1.movementRemaining, 2, 'A fully depleted Spirit Form charges exactly 1 against John\'s cumulative movement when the Form ends.');

const exhaustedCumulativeState = cumulativeFirstExit.state;
exhaustedCumulativeState.players.P1.johnCumulativeMovementRemaining = 1;
exhaustedCumulativeState.players.P1.movementRemaining = 1;
exhaustedCumulativeState.players.P1.actionsRemaining = 1;
exhaustedCumulativeState.players.P1.hand = [{ instanceId: 'cumulative-attack-two', cardId: 'attack-2' }];
exhaustedCumulativeState.objects = [{ id: 'cumulative-box-two', name: 'Wooden Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: { x: 5, y: 2 } }];
dealDamage(exhaustedCumulativeState, exhaustedCumulativeState.players.P1, 1, false, 'P2');
assert.equal(exhaustedCumulativeState.players.P1.movementRemaining, 1, 'Entering Spirit Form grants 1 MOV independently of the remaining cumulative pool.');
const exhaustedSpiritMove = applyGameCommand(exhaustedCumulativeState, { type: 'move', playerId: 'P1', to: { x: 4, y: 2 } });
assert.equal(exhaustedSpiritMove.ok, true);
if (!exhaustedSpiritMove.ok) throw new Error(exhaustedSpiritMove.error);
const exhaustedSpiritExit = applyGameCommand(exhaustedSpiritMove.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'cumulative-attack-two', targetId: 'cumulative-box-two', targetKind: 'object' });
assert.equal(exhaustedSpiritExit.ok, true);
if (!exhaustedSpiritExit.ok) throw new Error(exhaustedSpiritExit.error);
assert.equal(exhaustedSpiritExit.state.players.P1.johnCumulativeMovementRemaining, 0);
assert.equal(exhaustedSpiritExit.state.players.P1.movementRemaining, 0, 'Repeated form changes cannot restore depleted cumulative movement to normal John.');
dealDamage(exhaustedSpiritExit.state, exhaustedSpiritExit.state.players.P1, 1, false, 'P2');
assert.equal(exhaustedSpiritExit.state.players.P1.movementRemaining, 0, 'A second Spirit Form entry in the same turn grants 0 MOV after its earlier MOV and John\'s full cumulative pool were spent.');

const fearJusticeState = createHotseatTestState(true, 'john-christ', 3, 'dummy');
fearJusticeState.phase = 'active';
fearJusticeState.objects = [];
fearJusticeState.players.P1.position = { x: 3, y: 3 };
fearJusticeState.players.P2.position = { x: 2, y: 3 };
fearJusticeState.players.P3.position = { x: 4, y: 3 };
fearJusticeState.players.P1.movementRemaining = 3;
fearJusticeState.players.P1.hand = [];
fearJusticeState.players.P1.spellEcho = [null, null, { instanceId: 'fear-justice-level-3', cardId: 'fear-the-justice' }];
fearJusticeState.players.P2.hand = [{ instanceId: 'fear-defend-p2', cardId: 'defend-1' }];
fearJusticeState.players.P3.hand = [{ instanceId: 'fear-defend-p3', cardId: 'defend-1' }];
const fearJusticePlayed = applyGameCommand(fearJusticeState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(fearJusticePlayed.ok, true);
if (fearJusticePlayed.ok) {
  assert.equal(fearJusticePlayed.state.players.P1.spiritForm, true, 'Fear the Justice level 1 enters Spirit Form.');
  assert.equal(fearJusticePlayed.state.players.P1.movementRemaining, 1, 'Entering Spirit Form through Fear the Justice caps unspent MOV at 1.');
  assert.equal(fearJusticePlayed.state.players.P2.hand.some((card) => card.cardId === 'panic'), true, 'Fear the Justice level 2 applies Panic to adjacent P2.');
  assert.equal(fearJusticePlayed.state.players.P3.hand.some((card) => card.cardId === 'panic'), true, 'Fear the Justice level 2 applies Panic to adjacent P3.');
  assert.equal(fearJusticePlayed.state.forceDisarm?.targetId, 'P2', 'Fear the Justice level 3 begins sequential Defend discards with the first affected enemy.');
  const fearP2Discard = applyGameCommand(fearJusticePlayed.state, { type: 'force-disarm-discard', playerId: 'P2', cardInstanceId: 'fear-defend-p2' });
  assert.equal(fearP2Discard.ok, true);
  if (fearP2Discard.ok) {
    assert.equal(fearP2Discard.state.forceDisarm?.targetId, 'P3', 'Fear the Justice continues to the next affected enemy.');
    const fearP3Discard = applyGameCommand(fearP2Discard.state, { type: 'force-disarm-discard', playerId: 'P3', cardInstanceId: 'fear-defend-p3' });
    assert.equal(fearP3Discard.ok, true);
    if (fearP3Discard.ok) {
      assert.equal(fearP3Discard.state.phase, 'active');
      assert.equal(fearP3Discard.state.forceDisarm, null);
    }
  }
}

const innerPeaceState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
innerPeaceState.players.P1.spiritForm = true;
innerPeaceState.players.P1.attackRange = 1;
innerPeaceState.players.P1.hand = [
  { instanceId: 'inner-peace-pinned', cardId: 'pinned', revealedToOpponent: true },
  { instanceId: 'inner-peace-headache', cardId: 'headache', revealedToOpponent: true },
];
innerPeaceState.players.P1.pinnedStacks = 1;
innerPeaceState.players.P1.deck = [{ instanceId: 'inner-peace-burning-deck', cardId: 'burning' }];
innerPeaceState.players.P1.discard = [{ instanceId: 'inner-peace-exhaust-discard', cardId: 'exhaust' }];
innerPeaceState.players.P1.spellEcho = [null, null, { instanceId: 'inner-peace-level-3', cardId: 'inner-peace' }];
const innerPeacePlayed = applyGameCommand(innerPeaceState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(innerPeacePlayed.ok, true);
if (innerPeacePlayed.ok) {
  assert.equal(innerPeacePlayed.state.players.P1.spiritForm, false, 'Inner Peace level 1 exits Spirit Form.');
  assert.equal(innerPeacePlayed.state.phase, 'choosing-blessed-prayer-discard', 'Inner Peace waits for the Level 1 Hand Status choice.');
  const innerPeaceChoice = applyGameCommand(innerPeacePlayed.state, { type: 'inner-peace-status-choice', playerId: 'P1', cardInstanceId: 'inner-peace-pinned' });
  assert.equal(innerPeaceChoice.ok, true);
  if (innerPeaceChoice.ok) {
    assert.equal(innerPeaceChoice.state.players.P1.hand.some((card) => card.cardId === 'pinned' || card.cardId === 'headache'), false, 'Inner Peace removes the chosen negative Hand Status and one additional random negative Hand Status at level 2.');
    assert.equal(innerPeaceChoice.state.players.P1.deck.some((card) => card.cardId === 'burning'), true, 'Level 2 prefers a remaining negative Hand Status before Deck and Discard Status Cards.');
    assert.equal(innerPeaceChoice.state.players.P1.hand.some((card) => card.cardId === 'blessing-faith' && card.revealedToOpponent), true, 'Inner Peace level 3 immediately creates revealed Blessing: Faith.');
    assert.equal(innerPeaceChoice.state.players.P1.stoicShell, true, 'Perk-created Blessing: Faith immediately grants Stoic Shell.');
  }
}

const innerPeaceNoHandState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
innerPeaceNoHandState.players.P1.hand = [];
innerPeaceNoHandState.players.P1.deck = [{ instanceId: 'inner-peace-deck-priority', cardId: 'burning' }];
innerPeaceNoHandState.players.P1.discard = [{ instanceId: 'inner-peace-discard-later', cardId: 'exhaust' }];
innerPeaceNoHandState.players.P1.spellEcho = [null, { instanceId: 'inner-peace-level-2', cardId: 'inner-peace' }, null];
const innerPeaceNoHandPlayed = applyGameCommand(innerPeaceNoHandState, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(innerPeaceNoHandPlayed.ok, true);
if (innerPeaceNoHandPlayed.ok) {
  assert.equal(innerPeaceNoHandPlayed.state.players.P1.deck.some((card) => card.cardId === 'burning'), false, 'Without a negative Hand Status, Inner Peace level 2 removes one random negative Status from Deck first.');
  assert.equal(innerPeaceNoHandPlayed.state.players.P1.discard.some((card) => card.cardId === 'exhaust'), true, 'Inner Peace removes only one Level 2 negative Status and leaves lower-priority Discard Status Cards untouched.');
}

const innerPeacePositiveOnlyState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
innerPeacePositiveOnlyState.players.P1.hand = [{ instanceId: 'protected-faith', cardId: 'blessing-faith', revealedToOpponent: true }];
innerPeacePositiveOnlyState.players.P1.deck = [{ instanceId: 'protected-light', cardId: 'blessing-light', revealedToOpponent: true }];
innerPeacePositiveOnlyState.players.P1.discard = [{ instanceId: 'protected-shield', cardId: 'blessing-shield', revealedToOpponent: true }];
innerPeacePositiveOnlyState.players.P1.spellEcho = [null, { instanceId: 'inner-peace-positive-only', cardId: 'inner-peace' }, null];
const innerPeacePositiveOnlyPlayed = applyGameCommand(innerPeacePositiveOnlyState, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(innerPeacePositiveOnlyPlayed.ok, true);
if (innerPeacePositiveOnlyPlayed.ok) {
  assert.equal(innerPeacePositiveOnlyPlayed.state.phase, 'active', 'Inner Peace does not open a forced choice when no negative Status exists in Hand.');
  assert.deepEqual(innerPeacePositiveOnlyPlayed.state.players.P1.hand.map((card) => card.cardId), ['blessing-faith'], 'Inner Peace protects positive Status Cards in Hand.');
  assert.deepEqual(innerPeacePositiveOnlyPlayed.state.players.P1.deck.map((card) => card.cardId), ['blessing-light'], 'Inner Peace protects positive Status Cards in Deck.');
  assert.deepEqual(innerPeacePositiveOnlyPlayed.state.players.P1.discard.map((card) => card.cardId), ['blessing-shield'], 'Inner Peace protects positive Status Cards in Discard.');
}

const mindBlastState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
mindBlastState.objects = [];
mindBlastState.players.P1.position = { x: 2, y: 2 };
mindBlastState.players.P2.position = { x: 4, y: 2 };
mindBlastState.players.P1.spellEcho = [null, null, { instanceId: 'mind-blast-level-3', cardId: 'mind-blast' }];
mindBlastState.players.P2.hand = [{ instanceId: 'mind-blast-discard', cardId: 'attack-2' }];
mindBlastState.players.P2.deck = [{ instanceId: 'mind-blast-existing-deck', cardId: 'defend-1' }];
const mindBlastPlayed = applyGameCommand(mindBlastState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(mindBlastPlayed.ok, true);
if (mindBlastPlayed.ok) {
  assert.equal(mindBlastPlayed.state.phase, 'choosing-arcane-missle-target', 'Mind Blast first waits for John to select an enemy in Range and line of sight.');
  const mindBlastTargeted = applyGameCommand(mindBlastPlayed.state, { type: 'arcane-missle-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(mindBlastTargeted.ok, true);
  if (mindBlastTargeted.ok) {
    assert.equal(mindBlastTargeted.state.phase, 'choosing-force-disarm-discard', 'Mind Blast lets the target choose the Level 1 discard before later effects resolve.');
    const hpBefore = mindBlastTargeted.state.players.P2.hp;
    const mindBlastDiscarded = applyGameCommand(mindBlastTargeted.state, { type: 'force-disarm-discard', playerId: 'P2', cardInstanceId: 'mind-blast-discard' });
    assert.equal(mindBlastDiscarded.ok, true);
    if (mindBlastDiscarded.ok) {
      assert.equal(mindBlastDiscarded.state.players.P2.hand.length, 0, 'Mind Blast level 1 discards the target-selected Card.');
      assert.equal(mindBlastDiscarded.state.players.P2.hp, hpBefore - 1, 'Mind Blast level 2 deals 1 Damage after the discard.');
      assert.deepEqual(mindBlastDiscarded.state.players.P2.deck.slice(-2).map((card) => card.cardId), ['headache', 'headache'], "Mind Blast level 3 puts 2 Headache Cards on top of the target's Deck.");
      assert.equal(mindBlastDiscarded.state.players.P2.deck.slice(-2).every((card) => card.revealedToOpponent), true, 'Both generated Headache Cards are revealed Status Cards.');
      assert.equal(mindBlastDiscarded.state.players.P2.knownTopCardId, 'headache', 'The Headache added on top is tracked as the known top Card.');
      assert.equal(mindBlastDiscarded.state.phase, 'active');
    }
  }
}

const forcedDiscardImpossibleState = createHotseatTestState(true, 'john-christ', 2, 'orkk');
forcedDiscardImpossibleState.objects = [];
forcedDiscardImpossibleState.players.P1.position = { x: 2, y: 2 };
forcedDiscardImpossibleState.players.P2.position = { x: 4, y: 2 };
forcedDiscardImpossibleState.players.P1.spellEcho = [{ instanceId: 'forced-discard-mind-blast', cardId: 'mind-blast' }, null, null];
forcedDiscardImpossibleState.players.P2.hand = [{ instanceId: 'forced-discard-headache', cardId: 'headache' }];
const forcedDiscardMindBlast = applyGameCommand(forcedDiscardImpossibleState, { type: 'use-echo-perk', playerId: 'P1', position: 1 });
assert.equal(forcedDiscardMindBlast.ok, true);
if (forcedDiscardMindBlast.ok) {
  const forcedDiscardTarget = applyGameCommand(forcedDiscardMindBlast.state, { type: 'arcane-missle-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(forcedDiscardTarget.ok, true);
  if (forcedDiscardTarget.ok) {
    assert.equal(forcedDiscardTarget.state.players.P2.hp, 24, 'Failure to satisfy an enemy Card\'s forced discard does not deal defeat or Damage.');
    assert.equal(forcedDiscardTarget.state.players.P2.hand[0]?.cardId, 'headache', 'A non-discardable Card remains in Hand when an enemy forced-discard effect has no legal target.');
    assert.equal(forcedDiscardTarget.state.phase, 'active', 'Enemy forced-discard effects resolve without ending the match when no legal Card exists.');
    assert.equal(forcedDiscardTarget.state.winner, null);
  }
}

const guardianLevelThreeState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
guardianLevelThreeState.objects = [];
guardianLevelThreeState.players.P1.position = { x: 2, y: 3 };
guardianLevelThreeState.players.P2.position = { x: 3, y: 2 };
guardianLevelThreeState.players.P1.spellEcho = [null, null, { instanceId: 'guardian-level-3', cardId: 'spirit-guardian' }];
const guardianLevelThreePlayed = applyGameCommand(guardianLevelThreeState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(guardianLevelThreePlayed.ok, true);
if (guardianLevelThreePlayed.ok) {
  assert.equal(guardianLevelThreePlayed.state.phase, 'choosing-spirit-guardian-square');
  const guardianPlaced = applyGameCommand(guardianLevelThreePlayed.state, { type: 'spirit-guardian-square', playerId: 'P1', to: { x: 3, y: 3 } });
  assert.equal(guardianPlaced.ok, true);
  if (guardianPlaced.ok) {
    const guardian = guardianPlaced.state.objects.find((object) => object.kind === 'spirit-guardian');
    assert.equal(guardian?.guardianLevel, 3, 'Spirit Guardian preserves its played Spell Echo level.');
    assert.equal(guardian?.hp, 999, 'Level 2+ Spirit Guardian is invincible.');
    assert.equal(guardian?.heavy, true, 'Level 2+ Spirit Guardian carries the reusable Heavy Object property.');
    guardianPlaced.state.activePlayerId = 'P2';
    guardianPlaced.state.players.P2.hand = [{ instanceId: 'guardian-penalized-attack', cardId: 'attack-2' }];
    guardianPlaced.state.players.P2.actionsRemaining = 2;
    const guardianPenaltyAttack = applyGameCommand(guardianPlaced.state, { type: 'attack', playerId: 'P2', cardInstanceId: 'guardian-penalized-attack', targetId: 'P1' });
    assert.equal(guardianPenaltyAttack.ok, true);
    if (guardianPenaltyAttack.ok) {
      assert.equal(guardianPenaltyAttack.state.pendingAttack?.attackValue, 1, 'An enemy adjacent to a level 3 Guardian has -1 Attack Card Value.');
      guardianPenaltyAttack.state.players.P1.hand = [{ instanceId: 'guardian-buffed-defense', cardId: 'defend-1' }];
      const guardianDefense = applyGameCommand(guardianPenaltyAttack.state, { type: 'defend', playerId: 'P1', cardInstanceId: 'guardian-buffed-defense' });
      assert.equal(guardianDefense.ok, true);
      if (guardianDefense.ok) assert.equal(guardianDefense.state.combatReveal?.defendTotal, 2, 'The Guardian owner gains +1 Defend Value while adjacent.');
    }
  }
}

const guardianDurabilityState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
guardianDurabilityState.objects = [{ id: 'guardian-wall', name: 'Spirit Guardian', kind: 'spirit-guardian', hp: 999, maxHp: 999, position: { x: 3, y: 2 }, ownerId: 'P1', guardianLevel: 2, heavy: true }];
guardianDurabilityState.players.P2.position = { x: 4, y: 2 };
guardianDurabilityState.activePlayerId = 'P2';
guardianDurabilityState.players.P2.hand = [{ instanceId: 'guardian-wall-attack', cardId: 'attack-3' }];
const guardianWallAttack = applyGameCommand(guardianDurabilityState, { type: 'attack', playerId: 'P2', cardInstanceId: 'guardian-wall-attack', targetKind: 'object', targetId: 'guardian-wall' });
assert.equal(guardianWallAttack.ok, true, 'An invincible Guardian remains a valid direct Attack Card target.');
if (guardianWallAttack.ok) assert.equal(guardianWallAttack.state.objects.some((object) => object.id === 'guardian-wall'), true, 'Level 2 Guardian ignores combat and effect Damage.');
guardianDurabilityState.phase = 'choosing-force-pull-target';
guardianDurabilityState.players.P2.position = { x: 6, y: 2 };
guardianDurabilityState.forcePull = { casterId: 'P2', level: 3, distance: 3, targetRange: 4, undo: null };
const heavyGuardianPull = applyGameCommand(guardianDurabilityState, { type: 'force-pull-target', playerId: 'P2', targetKind: 'object', targetId: 'guardian-wall' });
assert.equal(heavyGuardianPull.ok, true, 'Heavy Guardian can be targeted by pull effects.');
if (heavyGuardianPull.ok) {
  assert.deepEqual(heavyGuardianPull.state.objects.find((object) => object.id === 'guardian-wall')?.position, { x: 4, y: 2 }, 'Heavy caps a pull effect to exactly 1 Square.');
  heavyGuardianPull.state.phase = 'choosing-force-throw-target';
  heavyGuardianPull.state.forceThrow = { casterId: 'P2', level: 3, distance: 4, targetRange: 4, targetKind: null, targetId: null, undo: null };
  const heavyGuardianPushTarget = applyGameCommand(heavyGuardianPull.state, { type: 'force-throw-target', playerId: 'P2', targetKind: 'object', targetId: 'guardian-wall' });
  assert.equal(heavyGuardianPushTarget.ok, true, 'Heavy Guardian can be targeted by push effects.');
  if (heavyGuardianPushTarget.ok) {
    const heavyGuardianPush = applyGameCommand(heavyGuardianPushTarget.state, { type: 'force-throw-direction', playerId: 'P2', to: { x: 3, y: 2 } });
    assert.equal(heavyGuardianPush.ok, true);
    if (heavyGuardianPush.ok) assert.deepEqual(heavyGuardianPush.state.objects.find((object) => object.id === 'guardian-wall')?.position, { x: 3, y: 2 }, 'Heavy caps a push effect to exactly 1 Square.');
  }
}

const guardianLevelOneState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
guardianLevelOneState.objects = [{ id: 'guardian-mortal', name: 'Spirit Guardian', kind: 'spirit-guardian', hp: 1, maxHp: 1, position: { x: 3, y: 2 }, ownerId: 'P1', guardianLevel: 1 }];
guardianLevelOneState.players.P2.position = { x: 4, y: 2 };
guardianLevelOneState.activePlayerId = 'P2';
guardianLevelOneState.players.P2.hand = [{ instanceId: 'guardian-mortal-attack', cardId: 'attack-2' }];
const guardianMortalAttack = applyGameCommand(guardianLevelOneState, { type: 'attack', playerId: 'P2', cardInstanceId: 'guardian-mortal-attack', targetKind: 'object', targetId: 'guardian-mortal' });
assert.equal(guardianMortalAttack.ok, true);
if (guardianMortalAttack.ok) assert.equal(guardianMortalAttack.state.objects.some((object) => object.id === 'guardian-mortal'), false, 'Level 1 Guardian is destroyed by a direct Attack Card.');

const guardianPerkProtectionState = createHotseatTestState(true, 'john-christ', 2, 'dummy') as any;
guardianPerkProtectionState.objects = [{ id: 'guardian-protection', name: 'Spirit Guardian', kind: 'spirit-guardian', hp: 1, maxHp: 1, position: { x: 3, y: 2 }, ownerId: 'P1', guardianLevel: 1 }];
guardianPerkProtectionState.players.P1.position = { x: 2, y: 2 };
guardianPerkProtectionState.players.P1.hp = 14;
guardianPerkProtectionState.currentGuardianPerkActionId = 1;
const firstGuardianHit = dealDamage(guardianPerkProtectionState, guardianPerkProtectionState.players.P1, 2, false, 'P2', 'perk');
assert.equal(firstGuardianHit, 1, 'An adjacent Guardian blocks 1 Perk Damage during an Action.');
const secondGuardianHit = dealDamage(guardianPerkProtectionState, guardianPerkProtectionState.players.P1, 2, false, 'P2', 'perk');
assert.equal(secondGuardianHit, 2, 'The Guardian blocks only 1 Perk Damage across all hits from the same Action.');
guardianPerkProtectionState.currentGuardianPerkActionId = 2;
const nextGuardianActionHit = dealDamage(guardianPerkProtectionState, guardianPerkProtectionState.players.P1, 2, false, 'P2', 'perk');
assert.equal(nextGuardianActionHit, 1, 'A new Perk Action refreshes the Guardian\'s 1 Damage block.');
guardianPerkProtectionState.currentGuardianPerkActionId = 3;
guardianPerkProtectionState.players.P1.position = { x: 5, y: 2 };
const pushedOutsideGuardianHit = dealDamage(guardianPerkProtectionState, guardianPerkProtectionState.players.P1, 2, true, 'P2', 'perk');
assert.equal(pushedOutsideGuardianHit, 2, 'Perk collision Damage is fully applied if John was moved outside Guardian adjacency before Damage resolves.');

const guardianAttackRemovalState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
guardianAttackRemovalState.objects = [{ id: 'guardian-owned', name: 'Spirit Guardian', kind: 'spirit-guardian', hp: 999, maxHp: 999, position: { x: 2, y: 3 }, ownerId: 'P1', guardianLevel: 3 }];
guardianAttackRemovalState.players.P1.position = { x: 2, y: 2 };
guardianAttackRemovalState.players.P2.position = { x: 3, y: 2 };
guardianAttackRemovalState.players.P1.hand = [{ instanceId: 'guardian-owner-attack', cardId: 'attack-2' }];
const guardianOwnerAttack = applyGameCommand(guardianAttackRemovalState, { type: 'attack', playerId: 'P1', cardInstanceId: 'guardian-owner-attack', targetId: 'P2' });
assert.equal(guardianOwnerAttack.ok, true);
if (guardianOwnerAttack.ok) assert.equal(guardianOwnerAttack.state.objects.some((object) => object.kind === 'spirit-guardian'), true, 'John keeps his Guardian when he uses an Attack Card.');

const guardianTurnExpiryState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
guardianTurnExpiryState.activePlayerId = 'P2';
guardianTurnExpiryState.objects = [{ id: 'guardian-expiring', name: 'Spirit Guardian', kind: 'spirit-guardian', hp: 1, maxHp: 1, position: { x: 3, y: 3 }, ownerId: 'P1', guardianLevel: 1 }];
guardianTurnExpiryState.players.P2.hand = [];
const guardianNextTurn = applyGameCommand(guardianTurnExpiryState, { type: 'end-turn', playerId: 'P2' });
assert.equal(guardianNextTurn.ok, true);
if (guardianNextTurn.ok) {
  assert.equal(guardianNextTurn.state.activePlayerId, 'P1');
  assert.equal(guardianNextTurn.state.objects.some((object) => object.id === 'guardian-expiring'), false, "A surviving Guardian is removed at the beginning of John's next turn.");
}

const blessedLightState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessedLightState.objects = [];
blessedLightState.players.P1.position = { x: 2, y: 2 };
blessedLightState.players.P2.position = { x: 4, y: 2 };
blessedLightState.players.P1.hand = [{ instanceId: 'blessed-light-test', cardId: 'blessed-light' }];
blessedLightState.players.P2.hand = [];
blessedLightState.players.P2.deck = [];
const blessedLightAttack = applyGameCommand(blessedLightState, { type: 'attack', playerId: 'P1', cardInstanceId: 'blessed-light-test', targetId: 'P2' });
assert.equal(blessedLightAttack.ok, true);
if (blessedLightAttack.ok) {
  const blessedLightResolved = applyGameCommand(blessedLightAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(blessedLightResolved.ok, true);
  if (blessedLightResolved.ok) {
    const blessedAckOne = applyGameCommand(blessedLightResolved.state, { type: 'ack-combat', playerId: 'P1' });
    assert.equal(blessedAckOne.ok, true);
    const blessedAckTwo = blessedAckOne.ok ? applyGameCommand(blessedAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : blessedAckOne;
    assert.equal(blessedAckTwo.ok, true);
    if (blessedAckTwo.ok) {
      assert.equal(blessedAckTwo.state.players.P2.deck.length, 1);
      assert.equal(blessedAckTwo.state.players.P2.deck[0].cardId, 'exhaust', 'With an empty Deck, Blessed Light places Exhaust on top as the next draw.');
      assert.equal(blessedAckTwo.state.players.P1.hand.some((card) => card.cardId === 'blessing-light'), true);
      const generatedBlessing = blessedAckTwo.state.players.P1.hand.find((card) => card.cardId === 'blessing-light')!;
      assert.equal(generatedBlessing.revealedToOpponent, true, 'Generated Blessing Cards are public while in John’s Hand.');
      assert.equal(isCardRevealedToOpponents(blessedAckTwo.state.players.P1, generatedBlessing), true);
      assert.equal(blessedAckTwo.state.players.P1.stoicShell, true, 'Creating Blessing: Light immediately grants Stoic Shell.');
    }
  }
}

const blessedBlockState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessedBlockState.objects = [];
blessedBlockState.players.P1.position = { x: 2, y: 2 };
blessedBlockState.players.P2.position = { x: 4, y: 2 };
blessedBlockState.players.P1.hand = [{ instanceId: 'blessed-light-vs-block', cardId: 'blessed-light' }];
blessedBlockState.players.P2.character = 'john-christ';
blessedBlockState.players.P2.hand = [{ instanceId: 'blessed-block-test', cardId: 'blessed-block' }];
blessedBlockState.players.P2.deck = [];
const blessedBlockAttack = applyGameCommand(blessedBlockState, { type: 'attack', playerId: 'P1', cardInstanceId: 'blessed-light-vs-block', targetId: 'P2' });
assert.equal(blessedBlockAttack.ok, true);
if (blessedBlockAttack.ok) {
  const blessedBlockOffer = applyGameCommand(blessedBlockAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'blessed-block-test' });
  assert.equal(blessedBlockOffer.ok, true);
  if (blessedBlockOffer.ok) {
    assert.equal(blessedBlockOffer.state.players.P2.hand.some((card) => card.cardId === 'blessing-shield'), false, 'Blessed Block does not create Blessing: Shield during the enemy turn.');
    assert.equal(blessedBlockOffer.state.players.P2.queuedBlessingCardIds.includes('blessing-shield'), true, 'Blessed Block queues Blessing: Shield for John’s turn start.');
    assert.equal(blessedBlockOffer.state.players.P2.stoicShell, false, 'Blessed Block does not grant Stoic Shell during the enemy turn.');
    assert.notEqual(blessedBlockOffer.state.phase, 'choosing-mythril-helmet', 'A Blessing: Shield generated by Blessed Block is unavailable during that same combat.');
    {
      const blessedBlockAckOne = applyGameCommand(blessedBlockOffer.state, { type: 'ack-combat', playerId: 'P1' });
      const blessedBlockAckTwo = blessedBlockAckOne.ok ? applyGameCommand(blessedBlockAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : blessedBlockAckOne;
      assert.equal(blessedBlockAckTwo.ok, true);
      if (blessedBlockAckTwo.ok) assert.equal(blessedBlockAckTwo.state.players.P2.deck.some((card) => card.cardId === 'exhaust'), false, 'Blessed Block cancels Blessed Light’s Attack Card effect.');
    }
  }
}

const queuedDefenseBlessingState = createHotseatTestState(false, 'magician', 2, 'john-christ');
queuedDefenseBlessingState.phase = 'active';
queuedDefenseBlessingState.pendingManaChoice = null;
queuedDefenseBlessingState.players.P2.queuedBlessingCardIds = ['blessing-shield', 'blessing-swiftness'];
queuedDefenseBlessingState.players.P2.stoicShell = false;
const queuedDefenseBlessingsAwarded = applyGameCommand(queuedDefenseBlessingState, { type: 'end-turn', playerId: 'P1' });
assert.equal(queuedDefenseBlessingsAwarded.ok, true);
if (queuedDefenseBlessingsAwarded.ok) {
  assert.equal(queuedDefenseBlessingsAwarded.state.players.P2.hand.some((card) => card.cardId === 'blessing-shield' && card.revealedToOpponent), true, 'Queued Defend Blessing: Shield enters Hand at the beginning of John’s turn.');
  assert.equal(queuedDefenseBlessingsAwarded.state.players.P2.hand.some((card) => card.cardId === 'blessing-swiftness' && card.revealedToOpponent), true, 'Queued Defend Blessing: Swiftness enters Hand at the beginning of John’s turn.');
  assert.equal(queuedDefenseBlessingsAwarded.state.players.P2.stoicShell, true, 'Turn-start Defend Blessing creation grants Stoic Shell.');
  assert.equal(queuedDefenseBlessingsAwarded.state.players.P2.queuedBlessingCardIds.length, 0, 'Awarded Defend Blessings leave the queue.');
}

const thornsState = createHotseatTestState(false, 'magician', 2, 'john-christ');
thornsState.objects = [];
thornsState.phase = 'active';
thornsState.pendingManaChoice = null;
thornsState.players.P1.position = { x: 2, y: 2 };
thornsState.players.P2.position = { x: 3, y: 2 };
thornsState.players.P1.hand = [{ instanceId: 'attack-vs-thorns', cardId: 'grimoire-cleanse' }];
thornsState.players.P2.hand = [{ instanceId: 'thorns-test', cardId: 'thorns' }];
const attackerHpBeforeThorns = thornsState.players.P1.hp;
const thornsAttack = applyGameCommand(thornsState, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack-vs-thorns', targetId: 'P2' });
assert.equal(thornsAttack.ok, true, thornsAttack.ok ? '' : thornsAttack.error);
if (thornsAttack.ok) {
  const thornsCombat = applyGameCommand(thornsAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'thorns-test' });
  assert.equal(thornsCombat.ok, true);
  if (thornsCombat.ok) {
    assert.equal(thornsCombat.state.players.P1.hp, attackerHpBeforeThorns - 1, 'Thorns deals 1 Damage to the Attacker before the combat result is acknowledged.');
    const thornsAckOne = applyGameCommand(thornsCombat.state, { type: 'ack-combat', playerId: 'P1' });
    const thornsAckTwo = thornsAckOne.ok ? applyGameCommand(thornsAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : thornsAckOne;
    assert.equal(thornsAckTwo.ok, true);
    if (thornsAckTwo.ok) {
      assert.equal(thornsAckTwo.state.players.P1.hp, attackerHpBeforeThorns - 1, 'Thorns deals 1 Damage to the Attacker before combat.');
      assert.equal(thornsAckTwo.state.players.P2.spiritForm, true, 'Combat Damage causes John to enter Spirit Form.');
      assert.equal(thornsAckTwo.state.players.P1.hand.some((card) => card.cardId === 'burning'), true, 'Thorns applies Burning to the Attacker after John enters Spirit Form.');
    }
  }
}

const blessedSwiftnessState = createHotseatTestState(false, 'magician', 2, 'john-christ');
blessedSwiftnessState.objects = [];
blessedSwiftnessState.phase = 'active';
blessedSwiftnessState.pendingManaChoice = null;
blessedSwiftnessState.players.P1.position = { x: 2, y: 2 };
blessedSwiftnessState.players.P2.position = { x: 3, y: 2 };
blessedSwiftnessState.players.P1.movementRemaining = 2;
blessedSwiftnessState.players.P1.hand = [{ instanceId: 'attack-vs-swiftness', cardId: 'grimoire-cleanse' }];
blessedSwiftnessState.players.P2.hand = [{ instanceId: 'blessed-swiftness-test', cardId: 'blessed-swiftness' }];
const swiftnessAttack = applyGameCommand(blessedSwiftnessState, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack-vs-swiftness', targetId: 'P2' });
assert.equal(swiftnessAttack.ok, true);
if (swiftnessAttack.ok) {
  const swiftnessDefense = applyGameCommand(swiftnessAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'blessed-swiftness-test' });
  assert.equal(swiftnessDefense.ok, true);
  if (swiftnessDefense.ok) {
    assert.equal(swiftnessDefense.state.players.P1.movementRemaining, 0, 'Blessed Swiftness annuls all of the attacker’s unspent MOV.');
    assert.equal(swiftnessDefense.state.players.P1.movementAnnulledByBlessedSwiftness, true, 'Blessed Swiftness displays a temporary annulled-MOV status on the affected Player.');
    assert.equal(swiftnessDefense.state.players.P2.hand.some((card) => card.cardId === 'blessing-swiftness'), false, 'Blessed Swiftness does not create its Blessing during the enemy turn.');
    assert.equal(swiftnessDefense.state.players.P2.queuedBlessingCardIds.includes('blessing-swiftness'), true, 'Blessed Swiftness queues its Blessing for John’s turn start.');
    assert.equal(effectiveMoveRange(swiftnessDefense.state.players.P2), 3, 'Queued Blessing: Swiftness grants no MOV before entering Hand.');
    assert.equal(swiftnessDefense.state.players.P2.stoicShell, false, 'Queued Blessing: Swiftness does not grant Stoic Shell early.');
  }
}

const swiftnessExpiryState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
swiftnessExpiryState.players.P1.movementAnnulledByBlessedSwiftness = true;
swiftnessExpiryState.players.P1.hand = [
  { instanceId: 'auto-swiftness', cardId: 'blessing-swiftness', revealedToOpponent: true },
  { instanceId: 'swiftness-card-1', cardId: 'blessed-light' },
  { instanceId: 'swiftness-card-2', cardId: 'cleanse' },
  { instanceId: 'swiftness-card-3', cardId: 'repent' },
  { instanceId: 'swiftness-card-4', cardId: 'enforce' },
  { instanceId: 'swiftness-card-5', cardId: 'blessed-might' },
];
assert.equal(swiftnessExpiryState.players.P1.hand.some((card) => card.cardId === 'blessing-swiftness'), true, 'Blessing: Swiftness remains in a six-Card Hand until end-turn processing actually begins.');
const swiftnessExpired = applyGameCommand(swiftnessExpiryState, { type: 'end-turn', playerId: 'P1' });
assert.equal(swiftnessExpired.ok, true);
if (swiftnessExpired.ok) {
  assert.equal(swiftnessExpired.state.players.P1.hand.some((card) => card.cardId === 'blessing-swiftness'), false, 'Blessing: Swiftness automatically leaves an over-limit Hand at end of turn.');
  assert.equal(swiftnessExpired.state.players.P1.discard.some((card) => card.cardId === 'blessing-swiftness'), false, 'Automatically discarded Blessing: Swiftness is Removed instead of entering Discard.');
  assert.notEqual(swiftnessExpired.state.phase, 'choosing-end-discard', 'Automatic removal satisfies a one-Card Hand overage before normal discard choice.');
  assert.equal(swiftnessExpired.state.players.P1.movementAnnulledByBlessedSwiftness, false, 'The temporary annulled-MOV status clears when the affected Player begins ending their turn.');
}

const resurrectionState = createHotseatTestState(false, 'magician', 2, 'john-christ');
resurrectionState.objects = [];
resurrectionState.phase = 'active';
resurrectionState.pendingManaChoice = null;
resurrectionState.players.P1.position = { x: 2, y: 2 };
resurrectionState.players.P2.position = { x: 3, y: 2 };
resurrectionState.players.P1.hand = [{ instanceId: 'attack-vs-resurrection', cardId: 'arcane-bolt' }];
resurrectionState.players.P2.hand = [{ instanceId: 'resurrection-test', cardId: 'resurrection' }];
resurrectionState.players.P2.deck = [{ instanceId: 'resurrection-draw', cardId: 'cleanse' }];
const resurrectionAttack = applyGameCommand(resurrectionState, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack-vs-resurrection', targetId: 'P2' });
assert.equal(resurrectionAttack.ok, true);
if (resurrectionAttack.ok) {
  const resurrectionCombat = applyGameCommand(resurrectionAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'resurrection-test' });
  assert.equal(resurrectionCombat.ok, true);
  if (resurrectionCombat.ok) {
    assert.equal(resurrectionCombat.state.players.P2.hp, 14, 'Resurrection negates combat Damage when a Base Square is available.');
    const resurrectionAckOne = applyGameCommand(resurrectionCombat.state, { type: 'ack-combat', playerId: 'P1' });
    const resurrectionAckTwo = resurrectionAckOne.ok ? applyGameCommand(resurrectionAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : resurrectionAckOne;
    assert.equal(resurrectionAckTwo.ok, true);
    if (resurrectionAckTwo.ok) {
      assert.equal(['H4', 'H5'].includes(cellLabel(resurrectionAckTwo.state.players.P2.position)), true, 'Resurrection teleports John to an available own Base Square.');
      assert.equal(resurrectionAckTwo.state.players.P2.hand.some((card) => card.instanceId === 'resurrection-draw'), true, 'Resurrection draws 1 Card.');
    }
  }
}

const blockedResurrectionState = createHotseatTestState(false, 'magician', 2, 'john-christ');
blockedResurrectionState.phase = 'active';
blockedResurrectionState.pendingManaChoice = null;
blockedResurrectionState.players.P1.position = { x: 2, y: 2 };
blockedResurrectionState.players.P2.position = { x: 3, y: 2 };
blockedResurrectionState.objects = [
  { id: 'blocked-base-h4', name: 'Wooden Box', hp: 1, maxHp: 1, position: { x: 8, y: 3 }, kind: 'wooden-box' },
  { id: 'blocked-base-h5', name: 'Wooden Box', hp: 1, maxHp: 1, position: { x: 8, y: 4 }, kind: 'wooden-box' },
];
blockedResurrectionState.players.P1.hand = [{ instanceId: 'attack-vs-blocked-resurrection', cardId: 'arcane-bolt' }];
blockedResurrectionState.players.P2.hand = [{ instanceId: 'blocked-resurrection-test', cardId: 'resurrection' }];
blockedResurrectionState.players.P2.deck = [{ instanceId: 'blocked-resurrection-draw', cardId: 'cleanse' }];
const blockedResurrectionAttack = applyGameCommand(blockedResurrectionState, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack-vs-blocked-resurrection', targetId: 'P2' });
assert.equal(blockedResurrectionAttack.ok, true);
if (blockedResurrectionAttack.ok) {
  const blockedResurrectionCombat = applyGameCommand(blockedResurrectionAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'blocked-resurrection-test' });
  assert.equal(blockedResurrectionCombat.ok, true);
  if (blockedResurrectionCombat.ok) {
    assert.equal(blockedResurrectionCombat.state.players.P2.hp, 12, 'Resurrection does not negate Damage when both Base Squares are blocked.');
    const blockedAckOne = applyGameCommand(blockedResurrectionCombat.state, { type: 'ack-combat', playerId: 'P1' });
    const blockedAckTwo = blockedAckOne.ok ? applyGameCommand(blockedAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : blockedAckOne;
    assert.equal(blockedAckTwo.ok, true);
    if (blockedAckTwo.ok) assert.equal(blockedAckTwo.state.players.P2.hand.some((card) => card.instanceId === 'blocked-resurrection-draw'), true, 'Resurrection still draws 1 Card when teleportation is impossible.');
  }
}

const cleanseState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
cleanseState.objects = [];
cleanseState.players.P1.position = { x: 2, y: 2 };
cleanseState.players.P2.position = { x: 4, y: 2 };
cleanseState.players.P1.hand = [{ instanceId: 'cleanse-test', cardId: 'cleanse' }];
cleanseState.players.P2.hand = [];
const cleanseAttack = applyGameCommand(cleanseState, { type: 'attack', playerId: 'P1', cardInstanceId: 'cleanse-test', targetId: 'P2' });
assert.equal(cleanseAttack.ok, true);
if (cleanseAttack.ok) {
  const cleanseResolved = applyGameCommand(cleanseAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(cleanseResolved.ok, true);
  if (cleanseResolved.ok) {
    const cleanseAckOne = applyGameCommand(cleanseResolved.state, { type: 'ack-combat', playerId: 'P1' });
    assert.equal(cleanseAckOne.ok, true);
    const cleanseAckTwo = cleanseAckOne.ok ? applyGameCommand(cleanseAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : cleanseAckOne;
    assert.equal(cleanseAckTwo.ok, true);
    if (cleanseAckTwo.ok) {
      const burning = cleanseAckTwo.state.players.P2.hand.find((card) => card.cardId === 'burning');
      assert.ok(burning, 'Cleanse adds Burning to the target’s Hand after combat.');
      assert.equal(burning?.revealedToOpponent, true, 'The applied Burning Status is public information.');
      assert.equal(burning?.sourcePlayerId, 'P1', 'Burning remembers John as its source.');
    }
  }
}

const enforceState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
enforceState.objects = [];
enforceState.players.P1.position = { x: 2, y: 2 };
enforceState.players.P2.position = { x: 4, y: 2 };
enforceState.players.P1.hand = [{ instanceId: 'enforce-test', cardId: 'enforce' }];
enforceState.players.P2.hand = [];
const enforceAttack = applyGameCommand(enforceState, { type: 'attack', playerId: 'P1', cardInstanceId: 'enforce-test', targetId: 'P2' });
assert.equal(enforceAttack.ok, true);
if (enforceAttack.ok) {
  assert.equal(enforceAttack.state.pendingAttack?.attackValue, 2, 'Enforce has Attack Value 2.');
  const enforceCombat = applyGameCommand(enforceAttack.state, { type: 'pass-defense', playerId: 'P2' });
  const enforceAckOne = enforceCombat.ok ? applyGameCommand(enforceCombat.state, { type: 'ack-combat', playerId: 'P1' }) : enforceCombat;
  const enforceAckTwo = enforceAckOne.ok ? applyGameCommand(enforceAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : enforceAckOne;
  assert.equal(enforceAckTwo.ok, true);
  if (enforceAckTwo.ok) {
    assert.equal(enforceAckTwo.state.players.P2.hand.some((card) => card.cardId === 'panic'), true, 'Enforce applies Panic after combat.');
    assert.equal(enforceAckTwo.state.players.P2.hand.some((card) => card.cardId === 'headache'), true, 'Enforce adds Headache after combat.');
  }
}

const panicState = createInitialState();
panicState.objects = [];
panicState.players.P1.position = { x: 4, y: 3 };
panicState.players.P2.position = { x: 8, y: 7 };
panicState.players.P1.movementRemaining = 2;
panicState.players.P1.hand = [
  { instanceId: 'panic-status-test', cardId: 'panic', revealedToOpponent: true },
  { instanceId: 'panic-attack-test', cardId: 'attack-2' },
  { instanceId: 'panic-perk-test', cardId: 'kyk' },
];
const panicMovementToSpend = panicState.players.P1.movementRemaining + effectiveMoveRange(panicState.players.P1);
assert.equal(applyCommand(panicState, { type: 'attack', playerId: 'P1', cardInstanceId: 'panic-attack-test', targetId: 'P2' }).ok, false, 'Panic prevents Attack Cards.');
assert.equal(applyCommand(panicState, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'panic-perk-test', destination: 'direct' }).ok, false, 'Panic prevents Perk Cards.');
const panicFreeMove = applyCommand(panicState, { type: 'free-move', playerId: 'P1' });
assert.equal(panicFreeMove.ok, true);
if (panicFreeMove.ok) {
  assert.equal(panicFreeMove.state.players.P1.hand.some((card) => card.cardId === 'panic'), false, 'Free Move Removes Panic.');
  assert.equal(panicFreeMove.state.players.P1.visualMovement?.path.length, panicMovementToSpend, 'Panic randomly spends existing movement bonuses plus all movement granted by Free Move.');
  assert.equal(panicFreeMove.state.players.P1.movementRemaining, 0, 'Panic spends all currently available movement.');
  panicFreeMove.state.players.P1.movementRemaining = 1;
  const laterMovement = movementPath(panicFreeMove.state, panicFreeMove.state.players.P1, { x: Math.max(1, panicFreeMove.state.players.P1.position.x - 1), y: panicFreeMove.state.players.P1.position.y });
  assert.ok(laterMovement.length <= 1, 'Additional movement gained after Panic removal remains available normally.');
}

const blessedMightState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessedMightState.objects = [];
blessedMightState.players.P1.position = { x: 2, y: 2 };
blessedMightState.players.P2.position = { x: 3, y: 2 };
blessedMightState.players.P1.hand = [{ instanceId: 'blessed-might-test', cardId: 'blessed-might' }];
blessedMightState.players.P2.hand = [{ instanceId: 'counterspell-vs-might', cardId: 'counterspell' }];
blessedMightState.players.P2.manaPoints = 1;
const blessedMightAttack = applyGameCommand(blessedMightState, { type: 'attack', playerId: 'P1', cardInstanceId: 'blessed-might-test', targetId: 'P2' });
assert.equal(blessedMightAttack.ok, true);
if (blessedMightAttack.ok) {
  const blessedMightDefense = applyGameCommand(blessedMightAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'counterspell-vs-might' });
  assert.equal(blessedMightDefense.ok, true);
  if (blessedMightDefense.ok) {
    const mightAckOne = applyGameCommand(blessedMightDefense.state, { type: 'ack-combat', playerId: 'P1' });
    const mightAckTwo = mightAckOne.ok ? applyGameCommand(mightAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : mightAckOne;
    assert.equal(mightAckTwo.ok, true);
    if (mightAckTwo.ok) {
      assert.equal(mightAckTwo.state.players.P1.hp, 14, 'Blessed Might cancels Counterspell retaliation while retaining its Defend Value.');
      assert.equal(mightAckTwo.state.players.P1.deck.some((card) => card.cardId === 'headache'), false, 'Blessed Might cancels Counterspell Headache.');
      assert.equal(mightAckTwo.state.players.P1.hand.some((card) => card.cardId === 'blessing-might'), true, 'Blessed Might creates Blessing: Might after combat.');
    }
  }
}

const blessingMightState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessingMightState.objects = [];
blessingMightState.players.P1.position = { x: 2, y: 2 };
blessingMightState.players.P2.position = { x: 3, y: 2 };
blessingMightState.players.P1.hand = [{ instanceId: 'might-attack', cardId: 'attack-2' }, { instanceId: 'might-blessing', cardId: 'blessing-might', revealedToOpponent: true }];
blessingMightState.players.P2.hand = [];
const blessingMightAttack = applyGameCommand(blessingMightState, { type: 'attack', playerId: 'P1', cardInstanceId: 'might-attack', targetId: 'P2' });
assert.equal(blessingMightAttack.ok, true);
if (blessingMightAttack.ok) {
  const blessingMightOffer = applyGameCommand(blessingMightAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(blessingMightOffer.ok, true);
  if (blessingMightOffer.ok) {
    assert.equal(blessingMightOffer.state.phase, 'choosing-blessing-might');
    const blessingMightApplied = applyGameCommand(blessingMightOffer.state, { type: 'blessing-might-decision', playerId: 'P1', use: true });
    assert.equal(blessingMightApplied.ok, true);
    if (blessingMightApplied.ok) {
      assert.equal(blessingMightApplied.state.combatReveal?.attackTotal, 4, 'Blessing: Might adds +2 to the played Attack Card.');
      assert.equal(blessingMightApplied.state.players.P1.hand.some((card) => card.cardId === 'blessing-might'), false, 'Blessing: Might is Removed after use.');
    }
  }
}

const spiritBlessingMightState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
spiritBlessingMightState.objects = [];
spiritBlessingMightState.players.P1.position = { x: 2, y: 2 };
spiritBlessingMightState.players.P2.position = { x: 3, y: 2 };
spiritBlessingMightState.players.P1.spiritForm = true;
spiritBlessingMightState.players.P1.attackRange = 1;
spiritBlessingMightState.players.P1.hand = [{ instanceId: 'spirit-might-attack', cardId: 'attack-2' }, { instanceId: 'spirit-might-blessing', cardId: 'blessing-might', revealedToOpponent: true }];
spiritBlessingMightState.players.P2.hand = [];
const spiritMightAttack = applyGameCommand(spiritBlessingMightState, { type: 'attack', playerId: 'P1', cardInstanceId: 'spirit-might-attack', targetId: 'P2' });
assert.equal(spiritMightAttack.ok, true);
if (spiritMightAttack.ok) {
  const spiritMightCombat = applyGameCommand(spiritMightAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(spiritMightCombat.ok, true);
  if (spiritMightCombat.ok) assert.notEqual(spiritMightCombat.state.phase, 'choosing-blessing-might', 'Blessing: Might cannot be applied in combat where John attacked in Spirit Form.');
}

const repentState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
repentState.objects = [];
repentState.players.P1.position = { x: 2, y: 2 };
repentState.players.P2.position = { x: 3, y: 2 };
repentState.players.P1.hp = 2;
repentState.players.P1.hand = [{ instanceId: 'repent-test', cardId: 'repent' }];
repentState.players.P2.hand = [];
const repentAttack = applyGameCommand(repentState, { type: 'attack', playerId: 'P1', cardInstanceId: 'repent-test', targetId: 'P2' });
assert.equal(repentAttack.ok, true);
if (repentAttack.ok) {
  assert.equal(repentAttack.state.pendingAttack?.attackValue, 1, 'Repent! has Attack Value 1.');
  const repentCombat = applyGameCommand(repentAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(repentCombat.ok, true);
  if (repentCombat.ok) {
    const repentAckOne = applyGameCommand(repentCombat.state, { type: 'ack-combat', playerId: 'P1' });
    const repentAckTwo = repentAckOne.ok ? applyGameCommand(repentAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : repentAckOne;
    assert.equal(repentAckTwo.ok, true);
    if (repentAckTwo.ok) {
      assert.equal(repentAckTwo.state.players.P1.hp, 1, 'Repent! deals 1 HP Damage to John after combat.');
      assert.equal(repentAckTwo.state.players.P1.spiritForm, true, 'Surviving HP Damage from Repent! makes John enter Spirit Form.');
      assert.equal(repentAckTwo.state.players.P2.hp, 17, 'The adjacent target takes combat Damage and 2 additional Repent! Damage.');
      assert.equal(repentAckTwo.state.spellProjectiles.some((event) => event.style === 'holy-fire' && event.targetId === 'P2'), true, 'Repent! emits Holy Fire under each affected adjacent enemy.');
    }
  }
}

const blessingCombatState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessingCombatState.objects = [];
blessingCombatState.players.P1.position = { x: 2, y: 2 };
blessingCombatState.players.P2.position = { x: 3, y: 2 };
blessingCombatState.players.P1.hand = [{ instanceId: 'john-attack', cardId: 'attack-2' }, { instanceId: 'light-blessing', cardId: 'blessing-light' }];
blessingCombatState.players.P2.hand = [{ instanceId: 'target-defense', cardId: 'defend-1' }];
const blessingAttack = applyGameCommand(blessingCombatState, { type: 'attack', playerId: 'P1', cardInstanceId: 'john-attack', targetId: 'P2' });
assert.equal(blessingAttack.ok, true);
if (blessingAttack.ok) {
  const blessingDefense = applyGameCommand(blessingAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'target-defense' });
  assert.equal(blessingDefense.ok, true);
  if (blessingDefense.ok) {
    assert.equal(blessingDefense.state.phase, 'choosing-blessing-light');
    const blessingApplied = applyGameCommand(blessingDefense.state, { type: 'blessing-light-decision', playerId: 'P1', use: true });
    assert.equal(blessingApplied.ok, true);
    if (blessingApplied.ok) {
      assert.equal(blessingApplied.state.players.P1.hand.some((card) => card.cardId === 'blessing-light'), false, 'Blessing: Light is Removed after use.');
      assert.equal(blessingApplied.state.combatReveal?.defendTotal, 0, 'Blessing: Light reduces the enemy Defend Card by 1.');
    }
  }
}

const blessingDiscardState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessingDiscardState.phase = 'choosing-end-discard';
blessingDiscardState.players.P1.spiritForm = true;
blessingDiscardState.players.P1.hand.push({ instanceId: 'discarded-light-blessing', cardId: 'blessing-light' });
const blessingDiscarded = applyGameCommand(blessingDiscardState, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'discarded-light-blessing' });
assert.equal(blessingDiscarded.ok, true);
if (blessingDiscarded.ok) {
  assert.equal(blessingDiscarded.state.players.P1.hand.some((card) => card.instanceId === 'discarded-light-blessing'), false);
  assert.equal(blessingDiscarded.state.players.P1.discard.some((card) => card.instanceId === 'discarded-light-blessing'), false, 'Discarding Blessing: Light Removes it instead of placing it in Discard.');
}

const blessingFaithCombatState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessingFaithCombatState.objects = [];
blessingFaithCombatState.players.P1.position = { x: 2, y: 2 };
blessingFaithCombatState.players.P2.position = { x: 3, y: 2 };
blessingFaithCombatState.players.P1.hand = [
  { instanceId: 'faith-attack', cardId: 'attack-3' },
  { instanceId: 'combat-faith', cardId: 'blessing-faith', revealedToOpponent: true },
];
blessingFaithCombatState.players.P2.hand = [{ instanceId: 'faith-thorns', cardId: 'thorns' }];
const faithAttack = applyGameCommand(blessingFaithCombatState, { type: 'attack', playerId: 'P1', cardInstanceId: 'faith-attack', targetId: 'P2' });
assert.equal(faithAttack.ok, true);
if (faithAttack.ok) {
  const faithDefense = applyGameCommand(faithAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'faith-thorns' });
  assert.equal(faithDefense.ok, true);
  if (faithDefense.ok) {
    assert.equal(faithDefense.state.phase, 'choosing-blessing-faith', 'A held Blessing: Faith is offered during combat.');
    const faithApplied = applyGameCommand(faithDefense.state, { type: 'blessing-faith-decision', playerId: 'P1', use: true });
    assert.equal(faithApplied.ok, true);
    if (faithApplied.ok) {
      assert.equal(faithApplied.state.players.P1.hp, 14, 'Blessing: Faith negates Thorns effect Damage to the attacker.');
      assert.equal(faithApplied.state.players.P2.hp, 20, 'Blessing: Faith negates combat Damage to the defender.');
      assert.equal(faithApplied.state.players.P1.hand.some((card) => card.cardId === 'blessing-faith'), false, 'Blessing: Faith is Removed after use.');
    }
  }
}

const blessingFaithExpiryState = createHotseatTestState(true, 'magician', 2, 'john-christ');
blessingFaithExpiryState.players.P1.hand = [];
blessingFaithExpiryState.players.P2.hand = [{ instanceId: 'expiring-faith', cardId: 'blessing-faith', revealedToOpponent: true }];
const blessingFaithExpired = applyGameCommand(blessingFaithExpiryState, { type: 'end-turn', playerId: 'P1' });
assert.equal(blessingFaithExpired.ok, true);
if (blessingFaithExpired.ok) assert.equal(blessingFaithExpired.state.players.P2.hand.some((card) => card.cardId === 'blessing-faith'), false, 'Unused Blessing: Faith is Removed at the beginning of its holder’s turn.');

const blessingShieldStatusState = createHotseatTestState(true, 'dummy', 2, 'john-christ');
blessingShieldStatusState.objects = [];
blessingShieldStatusState.players.P1.position = { x: 2, y: 2 };
blessingShieldStatusState.players.P2.position = { x: 3, y: 2 };
blessingShieldStatusState.players.P1.hand = [{ instanceId: 'shield-enforce', cardId: 'enforce' }];
blessingShieldStatusState.players.P2.hand = [
  { instanceId: 'shield-defense', cardId: 'defend-1' },
  { instanceId: 'status-shield', cardId: 'blessing-shield', revealedToOpponent: true },
];
const shieldStatusAttack = applyGameCommand(blessingShieldStatusState, { type: 'attack', playerId: 'P1', cardInstanceId: 'shield-enforce', targetId: 'P2' });
assert.equal(shieldStatusAttack.ok, true);
if (shieldStatusAttack.ok) {
  const shieldStatusDefense = applyGameCommand(shieldStatusAttack.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'shield-defense' });
  assert.equal(shieldStatusDefense.ok, true);
  if (shieldStatusDefense.ok) {
    const shieldStatusApplied = applyGameCommand(shieldStatusDefense.state, { type: 'blessing-shield-decision', playerId: 'P2', use: true });
    assert.equal(shieldStatusApplied.ok, true);
    if (shieldStatusApplied.ok) {
      const shieldAckOne = applyGameCommand(shieldStatusApplied.state, { type: 'ack-combat', playerId: 'P1' });
      const shieldAckTwo = shieldAckOne.ok ? applyGameCommand(shieldAckOne.state, { type: 'ack-combat', playerId: 'P2' }) : shieldAckOne;
      assert.equal(shieldAckTwo.ok, true);
      if (shieldAckTwo.ok) {
        assert.equal(shieldAckTwo.state.players.P2.hand.some((card) => card.cardId === 'panic'), false, 'Blessing: Shield automatically blocks the first negative Status applied during combat.');
        assert.equal(shieldAckTwo.state.players.P2.hand.some((card) => card.cardId === 'headache'), true, 'Blessing: Shield blocks exactly one Status, so Enforce still applies its second Status.');
        assert.equal(shieldAckTwo.state.players.P2.hand.some((card) => card.cardId === 'blessing-shield'), false, 'A used Blessing: Shield is Removed from the holder\'s Deck.');
      }
    }
  }
}

const blessingIds = ['blessing-light', 'blessing-prayer', 'blessing-might', 'blessing-shield', 'blessing-swiftness', 'blessing-faith'] as const;
for (const [index, blessingId] of blessingIds.entries()) {
  assert.doesNotMatch(cardDefinition({ instanceId: `blessing-text-${index}`, cardId: blessingId }).effectText ?? '', /remove(?:d)?\s+(?:after|on|when)/i, `${blessingId} relies on the default Blessing removal rule instead of repeating it.`);
  const overstack = createHotseatTestState(true, 'john-christ', 2, 'dummy');
  overstack.phase = 'choosing-end-discard';
  overstack.players.P1.spiritForm = true;
  overstack.players.P1.hand = [
    { instanceId: `overstack-blessing-${index}`, cardId: blessingId, revealedToOpponent: true },
    ...Array.from({ length: 5 }, (_, cardIndex) => ({ instanceId: `overstack-filler-${index}-${cardIndex}`, cardId: 'attack-2' as const })),
  ];
  const discarded = applyGameCommand(overstack, { type: 'discard-card', playerId: 'P1', cardInstanceId: `overstack-blessing-${index}` });
  assert.equal(discarded.ok, true, `${blessingId} can be discarded for Overstacking while John is in Spirit Form.`);
  if (discarded.ok) {
    assert.equal(discarded.state.players.P1.hand.some((card) => card.cardId === blessingId), false);
    assert.equal(discarded.state.players.P1.discard.some((card) => card.cardId === blessingId), false, `${blessingId} is Removed instead of entering Discard.`);
  }
}

const forcedBlessingDiscardState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
forcedBlessingDiscardState.players.P1.hand = [{ instanceId: 'forced-faith', cardId: 'blessing-faith', revealedToOpponent: true }];
forcedBlessingDiscardState.phase = 'choosing-force-disarm-discard';
forcedBlessingDiscardState.forceDisarm = { targetId: 'P1', mindBlastLevel: 1, mindBlastCasterId: 'P2' } as any;
const forcedBlessingDiscard = applyGameCommand(forcedBlessingDiscardState, { type: 'force-disarm-discard', playerId: 'P1', cardInstanceId: 'forced-faith' });
assert.equal(forcedBlessingDiscard.ok, true, 'A forced any-Card discard may choose a Blessing Status Card.');
if (forcedBlessingDiscard.ok) assert.equal(forcedBlessingDiscard.state.players.P1.discard.some((card) => card.cardId === 'blessing-faith'), false, 'A forcibly discarded Blessing is Removed.');

const blessingDashState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessingDashState.players.P1.freeMoveUsed = true;
blessingDashState.players.P1.spiritForm = true;
blessingDashState.players.P1.hand = [{ instanceId: 'dash-blessing', cardId: 'blessing-light', revealedToOpponent: true }];
const blessingDashStarted = applyGameCommand(blessingDashState, { type: 'dash', playerId: 'P1' });
assert.equal(blessingDashStarted.ok, false, 'Dash cannot be selected when only a Blessing is available as payment, including in Spirit Form.');

const mixedBlessingDashState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
mixedBlessingDashState.players.P1.freeMoveUsed = true;
mixedBlessingDashState.players.P1.hand = [{ instanceId: 'mixed-dash-blessing', cardId: 'blessing-light', revealedToOpponent: true }, { instanceId: 'mixed-dash-cost', cardId: 'cleanse' }];
const mixedBlessingDash = applyGameCommand(mixedBlessingDashState, { type: 'dash', playerId: 'P1' });
assert.equal(mixedBlessingDash.ok, true);
if (mixedBlessingDash.ok) {
  assert.equal(applyGameCommand(mixedBlessingDash.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'mixed-dash-blessing' }).ok, false, 'A Blessing cannot pay for Dash when another eligible Card exists.');
  assert.equal(applyGameCommand(mixedBlessingDash.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'mixed-dash-cost' }).ok, true, 'A non-Blessing Card can still pay for Dash.');
}

const spiritBlessedGuardState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
spiritBlessedGuardState.players.P1.freeMoveUsed = true;
spiritBlessedGuardState.players.P1.spiritForm = true;
spiritBlessedGuardState.players.P1.hand = [{ instanceId: 'guard-blessed-card', cardId: 'blessed-light' }];
spiritBlessedGuardState.players.P1.deck = [{ instanceId: 'guard-draw', cardId: 'attack-2' }];
const spiritBlessedGuard = applyGameCommand(spiritBlessedGuardState, { type: 'guard', playerId: 'P1' });
assert.equal(spiritBlessedGuard.ok, true);
if (spiritBlessedGuard.ok) {
  const spiritBlessedDiscarded = applyGameCommand(spiritBlessedGuard.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'guard-blessed-card' });
  assert.equal(spiritBlessedDiscarded.ok, true, 'John can discard a Card containing Bless for Guard while in Spirit Form.');
  if (spiritBlessedDiscarded.ok) assert.equal(spiritBlessedDiscarded.state.players.P1.discard.some((card) => card.instanceId === 'guard-blessed-card'), true, 'A normal Blessed Card enters Discard when used for Guard.');
}

const blessedPrayerState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blessedPrayerState.players.P1.hand = [{ instanceId: 'blessed-prayer-test', cardId: 'blessed-prayer' }];
blessedPrayerState.players.P1.deck = [{ instanceId: 'prayer-draw', cardId: 'attack-2' }];
blessedPrayerState.players.P1.movementRemaining = 1;
blessedPrayerState.players.P1.johnCumulativeMovementRemaining = 1;
const blessedPrayerPlayed = applyGameCommand(blessedPrayerState, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'blessed-prayer-test', destination: 'direct' });
assert.equal(blessedPrayerPlayed.ok, true);
if (blessedPrayerPlayed.ok) {
  const prayer = blessedPrayerPlayed.state.players.P1.hand.find((card) => card.cardId === 'blessing-prayer');
  assert.ok(prayer, 'Blessed Prayer Level 1 creates Blessing: Prayer.');
  assert.equal(prayer?.revealedToOpponent, true, 'Blessing: Prayer is revealed to enemies.');
  assert.equal(blessedPrayerPlayed.state.players.P1.stoicShell, true, 'Creating Blessing: Prayer grants Stoic Shell.');
  const prayerUsed = applyGameCommand(blessedPrayerPlayed.state, { type: 'play-free-action', playerId: 'P1', cardInstanceId: prayer!.instanceId });
  assert.equal(prayerUsed.ok, true);
  if (prayerUsed.ok) {
    assert.equal(prayerUsed.state.players.P1.movementRemaining, 0, 'Blessing: Prayer costs 1 MOV.');
    assert.equal(prayerUsed.state.players.P1.johnCumulativeMovementRemaining, 0, 'Blessing: Prayer also spends 1 from John\'s cumulative MOV so form changes cannot restore it.');
    assert.equal(prayerUsed.state.players.P1.hand.some((card) => card.cardId === 'blessing-prayer'), false, 'Blessing: Prayer is Removed after use.');
    assert.equal(prayerUsed.state.players.P1.hand.some((card) => card.instanceId === 'prayer-draw'), true, 'Blessing: Prayer draws 1 Card.');
  }
}

const blessedPrayerThreeState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
const blessedPrayerThreeCard = blessedPrayerThreeState.players.P1.deck.find((card) => card.cardId === 'blessed-prayer')!;
blessedPrayerThreeState.players.P1.deck = blessedPrayerThreeState.players.P1.deck.filter((card) => card.instanceId !== blessedPrayerThreeCard.instanceId);
blessedPrayerThreeState.players.P1.hand = [];
blessedPrayerThreeState.players.P1.spellEcho = [null, null, blessedPrayerThreeCard];
blessedPrayerThreeState.players.P1.discard = [{ instanceId: 'chosen-prayer-discard', cardId: 'cleanse' }];
const blessedPrayerThreePlayed = applyGameCommand(blessedPrayerThreeState, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(blessedPrayerThreePlayed.ok, true);
if (blessedPrayerThreePlayed.ok) {
  assert.equal(blessedPrayerThreePlayed.state.players.P1.movementRemaining, 1, 'Blessed Prayer Level 2 grants 1 MOV.');
  assert.equal(blessedPrayerThreePlayed.state.phase, 'choosing-blessed-prayer-discard');
  const prayerDiscardDrawn = applyGameCommand(blessedPrayerThreePlayed.state, { type: 'blessed-prayer-discard', playerId: 'P1', cardInstanceId: 'chosen-prayer-discard' });
  assert.equal(prayerDiscardDrawn.ok, true);
  if (prayerDiscardDrawn.ok) assert.equal(prayerDiscardDrawn.state.players.P1.hand.some((card) => card.instanceId === 'chosen-prayer-discard'), true, 'Blessed Prayer Level 3 draws the chosen Card from Discard.');
}

const prayerExpiryState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
prayerExpiryState.players.P1.hand = [{ instanceId: 'expiring-prayer', cardId: 'blessing-prayer', revealedToOpponent: true }];
const prayerExpired = applyGameCommand(prayerExpiryState, { type: 'end-turn', playerId: 'P1' });
assert.equal(prayerExpired.ok, true);
if (prayerExpired.ok) assert.equal(prayerExpired.state.players.P1.hand.some((card) => card.cardId === 'blessing-prayer'), false, 'Unused Blessing: Prayer is Removed at end of turn.');

const stoicHealState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
stoicHealState.activePlayerId = 'P2';
stoicHealState.players.P1.hp = 10;
stoicHealState.players.P1.stoicShell = true;
stoicHealState.players.P1.stoicShellStacks = 1;
const stoicHealTurn = applyGameCommand(stoicHealState, { type: 'end-turn', playerId: 'P2' });
assert.equal(stoicHealTurn.ok, true);
if (stoicHealTurn.ok) {
  assert.equal(stoicHealTurn.state.activePlayerId, 'P1');
  assert.equal(stoicHealTurn.state.players.P1.hp, 12);
  assert.equal(stoicHealTurn.state.players.P1.stoicShellStacks, 2, 'An intact Stoic Shell gains one Stack at the beginning of John\'s turn.');
  assert.equal(stoicHealTurn.state.players.P1.stoicShellHealAmount, 2, 'Stoic Shell restores 1 HP per accumulated Stack.');
  assert.equal(stoicHealTurn.state.players.P1.stoicShell, true, 'Stoic Shell remains after restoring HP and can only be removed by HP Damage.');
  assert.equal(stoicHealTurn.state.players.P1.stoicShellHealedTurn, stoicHealTurn.state.turn, 'Stoic Shell healing emits a turn-scoped visual/message event.');
}

const fullHealthStoicState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
fullHealthStoicState.activePlayerId = 'P2';
fullHealthStoicState.players.P1.hp = fullHealthStoicState.players.P1.maxHp;
fullHealthStoicState.players.P1.stoicShell = true;
fullHealthStoicState.players.P1.stoicShellStacks = 3;
const fullHealthStoicTurn = applyGameCommand(fullHealthStoicState, { type: 'end-turn', playerId: 'P2' });
assert.equal(fullHealthStoicTurn.ok, true);
if (fullHealthStoicTurn.ok) {
  assert.equal(fullHealthStoicTurn.state.players.P1.stoicShellStacks, 3, 'Stoic Shell does not gain another Stack while John is already at maximum HP.');
  assert.equal(fullHealthStoicTurn.state.players.P1.stoicShell, true, 'Stoic Shell and its existing Stacks remain intact at maximum HP.');
  assert.equal(fullHealthStoicTurn.state.players.P1.stoicShellHealAmount, 0);
  assert.equal(fullHealthStoicTurn.state.players.P1.stoicShellHealedTurn, null, 'No healing animation or message is emitted at maximum HP.');
}

assert.equal(THE_TRENCH_ARENA.name, 'The Trench');
assert.deepEqual(THE_TRENCH_ARENA.pillars, ['A3', 'A6', 'H3', 'H6']);
assert.deepEqual(THE_TRENCH_ARENA.bases.P1, ['D1', 'E1']);
assert.deepEqual(THE_TRENCH_ARENA.bases.P2, ['D8', 'E8']);
assert.deepEqual(THE_TRENCH_ARENA.slideSquares, ['C2', 'F2', 'C4', 'F4', 'C5', 'F5', 'C7', 'F7']);
assert.deepEqual(THE_TRENCH_ARENA.trenchSquares, ['C4', 'D4', 'E4', 'F4', 'C5', 'D5', 'E5', 'F5']);
assert.deepEqual(THE_TRENCH_ARENA.adjacentHighgroundOnlyTargets, ['B3', 'G3', 'B6', 'G6']);
for (const label of ['B3', 'G3', 'B6', 'G6']) assert.equal(THE_TRENCH_ARENA.highgroundProtected.includes(label), true, `${label} is Highground Protected.`);
assert.equal(arenaForPlayerCount(2).id, 'nagrand', 'Nagrand remains the default 1v1 arena for online and legacy setup flows.');
assert.deepEqual(randomTrenchBoxSpawns(() => 0), ['C3', 'C6', 'B3', 'G6'], 'The minimum random rolls use C3, C6, B3, and the opposite G6 Square.');
assert.deepEqual(randomTrenchBoxSpawns(() => .999999), ['F3', 'F6', 'G3', 'B6'], 'The maximum random rolls use F3, F6, G3, and the opposite B6 Square.');
const trenchInitialBoxes = createTrenchTestState(true, 'magician', 'dummy').objects.filter((object) => object.kind === 'wooden-box');
assert.equal(trenchInitialBoxes.length, 4, 'The Trench starts with exactly four Boxes.');
const trenchInitialBoxLabels = trenchInitialBoxes.map((object) => cellLabel(object.position));
assert.equal(trenchInitialBoxLabels.filter((label) => ['C3', 'D3', 'E3', 'F3'].includes(label)).length, 1, 'The Trench spawns one Box in Group 1.');
assert.equal(trenchInitialBoxLabels.filter((label) => ['C6', 'D6', 'E6', 'F6'].includes(label)).length, 1, 'The Trench spawns one Box in Group 2.');
assert.equal(trenchInitialBoxLabels.filter((label) => ['B3', 'G3'].includes(label)).length, 1, 'The Trench spawns one Box in Group 3.');
assert.equal(trenchInitialBoxLabels.includes('B3') ? trenchInitialBoxLabels.includes('G6') : trenchInitialBoxLabels.includes('B6'), true, 'Group 4 spawns opposite the Group 3 Box.');

const trenchSlopeState = createTrenchTestState(true, 'magician', 'dummy');
trenchSlopeState.objects = [];
trenchSlopeState.players.P1.position = { x: 2, y: 3 }; // B4, ordinary Low Ground
trenchSlopeState.players.P1.movementRemaining = 1;
const ordinarySlideEntry = applyGameCommand(trenchSlopeState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } }); // C4 Slide
assert.equal(ordinarySlideEntry.ok, true);
if (ordinarySlideEntry.ok) assert.deepEqual(ordinarySlideEntry.state.players.P1.position, { x: 3, y: 3 }, 'Entering a Slide Square from non-High Ground causes no automatic movement.');
assert.equal(isForbiddenSlideAscent(trenchSlopeState, { x: 3, y: 1 }, { x: 3, y: 2 }), true, 'C2 Slide cannot move or be pushed upward onto C3 High Ground.');
assert.equal(isForbiddenSlideAscent(trenchSlopeState, { x: 3, y: 3 }, { x: 3, y: 2 }), true, 'C4 Slide cannot move or be pushed upward onto C3 High Ground.');
assert.equal(isForbiddenSlideAscent(trenchSlopeState, { x: 4, y: 3 }, { x: 4, y: 2 }), true, 'D4 Trench cannot move or be pushed directly onto D3 High Ground.');
assert.equal(isForbiddenSlideAscent(trenchSlopeState, { x: 4, y: 4 }, { x: 3, y: 4 }), false, 'A Trench Square may move to another non-High-Ground Square.');
assert.equal(canAttackTargetSquare(trenchSlopeState, { x: 3, y: 2 }, { x: 2, y: 2 }), true, 'B3 can be attacked from adjacent C3 High Ground.');
assert.equal(canAttackTargetSquare(trenchSlopeState, { x: 4, y: 2 }, { x: 2, y: 2 }), false, 'B3 cannot be attacked from a non-adjacent High Ground Square.');
assert.equal(canAttackTargetSquare(trenchSlopeState, { x: 2, y: 3 }, { x: 2, y: 2 }), true, 'B3 can be attacked normally from Low Ground; Highground Protection only restricts attacks originating on High Ground.');
assert.equal(canAttackTargetSquare(trenchSlopeState, { x: 2, y: 1 }, { x: 3, y: 1 }), true, 'Ordinary Highground Protection Squares keep standard targeting from Low Ground.');

const trenchPushState = createTrenchTestState(true, 'shinobi', 'dummy');
trenchPushState.objects = [];
trenchPushState.players.P1.position = { x: 3, y: 4 }; // C5, behind the pushed target
trenchPushState.players.P2.position = { x: 3, y: 3 }; // C4 Trench
trenchPushState.phase = 'choosing-force-throw-target';
trenchPushState.forceThrow = { casterId: 'P1', level: 3, distance: 3, targetRange: 2, targetKind: null, targetId: null, undo: null };
const trenchPushTarget = applyGameCommand(trenchPushState, { type: 'force-throw-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
assert.equal(trenchPushTarget.ok, true);
if (trenchPushTarget.ok) {
  const trenchPushResolved = applyGameCommand(trenchPushTarget.state, { type: 'force-throw-direction', playerId: 'P1', to: { x: 3, y: 2 } });
  assert.equal(trenchPushResolved.ok, true);
  if (trenchPushResolved.ok) assert.deepEqual(trenchPushResolved.state.players.P2.position, { x: 3, y: 3 }, 'A push cannot move a character directly from C4 Trench onto C3 High Ground.');
}

const occupiedSlideEntryState = createTrenchTestState(true, 'john-christ', 'dummy');
occupiedSlideEntryState.objects = [];
occupiedSlideEntryState.players.P1.position = { x: 4, y: 2 }; // D3 High Ground
occupiedSlideEntryState.players.P1.spiritForm = true;
occupiedSlideEntryState.players.P1.movementRemaining = 3;
occupiedSlideEntryState.players.P2.position = { x: 3, y: 3 }; // C4 Slide
const occupiedSlideEntry = applyGameCommand(occupiedSlideEntryState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } });
assert.equal(occupiedSlideEntry.ok, false, 'Even pass-through movement cannot enter an enemy-occupied Slide Square from High Ground.');

const trenchSlideState = createTrenchTestState(true, 'magician', 'dummy');
trenchSlideState.objects = [];
trenchSlideState.players.P1.position = { x: 4, y: 2 }; // D3
trenchSlideState.players.P1.movementRemaining = 1;
const trenchSlide = applyGameCommand(trenchSlideState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } }); // C4
assert.equal(trenchSlide.ok, true);
if (trenchSlide.ok) {
  assert.deepEqual(trenchSlide.state.players.P1.position, { x: 2, y: 4 }, 'D3 -> C4 automatically Slides to B5.');
  assert.equal(trenchSlide.state.players.P1.movementRemaining, 0, 'The automatic Slide spends no additional MOV and works after MOV reaches zero.');
  assert.deepEqual(trenchSlide.state.players.P1.visualMovement?.path.at(-1), { x: 2, y: 4 }, 'Slide movement is included in the movement animation path.');
}

const trenchObjectState = createTrenchTestState(true, 'magician', 'dummy');
trenchObjectState.objects = [{ id: 'slide-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 4 } }]; // C5
trenchObjectState.players.P1.position = { x: 3, y: 2 }; // C3
trenchObjectState.players.P1.movementRemaining = 1;
const trenchObjectSlide = applyGameCommand(trenchObjectState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } }); // C4
assert.equal(trenchObjectSlide.ok, true);
if (trenchObjectSlide.ok) {
  assert.deepEqual(trenchObjectSlide.state.players.P1.position, { x: 3, y: 4 });
  assert.deepEqual(trenchObjectSlide.state.objects.find((object) => object.id === 'slide-box')?.position, { x: 3, y: 5 }, 'A Slide pushes an Object one Square when the next Square is free.');
}

const trenchBlockedObjectState = createTrenchTestState(true, 'magician', 'dummy');
trenchBlockedObjectState.objects = [
  { id: 'slide-box-blocked', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 4 } },
  { id: 'slide-column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 3, y: 5 } },
];
trenchBlockedObjectState.players.P1.position = { x: 3, y: 2 };
trenchBlockedObjectState.players.P1.movementRemaining = 1;
const trenchBlockedObjectSlide = applyGameCommand(trenchBlockedObjectState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } });
assert.equal(trenchBlockedObjectSlide.ok, true);
if (trenchBlockedObjectSlide.ok) {
  assert.equal(trenchBlockedObjectSlide.state.objects.some((object) => object.id === 'slide-box-blocked'), false, 'A Slide destroys an Object that cannot be pushed.');
  assert.equal(trenchBlockedObjectSlide.state.objectPushAnimations.some((event) => event.objectId === 'slide-box-blocked' && event.destroy), true, 'Destroyed Objects emit the general destruction animation event.');
}

const trenchEnemyState = createTrenchTestState(true, 'magician', 'dummy');
trenchEnemyState.objects = [];
trenchEnemyState.players.P1.position = { x: 3, y: 2 };
trenchEnemyState.players.P1.movementRemaining = 1;
trenchEnemyState.players.P2.position = { x: 3, y: 4 };
const enemyHpBeforeSlide = trenchEnemyState.players.P2.hp;
const trenchEnemySlide = applyGameCommand(trenchEnemyState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } });
assert.equal(trenchEnemySlide.ok, true);
if (trenchEnemySlide.ok) {
  assert.equal(trenchEnemySlide.state.players.P2.hp, enemyHpBeforeSlide - 1, 'A Slide always deals 1 Damage to an enemy in the automatic destination.');
  assert.deepEqual(trenchEnemySlide.state.players.P2.position, { x: 3, y: 4 }, 'An enemy on C5 cannot be pushed upward onto C6 High Ground.');
  assert.deepEqual(trenchEnemySlide.state.players.P1.position, { x: 3, y: 3 }, 'The sliding character remains on C4 when the enemy cannot be displaced from C5.');
}

const trenchBlockedEnemyState = createTrenchTestState(true, 'magician', 'dummy');
trenchBlockedEnemyState.objects = [{ id: 'enemy-blocker', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 3, y: 5 } }];
trenchBlockedEnemyState.players.P1.position = { x: 3, y: 2 };
trenchBlockedEnemyState.players.P1.movementRemaining = 1;
trenchBlockedEnemyState.players.P2.position = { x: 3, y: 4 };
const blockedEnemyHp = trenchBlockedEnemyState.players.P2.hp;
const trenchBlockedEnemySlide = applyGameCommand(trenchBlockedEnemyState, { type: 'move', playerId: 'P1', to: { x: 3, y: 3 } });
assert.equal(trenchBlockedEnemySlide.ok, true);
if (trenchBlockedEnemySlide.ok) {
  assert.equal(trenchBlockedEnemySlide.state.players.P2.hp, blockedEnemyHp - 1, 'An unpushable enemy still receives 1 Slide Damage.');
  assert.deepEqual(trenchBlockedEnemySlide.state.players.P2.position, { x: 3, y: 4 }, 'An unpushable enemy remains in place.');
  assert.deepEqual(trenchBlockedEnemySlide.state.players.P1.position, { x: 3, y: 3 }, 'The sliding character remains on the Slide Square if the enemy cannot be displaced.');
}

console.log('Rules checks passed.');
