import assert from 'node:assert/strict';
import { ACTION_QUEST_POOL, applyCommand, createHotseatTestState, type GameState, type GameStateWithKamelot, type GameStateWithQuestPhases } from '../shared/game.ts';

function endTurn(state: GameState, playerId: 'P1' | 'P2'): GameState {
  const result = applyCommand(state, { type: 'end-turn', playerId });
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}

const timed = createHotseatTestState(true, 'magician', 2, 'shinobi') as GameStateWithQuestPhases;
timed.turn = 3;
timed.activePlayerId = 'P1';
timed.roundFirstPlayerId = 'P1';
timed.players.P1.hand = [];
timed.players.P2.hand = [];
timed.questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['damage-contest'], currentQuest: { id: 'damage-contest', announcedRound: 1, endsAfterRound: 3, winners: [], progress: { P1: 3, P2: 1 } }, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {} };
const lastRoundSecondTurn = endTurn(timed, 'P1');
assert.equal(lastRoundSecondTurn.questPhases?.currentQuest?.id, 'damage-contest', 'The Quest remains active for the final Player turn of its last Round.');
const resolved = endTurn(lastRoundSecondTurn, 'P2');
assert.equal(resolved.turn, 4);
assert.equal(resolved.questPhases?.currentQuest, null, 'A timed Quest resolves at the start of the next Round.');
assert.deepEqual(resolved.questPhases?.lastQuestWinners, ['P1']);

const flag = createHotseatTestState(true, 'magician', 2, 'shinobi') as GameStateWithQuestPhases;
flag.turn = 5;
flag.activePlayerId = 'P2';
flag.roundFirstPlayerId = 'P1';
flag.objects = [];
flag.players.P1.position = { x: 1, y: 3 };
flag.players.P1.hand = [];
flag.players.P2.hand = [];
flag.questPhases = {
  actionDamageByPlayer: {}, usedQuestIds: ['capture-the-flag'], currentQuest: { id: 'capture-the-flag', announcedRound: 1, endsAfterRound: 5, winners: [], progress: { P1: 1 } }, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {},
  captureTheFlag: { flags: [{ id: 'capture-flag-P2', ownerId: 'P2', homeSquares: [{ x: 8, y: 3 }, { x: 8, y: 4 }], homeAnchor: { x: 8, y: 3.5 }, status: 'carried', carrierId: 'P1', droppedAt: null, grabbedFromHome: true }] },
};
const captured = endTurn(flag, 'P2');
assert.equal(captured.turn, 6);
assert.deepEqual(captured.questPhases?.lastQuestWinners, ['P1'], 'The final Round Flag qualifies at the next turn-start check.');
assert.equal(captured.questPhases?.lastQuestResult?.questId, 'capture-the-flag');
assert.equal(captured.players.P1.hand.some((card) => card.cardId === 'banner'), true, 'The Conqueror awards its Banner after the final turn-start check.');
assert.notEqual(captured.questPhases?.currentQuest?.id, 'capture-the-flag', 'The next Quest is announced after the previous one resolves.');

const inactiveCarrier = structuredClone(flag);
inactiveCarrier.players.P1.position = { x: 2, y: 2 };
inactiveCarrier.players.P2.position = { x: 8, y: 3 };
inactiveCarrier.questPhases!.currentQuest!.progress = { P2: 1 };
inactiveCarrier.questPhases!.captureTheFlag!.flags = [
  { id: 'capture-flag-P1', ownerId: 'P1', homeSquares: [{ x: 1, y: 3 }, { x: 1, y: 4 }], homeAnchor: { x: 1, y: 3.5 }, status: 'carried', carrierId: 'P2', droppedAt: null, grabbedFromHome: true },
];
const beforeDeadline = structuredClone(inactiveCarrier);
beforeDeadline.turn = 4;
const stillActive = endTurn(beforeDeadline, 'P2');
assert.equal(stillActive.turn, 5);
assert.equal(stillActive.questPhases?.currentQuest?.id, 'capture-the-flag', 'Before the deadline, another Player cannot complete the Quest at this Player\'s turn start.');

const inactiveWinner = endTurn(inactiveCarrier, 'P2');
assert.equal(inactiveWinner.turn, 6);
assert.deepEqual(inactiveWinner.questPhases?.lastQuestWinners, ['P2'], 'The final deadline credits a qualifying carrier even when another Player begins the Round.');
assert.equal(inactiveWinner.players.P2.hand.some((card) => card.cardId === 'banner'), true, 'The inactive qualifying carrier receives the main Reward.');

const reciprocal = structuredClone(flag);
reciprocal.players.P1.position = { x: 1, y: 3 };
reciprocal.players.P2.position = { x: 8, y: 3 };
reciprocal.questPhases!.currentQuest!.progress = { P1: 1, P2: 1 };
reciprocal.questPhases!.captureTheFlag!.flags.push(
  { id: 'capture-flag-P1', ownerId: 'P1', homeSquares: [{ x: 1, y: 3 }, { x: 1, y: 4 }], homeAnchor: { x: 1, y: 3.5 }, status: 'carried', carrierId: 'P2', droppedAt: null, grabbedFromHome: true },
);
const drawn = endTurn(reciprocal, 'P2');
assert.deepEqual(drawn.questPhases?.lastQuestWinners?.sort(), ['P1', 'P2'], 'Multiple final-deadline carriers draw The Conqueror.');
for (const id of ['P1', 'P2'] as const) {
  assert.equal(drawn.players[id].hand.some((card) => card.cardId === 'banner-draw'), true, 'Every tied carrier receives the Draw Reward.');
  assert.equal(drawn.players[id].hand.some((card) => card.cardId === 'banner'), false, 'Drawn carriers do not receive the solo Reward.');
}

const merylinFlag = createHotseatTestState(true, 'merylin', 2, 'shinobi') as GameStateWithKamelot & GameStateWithQuestPhases;
merylinFlag.turn = 5;
merylinFlag.activePlayerId = 'P2';
merylinFlag.roundFirstPlayerId = 'P1';
merylinFlag.objects = [];
merylinFlag.players.P1.position = { x: 2, y: 3 }; // B4: a Kamelot-created Base Square.
merylinFlag.players.P1.hand = [];
merylinFlag.players.P2.hand = [];
merylinFlag.kamelotChanges = [{ label: 'B4', ownerId: 'P1', value: 1, ready: true }];
merylinFlag.questPhases = structuredClone(flag.questPhases!);
const paintedAtDeadline = endTurn(structuredClone(merylinFlag), 'P2');
assert.deepEqual(paintedAtDeadline.questPhases?.lastQuestWinners, [], 'A Kamelot-created Base does not complete The Conqueror at the Round limit.');
assert.equal(paintedAtDeadline.players.P1.hand.some((card) => card.cardId === 'banner'), false);

const paintedAtTurnStart = structuredClone(merylinFlag);
paintedAtTurnStart.turn = 4;
const paintedBeforeDeadline = endTurn(paintedAtTurnStart, 'P2');
assert.equal(paintedBeforeDeadline.questPhases?.currentQuest?.id, 'capture-the-flag', 'A Kamelot-created Base does not complete The Conqueror at a normal turn start.');

const originalBase = structuredClone(merylinFlag);
originalBase.players.P1.position = { x: 1, y: 3 }; // A4: an original Base Square.
const originalBaseWinner = endTurn(originalBase, 'P2');
assert.deepEqual(originalBaseWinner.questPhases?.lastQuestWinners, ['P1'], 'Merylin wins with the enemy Flag on her original Base.');
assert.equal(originalBaseWinner.players.P1.hand.some((card) => card.cardId === 'banner'), true);
const originalBaseBeforeDeadline = structuredClone(originalBase);
originalBaseBeforeDeadline.turn = 4;
const originalTurnStartWinner = endTurn(originalBaseBeforeDeadline, 'P2');
assert.deepEqual(originalTurnStartWinner.questPhases?.lastQuestWinners, ['P1'], 'Merylin also wins from her original Base at a normal turn start.');

const paintedBeforeQuest = createHotseatTestState(true, 'merylin', 2, 'shinobi') as GameStateWithKamelot & GameStateWithQuestPhases;
paintedBeforeQuest.turn = 5;
paintedBeforeQuest.activePlayerId = 'P1';
paintedBeforeQuest.roundFirstPlayerId = 'P1';
paintedBeforeQuest.objects = [];
paintedBeforeQuest.players.P1.hand = [];
paintedBeforeQuest.players.P2.hand = [];
paintedBeforeQuest.kamelotChanges = [{ label: 'H4', ownerId: 'P1', value: 1, ready: true }];
paintedBeforeQuest.questPhases = {
  actionDamageByPlayer: {}, usedQuestIds: ['damage-contest'], currentQuest: { id: 'damage-contest', announcedRound: 1, endsAfterRound: 5, winners: [], progress: {} },
  lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {},
};
const nextQuestChoices = ACTION_QUEST_POOL.filter((quest) => quest.id !== 'damage-contest');
const conquerorIndex = nextQuestChoices.findIndex((quest) => quest.id === 'capture-the-flag');
const randomBeforeQuest = Math.random;
let startedConqueror: GameState;
try {
  Math.random = () => (conquerorIndex + 0.5) / nextQuestChoices.length;
  startedConqueror = endTurn(endTurn(paintedBeforeQuest, 'P1'), 'P2');
} finally {
  Math.random = randomBeforeQuest;
}
assert.equal(startedConqueror.questPhases?.currentQuest?.id, 'capture-the-flag');
assert.deepEqual(startedConqueror.questPhases?.captureTheFlag?.flags.find((entry) => entry.ownerId === 'P2')?.homeSquares,
  [{ x: 8, y: 3 }, { x: 8, y: 4 }], 'Kamelot repainting does not move or remove an enemy Flag from its original Base Squares.');

console.log('Action Quest timing checks passed.');
