import assert from 'node:assert/strict';
import { STARTING_DECKS, applyCommand, baseSquareAt, cardDefinition, createHotseatTestState, kamelotChanges, type Cell, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};
const fresh = (): GameState => {
  const state = createHotseatTestState(true, 'merylin', 2);
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  return state;
};
let serial = 0;
const castAt = (state: GameState, label: string): GameState => {
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.players.P1.position = cell(label);
  state.players.P1.actionsRemaining = 2;
  state.players.P1.perkUsed = false;
  const instanceId = `kamelot-${++serial}`;
  state.players.P1.hand = [{ instanceId, cardId: 'kamelot-stance' }];
  return step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: instanceId, destination: 'direct' });
};

assert.deepEqual(STARTING_DECKS.merylin.defaults.filter((cardId) => cardId.endsWith('-stance')), ['kamelot-stance', 'windwalker-stance', 'carian-stance']);
assert.equal(cardDefinition({ instanceId: 'description', cardId: 'kamelot-stance' }).levelEffects?.[0], 'Turn a Square you occupy into your Base Square or add +1 to its value. Maximum 3 changes.');
assert.deepEqual(STARTING_DECKS.merylin.perkPhase, ['barbarian-stance', 'spellsinger-stance']);
const testRoomStarters = createHotseatTestState(true, 'merylin', 2).players.P1.hand.map((card) => card.cardId);
for (const cardId of ['kamelot-stance', 'windwalker-stance', 'carian-stance']) assert.ok(testRoomStarters.includes(cardId), `${cardId} starts in the Test Room Hand.`);
for (const cardId of ['barbarian-stance', 'spellsinger-stance']) assert.ok(!testRoomStarters.includes(cardId), `${cardId} is a Focus choice.`);
let opening = createHotseatTestState(false, 'merylin', 2);
opening = step(opening, { type: 'choose-focus', playerId: 'P1', focus: 'attack' });
opening = step(opening, { type: 'choose-focus-card', playerId: 'P1', cardId: 'lightbringer' });
const openingCards = [...opening.players.P1.hand, ...opening.players.P1.deck].map((card) => card.cardId);
for (const cardId of ['kamelot-stance', 'windwalker-stance', 'carian-stance']) assert.ok(openingCards.includes(cardId), `${cardId} is in Merylin's opening deck.`);
for (const cardId of ['barbarian-stance', 'spellsinger-stance']) assert.ok(!openingCards.includes(cardId), `${cardId} is reserved for the later Perk choice.`);

let painted = castAt(fresh(), 'B4');
assert.equal(baseSquareAt(painted, 'B4')?.ownerId, 'P1');
assert.equal(baseSquareAt(painted, 'B4')?.value, 1);
assert.equal(baseSquareAt(painted, 'B4')?.ready, true);
painted.players.P2.position = cell('C4');
painted.players.P1.hand = [{ instanceId: 'defend', cardId: 'defend-1' }];
painted.players.P2.hand = [{ instanceId: 'attack', cardId: 'attack-2' }];
painted = step(painted, { type: 'end-turn', playerId: 'P1' });
assert.equal(baseSquareAt(painted, 'B4')?.ready, true, 'Ending the turn retains the active Base defense.');
const attacked = step(painted, { type: 'attack', playerId: 'P2', cardInstanceId: 'attack', targetId: 'P1', targetKind: 'player' });
const defended = step(attacked, { type: 'defend', playerId: 'P1', cardInstanceId: 'defend' });
assert.equal(defended.combatReveal?.defendTotal, 2, 'A painted Base grants +1 DEF to cards.');

// Force Pull onto a painted Base grants DEF immediately, including older saved tiles.
for (const legacyUnready of [false, true]) {
  for (const simultaneousCombatStack of [false, true]) {
    let matchup = castAt(fresh(), 'B6');
    (matchup as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = simultaneousCombatStack;
    matchup.players.P2.character = 'shinobi';
    matchup.players.P2.position = cell('C6');
    matchup.players.P2.lightsaberBuff = true;
    matchup.players.P1.hand = [{ instanceId: 'decisive', cardId: 'decisive-block' }];
    matchup.players.P2.hand = [{ instanceId: 'saber', cardId: 'light-the-saber' }];
    if (legacyUnready) (kamelotChanges(matchup)[0] as { ready: boolean }).ready = false;
    matchup.players.P1.position = cell('A6');
    matchup.activePlayerId = 'P2';
    matchup.players.P2.actionsRemaining = 2;
    matchup.players.P2.hand.push({ instanceId: 'pull', cardId: 'force-pull' });
    matchup = step(matchup, { type: 'play-perk', playerId: 'P2', cardInstanceId: 'pull', destination: 'direct' });
    matchup = step(matchup, { type: 'force-pull-target', playerId: 'P2', targetKind: 'player', targetId: 'P1' });
    assert.deepEqual(matchup.players.P1.position, cell('B6'), 'Force Pull moves Merylin onto her Base.');
    matchup = step(matchup, { type: 'attack', playerId: 'P2', cardInstanceId: 'saber', targetId: 'P1', targetKind: 'player' });
    matchup = step(matchup, { type: 'defend', playerId: 'P1', cardInstanceId: 'decisive' });
    assert.equal(matchup.combatReveal?.attackTotal, 3, 'Active Lightsaber adds +1 ATT.');
    assert.equal(matchup.combatReveal?.defendTotal, 4, 'Decisive Block receives Base DEF immediately after Force Pull.');
    assert.equal(matchup.combatReveal?.defendModifiers?.some((modifier) => modifier.source === 'own Base' && modifier.value === 1), true);
  }
}

let leftBeforeTurnEnd = castAt(fresh(), 'B4');
leftBeforeTurnEnd.players.P1.position = cell('B5');
leftBeforeTurnEnd = step(leftBeforeTurnEnd, { type: 'end-turn', playerId: 'P1' });
assert.equal(baseSquareAt(leftBeforeTurnEnd, 'B4')?.ready, true, 'Leaving before turn end does not deactivate the painted Base.');

let upgraded = castAt(fresh(), 'A4');
assert.equal(baseSquareAt(upgraded, 'A4')?.value, 2, 'An existing friendly Base is upgraded.');
assert.equal(baseSquareAt(upgraded, 'A4')?.ready, true);
upgraded = step(upgraded, { type: 'end-turn', playerId: 'P1' });
assert.equal(baseSquareAt(upgraded, 'A4')?.ready, true);
assert.equal(baseSquareAt(upgraded, 'A4')?.value, 2);
upgraded.players.P2.position = cell('B4');
upgraded.players.P1.hand = [{ instanceId: 'upgraded-defend', cardId: 'defend-1' }];
upgraded.players.P2.hand = [{ instanceId: 'upgraded-attack', cardId: 'attack-2' }];
const upgradedAttack = step(upgraded, { type: 'attack', playerId: 'P2', cardInstanceId: 'upgraded-attack', targetId: 'P1', targetKind: 'player' });
const upgradedDefense = step(upgradedAttack, { type: 'defend', playerId: 'P1', cardInstanceId: 'upgraded-defend' });
assert.equal(upgradedDefense.combatReveal?.defendTotal, 3, 'An upgraded Base grants +2 DEF to cards.');
upgraded = castAt(upgraded, 'A4');
assert.equal(baseSquareAt(upgraded, 'A4')?.value, 3, 'A second upgrade raises the Base to +3 DEF.');
assert.equal(baseSquareAt(upgraded, 'A4')?.ready, true);
upgraded = step(upgraded, { type: 'end-turn', playerId: 'P1' });
assert.equal(baseSquareAt(upgraded, 'A4')?.ready, true);
upgraded.players.P1.hand = [{ instanceId: 'perfected-defend', cardId: 'defend-1' }];
upgraded.players.P2.hand = [{ instanceId: 'perfected-attack', cardId: 'attack-2' }];
const perfectedAttack = step(upgraded, { type: 'attack', playerId: 'P2', cardInstanceId: 'perfected-attack', targetId: 'P1', targetKind: 'player' });
const perfectedDefense = step(perfectedAttack, { type: 'defend', playerId: 'P1', cardInstanceId: 'perfected-defend' });
assert.equal(perfectedDefense.combatReveal?.defendTotal, 4, 'A twice upgraded Base grants +3 DEF to a defending Merylin.');
const capped = upgraded;
capped.activePlayerId = 'P1'; capped.phase = 'active'; capped.players.P1.perkUsed = false;
capped.players.P1.hand = [{ instanceId: 'capped', cardId: 'kamelot-stance' }];
assert.equal(applyCommand(capped, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'capped', destination: 'direct' }).ok, false, 'A Base cannot be raised above +3 DEF.');

let yellow = castAt(fresh(), 'D1');
assert.equal(baseSquareAt(yellow, 'D1')?.ownerId, 'P1', 'A Yellow Square becomes Merylin\'s Base.');
yellow = step(yellow, { type: 'end-turn', playerId: 'P1' });
yellow = step(yellow, { type: 'end-turn', playerId: 'P2' });
assert.ok(!yellow.log.some((line) => line.includes('started the turn on D1 and drew')), 'A repainted Yellow Square no longer grants a draw.');
const enemyBase = castAt(fresh(), 'H4');
assert.equal(baseSquareAt(enemyBase, 'H4')?.ownerId, 'P1', 'An enemy Base changes ownership.');
enemyBase.players.P1.position = cell('G4');
enemyBase.players.P2.position = cell('H4');
enemyBase.players.P1.merylinSummonActive = true;
enemyBase.players.P1.hand = [{ instanceId: 'enemy-base-attack', cardId: 'attack-2' }];
enemyBase.players.P2.hand = [{ instanceId: 'enemy-base-defend', cardId: 'defend-1' }];
const enemyBaseAttack = step(enemyBase, { type: 'attack', playerId: 'P1', cardInstanceId: 'enemy-base-attack', targetId: 'P2', targetKind: 'player' });
const enemyBaseDefense = step(enemyBaseAttack, { type: 'defend', playerId: 'P2', cardInstanceId: 'enemy-base-defend' });
assert.equal(enemyBaseDefense.combatReveal?.defendTotal, 1, 'A repainted enemy Base grants its former owner no DEF.');

let queue = fresh();
for (const label of ['B2', 'B3', 'B4']) queue = castAt(queue, label);
assert.equal(kamelotChanges(queue).length, 3);
queue = castAt(queue, 'B5');
assert.equal(baseSquareAt(queue, 'B2'), null, 'The fourth change reverts the oldest paint.');
assert.equal(kamelotChanges(queue).length, 3);
queue = castAt(queue, 'B6');
assert.equal(baseSquareAt(queue, 'B3'), null, 'The fifth change reverts the second paint.');
assert.deepEqual(kamelotChanges(queue).map((change) => change.label), ['B4', 'B5', 'B6']);

const levelThree = fresh();
levelThree.players.P1.position = cell('B4');
levelThree.players.P1.spellEcho = [null, null, { instanceId: 'kamelot-level-three', cardId: 'kamelot-stance' }];
levelThree.players.P1.hand = [{ instanceId: 'followup-perk', cardId: 'carian-stance' }];
const afterKamelot = step(levelThree, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(afterKamelot.players.P1.spellsingerExtraPerkUses, 1, 'Level 3 grants one extra Perk use.');
assert.equal(afterKamelot.players.P1.spellsingerExtraAttacks, 1, 'Level 3 grants one Attack-only Action.');
const afterFollowup = step(afterKamelot, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'followup-perk', destination: 'direct' });
assert.equal(afterFollowup.players.P1.spellsingerExtraPerkUses, 0, 'The followup Perk consumes the allowance.');
assert.equal(afterFollowup.players.P1.actionsRemaining, 0, 'The normal Actions are exhausted after the second Perk.');
afterFollowup.players.P1.spellsingerExtraPerkUses = 1;
afterFollowup.players.P1.hand = [{ instanceId: 'third-perk', cardId: 'windwalker-stance' }, { instanceId: 'extra-attack', cardId: 'attack-2' }];
afterFollowup.players.P2.position = cell('C4');
assert.equal(applyCommand(afterFollowup, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'third-perk', destination: 'direct' }).ok, false, 'The extra Action cannot play a Perk.');
const extraAttack = step(afterFollowup, { type: 'attack', playerId: 'P1', cardInstanceId: 'extra-attack', targetId: 'P2', targetKind: 'player' });
assert.equal(extraAttack.players.P1.spellsingerExtraAttacks, 0, 'An Attack Card consumes the extra Action.');
assert.equal(extraAttack.players.P1.actionsRemaining, 0);
const expiredExtraAttack = step(afterKamelot, { type: 'end-turn', playerId: 'P1' });
assert.equal(expiredExtraAttack.players.P1.spellsingerExtraAttacks, 0, 'The extra Attack Action expires at turn end.');

console.log('Kamelot Stance checks passed.');
