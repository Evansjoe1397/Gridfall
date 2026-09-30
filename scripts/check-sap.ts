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
  'A target in Range chooses a Defend Card to reveal',
  '+2 Range, reveal all Defend cards.',
  'Force the target to discard the highest occupied Perk from Spell Echo.',
]);

const levelOne = begin(setup(1, 2), 1);
assert.equal((levelOne as GameState & { sap?: { range: number } }).sap?.range, 2);
const singleReveal = step(levelOne, { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
assert.equal(singleReveal.phase, 'active', 'Level 1 automatically reveals the only Defend Card.');
assert.equal(isCardRevealedToOpponents(singleReveal.players.P2, singleReveal.players.P2.hand[0], 'P1'), true);
type NoticeState = GameState & { privateNotice?: { playerId: string; message: string } };
assert.equal((singleReveal as NoticeState).privateNotice?.playerId, 'P2', 'The reveal notice belongs to the targeted player.');
assert.equal((singleReveal as NoticeState).privateNotice?.message, 'You have revealed Defend Card to Wreckna.');

const multiple = setup(1, 2);
multiple.players.P2.hand.push({ instanceId: 'second-defend', cardId: 'block' });
let manual = step(begin(multiple, 1), { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
assert.equal(manual.phase, 'choosing-sap-defend', 'Level 1 still asks the target to choose when several Defend Cards are held.');
assert.equal(applyCommand(manual, { type: 'sap-defend-reveal', playerId: 'P2', cardInstanceId: 'attack' }).ok, false);
manual = step(manual, { type: 'sap-defend-reveal', playerId: 'P2', cardInstanceId: 'second-defend' });
assert.equal(manual.phase, 'active');
assert.equal(isCardRevealedToOpponents(manual.players.P2, manual.players.P2.hand[0], 'P1'), false, 'The unchosen Defend Card stays hidden.');
assert.equal((manual as NoticeState).privateNotice?.message, 'You have revealed Block to Wreckna.');
const levelOneTooFar = begin(setup(1, 3), 1);
assert.equal(applyCommand(levelOneTooFar, { type: 'sap-target', playerId: 'P1', targetId: 'P2' }).ok, false, 'Level 1 retains Wreckna\'s normal Range.');

let levelTwo = begin(setup(2, 4), 2);
levelTwo.players.P2.hand.push({ instanceId: 'second-defend', cardId: 'block' });
assert.equal((levelTwo as GameState & { sap?: { range: number } }).sap?.range, 4, 'Level 2 gains +2 Range.');
levelTwo = step(levelTwo, { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
assert.equal(levelTwo.phase, 'active', 'Level 2 automatically reveals all Defend Cards.');
const revealed = levelTwo.players.P2.hand.find((card) => card.instanceId === 'defend')!;
assert.equal(levelTwo.phase, 'active');
assert.equal(levelTwo.players.P2.hand.includes(revealed), true, 'The revealed Defend Card remains in Hand.');
assert.equal(isCardRevealedToOpponents(levelTwo.players.P2, revealed, 'P1'), true, 'The card is revealed to Wreckna.');
assert.equal(isCardRevealedToOpponents(levelTwo.players.P2, revealed, 'P3'), false, 'Sap does not reveal the Card to another opponent.');
assert.equal(isCardRevealedToOpponents(levelTwo.players.P2, levelTwo.players.P2.hand[2], 'P1'), true);
assert.equal(isCardRevealedToOpponents(levelTwo.players.P2, levelTwo.players.P2.hand[1], 'P1'), false, 'Attack Cards remain hidden.');
assert.equal((levelTwo as NoticeState).privateNotice?.playerId, 'P2');
assert.equal((levelTwo as NoticeState).privateNotice?.message, 'All Defend cards were revealed to Wreckna.');
assert.equal(levelTwo.players.P2.hand.length, 3, 'All revealed Cards stay in Hand.');

let levelThree = begin(setup(3, 4), 3);
levelThree.players.P2.spellEcho = [
  { instanceId: 'echo-one', cardId: 'echo-pulse' },
  { instanceId: 'echo-two', cardId: 'magic-hand' },
  null,
];
levelThree = step(levelThree, { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
assert.equal(levelThree.phase, 'active', 'Level 3 inherits the automatic all-Defend reveal.');
assert.equal(levelThree.players.P2.spellEcho[1], null, 'Level 3 discards the highest occupied Spell Echo Perk.');
assert.equal(levelThree.players.P2.spellEcho[0]?.instanceId, 'echo-one');
assert.equal(levelThree.players.P2.discard.some((card) => card.instanceId === 'echo-two'), true);

const noDefense = step(begin(setup(3, 4, false), 3), { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
const notice = (noDefense as GameState & { privateNotice?: { playerId: string; message: string } }).privateNotice;
assert.equal(noDefense.phase, 'active');
assert.equal(notice?.playerId, 'P1');
assert.match(notice?.message ?? '', /no Defend Card to reveal/i);

console.log('Sap checks passed: automatic single/all Defend reveal, manual Level 1 choice, +2 Range, unchanged Spell Echo discard, and private notices.');
