import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameState, type GameStateWithQuestPhases } from '../shared/game.ts';

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

console.log('Action Quest timing checks passed.');
