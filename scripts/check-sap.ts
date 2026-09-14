import assert from 'node:assert/strict';
import { CARDS, applyCommand, createHotseatTestState, isCardRevealedToOpponents, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}

function setup(level: 1 | 2 | 3, range: number, withDefense = true): GameState {
  const state = createHotseatTestState(true, 'wreckna', 2, 'shinobi');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 2 + range, y: 2 };
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = [];
    player.spellEcho = [null, null, null];
    player.actionsRemaining = 2; player.perkUsed = false;
  }
  state.players.P1.spellEcho[level - 1] = { instanceId: 'sap', cardId: 'sap' };
  state.players.P2.hand = withDefense
    ? [{ instanceId: 'defend', cardId: 'defend-1' }, { instanceId: 'attack', cardId: 'attack-2' }]
    : [{ instanceId: 'attack', cardId: 'attack-2' }];
  return state;
}

function begin(state: GameState, level: 1 | 2 | 3): GameState {
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
}

const sap = CARDS.find((card) => card.id === 'sap');
assert.deepEqual(sap?.levelEffects, [
  'Target in Range chooses a Defend card to Reveal',
  '+2 Range',
  'Force the target to discard the highest occupied Perk from Spell Echo, checking level 3, then 2, then 1',
]);

const levelOne = begin(setup(1, 2), 1);
assert.equal((levelOne as GameState & { sap?: { range: number } }).sap?.range, 2);
assert.equal(applyCommand(levelOne, { type: 'sap-target', playerId: 'P1', targetId: 'P2' }).ok, true);
const levelOneTooFar = begin(setup(1, 3), 1);
assert.equal(applyCommand(levelOneTooFar, { type: 'sap-target', playerId: 'P1', targetId: 'P2' }).ok, false, 'Level 1 retains Wreckna\'s normal Range.');

let levelTwo = begin(setup(2, 4), 2);
assert.equal((levelTwo as GameState & { sap?: { range: number } }).sap?.range, 4, 'Level 2 gains +2 Range.');
levelTwo = step(levelTwo, { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
assert.equal(levelTwo.phase, 'choosing-sap-defend');
assert.equal(applyCommand(levelTwo, { type: 'sap-defend-reveal', playerId: 'P2', cardInstanceId: 'attack' }).ok, false, 'Only a Defend Card can be revealed.');
levelTwo = step(levelTwo, { type: 'sap-defend-reveal', playerId: 'P2', cardInstanceId: 'defend' });
const revealed = levelTwo.players.P2.hand.find((card) => card.instanceId === 'defend')!;
assert.equal(levelTwo.phase, 'active');
assert.equal(levelTwo.players.P2.hand.includes(revealed), true, 'The revealed Defend Card remains in Hand.');
assert.equal(isCardRevealedToOpponents(levelTwo.players.P2, revealed, 'P1'), true, 'The card is revealed to Wreckna.');

let levelThree = begin(setup(3, 4), 3);
levelThree.players.P2.spellEcho = [
  { instanceId: 'echo-one', cardId: 'echo-pulse' },
  { instanceId: 'echo-two', cardId: 'magic-hand' },
  null,
];
levelThree = step(levelThree, { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
assert.equal(levelThree.phase, 'choosing-sap-defend');
assert.equal(levelThree.players.P2.spellEcho[1]?.instanceId, 'echo-two', 'Level 3 waits for the manual reveal.');
levelThree = step(levelThree, { type: 'sap-defend-reveal', playerId: 'P2', cardInstanceId: 'defend' });
assert.equal(levelThree.players.P2.spellEcho[1], null, 'Level 3 discards the highest occupied Spell Echo Perk.');
assert.equal(levelThree.players.P2.spellEcho[0]?.instanceId, 'echo-one');
assert.equal(levelThree.players.P2.discard.some((card) => card.instanceId === 'echo-two'), true);

const noDefense = step(begin(setup(3, 4, false), 3), { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
const notice = (noDefense as GameState & { privateNotice?: { playerId: string; message: string } }).privateNotice;
assert.equal(noDefense.phase, 'active');
assert.equal(notice?.playerId, 'P1');
assert.match(notice?.message ?? '', /no Defend Card to reveal/i);

console.log('Sap checks passed: manual Defend reveal, cumulative +2 Range, delayed level-3 payoff, and private no-card notice.');
