import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, simulateGameCommand, type GameCommand, type GameState, type GameStateWithQuestPhases } from '../shared/game.ts';
import { observeMerylinMatch } from '../src/merylin-bot-observation.ts';
import { chooseMerylinCommand, merylinCandidates, merylinDecisionPending } from '../src/merylin-bot.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return result.state;
}
function setup(): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'merylin');
  state.phase = 'active'; state.activePlayerId = 'P2'; state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = true;
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.movementRemaining = 0; player.freeMoveUsed = true; player.actionsRemaining = 2;
  }
  state.players.P1.position = { x: 3, y: 3 }; state.players.P2.position = { x: 5, y: 3 };
  return state;
}
const bot = (state: GameState) => {
  const before = JSON.stringify(state);
  const choice = chooseMerylinCommand(observeMerylinMatch(state));
  assert.equal(JSON.stringify(state), before, 'Planning never mutates live state');
  assert.ok(choice, `Bot has a decision at ${state.phase}`);
  const result = applyCommand(state, choice.command);
  assert.ok(result.ok, `${choice.command.type}: ${result.ok ? '' : result.error}`);
  return choice;
};

let state = setup(); state.players.P2.merylinSummonActive = true;
state.players.P2.hand = [{ instanceId: 'blade', cardId: 'excalibur' }];
state.players.P1.hp = 2;
assert.equal(bot(state).command.type, 'attack', 'Prefer a credible finishing Attack to passing');

state = setup(); state.players.P2.hand = [{ instanceId: 'carian', cardId: 'carian-stance' }, { instanceId: 'blade', cardId: 'excalibur' }];
const summon = bot(state).command;
assert.equal(summon.type, 'play-perk', 'Prepare Summon before attacking');
state = step(state, summon);
assert.equal(state.players.P2.merylinSummonActive, true);
assert.equal(bot(state).command.type, 'attack');

// Finishing choices must include their payments and turn-end Burning damage.
// This models the dump's Round 6: Guard drew a Card but left Burning recurring.
state = setup(); state.players.P1.position = { x: 1, y: 0 };
state.players.P2.hp = 8; state.players.P2.actionsRemaining = 0; state.players.P2.movementRemaining = 1;
state.players.P2.perkUsed = true; state.players.P2.spellEcho[0] = { instanceId: 'echo', cardId: 'carian-stance' };
state.players.P2.hand = [{ instanceId: 'burn', cardId: 'burning' }, { instanceId: 'keep', cardId: 'frostmourne' }, { instanceId: 'weak', cardId: 'tactician' }];
state.players.P2.deck = [{ instanceId: 'draw', cardId: 'excalibur' }];
let clearing = bot(state).command;
if (clearing.type === 'move') { state = step(state, clearing); clearing = bot(state).command; }
assert.equal(clearing.type, 'dash', 'Prefer removing continuing Burning to an apparently free Guard draw');
state = step(state, clearing);
assert.equal(state.players.P2.hp, 7, 'Forecast does not pretend Burning Dash avoids its immediate damage');
assert.ok(!state.players.P2.hand.some((card) => card.cardId === 'burning'));
assert.ok(state.players.P2.removedDeck.some((card) => card.instanceId === 'burn'));

state = setup(); state.phase = 'choosing-end-discard'; state.players.P2.hp = 10;
state.players.P2.hand = [{ instanceId: 'burn', cardId: 'burning' }, { instanceId: 'keep', cardId: 'excalibur' }, { instanceId: 'also-keep', cardId: 'tactician' }];
assert.equal(bot(state).command.type, 'end-turn', 'Do not throw away the whole Hand to postpone the same turn-end damage');

// Waiting opens slot 1, allowing a second Perk instead of reusing Carian forever.
state = setup(); state.players.P1.position = { x: 1, y: 0 };
state.players.P2.spellEcho[0] = { instanceId: 'echo', cardId: 'carian-stance' };
state.players.P2.hand = [{ instanceId: 'build', cardId: 'kamelot-stance' }];
const waiting = bot(state).command;
assert.equal(waiting.type, 'end-turn', 'Skip an unnecessary Level 1 activation to develop Echo');
state = step(state, waiting);
assert.equal(state.players.P2.spellEcho[0], null);
assert.equal(state.players.P2.spellEcho[1]?.cardId, 'carian-stance');
state = step(state, { type: 'end-turn', playerId: 'P1' });
let adding = bot(state).command;
for (let count = 0; count < 4 && ['free-move', 'move'].includes(adding.type); count++) { state = step(state, adding); adding = bot(state).command; }
assert.equal(adding.type, 'play-perk'); assert.equal(adding.destination, 'echo');
state = step(state, adding); assert.equal(state.players.P2.spellEcho.filter(Boolean).length, 2);

state = setup(); state.players.P1.position = { x: 1, y: 0 };
state.players.P2.spellEcho = [null, { instanceId: 'second', cardId: 'kamelot-stance' }, { instanceId: 'third', cardId: 'carian-stance' }];
state.players.P2.hand = [{ instanceId: 'fill', cardId: 'windwalker-stance' }];
const filling = bot(state).command;
assert.equal(filling.type, 'play-perk'); assert.equal(filling.destination, 'echo');
state = step(state, filling); assert.equal(state.players.P2.spellEcho.filter(Boolean).length, 3);

// Development is optional: do not delay a credible finishing Attack for it.
state = setup(); state.players.P1.hp = 2;
state.players.P2.spellEcho[0] = { instanceId: 'summon-now', cardId: 'carian-stance' };
state.players.P2.hand = [{ instanceId: 'finish', cardId: 'excalibur' }, { instanceId: 'build-later', cardId: 'kamelot-stance' }];
const urgent = bot(state).command;
assert.equal(urgent.type, 'use-echo-perk', 'Summon now when it enables a finishing Attack');
state = step(state, urgent); assert.equal(bot(state).command.type, 'attack');

state = setup(); state.players.P2.hp = 1; state.players.P1.hp = 2;
state.players.P2.merylinSummonActive = true;
state.players.P2.hand = [{ instanceId: 'burn', cardId: 'burning' }, { instanceId: 'finish', cardId: 'excalibur' }];
assert.equal(bot(state).command.type, 'attack', 'Take the winning Attack instead of paying lethal Burning Dash damage');

state = setup(); state.activePlayerId = 'P1'; state.players.P1.position = { x: 4, y: 3 };
state.players.P1.hand = [{ instanceId: 'hidden-attack', cardId: 'attack-3' }, { instanceId: 'secret', cardId: 'attack-2' }];
state.players.P1.deck = [{ instanceId: 'secret-deck', cardId: 'block' }];
state.players.P2.hand = [{ instanceId: 'block', cardId: 'decisive-block' }, { instanceId: 'tactician', cardId: 'tactician' }];
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'hidden-attack', targetId: 'P2' });
const alternate = structuredClone(state);
alternate.players.P1.hand = alternate.players.P1.hand.map((card) => ({ ...card, cardId: 'force-disarm' }));
alternate.players.P1.deck.reverse(); alternate.players.P1.deck[0].cardId = 'hello-there';
alternate.pendingAttack!.cardId = 'hello-there'; alternate.pendingAttack!.attackValue = 97;
alternate.pendingAttack!.cardInstanceId = 'another-secret-id'; alternate.pendingAttack!.attackModifiers = [{ source: 'secret card', value: 99 }];
alternate.players.P1.discard = alternate.players.P1.discard.map((card) => card.instanceId === 'hidden-attack' ? { instanceId: 'another-secret-id', cardId: 'hello-there' } : card);
alternate.log.push('secret hand and attack details');
assert.deepEqual(observeMerylinMatch(state), observeMerylinMatch(alternate), 'Hidden Hand, Deck, logs and committed Attack do not cross the boundary');
assert.ok(!JSON.stringify(observeMerylinMatch(alternate)).includes('another-secret-id'), 'In-flight Discard does not expose the committed Attack');
assert.deepEqual(bot(state).command, bot(alternate).command, 'A different actual hidden Attack cannot influence the defense decision');

const ordered = setup(); ordered.players.P2.freeMoveUsed = false;
ordered.players.P2.deck = [{ instanceId: 'd1', cardId: 'excalibur' }, { instanceId: 'd2', cardId: 'carian-stance' }];
const reordered = structuredClone(ordered); reordered.players.P2.deck.reverse();
assert.deepEqual(observeMerylinMatch(ordered), observeMerylinMatch(reordered), 'Bot cannot see its own shuffled draw order');
const random = Math.random;
try { Math.random = () => { throw new Error('Planner touched the live random source'); }; bot(ordered); }
finally { Math.random = random; }

// End-turn hand limits and enemy-forced discards must always retain a legal choice.
for (const phase of ['choosing-end-discard', 'choosing-force-disarm-discard', 'choosing-flurry-enemy-discard', 'choosing-grimoire-discard', 'choosing-mind-tricks-enemy-discard'] as const) {
  const fixture = setup();
  fixture.players.P2.hand = Array.from({ length: 6 }, (_, index) => ({ instanceId: `cost-${index}`, cardId: 'excalibur' }));
  fixture.phase = phase;
  if (phase === 'choosing-force-disarm-discard') fixture.forceDisarm = { targetId: 'P2', cardKind: 'attack' };
  if (phase === 'choosing-flurry-enemy-discard') {
    fixture.pendingAttack = { attackerId: 'P2', defenderId: 'P1', cardId: 'excalibur', cardInstanceId: 'used', attackValue: 3, returnToHandAfterCombat: false };
    fixture.flurry = { defenderId: 'P1', attackerId: 'P2', resumePhase: 'defending', remainingEnemyDiscards: 1 };
  }
  if (phase === 'choosing-grimoire-discard') {
    fixture.pendingAttack = { attackerId: 'P1', defenderId: 'P2', cardId: 'grimoire-cleanse', cardInstanceId: 'used', attackValue: 3, returnToHandAfterCombat: false, grimoireDiscardsRemaining: 2 };
  }
  if (phase === 'choosing-mind-tricks-enemy-discard') fixture.mindTricks = { casterId: 'P1', level: 1, maxDiscards: 1, discarded: 0, revealedInstanceIds: [], enemyId: 'P2', enemyDiscardsRemaining: 1, undo: null };
  bot(fixture);
}

// Standard opening/progression is handled rather than bypassed for the bot.
state = createHotseatTestState(false, 'shinobi', 2, 'merylin');
state = step(state, { type: 'choose-focus-card', playerId: 'P1', cardId: 'hello-there' });
assert.ok(merylinDecisionPending(state, 'P2'));
state = step(state, bot(state).command);
assert.equal(state.phase, 'active');

for (const phase of [1, 2, 3] as const) {
  state = setup(); state.players.P2.hand = [{ instanceId: 'refine', cardId: 'frostmourne' }, { instanceId: 'negative', cardId: 'exhaust' }];
  state.phase = phase === 3 ? 'choosing-phase-three-card' : 'choosing-phase-card';
  const quests = (state as GameStateWithQuestPhases).questPhases ??= { actionDamageByPlayer: {}, usedQuestIds: [], currentQuest: null, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {} };
  quests.lastQuestWinners = ['P2'];
  quests.phaseReward = { phase, pendingPlayerIds: ['P2'], completedPlayerIds: [], playerProgress: {} };
  for (let count = 0; count < 8 && (state as GameStateWithQuestPhases).questPhases?.phaseReward; count++) state = step(state, bot(state).command);
  assert.equal((state as GameStateWithQuestPhases).questPhases?.phaseReward, null, `Phase ${phase} completes including Card destination`);
}

for (const cardId of ['kamelot-stance', 'spellsinger-stance', 'carian-stance', 'windwalker-stance', 'barbarian-stance'] as const) {
  state = setup(); state.players.P2.hand = [{ instanceId: 'negative', cardId: 'exhaust' }];
  state.players.P2.spellEcho[2] = { instanceId: 'echo', cardId };
  state.players.P2.discard = [{ instanceId: 'recover', cardId: 'excalibur' }];
  state = step(state, { type: 'use-echo-perk', playerId: 'P2', position: 3 });
  for (let count = 0; count < 4 && state.phase !== 'active'; count++) state = step(state, bot(state).command);
  assert.equal(state.phase, 'active', `${cardId} Level 3 completes its required choices`);
}

// Yamato is chosen under uncertainty and still picks a legal escape from melee.
state = setup(); state.activePlayerId = 'P1'; state.players.P1.position = { x: 4, y: 3 };
state.players.P1.hand = [{ instanceId: 'incoming', cardId: 'attack-3' }];
state.players.P2.hand = [{ instanceId: 'escape', cardId: 'yamato' }];
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'incoming', targetId: 'P2' });
state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'escape' });
assert.equal(state.phase, 'choosing-yamato-move');
state = step(state, bot(state).command);
assert.notEqual(state.phase, 'choosing-yamato-move');

// Private enemy Combat Card submissions remain invisible even after the two combat Cards reveal.
state = setup(); state.activePlayerId = 'P1'; state.players.P1.position = { x: 4, y: 3 };
state.players.P1.hand = [{ instanceId: 'incoming', cardId: 'attack-3' }, { instanceId: 'extra', cardId: 'banner' }];
state.players.P2.hand = [{ instanceId: 'defend', cardId: 'decisive-block' }, { instanceId: 'extra-bot', cardId: 'banner' }];
(state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = true;
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'incoming', targetId: 'P2' });
state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defend' });
assert.equal(state.phase, 'choosing-combat-stack');
const locked = step(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'extra' });
assert.deepEqual(observeMerylinMatch(locked), observeMerylinMatch(state), 'Private enemy extra Card selection is stripped');
assert.deepEqual(bot(locked).command, bot(state).command);

state = setup(); state.players.P2.merylinSummonActive = true;
state.players.P2.hand = [{ instanceId: 'blade', cardId: 'excalibur' }, { instanceId: 'bot-banner', cardId: 'banner' }];
state.players.P1.character = 'merylin'; state.players.P1.hand = [{ instanceId: 'hidden-defense', cardId: 'defend-1' }, { instanceId: 'human-banner', cardId: 'banner' }];
(state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = true;
state = step(state, { type: 'attack', playerId: 'P2', cardInstanceId: 'blade', targetId: 'P1' });
const oracleHidden = structuredClone(state);
oracleHidden.players.P1.hand[0] = { instanceId: 'secret-oracle', cardId: 'oracle' };
Object.assign(oracleHidden.pendingAttack!, { oracleInstanceId: 'secret-oracle', oracleValueAtCombatStart: 3, oracleRevealedThisCombat: false, oracleAttackRevealed: false });
assert.deepEqual(observeMerylinMatch(state), observeMerylinMatch(oracleHidden), 'Enemy Oracle caches cannot reveal an unrevealed Hand Card');
(state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = true;
state = step(state, { type: 'defend', playerId: 'P1', cardInstanceId: 'hidden-defense' });
const publicDefense = observeMerylinMatch(state).state;
assert.equal(publicDefense.players.P1.hand.find((card) => card.instanceId === 'hidden-defense')?.cardId, 'defend-1', 'The committed Defend Card is now public and remains resolvable');
const ownExtra = simulateGameCommand(publicDefense, { type: 'combat-stack-choice', playerId: 'P2', cardInstanceId: 'bot-banner' });
assert.ok(ownExtra.ok);
const resolvedExtra = simulateGameCommand(ownExtra.state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: null });
assert.ok(resolvedExtra.ok);
assert.ok(resolvedExtra.state.combatReveal?.deferredAfterCombatState, 'Combat forecasts resolve with a public human Defend Card');

// Lightbringer resumes an already chosen defense before the normal combat reveal.
// Its continuation needs an anonymous legal proxy, never the actual hidden Card.
state = setup(); state.players.P2.merylinSummonActive = true;
state.players.P2.hand = [{ instanceId: 'swap-blade', cardId: 'lightbringer' }];
state.players.P1.position = { x: 4, y: 3 };
state.players.P1.character = 'fyrebanks';
state.players.P1.hand = [{ instanceId: 'private-defense', cardId: 'fire-shield' }];
state = step(state, { type: 'attack', playerId: 'P2', cardInstanceId: 'swap-blade', targetId: 'P1' });
state = step(state, { type: 'defend', playerId: 'P1', cardInstanceId: 'private-defense' });
assert.equal(state.phase, 'choosing-lightbringer-swap');
const otherDefense = structuredClone(state); otherDefense.players.P1.hand[0].cardId = 'counterflame';
assert.deepEqual(observeMerylinMatch(state), observeMerylinMatch(otherDefense), 'Unrevealed committed defenses are anonymous during Lightbringer');
assert.ok(!JSON.stringify(observeMerylinMatch(state)).includes('private-defense'));
assert.equal(bot(state).command.type, 'lightbringer-swap-decision', 'Lightbringer can resume without reading the secret defense');

const unsupported = setup(); (unsupported as GameState & { arenaId: string }).arenaId = 'pipe';
assert.equal(chooseMerylinCommand(observeMerylinMatch(unsupported)), null, 'The first bot is explicitly limited to Nagrand');
unsupported.perkMode = true; (unsupported as GameState & { arenaId: string }).arenaId = 'nagrand';
assert.equal(chooseMerylinCommand(observeMerylinMatch(unsupported)), null, 'Perk Mode is not silently treated as supported');

console.log('Merylin bot checks passed: tactical Attack/Summon, legal reactions/discards, opening, hidden-information invariance, unknown draw order and isolated planning RNG.');
