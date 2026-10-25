import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, createMultiplayerState, createLordaeronMultiplayerState, createBestOfThreeState, createPipeTestState, createTrenchTestState, drawCards, drawnPerkCandidates, enablePerkMode, hasPendingPerkChoice, phaseCardCandidates, STARTING_DECKS, type GameState, type GameStateWithQuestPhases, type CharacterId, type CardTypeId } from '../shared/game.ts';

function step(state: GameState, command: unknown): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.state;
}
function opening(character: CharacterId): GameState {
  const state = createHotseatTestState(false, character, 2, 'dummy');
  enablePerkMode(state);
  return step(state, { type: 'choose-focus-card', playerId: 'P1', cardId: STARTING_DECKS[character].attackFocus[0] });
}
function reward(state: GameState, phase: 1 | 2, winner = true) {
  const quests = (state as GameStateWithQuestPhases).questPhases!;
  quests.lastQuestWinners = winner ? ['P1'] : [];
  quests.phaseReward = { phase, pendingPlayerIds: ['P1'], completedPlayerIds: [], playerProgress: {} };
  state.phase = 'choosing-phase-card';
  return state;
}
for (const character of Object.keys(STARTING_DECKS) as CharacterId[]) {
  let state = opening(character);
  const player = state.players.P1;
  const definition = STARTING_DECKS[character];
  assert.equal(player.hand.length, 3);
  assert.deepEqual([...player.hand, ...player.deck].filter((card) => card.cardId !== 'perk-draw' && cardDefinition(card).kind === 'perk').map((card) => card.cardId), [definition.reserve]);
  assert.equal(player.deck.filter((card) => card.cardId === 'perk-draw').length, 2);
  assert.equal(player.deck.at(-1)?.cardId, definition.attackFocus[0]);
  assert.equal(drawnPerkCandidates(player).length, 4);
  assert.equal(drawCards(player, 1), 1);
  assert.equal(player.hand.at(-1)?.cardId, definition.attackFocus[0]);
  const tokens = player.deck.filter((card) => card.cardId === 'perk-draw');
  player.deck = [...player.deck.filter((card) => card.cardId !== 'perk-draw'), ...tokens];
  assert.equal(drawCards(player, 2), 2);
  assert.equal(player.perkMode?.pendingChoices, 2);
  assert.ok(!player.hand.some((card) => card.cardId === 'perk-draw'));
  assert.ok(hasPendingPerkChoice(state));
  assert.ok(!applyCommand(state, { type: 'end-turn', playerId: 'P1' }).ok);
  assert.ok(!applyCommand(state, { type: 'choose-drawn-perk', playerId: 'P2', cardId: drawnPerkCandidates(player)[0] }).ok);
  assert.ok(!applyCommand(state, { type: 'choose-drawn-perk', playerId: 'P1', cardId: definition.reserve }).ok);
  const chosen = drawnPerkCandidates(player)[0];
  state = step(state, { type: 'choose-drawn-perk', playerId: 'P1', cardId: chosen });
  assert.equal(drawnPerkCandidates(state.players.P1).length, 3);
  assert.ok(state.players.P1.hand.some((card) => card.cardId === chosen));
  assert.ok(!applyCommand(state, { type: 'choose-drawn-perk', playerId: 'P1', cardId: chosen }).ok);
  state = step(state, { type: 'choose-drawn-perk', playerId: 'P1', cardId: drawnPerkCandidates(state.players.P1)[0] });
  assert.equal(drawnPerkCandidates(state.players.P1).length, 2);
  assert.equal(hasPendingPerkChoice(state), false);
  assert.equal(state.phase, 'active');
  assert.ok(!state.players.P1.discard.some((card) => card.cardId === 'perk-draw'));
  // Acquired Cards stay unavailable after leaving all piles.
  state.players.P1.hand = [];
  state = reward(state, 2);
  assert.ok(!phaseCardCandidates(state, 'P1').includes(chosen));
  assert.ok(!phaseCardCandidates(state, 'P1').includes(definition.reserve));
  assert.ok(phaseCardCandidates(state, 'P1').some((id) => cardDefinition({ cardId: id, instanceId: '' }).kind === 'perk'));
  assert.ok(phaseCardCandidates(state, 'P1').some((id) => cardDefinition({ cardId: id, instanceId: '' }).kind !== 'perk'));
}
for (const winner of [false, true]) {
  let state = reward(opening('merylin'), 1, winner);
  assert.ok(phaseCardCandidates(state, 'P1').includes('perk-draw'));
  state = step(state, { type: 'phase-card-choice', playerId: 'P1', cardId: 'perk-draw' });
  assert.equal(state.players.P1.deck.filter((card) => card.cardId === 'perk-draw').length, 3);
  assert.ok(!state.players.P1.hand.some((card) => card.cardId === 'perk-draw'));
  assert.ok(!applyCommand(state, { type: 'phase-card-destination', playerId: 'P1', destination: 'hand' }).ok);
  state = reward(state, 2, winner);
  assert.ok(phaseCardCandidates(state, 'P1').includes('kamelot-stance'));
  state = step(state, { type: 'phase-card-choice', playerId: 'P1', cardId: 'kamelot-stance' });
  if (winner) state = step(state, { type: 'phase-card-destination', playerId: 'P1', destination: 'hand' });
  assert.ok(!state.players.P1.perkMode!.remaining.includes('kamelot-stance'));
  assert.ok([...state.players.P1.deck, ...state.players.P1.hand].some((card) => card.cardId === 'kamelot-stance'));
}
// Perk choices preserve the phase that was interrupted by a draw.
for (const phase of ['active', 'choosing-preparation-discard', 'defending'] as const) {
  let state = opening('merylin');
  state.phase = phase;
  state.players.P1.deck = [{ cardId: 'perk-draw', instanceId: 'interrupt' }];
  drawCards(state.players.P1, 1);
  state = step(state, { type: 'choose-drawn-perk', playerId: 'P1', cardId: 'windwalker-stance' });
  assert.equal(state.phase, phase, 'Perk choices preserve the interrupted game choice.');
}
let freeMove = opening('merylin');
freeMove.players.P1.deck = [{ cardId: 'perk-draw', instanceId: 'free-move-token' }];
freeMove = step(freeMove, { type: 'free-move', playerId: 'P1' });
assert.equal(freeMove.players.P1.perkMode?.pendingChoices, 1);
const movement = freeMove.players.P1.movementRemaining;
freeMove = step(freeMove, { type: 'choose-drawn-perk', playerId: 'P1', cardId: 'kamelot-stance' });
assert.equal(freeMove.players.P1.movementRemaining, movement);
assert.equal(freeMove.players.P1.freeMoveUsed, true);
let guard = opening('merylin');
guard.players.P1.freeMoveUsed = true;
guard.players.P1.deck = [{ cardId: 'perk-draw', instanceId: 'guard-token' }];
guard.players.P1.hand.push({ instanceId: 'automatic', cardId: 'overpower' });
guard = step(guard, { type: 'guard', playerId: 'P1' });
assert.equal(guard.phase, 'choosing-guard-discard');
assert.ok(guard.players.P1.hand.some((card) => card.instanceId === 'automatic'), 'Automatic discards wait for the drawn Perk.');
guard = step(guard, { type: 'choose-drawn-perk', playerId: 'P1', cardId: 'kamelot-stance' });
assert.ok(!guard.players.P1.hand.some((card) => card.instanceId === 'automatic'));

// Exhausted pools consume extra tokens without opening an impossible choice.
const exhausted = opening('merylin');
exhausted.players.P1.perkMode!.remaining = [];
exhausted.players.P1.deck = [{ cardId: 'perk-draw', instanceId: 'extra' }];
drawCards(exhausted.players.P1, 1);
assert.equal(hasPendingPerkChoice(exhausted), false);
assert.ok(!exhausted.players.P1.hand.some((card) => card.cardId === 'perk-draw'));

// Each arena and FFA uses the same opening rules; later opening draws can queue choices.
for (const state of [createMultiplayerState({ P1: 'merylin', P2: 'shinobi', P3: 'orkk' }), createLordaeronMultiplayerState({ P1: 'merylin', P2: 'shinobi', P3: 'orkk' }), createPipeTestState(false, 'merylin', 'shinobi'), createTrenchTestState(false, 'merylin', 'shinobi')]) {
  enablePerkMode(state);
  let next = state;
  while (['choosing-focus', 'choosing-focus-card'].includes(next.phase)) {
    const id = (next as GameState & { openingSetup: { pendingPlayerIds: ('P1' | 'P2' | 'P3')[] } }).openingSetup.pendingPlayerIds[0];
    const character = next.players[id].character as CharacterId;
    next = step(next, { type: 'choose-focus-card', playerId: id, cardId: STARTING_DECKS[character].attackFocus[0] });
  }
  for (const player of Object.values(next.players)) {
    assert.ok(player.perkMode);
    assert.equal(player.deck.at(-1)?.cardId, STARTING_DECKS[player.character as CharacterId].attackFocus[0]);
    assert.equal(drawnPerkCandidates(player).length, 4);
  }
}
for (const seriesMode of ['duel', 'tournament'] as const) {
  let state = createBestOfThreeState(seriesMode, { P1: ['merylin', seriesMode === 'duel' ? 'merylin' : 'magician'], P2: ['shinobi', seriesMode === 'duel' ? 'shinobi' : 'orkk'] }, true, true);
  function finish(winner: 'P1' | 'P2') {
    state.phase = 'active'; state.activePlayerId = winner;
    state.players[winner === 'P1' ? 'P2' : 'P1'].hp = 0;
    state = step(state, { type: 'free-move', playerId: winner });
    state = step(state, { type: 'ready-series-match', playerId: 'P1' });
    state = step(state, { type: 'ready-series-match', playerId: 'P2' });
  }
  state.players.P1.perkMode!.remaining = ['windwalker-stance'];
  state.players.P1.deck = []; state.players.P1.hand = []; state.players.P1.discard = [];
  finish('P1');
  assert.equal(state.series?.match, 2);
  assert.equal(state.perkMode, true);
  assert.equal(drawnPerkCandidates(state.players.P1).length, 4, 'Match 2 starts with a fresh pool.');
  state.players.P2.perkMode!.remaining = ['force-pull'];
  state.players.P2.deck = []; state.players.P2.hand = []; state.players.P2.discard = [];
  finish('P2');
  assert.equal(state.series?.match, 3);
  assert.deepEqual(state.players.P1.perkMode?.remaining, ['windwalker-stance']);
  assert.deepEqual(state.players.P2.perkMode?.remaining, ['force-pull']);
}
const normal = createHotseatTestState(false, 'merylin', 2, 'dummy');
const regular = step(normal, { type: 'choose-focus-card', playerId: 'P1', cardId: 'lightbringer' });
assert.equal(regular.perkMode, undefined);
assert.ok(!regular.players.P1.deck.some((card) => card.cardId === 'perk-draw'));
assert.equal([...regular.players.P1.deck, ...regular.players.P1.hand].filter((card) => cardDefinition(card).kind === 'perk').length, 3);
console.log('Perk Mode checks passed: all configured rosters, opening order, queued draws, pool validation, Phase rewards, arenas, FFA, series carryover, and normal mode.');
