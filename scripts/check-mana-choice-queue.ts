import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, phaseCardCandidates, type GameState, type GameStateWithQuestPhases } from '../shared/game.ts';

function step(state: GameState, command: Parameters<typeof applyCommand>[1]): GameStateWithQuestPhases {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state as GameStateWithQuestPhases;
}

function readyLogan(): GameStateWithQuestPhases {
  const state = createHotseatTestState(true, 'magician', 2, 'shinobi') as GameStateWithQuestPhases;
  state.turn = 5;
  state.activePlayerId = 'P2';
  state.roundFirstPlayerId = 'P1';
  state.players.P1.manaPoints = 3;
  state.players.P1.hand = [];
  state.players.P2.hand = [];
  state.questPhases = {
    actionDamageByPlayer: {}, usedQuestIds: ['damage-contest'],
    currentQuest: { id: 'damage-contest', announcedRound: 1, endsAfterRound: 5, winners: [], progress: { P1: 3, P2: 0 } },
    lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {},
  };
  return state;
}

const phaseStart = step(readyLogan(), { type: 'end-turn', playerId: 'P2' });
assert.equal(phaseStart.turn, 6);
assert.equal(phaseStart.phase, 'choosing-phase-card', 'The Phase reward takes priority over Logan\'s Mana prompt.');
assert.equal(phaseStart.pendingManaChoice, 'P1', 'The Consume decision stays pending.');
assert.equal(applyCommand(phaseStart, { type: 'mana-choice', playerId: 'P1', consume: true }).ok, false, 'Consume cannot bypass the Focus choice.');

const selectedFocus = step(phaseStart, { type: 'phase-card-choice', playerId: 'P1', cardId: phaseCardCandidates(phaseStart, 'P1')[0] });
assert.equal(selectedFocus.phase, 'choosing-phase-card');
assert.equal(selectedFocus.questPhases?.phaseReward?.playerProgress?.P1?.selectedCardId !== undefined, true, 'The winner still chooses Card placement.');
const placedFocus = step(selectedFocus, { type: 'phase-card-destination', playerId: 'P1', destination: 'hand' });
assert.equal(placedFocus.phase, 'choosing-phase-card', 'The other Player finishes their reward before Consume opens.');
const readyForConsume = step(placedFocus, { type: 'phase-card-choice', playerId: 'P2', cardId: phaseCardCandidates(placedFocus, 'P2')[0] });
assert.equal(readyForConsume.phase, 'choosing-mana-mode', 'The Consume prompt opens automatically after all Phase reward steps.');
assert.equal(readyForConsume.activePlayerId, 'P1');
assert.equal(readyForConsume.pendingManaChoice, 'P1');
const consumed = step(readyForConsume, { type: 'mana-choice', playerId: 'P1', consume: true });
assert.equal(consumed.phase, 'active');
assert.equal(consumed.players.P1.manaPoints, 0);
assert.equal(consumed.players.P1.manaMode, 'consume');

const minimized = step(readyForConsume, { type: 'minimize-mana-choice', playerId: 'P1' });
assert.equal(minimized.phase, 'active', 'Minimizing the prompt does not reopen it immediately.');
assert.equal(minimized.pendingManaChoice, 'P1');
const restored = step(minimized, { type: 'mana-choice', playerId: 'P1', consume: false });
assert.equal(restored.players.P1.manaPoints, 3);
assert.equal(restored.players.P1.manaMode, 'generate');

const ordinaryTurn = readyLogan();
ordinaryTurn.turn = 4;
const ordinaryPrompt = step(ordinaryTurn, { type: 'end-turn', playerId: 'P2' });
assert.equal(ordinaryPrompt.phase, 'choosing-mana-mode', 'Without another choice, the Mana prompt still opens at turn start.');

console.log('Mana choice queue checks passed.');
