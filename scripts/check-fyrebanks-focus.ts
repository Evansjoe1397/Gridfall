import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, CharacterIdSchema, createHotseatTestState, createPipeTestState, createTrenchTestState, createBestOfThreeState, drawCards, enablePerkMode, phaseCardCandidates, STARTING_DECKS, type CardTypeId, type GameCommand, type GameState, type GameStateWithQuestPhases } from '../shared/game.ts';

const definition = STARTING_DECKS.fyrebanks;
assert.deepEqual(definition.attackFocus, ['pocket-lens', 'immolate-improved']);
assert.deepEqual(definition.defendFocus, ['wall-of-fire', 'breezy']);
assert.deepEqual(definition.perkPhase, ['lens', 'fyrestarter']); assert.equal(definition.reserve, 'evocation');
assert.equal(new Set(Object.values(definition).flat()).size, 15, 'Complete roster: nine base Cards plus six phase Cards.');
assert.equal(CharacterIdSchema.safeParse('fyrebanks').success, false, 'Hotseat-only access is preserved.');
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return result.state;
}
function finishOpening(state: GameState, selected: CardTypeId = 'pocket-lens'): GameState {
  while (['choosing-focus', 'choosing-focus-card'].includes(state.phase)) {
    const opening = (state as any).openingSetup;
    const id = opening.pendingPlayerIds[0];
    state = step(state, { type: 'choose-focus-card', playerId: id, cardId: selected });
  }
  return state;
}
function boundary(state: GameState, turn: number): GameState {
  state.turn = turn; state.activePlayerId = 'P2';
  for (const player of Object.values(state.players)) player.freeMoveUsed = true;
  state = step(state, { type: 'end-turn', playerId: 'P2' });
  if (state.phase === 'choosing-end-discard') {
    while (state.players.P2.hand.length > 5) {
      const card = state.players.P2.hand.find((card) => { const def = cardDefinition(card); return !def.cannotBeDiscarded && (def.kind !== 'status' || def.canDiscardForHandLimit); })!;
      state = step(state, { type: 'discard-card', playerId: 'P2', cardInstanceId: card.instanceId });
    }
    state = step(state, { type: 'end-turn', playerId: 'P2' });
  }
  return state;
}
function finishRewards(state: GameState): GameState {
  const q = (state as GameStateWithQuestPhases).questPhases!; q.lastQuestWinners = [];
  while (['choosing-phase-card', 'choosing-phase-three-card'].includes(state.phase)) {
    const id = q.phaseReward!.pendingPlayerIds[0];
    state = step(state, q.phaseReward!.phase === 3 ? { type: 'phase-three-finish', playerId: id }
      : { type: 'phase-card-choice', playerId: id, cardId: phaseCardCandidates(state, id)[0] });
    Object.assign(q, (state as GameStateWithQuestPhases).questPhases!);
  }
  return state;
}
for (const selected of [...definition.attackFocus, ...definition.defendFocus]) {
  let state = createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks');
  assert.equal(state.phase, 'choosing-focus');
  assert.equal(applyCommand(state, { type: 'choose-focus-card', playerId: 'P1', cardId: 'fyrestarter' }).ok, false, 'Perk phase Cards cannot be opening Focus Cards.');
  state = finishOpening(state, selected);
  assert.equal(state.phase, 'active');
  for (const player of Object.values(state.players)) {
    assert.ok(player.hand.some((card) => card.cardId === 'evocation'));
    assert.equal(player.hand.length, player.id === 'P1' ? 3 : 4);
    assert.equal(player.deck.at(-1)?.cardId, selected); assert.equal(player.knownTopCardId, selected);
    assert.equal(player.hand.length + player.deck.length, 10);
    assert.deepEqual([...player.hand, ...player.deck].map((card) => card.cardId).sort(), [...definition.defaults, selected].sort());
  }
  const preview = structuredClone(state); drawCards(preview.players.P1, 1); assert.equal(preview.players.P1.hand.at(-1)?.cardId, selected);
  state = boundary(state, 5); assert.equal(state.phase, 'choosing-phase-card', 'Fyrebanks receives Phase 1 rewards at Round 6.');
  for (const id of ['P1', 'P2'] as const) assert.deepEqual(phaseCardCandidates(state, id).sort(), [...definition.attackFocus, ...definition.defendFocus].filter((card) => card !== selected).sort());
  state = finishRewards(state); state = boundary(state, 10);
  assert.equal((state as GameStateWithQuestPhases).questPhases!.phaseReward?.phase, 2);
  assert.deepEqual(phaseCardCandidates(state, 'P1'), ['lens', 'fyrestarter']);
  state = finishRewards(state); state = boundary(state, 15);
  assert.equal(state.phase, 'choosing-phase-three-card', 'Phase 3 refinement also includes Fyrebanks.');
  state = finishRewards(state); assert.equal(state.phase, 'active');
}

for (const create of [() => createPipeTestState(false, 'fyrebanks', 'fyrebanks'), () => createTrenchTestState(false, 'fyrebanks', 'fyrebanks'), () => createHotseatTestState(false, 'fyrebanks', 3), () => createBestOfThreeState('duel', { P1: ['fyrebanks', 'fyrebanks'], P2: ['fyrebanks', 'fyrebanks'] }, true)]) {
  const state = finishOpening(create(), 'breezy');
  for (const player of Object.values(state.players).filter((player) => player.character === 'fyrebanks')) {
    assert.ok(player.hand.some((card) => card.cardId === 'evocation')); assert.equal(player.deck.at(-1)?.cardId, 'breezy');
  }
}
let state = createHotseatTestState(false, 'fyrebanks', 2, 'dummy');
state = step(state, { type: 'choose-focus', playerId: 'P1', focus: 'defend' }); assert.equal(state.phase, 'choosing-focus-card');
state = step(state, { type: 'back-focus-choice', playerId: 'P1' }); assert.equal(state.phase, 'choosing-focus');
assert.equal(applyCommand(state, { type: 'choose-focus-card', playerId: 'P2', cardId: 'breezy' }).ok, false);
enablePerkMode(state); state = finishOpening(state);
assert.equal(state.players.P1.perkMode?.remaining.length, 7, 'Chosen opening Focus is removed from the Perk Mode pool.');
assert.equal(state.players.P1.deck.filter((card) => card.cardId === 'perk-draw').length, 2);
assert.deepEqual(state.players.P1.hand.filter((card) => ['evocation', 'flame-ward', 'ray-of-fire', 'lens', 'fyrestarter'].includes(card.cardId)).map((card) => card.cardId), ['evocation']);

// A deciding match grants the earlier winner their missing phase rewards.
state = finishOpening(createBestOfThreeState('duel', { P1: ['fyrebanks', 'fyrebanks'], P2: ['fyrebanks', 'fyrebanks'] }, true));
for (const [winner, round] of [['P1', 6], ['P2', 11]] as const) {
  state.turn = round; state.phase = 'active'; state.activePlayerId = winner; state.players[winner].freeMoveUsed = false; state.players[winner === 'P1' ? 'P2' : 'P1'].hp = 0;
  state = step(state, { type: 'free-move', playerId: winner });
  state = step(state, { type: 'ready-series-match', playerId: 'P1' });
  state = step(state, { type: 'ready-series-match', playerId: 'P2' });
  if (state.series?.match === 2) state = finishOpening(state);
}
assert.equal(state.series?.match, 3); assert.equal(state.phase, 'choosing-phase-card');
assert.equal((state as GameStateWithQuestPhases).questPhases!.phaseReward?.phase, 2);
assert.deepEqual(phaseCardCandidates(state, 'P1'), ['lens', 'fyrestarter']);
state = finishRewards(state); assert.equal(state.turn, 1); assert.equal(state.phase, 'active');
console.log('Fyrebanks Focus checks passed: all four opening choices, reserve/top-card/second-player draw, real Phase 1/2/3 transitions, arenas/FFA/series, ownership/back, Perk Mode and Hotseat gate.');
