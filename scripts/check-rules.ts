import assert from 'node:assert/strict';
import fc from 'fast-check';
import { arenaForPlayerCount, LORDAERON_ARENA } from '../shared/arenas.ts';
import { ACTION_QUEST_POOL, applyCommand, applyPinned, cellLabel, createHotseatTestState, createInitialState as createGameInitialState, createLordaeronMultiplayerState, createMultiplayerState, distance, drawCards, effectiveMoveRange, hasLineOfSight, kykDirectionAllowed, markCharacterMoved, revealCardToOpponent, type CardTypeId, type LordaeronGameState } from '../shared/game.ts';

const createInitialState = () => createGameInitialState('shinobi-vs-orkk');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'rabbit-run')?.durationRounds, 5);
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'rabbit-run')?.reward, 'Portal Card');
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'provocateur')?.durationRounds, 5);
assert.equal(ACTION_QUEST_POOL.find((quest) => quest.id === 'provocateur')?.reward, 'Vicious Mockery Card');

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
    assert.equal(useMockery.state.players.P2.hp, 24, 'Vicious Mockery adds +2 ATT before combat damage is resolved.');
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
    assert.equal(usePortal.state.players.P1.discard.some((card) => card.cardId === 'portal'), true, 'Portal behaves as a normal Perk and enters Discard after use.');
  }
}

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
    assert.equal(hit.state.players.P2.hp, 23, 'Fireball deals 3 Damage.');
    assert.equal([...hit.state.players.P1.hand, ...hit.state.players.P1.deck, ...hit.state.players.P1.discard].some((card) => card.cardId === 'fireball'), false, 'Fireball is Removed rather than discarded after use.');
  }
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

const rabbitProgress = createInitialState() as any;
rabbitProgress.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['rabbit-run'], currentQuest: { id: 'rabbit-run', announcedRound: 1, endsAfterRound: 10, winners: [], progress: {} }, lastQuestWinners: [], progression: {}, phaseReward: null };
rabbitProgress.players.P1.movementRemaining = 2;
const rabbitMove = applyCommand(rabbitProgress, { type: 'move', playerId: 'P1', to: { x: 2, y: 3 } });
assert.equal(rabbitMove.ok, true);
if (rabbitMove.ok) {
  rabbitMove.state.phase = 'choosing-preparation-teleport';
  rabbitMove.state.preparation = { casterId: 'P1', consume: true, undo: null };
  const rabbitTeleport = applyCommand(rabbitMove.state, { type: 'preparation-teleport', playerId: 'P1', to: { x: 3, y: 3 } });
  assert.equal(rabbitTeleport.ok, true);
  if (rabbitTeleport.ok) assert.equal((rabbitTeleport.state as any).questPhases.currentQuest.progress.P1, 2, 'Rabbit Run counts normal movement by distance and any teleport as exactly 1.');
}

const phaseBoundary = createHotseatTestState(true, 'shinobi') as any;
phaseBoundary.turn = 10;
phaseBoundary.activePlayerId = 'P3';
phaseBoundary.roundFirstPlayerId = 'P1';
phaseBoundary.players.P3.hand = [];
const phaseBoundaryResult = applyCommand(phaseBoundary, { type: 'end-turn', playerId: 'P3' });
assert.equal(phaseBoundaryResult.ok, true);
if (phaseBoundaryResult.ok) {
  assert.equal(phaseBoundaryResult.state.turn, 11, 'A new Round starts when play returns to the designated first Player.');
  assert.equal(phaseBoundaryResult.state.phase, 'choosing-phase-card', 'The Phase One reward begins after Round 10.');
  assert.equal((phaseBoundaryResult.state as any).questPhases.phaseReward.pendingPlayerIds.length, 1, 'Test Dummies do not receive player-only Phase choices.');
  const phaseCard = applyCommand(phaseBoundaryResult.state, { type: 'phase-card-choice', playerId: 'P1', cardId: 'not-a-shinobi' });
  assert.equal(phaseCard.ok, true, 'An Attack-focused Shinobi may select an available Defend Card at Phase One.');
  if (phaseCard.ok) {
    assert.equal(phaseCard.state.phase, 'active');
    assert.equal(phaseCard.state.players.P1.deck.some((card) => card.cardId === 'not-a-shinobi'), true, 'A non-winner Phase Card is shuffled into the Deck.');
    const phaseTwoState = phaseCard.state as any;
    phaseTwoState.turn = 20;
    phaseTwoState.activePlayerId = 'P3';
    phaseTwoState.players.P3.hand = [];
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
assert.deepEqual(lordMultiplayer.objects.filter((object) => object.kind === 'wooden-box').map((object) => cellLabel(object.position)).sort(), ['B3', 'D10', 'F5'], 'Three-player multiplayer loads every Lordaeron box.');
let lordReady = lordMultiplayer as any;
for (const [playerId, cardId] of [['P1', 'mana-barrage'], ['P2', 'chip-cast'], ['P3', 'cut-them-legs']] as const) {
  const focusResult = applyCommand(lordReady, { type: 'choose-focus', playerId, focus: 'attack' });
  assert.equal(focusResult.ok, true);
  const cardResult = focusResult.ok ? applyCommand(focusResult.state, { type: 'choose-focus-card', playerId, cardId }) : focusResult;
  assert.equal(cardResult.ok, true);
  if (cardResult.ok) lordReady = cardResult.state;
}
assert.equal(lordReady.phase, 'choosing-base-placement');
assert.equal(lordReady.players.P1.hand.length, 3);
assert.equal(lordReady.players.P1.deck.length, 7);
assert.equal(lordReady.players.P1.hand.some((card: any) => card.cardId === 'preparation'), true);
assert.equal(lordReady.players.P1.deck.at(-1)?.cardId, 'mana-barrage');
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
        assert.equal(player.hand.length, 3, 'Every multiplayer player begins with two shuffled default Cards and their Reserve Card.');
        assert.equal(player.deck.length, 7, 'Every multiplayer player begins with a ten-Card starting Deck split between Hand and Deck.');
      }
    }
  }
}
const multiplayerLogan = createMultiplayerState({ P1: 'magician', P2: 'magician' });
assert.equal(multiplayerLogan.players.P1.name, 'Long Hat Logan');
assert.equal(multiplayerLogan.players.P2.name, 'Long Hat Logan');
assert.equal(multiplayerLogan.phase, 'choosing-focus');
assert.equal(multiplayerLogan.players.P1.hand.length, 0);
const loganTestState = createHotseatTestState();
assert.equal(loganTestState.boardSize, 11);
assert.equal(loganTestState.objects.length, 5);
assert.deepEqual(loganTestState.objects.map((object) => cellLabel(object.position)).sort(), ['B2', 'B3', 'D10', 'F5', 'G10']);
assert.equal(loganTestState.players.P1.character, 'magician');
assert.equal(loganTestState.players.P1.name, 'Long Hat Logan');
assert.equal(loganTestState.players.P1.maxHp, 18);
assert.equal(loganTestState.players.P1.moveRange, 2);
assert.equal(loganTestState.players.P1.attackRange, 3);
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
chainTest.players.P2.position = { x: 4, y: 3 };
chainTest.objects.push({ id: 'chain-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 3 } });
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
  const targetMagic = applyCommand(startMagic.state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'magic-box' });
  assert.equal(targetMagic.ok, true);
  if (targetMagic.ok) {
    const resolveMagic = applyCommand(targetMagic.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 3, y: 0 } });
    assert.equal(resolveMagic.ok, true);
    if (resolveMagic.ok) assert.deepEqual(resolveMagic.state.objects.find((object) => object.id === 'magic-box')?.position, { x: 8, y: 0 });
  }
}
const shizzleTest = createHotseatTestState(true);
shizzleTest.players.P1.position = { x: 1, y: 0 };
shizzleTest.players.P2.position = { x: 3, y: 0 };
const shizzleCard = shizzleTest.players.P1.hand.find((card) => card.cardId === 'shizzle')!;
const startShizzle = applyCommand(shizzleTest, { type: 'play-perk', playerId: 'P1', cardInstanceId: shizzleCard.instanceId, destination: 'direct' });
assert.equal(startShizzle.ok, true);
if (startShizzle.ok) {
  const resolveShizzle = applyCommand(startShizzle.state, { type: 'shizzle-destination', playerId: 'P1', to: { x: 4, y: 0 } });
  assert.equal(resolveShizzle.ok, true);
  if (resolveShizzle.ok) {
    assert.deepEqual(resolveShizzle.state.players.P1.position, { x: 4, y: 0 });
    assert.equal(resolveShizzle.state.players.P2.hp, 20);
  }
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
  const consumeMana = applyCommand(loganManaPrompt.state, { type: 'mana-choice', playerId: 'P1', consume: true });
  assert.equal(consumeMana.ok, true);
  if (consumeMana.ok) {
    assert.equal(consumeMana.state.players.P1.manaPoints, 0);
    assert.equal(consumeMana.state.players.P1.manaMode, 'consume');
    assert.equal(consumeMana.state.phase, 'active');
  }
}

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
assert.equal(defaultLineup.players.P1.shieldEquipped, true);
assert.equal(defaultLineup.players.P2.name, 'Obi Wan Shinobi');
assert.equal(defaultLineup.players.P2.character, 'shinobi');
assert.equal(defaultLineup.players.P2.hand.length, 15, 'Obi Wan Shinobi starts Nagrand Arena with all 15 unique Cards.');
assert.equal(defaultLineup.players.P2.deck.length, 0);
assert.deepEqual(defaultLineup.players.P1.position, { x: 1, y: 3 });
assert.deepEqual(defaultLineup.players.P2.position, { x: 8, y: 4 });
assert.equal(defaultLineup.objects.filter((object) => object.kind === 'wall-pillar').length, 8, 'Nagrand Arena starts with eight Wall Object pillars.');
assert.equal(defaultLineup.objects.filter((object) => object.kind === 'wooden-box').length, 2, 'Nagrand Arena starts with two Wooden Boxes.');
assert.equal(defaultLineup.objects.some((object) => object.kind === 'wooden-box' && cellLabel(object.position) === 'E1'), true);
assert.equal(defaultLineup.objects.some((object) => object.kind === 'wooden-box' && cellLabel(object.position) === 'D8'), true);
assert.deepEqual(Object.keys(defaultLineup.elevations).sort(), ['D4', 'D5', 'E4', 'E5']);
assert.equal(hasLineOfSight(defaultLineup, { x: 1, y: 2 }, { x: 5, y: 2 }), false, 'The C3 pillar blocks direct line of sight.');

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
  if (homeDefense.ok) assert.equal(homeDefense.state.combatReveal?.defendTotal, 3, 'A4 grants its owner +1 Defend Value in addition to Da Orkk\'s equipped Shield.');
}

const highGroundAttackState = createGameInitialState();
highGroundAttackState.activePlayerId = 'P2';
highGroundAttackState.players.P2.position = { x: 4, y: 3 };
highGroundAttackState.players.P1.position = { x: 2, y: 3 };
highGroundAttackState.players.P2.hand = [{ instanceId: 'high-attack', cardId: 'attack-2' }];
const highGroundAttack = applyCommand(highGroundAttackState, { type: 'attack', playerId: 'P2', cardInstanceId: 'high-attack', targetId: 'P1' });
assert.equal(highGroundAttack.ok, true);
if (highGroundAttack.ok) assert.equal(highGroundAttack.state.pendingAttack?.attackValue, 3, 'High Ground attacking Low Ground grants +1 Attack Value.');

const protectedState = createGameInitialState();
protectedState.activePlayerId = 'P2';
protectedState.players.P2.position = { x: 5, y: 3 };
protectedState.players.P1.position = { x: 3, y: 3 };
protectedState.players.P2.hand = [{ instanceId: 'protected-attack', cardId: 'attack-2' }];
const protectedAttack = applyCommand(protectedState, { type: 'attack', playerId: 'P2', cardInstanceId: 'protected-attack', targetId: 'P1' });
assert.equal(protectedAttack.ok, false, 'A non-adjacent High Ground attacker cannot attack a Highground Protection Square.');

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
assert.equal(defaultLineup.players.P1.hand.some((card) => card.cardId === 'chip-cast'), true);
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
consumeOne.players.P1.hp = 24;
consumeOne.players.P1.rageStacks = 3;
const consumeCard = consumeOne.players.P1.hand.find((card) => card.cardId === 'consume-rage')!;
const consumedOne = applyCommand(consumeOne, { type: 'play-perk', playerId: 'P1', cardInstanceId: consumeCard.instanceId, destination: 'direct' });
assert.equal(consumedOne.ok, true);
if (consumedOne.ok) {
  assert.equal(consumedOne.state.players.P1.hp, 25, 'Consume Rage level 1 heals 1 HP.');
  assert.equal(consumedOne.state.players.P1.rageStacks, 0, 'Consume Rage level 1 removes 3 Rage.');
}

const consumeInsufficient = createGameInitialState();
consumeInsufficient.players.P1.hp = 24;
consumeInsufficient.players.P1.rageStacks = 2;
const insufficientCard = consumeInsufficient.players.P1.hand.find((card) => card.cardId === 'consume-rage')!;
const consumedInsufficient = applyCommand(consumeInsufficient, { type: 'play-perk', playerId: 'P1', cardInstanceId: insufficientCard.instanceId, destination: 'direct' });
assert.equal(consumedInsufficient.ok, true, 'Consume Rage may still be cast without enough Rage.');
if (consumedInsufficient.ok) {
  assert.equal(consumedInsufficient.state.players.P1.hp, 24, 'Insufficient Rage provides no healing.');
  assert.equal(consumedInsufficient.state.players.P1.rageStacks, 2, 'Insufficient Rage is not consumed.');
  assert.equal(consumedInsufficient.state.players.P1.discard.some((card) => card.cardId === 'consume-rage'), true, 'The cast Perk is still discarded normally.');
}

const consumeThree = createGameInitialState();
consumeThree.players.P1.hp = 24;
consumeThree.players.P1.rageStacks = 2;
consumeThree.players.P1.position = { x: 2, y: 1 };
consumeThree.players.P2.position = { x: 3, y: 2 };
consumeThree.players.P1.hand = [];
consumeThree.players.P1.spellEcho[2] = { instanceId: 'consume-three', cardId: 'consume-rage' };
const consumedThree = applyCommand(consumeThree, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(consumedThree.ok, true);
if (consumedThree.ok) {
  assert.equal(consumedThree.state.players.P1.hp, 25);
  assert.equal(consumedThree.state.players.P1.rageStacks, 0);
  assert.equal(consumedThree.state.players.P2.hand.some((card) => card.cardId === 'exhaust'), true, 'Consume Rage level 3 adds Exhaust to adjacent enemies.');
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
    assert.equal(resolveDirectShield.state.objectPushAnimations.some((event) => event.damage?.playerId === 'P2' && event.damage.collision && event.damage.amount === 1), true, 'Shield collision emits a reusable damage-number and impact event.');
  }
}

const directArmRecall = createGameInitialState();
directArmRecall.players.P1.position = { x: 4, y: 3 };
directArmRecall.players.P2.position = { x: 4, y: 1 };
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
      assert.equal(resolveDirectRecall.state.players.P2.hp, 18, 'Level 3 detects the enemy on the direct Shield recall line, deals collision damage, then adjacent damage.');
      assert.deepEqual(resolveDirectRecall.state.players.P2.position, { x: 4, y: 2 }, 'The B4 enemy follows the Shield straight to C4 rather than being pulled diagonally.');
      assert.equal(distance(resolveDirectRecall.state.players.P2.position, directArmRecall.players.P2.position), 1, 'The enemy passed through by the Shield is pulled exactly 1 Square toward Da Orkk.');
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
  assert.equal(fistboltAttack.state.pendingAttack?.attackValue, 3, 'Fistbolt generates and consumes 1 Rage for +1 Attack Value when Orkk had none.');
  assert.equal(fistboltAttack.state.players.P1.rageStacks, 0);
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
    assert.equal(shieldedChainResult.state.players.P1.rageStacks, 1, 'Chain Punchin generates 1 Rage after combat.');
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
    assert.equal(unshieldedChainResult.state.players.P1.rageStacks, 1);
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

const chipCastState = createGameInitialState();
chipCastState.players.P1.position = { x: 2, y: 1 };
chipCastState.players.P2.position = { x: 3, y: 1 };
chipCastState.players.P1.rageStacks = 2;
chipCastState.players.P2.hand = [{ instanceId: 'chip-exhaust', cardId: 'exhaust', revealedToOpponent: true }];
chipCastState.players.P2.discard = [{ instanceId: 'chip-headache', cardId: 'headache' }];
chipCastState.players.P2.deck = [{ instanceId: 'chip-normal-deck', cardId: 'attack-2' }];
const chipCastCard = ensureCardInHand(chipCastState, 'P1', 'chip-cast');
const chipCastAttack = applyCommand(chipCastState, { type: 'attack', playerId: 'P1', cardInstanceId: chipCastCard.instanceId, targetId: 'P2' });
assert.equal(chipCastAttack.ok, true);
if (chipCastAttack.ok) {
  assert.equal(chipCastAttack.state.pendingAttack?.rageSpent, 2, 'Chip-cast remembers the Rage committed to its attack.');
  const chipCastResult = applyCommand(chipCastAttack.state, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(chipCastResult.ok, true);
  if (chipCastResult.ok) {
    const chipStatuses = chipCastResult.state.players.P2.deck.filter((card) => card.cardId === 'exhaust' || card.cardId === 'headache');
    assert.equal(chipStatuses.length, 4, 'Chip-cast shuffles existing Exhaust, existing Headache, and one new Headache per spent Rage into the enemy Deck.');
    assert.equal(chipCastResult.state.players.P2.hand.some((card) => card.cardId === 'exhaust' || card.cardId === 'headache'), false);
    assert.equal(chipCastResult.state.players.P2.discard.some((card) => card.cardId === 'exhaust' || card.cardId === 'headache'), false);
    assert.equal(chipStatuses.every((card) => !card.revealedToOpponent), true, 'Statuses shuffled into the Deck become hidden.');
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
const shinobiLoadout = createInitialState();
assert.equal(shinobiLoadout.players.P2.pinnedStacks, 0);
assert.equal(shinobiLoadout.players.P2.name, 'Da Orkk');
assert.equal(shinobiLoadout.players.P2.hp, 26);
assert.equal(shinobiLoadout.players.P2.maxHp, 26);
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
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'chip-cast'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'knee-blast'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'da-blokk'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'double'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'arcane-shield'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'countaspell'), true);
assert.equal(shinobiLoadout.players.P2.hand.some((card) => card.cardId === 'mana-baryer'), true);
assert.equal(shinobiLoadout.players.P2.deck.length, 0);
assert.equal(shinobiLoadout.players.P2.shieldEquipped, true);
assert.equal(shinobiLoadout.objects.filter((object) => object.kind === 'wall-pillar').length, 8);
assert.equal(shinobiLoadout.objects.filter((object) => object.kind === 'wooden-box').length, 2);
assert.equal(shinobiLoadout.players.P1.hand.length, 3, 'Shinobi must draw the top three shuffled unique cards for the opening Hand.');
assert.equal(shinobiLoadout.players.P1.deck.length, 12);
assert.equal(new Set([...shinobiLoadout.players.P1.hand, ...shinobiLoadout.players.P1.deck].map((card) => card.cardId)).size, 15, 'Every unique Shinobi card must exist exactly once across the opening Hand and Deck.');

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
const movementCauseState = createInitialState();
markCharacterMoved(movementCauseState.players.P1, 'own-card');
assert.equal(movementCauseState.players.P1.movedThisTurn, false);
markCharacterMoved(movementCauseState.players.P1, 'enemy-ability');
assert.equal(movementCauseState.players.P1.movedThisTurn, true);

const pinnedState = createInitialState();
assert.equal(applyPinned(pinnedState.players.P1, 2), 2);
assert.equal(effectiveMoveRange(pinnedState.players.P1), 0);
const pinnedTurnEnd = applyCommand(pinnedState, { type: 'end-turn', playerId: 'P1' });
assert.equal(pinnedTurnEnd.ok, true);
if (pinnedTurnEnd.ok) {
  assert.equal(pinnedTurnEnd.state.players.P1.pinnedStacks, 1);
  assert.equal(effectiveMoveRange(pinnedTurnEnd.state.players.P1), 1);
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
    assert.equal(lostCombat.state.players.P2.hp, 26);
    assert.equal(lostCombat.state.players.P1.hand.length, lightSaberLossHandSize);
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
    assert.equal(wonCombat.state.players.P2.hp, 24);
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
    const enteredEnemy = applyCommand(danceCombat.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 1 } });
    assert.equal(enteredEnemy.ok, true);
    if (enteredEnemy.ok) {
      assert.equal(enteredEnemy.state.players.P2.hp, 24);
      assert.equal(enteredEnemy.state.danceThrough?.stepsRemaining, 2);
      const illegalStop = applyCommand(enteredEnemy.state, { type: 'end-dance', playerId: 'P1' });
      assert.equal(illegalStop.ok, false);
      const leftEnemy = applyCommand(enteredEnemy.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 2 } });
      assert.equal(leftEnemy.ok, true);
      if (leftEnemy.ok) {
        assert.equal(leftEnemy.state.players.P2.hp, 23);
        assert.equal(leftEnemy.state.players.P1.movedThisTurn, false);
        const illegalFinalOverlap = applyCommand(leftEnemy.state, { type: 'move', playerId: 'P1', to: { x: 2, y: 1 } });
        assert.equal(illegalFinalOverlap.ok, false);
        const finalStep = applyCommand(leftEnemy.state, { type: 'move', playerId: 'P1', to: { x: 3, y: 1 } });
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
    assert.equal(defendedDisarm.state.players.P2.hp, 26);
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
    assert.equal(cutCombat.state.players.P2.hp, 23);
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
    assert.equal(cutDefended.state.players.P2.hp, 26);
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
    assert.equal(helloDefended.state.players.P2.hp, 22);
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
    assert.equal(plainHelloCombat.state.players.P2.hp, 25);
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
    assert.equal(blockCombat.state.players.P2.hp, 25);
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
  }
}

let flurryChoiceState = createInitialState();
flurryChoiceState.activePlayerId = 'P2';
flurryChoiceState.players.P1.position = { x: 2, y: 1 };
flurryChoiceState.players.P2.position = { x: 3, y: 1 };
const flurryDefence = ensureCardInHand(flurryChoiceState, 'P1', 'flurry-defensive-strikes');
const flurryPayment = ensureCardInHand(flurryChoiceState, 'P1', 'double-jump');
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
    assert.equal(flurryCombat.state.players.P2.hp, 25);
    assert.equal(flurryCombat.state.players.P1.hp, 18);
    assert.equal(flurryCombat.state.phase, 'flurry-offer');
    const paidFlurry = applyCommand(flurryCombat.state, { type: 'flurry-pay', playerId: 'P1', cardInstanceId: flurryPayment.instanceId });
    assert.equal(paidFlurry.ok, true);
    if (paidFlurry.ok) {
      assert.equal(paidFlurry.state.phase, 'choosing-flurry-enemy-discard');
      const firstEnemyDiscard = applyCommand(paidFlurry.state, { type: 'flurry-enemy-discard', playerId: 'P2', cardInstanceId: 'enemy-choice-1' });
      assert.equal(firstEnemyDiscard.ok, true);
      if (firstEnemyDiscard.ok) {
        const secondEnemyDiscard = applyCommand(firstEnemyDiscard.state, { type: 'flurry-enemy-discard', playerId: 'P2', cardInstanceId: 'enemy-choice-2' });
        assert.equal(secondEnemyDiscard.ok, true);
        if (secondEnemyDiscard.ok) {
          assert.equal(secondEnemyDiscard.state.players.P2.hand.length, 1);
          assert.equal(secondEnemyDiscard.state.phase, 'active');
        }
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
    assert.equal(calmCombat.state.players.P2.pinnedStacks, 0);
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
    assert.equal(unpinnedCalmCombat.state.players.P2.pinnedStacks, 1);
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
    assert.equal(calmHelloCombat.state.players.P2.pinnedStacks, 0);
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
    assert.equal(notShinobiCombat.state.players.P1.lightsaberBuff, true, 'The Defence card must apply Lightsaber after combat.');
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
pinnedCardState.players.P1.pinnedStacks = 0;
applyPinned(pinnedCardState.players.P1, 3);
assert.equal(pinnedCardState.players.P1.hand.filter((card) => card.cardId === 'pinned').length, 3);
assert.equal(effectiveMoveRange(pinnedCardState.players.P1), 0);
const pinnedCardTurnEnd = applyCommand(pinnedCardState, { type: 'end-turn', playerId: 'P1' });
assert.equal(pinnedCardTurnEnd.ok, true);
if (pinnedCardTurnEnd.ok) {
  assert.equal(pinnedCardTurnEnd.state.players.P1.hand.filter((card) => card.cardId === 'pinned').length, 2, 'One Pinned Card must be Removed rather than discarded at turn end.');
  assert.equal(pinnedCardTurnEnd.state.players.P1.discard.some((card) => card.cardId === 'pinned'), false);
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
assert.equal(choseHeadacheDash.ok, true);
if (choseHeadacheDash.ok) {
  const illegalHeadacheDiscard = applyCommand(choseHeadacheDash.state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'headache-test' });
  assert.equal(illegalHeadacheDiscard.ok, false, 'Headache cannot be discarded to pay for Dash.');
}
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
      const jumpAway = applyCommand(jumpOntoEnemy.state, { type: 'move', playerId: 'P1', to: { x: 4, y: 2 } });
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
      assert.equal(forcePush.state.players.P2.hp, 25);
      assert.equal(forcePush.state.objects[0].hp, 3, 'Test Objects are indestructible.');
      assert.equal(forcePush.state.phase, 'active');
    }
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
    if (directPush.ok) assert.deepEqual(directPush.state.objects[0].position, { x: 5, y: 2 });
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
  const pulled = applyCommand(forcePullPlay.state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  assert.equal(pulled.ok, true);
  if (pulled.ok) {
    assert.deepEqual(pulled.state.players.P2.position, { x: 2, y: 1 });
    assert.equal(pulled.state.players.P2.hp, 26, 'Force Pull movement must not deal collision damage.');
  }
  const cancelledPull = applyCommand(forcePullPlay.state, { type: 'cancel-targeting', playerId: 'P1' });
  assert.equal(cancelledPull.ok, true);
  if (cancelledPull.ok) {
    assert.equal(cancelledPull.state.players.P1.hand.some((card) => card.instanceId === forcePullCard.instanceId), true);
    assert.equal(cancelledPull.state.players.P1.actionsRemaining, 2);
  }
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
      if (swiftformEnd.ok) assert.equal(swiftformEnd.state.players.P1.lightsaberBuff, true, 'Swiftform level 2 must grant Lightsaber even after movement.');
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
  if (edgePush.ok) { assert.equal(edgePush.state.players.P2.hp, 26); assert.deepEqual(edgePush.state.players.P2.position, { x: 8, y: 1 }); }
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
    assert.equal(defendOrkk.state.players.P2.hp, 25, 'Equipped Shield adds +1 to Da Orkk Defend Cards.');
    assert.equal(defendOrkk.state.players.P2.rageStacks, 1, 'One damaging event during an enemy turn grants one Rage.');
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
    assert.equal(resolvedMultiDamage.state.players.P2.rageStacks, 1, 'Multiple damage events in one Combat grant only 1 Rage.');
    const secondAttack = applyCommand(resolvedMultiDamage.state, { type: 'attack', playerId: 'P1', cardInstanceId: 'second-combat', targetId: 'P2' });
    assert.equal(secondAttack.ok, true);
    if (secondAttack.ok) {
      const resolvedSecond = applyCommand(secondAttack.state, { type: 'pass-defense', playerId: 'P2' });
      assert.equal(resolvedSecond.ok, true);
      if (resolvedSecond.ok) assert.equal(resolvedSecond.state.players.P2.rageStacks, 2, 'A separate Combat in the same enemy turn can grant another Rage.');
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
    assert.equal(defendDaBlokk.state.players.P2.hp, 25, 'Da Blokk has 2 total Defence while the Shield is equipped.');
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
    assert.equal(defendEquippedArcaneShield.state.players.P2.shieldEquipped, false, 'Arcane Shield drops a Shield that was equipped when combat began.');
    const droppedShield = defendEquippedArcaneShield.state.objects.find((object) => object.kind === 'orkk-shield' && object.ownerId === 'P2');
    assert.ok(droppedShield);
    assert.equal(distance(droppedShield.position, defendEquippedArcaneShield.state.players.P2.position), 1, 'Arcane Shield drops onto a random empty adjacent Square.');
  }
}

const arcaneShieldUnequipped = createInitialState();
arcaneShieldUnequipped.players.P1.position = { x: 2, y: 1 };
arcaneShieldUnequipped.players.P2.position = { x: 3, y: 1 };
arcaneShieldUnequipped.players.P2.shieldEquipped = false;
arcaneShieldUnequipped.players.P1.hand = [{ instanceId: 'arcane-rage-attack', cardId: 'attack-2' }];
arcaneShieldUnequipped.players.P2.hand = [{ instanceId: 'arcane-rage-defense', cardId: 'arcane-shield' }];
arcaneShieldUnequipped.objects = [{ id: 'arcane-existing-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 4, y: 3 } }];
const attackUnequippedArcaneShield = applyCommand(arcaneShieldUnequipped, { type: 'attack', playerId: 'P1', cardInstanceId: 'arcane-rage-attack', targetId: 'P2' });
assert.equal(attackUnequippedArcaneShield.ok, true);
if (attackUnequippedArcaneShield.ok) {
  const defendUnequippedArcaneShield = applyCommand(attackUnequippedArcaneShield.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'arcane-rage-defense' });
  assert.equal(defendUnequippedArcaneShield.ok, true);
  if (defendUnequippedArcaneShield.ok) {
    assert.equal(defendUnequippedArcaneShield.state.players.P2.hp, 26);
    assert.equal(defendUnequippedArcaneShield.state.players.P2.rageStacks, 1, 'Arcane Shield generates 1 Rage after combat when the Shield began unequipped.');
    assert.equal(defendUnequippedArcaneShield.state.players.P2.shieldEquipped, false, 'Arcane Shield no longer recalls an unequipped Shield.');
    assert.equal(defendUnequippedArcaneShield.state.objects.some((object) => object.id === 'arcane-existing-shield'), true, 'The existing Shield remains on the Board.');
    assert.equal(defendUnequippedArcaneShield.state.objectPushAnimations.some((event) => event.objectId === 'arcane-existing-shield'), false);
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
    assert.equal(defendManaEquipped.state.players.P2.hp, 26, 'Mana Baryer has 4 Defend Value, not 3, while Shield is equipped.');
    assert.equal(defendManaEquipped.state.combatReveal?.defendTotal, 4);
  }
}

const manaBaryerRecall = createInitialState();
manaBaryerRecall.players.P1.position = { x: 3, y: 2 };
manaBaryerRecall.players.P2.position = { x: 4, y: 3 };
manaBaryerRecall.players.P2.shieldEquipped = false;
manaBaryerRecall.players.P1.hand = [{ instanceId: 'mana-recall-attack', cardId: 'attack-3' }];
manaBaryerRecall.players.P2.hand = [{ instanceId: 'mana-recall-defense', cardId: 'mana-baryer' }];
manaBaryerRecall.objects = [{ id: 'mana-recall-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } }];
const attackManaRecall = applyCommand(manaBaryerRecall, { type: 'attack', playerId: 'P1', cardInstanceId: 'mana-recall-attack', targetId: 'P2' });
assert.equal(attackManaRecall.ok, true);
if (attackManaRecall.ok) {
  const defendManaRecall = applyCommand(attackManaRecall.state, { type: 'defend', playerId: 'P2', cardInstanceId: 'mana-recall-defense' });
  assert.equal(defendManaRecall.ok, true);
  if (defendManaRecall.ok) {
    assert.equal(defendManaRecall.state.players.P2.hp, 25, 'Unequipped Mana Baryer uses only its base 2 Defend Value.');
    assert.equal(defendManaRecall.state.players.P1.hp, 18, 'Mana Baryer deals 2 damage when its recall path crosses the attacker.');
    assert.equal(defendManaRecall.state.players.P2.shieldEquipped, true);
    assert.equal(defendManaRecall.state.objects.some((object) => object.id === 'mana-recall-shield'), false);
    const manaAnimation = defendManaRecall.state.objectPushAnimations.find((event) => event.objectId === 'mana-recall-shield');
    assert.equal(manaAnimation?.path?.some((cell) => cell.x === 3 && cell.y === 2), true, 'Mana Baryer animation retains the walkable path through the enemy Square.');
    assert.equal(manaAnimation?.equipPlayerId, 'P2');
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
  assert.equal(spentRage.state.players.P2.rageStacks, 0, 'All Rage is consumed when Da Orkk uses an Attack Card.');
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
    assert.equal(blockedPush.state.players.P1.hp, 18, 'Level 3 deals collision damage plus 1 when the enemy cannot be pushed past the Board edge.');
    assert.deepEqual(blockedPush.state.players.P1.position, { x: 8, y: 1 });
    const stoppedShield = blockedPush.state.objects.find((object) => object.kind === 'orkk-shield')!;
    assert.equal(distance(stoppedShield.position, { x: 8, y: 1 }), 1, 'The Shield stops adjacent to its enemy collision Square.');
    assert.equal(Object.values(blockedPush.state.players).some((player) => player.position.x === stoppedShield.position.x && player.position.y === stoppedShield.position.y), false, 'The thrown Shield cannot finish on a character-occupied Square.');
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
    assert.equal(createdShield.state.players.P2.shieldEquipped, true, 'Arm da Wiz creates and equips a replacement when the old Shield is unreachable.');
    assert.equal(createdShield.state.objects.some((object) => object.kind === 'orkk-shield' && object.ownerId === 'P2'), false, 'Creating a Shield removes the old Shield copy from the Board.');
  }
}

const armRecall = createInitialState();
armRecall.activePlayerId = 'P2';
armRecall.players.P2.shieldEquipped = false;
armRecall.players.P2.position = { x: 4, y: 3 };
armRecall.players.P1.position = { x: 2, y: 1 };
armRecall.objects = [{ id: 'recall-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 999, maxHp: 999, position: { x: 1, y: 0 } }];
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
      const recallAnimation = recalled.state.objectPushAnimations.find((event) => event.objectId === 'recall-shield');
      assert.equal(recallAnimation?.removeOnComplete, true);
      assert.equal(recallAnimation?.path?.length, 3, 'The recalled Shield preserves its maneuvering path for animation.');
    }
  }
}

const armLevelThree = createInitialState();
armLevelThree.activePlayerId = 'P2';
armLevelThree.players.P2.shieldEquipped = false;
armLevelThree.players.P2.position = { x: 4, y: 3 };
armLevelThree.players.P1.position = { x: 2, y: 1 };
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
      assert.equal(recalledThree.state.players.P1.hp, 18, 'Level 3 deals collision and adjacent-to-Orkk damage.');
      assert.deepEqual(recalledThree.state.players.P1.position, { x: 3, y: 2 }, 'The collided enemy is pulled one Square toward Da Orkk.');
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
      assert.deepEqual(recalledTwo.state.players.P1.position, { x: 2, y: 1 }, 'Level 2 does not pull the collided enemy.');
      assert.equal(recalledTwo.state.objectPushAnimations.some((event) => event.damage?.playerId === 'P1' && event.damage.collision && event.damage.amount === 1), true);
    }
  }
}

console.log('Rules checks passed.');
