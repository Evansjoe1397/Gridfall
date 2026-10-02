import assert from 'node:assert/strict';
import { applyCommand, createBestOfThreeState, phaseCardCandidates, type CardTypeId, type GameState, type GameStateWithQuestPhases, type PlayerId } from '../shared/game.ts';

function step(state: GameState, command: Parameters<typeof applyCommand>[1]): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}
function finishMatch(state: GameState, winner: 'P1' | 'P2', round: number): GameState {
  const loser: PlayerId = winner === 'P1' ? 'P2' : 'P1';
  state.phase = 'active';
  state.activePlayerId = winner;
  state.turn = round;
  state.players[loser].hp = 0;
  return step(state, { type: 'free-move', playerId: winner });
}

const excludedStatuses: CardTypeId[] = ['pinned', 'headache', 'exhaust', 'burning', 'panic', 'blessing-light', 'blessing-prayer', 'blessing-might', 'blessing-shield', 'blessing-swiftness', 'blessing-faith'];
const questRewards: CardTypeId[] = ['fireball', 'firebolt', 'portal', 'portal-perk', 'vicious-mockery', 'vicious-mockery-1', 'banner', 'banner-draw', 'mythril-helmet', 'helmet', 'boomerang', 'boomerang-draw', 'monarch-flush', 'monarch-flush-perk', 'feint', 'weak-feint', 'sweet-potato'];
function allCards(state: GameState, playerId: PlayerId) {
  const player = state.players[playerId];
  return [...player.deck, ...player.hand, ...player.discard];
}
function finishRewardChoices(state: GameState): GameState {
  while (['choosing-phase-card', 'choosing-phase-three-card'].includes(state.phase)) {
    const reward = (state as GameStateWithQuestPhases).questPhases!.phaseReward!;
    const playerId = reward.pendingPlayerIds[0];
    if (reward.phase === 3) state = step(state, { type: 'phase-three-finish', playerId });
    else if (reward.playerProgress?.[playerId]?.selectedCardId) state = step(state, { type: 'phase-card-destination', playerId, destination: 'shuffle' });
    else state = step(state, { type: 'phase-card-choice', playerId, cardId: phaseCardCandidates(state, playerId)[0] });
  }
  return state;
}

const roster = { P1: ['shinobi', 'magician'], P2: ['orkk', 'spectre'] } as const;
assert.throws(() => createBestOfThreeState('tournament', { P1: ['shinobi', 'shinobi'], P2: roster.P2 }, true));
let state = createBestOfThreeState('tournament', roster, true);
assert.deepEqual([...state.series!.arenaOrder].sort(), ['nagrand', 'pipe', 'trench']);
assert.equal((state as GameState & { arenaId?: string }).arenaId, state.series!.arenaOrder[0]);
assert.equal(state.series?.match, 1);
assert.equal(state.players.P1.character, 'shinobi');
assert.equal(state.players.P2.character, 'orkk');
state.players.P1.deck = [{ instanceId: 'winner-one-card', cardId: 'attack-2', soulStrikeForcedUse: 'attack' }];
state.players.P1.hand = [{ instanceId: 'winner-one-status', cardId: 'pinned' }];
state.players.P1.discard = excludedStatuses.map((cardId) => ({ instanceId: `excluded-${cardId}`, cardId }));
state.players.P1.deck.push(...questRewards.map((cardId) => ({ instanceId: `reward-${cardId}`, cardId, oneTimeCopy: cardId === 'monarch-flush-perk' })));
state.players.P1.hand.push({ instanceId: 'temporary-copy', cardId: 'attack-3', oneTimeCopy: true });
state.players.P1.pinnedStacks = 2;
state.players.P1.traitBlocked = true;
state.players.P1.movementAnnulledByBlessedSwiftness = true;
state.players.P1.spellEcho = [{ instanceId: 'winner-one-echo', cardId: 'swiftform' }, null, null];
state.players.P1.matchStats!.attackDamage = 7;
state = finishMatch(state, 'P1', 11);
assert.deepEqual(state.series?.wins, { P1: 1, P2: 0 });
assert.equal(state.series?.results[0].arenaId, state.series?.arenaOrder[0]);
assert.equal(state.series?.results[0].players.P1.matchStats.attackDamage, 7);
assert.equal(state.series?.winningSnapshots.P1?.phase, 2);
assert.ok(state.series!.winningSnapshots.P1!.cards.every((card) => !excludedStatuses.includes(card.cardId)));
// Simulate an older saved snapshot; restoration must clean this too.
state.series!.winningSnapshots.P1!.cards.push({ instanceId: 'legacy-blessing', cardId: 'blessing-might' });
state = step(state, { type: 'ready-series-match', playerId: 'P1' });
assert.equal(state.series?.match, 1, 'One ready Player cannot start Match 2.');
assert.equal(applyCommand(state, { type: 'ready-series-match', playerId: 'P1' }).ok, false);
state = step(state, { type: 'ready-series-match', playerId: 'P2' });
assert.equal(state.series?.match, 2);
assert.equal((state as GameState & { arenaId?: string }).arenaId, state.series!.arenaOrder[1]);
assert.equal(state.players.P1.character, 'magician');
assert.equal(state.players.P2.character, 'spectre');
assert.equal(state.players.P1.hp, state.players.P1.maxHp);
assert.equal(state.players.P2.hp, state.players.P2.maxHp);
assert.equal(state.turn, 1);

state.players.P2.deck = [{ instanceId: 'winner-two-status', cardId: 'pinned' }, { instanceId: 'winner-two-card', cardId: 'attack-2' }];
state.players.P2.spellEcho = [null, { instanceId: 'winner-two-echo', cardId: 'replicate' }, null];
state.players.P2.matchStats!.perkDamage = 5;
state = finishMatch(state, 'P2', 2);
assert.deepEqual(state.series?.wins, { P1: 1, P2: 1 });
assert.equal(state.series?.results[1].players.P2.matchStats.perkDamage, 5);
state = step(state, { type: 'ready-series-match', playerId: 'P2' });
assert.equal(state.series?.match, 2);
state = step(state, { type: 'ready-series-match', playerId: 'P1' });
assert.equal(state.series?.match, 3);
assert.equal((state as GameState & { arenaId?: string }).arenaId, state.series!.arenaOrder[2]);
assert.equal(state.players.P1.character, 'shinobi');
assert.equal(state.players.P2.character, 'spectre');
assert.equal(state.players.P1.hp, state.players.P1.maxHp);
assert.equal(state.players.P2.hp, state.players.P2.maxHp);
assert.equal(state.turn, 11, 'Catch-up choices use the later completed Phase until play starts.');
assert.equal(state.players.P1.spellEcho[0]?.instanceId, 'winner-one-echo');
assert.equal(state.players.P2.spellEcho[1]?.instanceId, 'winner-two-echo');
for (const playerId of ['P1', 'P2'] as const) {
  assert.ok(allCards(state, playerId).every((card) => !excludedStatuses.includes(card.cardId)), 'Negative and Blessing Cards do not carry into Match 3.');
  assert.equal(state.players[playerId].pinnedStacks, 0);
  assert.ok(!state.players[playerId].traitBlocked);
  assert.equal(state.players[playerId].movementAnnulledByBlessedSwiftness, false);
  assert.equal(state.players[playerId].matchStats!.totalDamage, 0);
  assert.ok(allCards(state, playerId).every((card) => !card.soulStrikeForcedUse), 'Soul Strike forced-use effects do not carry into Match 3.');
}
for (const cardId of questRewards) assert.ok(allCards(state, 'P1').some((card) => card.instanceId === `reward-${cardId}`), `${cardId} Quest Reward carries into Match 3.`);
assert.ok(!allCards(state, 'P1').some((card) => card.instanceId === 'temporary-copy'));
assert.equal((state as GameStateWithQuestPhases).questPhases!.currentQuest, null, 'No Quest runs during catch-up choices.');
assert.deepEqual((state as GameStateWithQuestPhases).questPhases!.usedQuestIds, []);
assert.equal(state.phase, 'choosing-phase-card');
assert.equal((state as GameState & { questPhases?: { phaseReward?: { phase: number; pendingPlayerIds: PlayerId[] } } }).questPhases?.phaseReward?.phase, 1);
assert.deepEqual((state as GameState & { questPhases?: { phaseReward?: { pendingPlayerIds: PlayerId[] } } }).questPhases?.phaseReward?.pendingPlayerIds, ['P2']);
state = step(state, { type: 'phase-card-choice', playerId: 'P2', cardId: phaseCardCandidates(state, 'P2')[0] });
assert.equal((state as GameState & { questPhases?: { phaseReward?: { phase: number } } }).questPhases?.phaseReward?.phase, 2, 'Phase 2 follows the Phase 1 catch-up choice.');
state = step(state, { type: 'phase-card-choice', playerId: 'P2', cardId: phaseCardCandidates(state, 'P2')[0] });
assert.equal(state.phase, 'active', 'The deciding match starts after all missed rewards are selected.');
assert.equal(state.turn, 1, 'Round counting resets after the final catch-up reward.');
assert.equal(state.series!.catchupQueue, undefined);
assert.equal((state as GameStateWithQuestPhases).questPhases!.usedQuestIds.length, 1, 'Match 3 announces its first fresh Quest.');
assert.equal((state as GameStateWithQuestPhases).questPhases!.currentQuest!.announcedRound, 1);
assert.equal(allCards(state, 'P2').length, 3, 'The lagging winner retains both catch-up Cards and its original Card.');
const freshDecidingMatch = structuredClone(state);
state = finishMatch(state, 'P1', 11);
assert.deepEqual(state.series?.results.map((result) => result.winnerId), ['P1', 'P2', 'P1']);
assert.deepEqual(state.series?.results.map((result) => result.arenaId), state.series?.arenaOrder);
assert.deepEqual(state.series?.wins, { P1: 2, P2: 1 });

const sweep = createBestOfThreeState('duel', { P1: ['shinobi', 'shinobi'], P2: ['orkk', 'orkk'] }, true);
let sweepState = finishMatch(sweep, 'P1', 1);
sweepState = step(sweepState, { type: 'ready-series-match', playerId: 'P1' });
sweepState = step(sweepState, { type: 'ready-series-match', playerId: 'P2' });
sweepState = finishMatch(sweepState, 'P1', 1);
assert.equal(sweepState.series?.results.length, 2, 'A 2-0 series has two match results.');
assert.equal(applyCommand(sweepState, { type: 'ready-series-match', playerId: 'P1' }).ok, false, 'A 2-0 series ends after Match 2.');

let drawState = createBestOfThreeState('duel', { P1: ['shinobi', 'shinobi'], P2: ['orkk', 'orkk'] }, true);
const drawnArena = (drawState as GameState & { arenaId?: string }).arenaId;
drawState.phase = 'finished';
drawState.winner = null;
drawState = step(drawState, { type: 'ready-series-match', playerId: 'P1' });
drawState = step(drawState, { type: 'ready-series-match', playerId: 'P2' });
assert.equal(drawState.series?.match, 1, 'A drawn match is replayed without advancing the series.');
assert.equal((drawState as GameState & { arenaId?: string }).arenaId, drawnArena, 'A replay keeps its assigned arena.');
assert.deepEqual(drawState.series?.wins, { P1: 0, P2: 0 });

for (const hotseat of [true, false]) {
  for (const rounds of [[6, 6], [16, 1]] as const) {
    let deciding = createBestOfThreeState('tournament', roster, hotseat);
    deciding = finishMatch(deciding, 'P1', rounds[0]);
    deciding = step(deciding, { type: 'ready-series-match', playerId: 'P1' });
    deciding = step(deciding, { type: 'ready-series-match', playerId: 'P2' });
    deciding = finishMatch(deciding, 'P2', rounds[1]);
    deciding = step(deciding, { type: 'ready-series-match', playerId: 'P1' });
    deciding = step(deciding, { type: 'ready-series-match', playerId: 'P2' });
    deciding = finishRewardChoices(deciding);
    assert.equal(deciding.turn, 1, 'Equal progression and three-Phase catch-up both start Round 1 in hotseat and online.');
    assert.equal((deciding as GameStateWithQuestPhases).questPhases!.usedQuestIds.length, 1);
    deciding.phase = 'finished';
    deciding.winner = null;
    deciding = step(deciding, { type: 'ready-series-match', playerId: 'P1' });
    deciding = step(deciding, { type: 'ready-series-match', playerId: 'P2' });
    deciding = finishRewardChoices(deciding);
    assert.equal(deciding.turn, 1, 'A drawn Match 3 replay resets its timer and Quest history again.');
    assert.equal((deciding as GameStateWithQuestPhases).questPhases!.usedQuestIds.length, 1);
  }
}

// Play all five fresh Quests through normal turn and Phase transitions.
let fullMatch = structuredClone(freshDecidingMatch) as GameStateWithQuestPhases;
fullMatch.players.P2.matchStats!.totalDamage = 10;
for (let turns = 0; fullMatch.phase !== 'finished'; turns++) {
  assert.ok(turns < 60, 'The fresh Match 3 must finish within five Quests.');
  fullMatch = finishRewardChoices(fullMatch) as GameStateWithQuestPhases;
  const beforeCount = fullMatch.questPhases!.usedQuestIds.length;
  for (const player of Object.values(fullMatch.players)) player.hand = [];
  fullMatch = step(fullMatch, { type: 'end-turn', playerId: fullMatch.activePlayerId }) as GameStateWithQuestPhases;
  if (fullMatch.phase === 'finished') assert.equal(beforeCount, 5, 'Earlier Quests cannot trigger the tiebreaker.');
  else assert.ok(fullMatch.questPhases!.usedQuestIds.length <= 5);
  if (fullMatch.questPhases!.phaseReward) assert.ok(fullMatch.turn > 1, 'Normal Phase rewards do not reset the timer again.');
}
assert.equal(fullMatch.winner, 'P2', 'Match 3 uses its own fresh statistics for the fifth-Quest tiebreaker.');
assert.equal(fullMatch.series!.wins.P2, 2);
assert.equal(fullMatch.series!.results.length, 3);
assert.equal(fullMatch.questPhases!.currentQuest, null);
assert.equal(fullMatch.questPhases!.usedQuestIds.length, 5);

// A shorter fifth Quest ends before the next Phase boundary, after both last turns.
let fifth = structuredClone(freshDecidingMatch) as GameStateWithQuestPhases;
fifth.turn = 23;
fifth.activePlayerId = 'P1';
(fifth as GameState & { roundFirstPlayerId: PlayerId }).roundFirstPlayerId = 'P1';
fifth.players.P1.hand = [];
fifth.players.P2.hand = [];
fifth.players.P2.matchStats!.totalDamage = 4;
fifth.questPhases!.usedQuestIds = ['rabbit-run', 'provocateur', 'tank-junior', 'the-spy', 'damage-contest'];
fifth.questPhases!.currentQuest = { id: 'damage-contest', announcedRound: 21, endsAfterRound: 23, winners: [], progress: { P1: 3, P2: 1 } };
fifth = step(fifth, { type: 'end-turn', playerId: 'P1' }) as GameStateWithQuestPhases;
assert.equal(fifth.phase, 'active', 'The fifth Quest stays active for the last Player turn.');
fifth = step(fifth, { type: 'end-turn', playerId: 'P2' }) as GameStateWithQuestPhases;
assert.equal(fifth.turn, 24);
assert.equal(fifth.phase, 'finished', 'No waiting for Round 26 after the fifth Quest completes.');
assert.equal(fifth.winner, 'P2');
assert.ok(fifth.players.P1.hand.some((card) => card.cardId === 'fireball'), 'The fifth Quest reward resolves before the tiebreaker.');

// Early Conqueror completion also ends the fifth Quest immediately.
let conqueror = structuredClone(freshDecidingMatch) as GameStateWithQuestPhases;
conqueror.turn = 21;
conqueror.activePlayerId = 'P2';
(conqueror as GameState & { roundFirstPlayerId: PlayerId }).roundFirstPlayerId = 'P1';
// The carried Flag starts with P1 already on its original arena starting Base.
conqueror.players.P1.hand = [];
conqueror.players.P2.hand = [];
conqueror.players.P1.matchStats!.totalDamage = 9;
conqueror.questPhases!.usedQuestIds = ['rabbit-run', 'provocateur', 'tank-junior', 'the-spy', 'capture-the-flag'];
conqueror.questPhases!.currentQuest = { id: 'capture-the-flag', announcedRound: 21, endsAfterRound: 25, winners: [], progress: { P1: 1 } };
conqueror.questPhases!.captureTheFlag = { flags: [{ id: 'enemy-flag', ownerId: 'P2', homeSquares: [{ x: 1, y: 0 }, { x: 1, y: 1 }], homeAnchor: { x: 1, y: 0.5 }, status: 'carried', carrierId: 'P1', droppedAt: null, grabbedFromHome: true }] };
conqueror = step(conqueror, { type: 'end-turn', playerId: 'P2' }) as GameStateWithQuestPhases;
assert.equal(conqueror.turn, 22);
assert.equal(conqueror.phase, 'finished', 'Early fifth-Quest completion cannot be overwritten by turn-start processing.');
assert.equal(conqueror.winner, 'P1');
assert.ok(conqueror.players.P1.hand.some((card) => card.cardId === 'banner'));
assert.equal(conqueror.questPhases!.usedQuestIds.length, 5);

console.log('Best-of-Three checks passed.');
