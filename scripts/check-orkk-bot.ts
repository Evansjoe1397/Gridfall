import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCommand, createHotseatTestState, type GameCommand, type GameState, type GameStateWithQuestPhases, type CardTypeId } from '../shared/game.ts';
import { observeMerylinMatch } from '../src/merylin-bot-observation.ts';
import { chooseOrkkCommand, orkkDecisionPending } from '../src/orkk-bot.ts';
import { nagrandDecisionPending } from '../src/nagrand-bot.ts';

function setup(): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'orkk');
  state.phase = 'active'; state.activePlayerId = 'P2'; state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = true;
  for (const p of Object.values(state.players)) {
    p.hand = []; p.deck = []; p.discard = []; p.spellEcho = [null, null, null];
    p.freeMoveUsed = true; p.movementRemaining = 0; p.actionsRemaining = 2;
  }
  state.players.P2.position = { x: 3, y: 3 }; state.players.P1.position = { x: 4, y: 3 };
  return state;
}
function step(state: GameState, cmd: GameCommand): GameState {
  const result = applyCommand(state, cmd); assert.ok(result.ok, `${cmd.type}: ${result.ok ? '' : result.error}`); return result.state;
}
function choice(state: GameState): GameCommand {
  const before = JSON.stringify(state);
  const decision = chooseOrkkCommand(observeMerylinMatch(state));
  assert.equal(JSON.stringify(state), before, 'Planning must not mutate the live match');
  assert.ok(decision, `Missing decision at ${state.phase}`);
  step(state, decision.command); return decision.command;
}
function perk(cardId: CardTypeId, level: 1 | 2 | 3): GameState {
  const state = setup(); state.players.P2.spellEcho[level - 1] = { instanceId: 'perk', cardId };
  if (cardId === 'arm-da-wiz') state.players.P2.shieldEquipped = false;
  return step(state, { type: 'use-echo-perk', playerId: 'P2', position: level });
}

let state = setup(); state.players.P2.hand = [{ instanceId: 'fist', cardId: 'fistbolt' }]; state.players.P1.hp = 2;
assert.equal(choice(state).type, 'attack', 'Use Fistbolt for a credible finish even at zero Rage');
state = setup(); state.players.P2.rageStacks = 3;
state.players.P2.hand = [{ instanceId: 'knee', cardId: 'knee-blast' }]; state.players.P1.hp = 5;
assert.equal(choice(state).type, 'attack', 'Spend Rage on an Attack rather than hoarding it');

state = perk('arkane-arow', 3); state.players.P1.hp = 1;
let cmd = choice(state); assert.equal(cmd.type, 'arkane-arow-target');
state = step(state, cmd); assert.equal(state.players.P1.hp, 0, 'Throw at the enemy instead of an empty Square');

state = setup(); state.players.P2.spellEcho[2] = { instanceId: 'arrow', cardId: 'arkane-arow' }; state.players.P1.hp = 1;
assert.equal(choice(state).type, 'use-echo-perk', 'Forecast the targeting step when deciding to throw a lethal Shield');

state = perk('kyk', 3);
state.players.P2.position = { x: 6, y: 3 }; state.players.P1.position = { x: 7, y: 3 };
cmd = choice(state); assert.equal(cmd.type, 'kyk-target');
state = step(state, cmd); cmd = choice(state); assert.equal(cmd.type, 'kyk-direction');
state = step(state, cmd); assert.ok(state.players.P1.hp < state.players.P1.maxHp, 'Choose an edge collision over a harmless push');

state = setup(); state.players.P2.position = { x: 7, y: 6 }; state.players.P1.position = { x: 8, y: 7 };
state.players.P2.spellEcho[2] = { instanceId: 'corner-kyk', cardId: 'kyk' };
assert.notEqual(choice(state).type, 'use-echo-perk', 'Do not enter Kyk when its only target has no selectable board direction');

state = setup(); state.players.P2.shieldEquipped = false;
state.objects.push({ id: 'shield', kind: 'orkk-shield', name: 'Iron Shield', hp: 3, maxHp: 3, ownerId: 'P2', position: { x: 5, y: 3 } });
state.players.P2.spellEcho[2] = { instanceId: 'arm', cardId: 'arm-da-wiz' };
state = step(state, { type: 'use-echo-perk', playerId: 'P2', position: 3 });
cmd = choice(state); assert.equal(cmd.type, 'arm-da-wiz-choice');
assert.equal(cmd.choice, 'recall', 'Prefer a damaging recall to paying for a new Shield');
state = step(state, cmd); cmd = choice(state); state = step(state, cmd);
assert.equal(state.players.P2.shieldEquipped, true); assert.ok(state.players.P1.hp < state.players.P1.maxHp);
assert.ok(state.players.P2.rageStacks >= 3, 'Recall gains Rage for the crossed enemy');

state = perk('arm-da-wiz', 1);
if (state.phase === 'choosing-arm-da-wiz-choice') state = step(state, { type: 'arm-da-wiz-choice', playerId: 'P2', choice: 'create' });
assert.equal(state.phase, 'choosing-arm-da-wiz-create-payment');
state.players.P2.hp = 1; state.players.P2.rageStacks = 1;
cmd = choice(state); assert.equal(cmd.type, 'arm-da-wiz-create-payment'); assert.equal(cmd.payment, 'rage', 'Never pay lethal HP when Rage is available');

state = setup(); state.players.P2.hp = 4; state.players.P2.rageStacks = 3;
state.players.P2.spellEcho[2] = { instanceId: 'heal', cardId: 'consume-rage' };
state.players.P2.hand = [{ instanceId: 'burn', cardId: 'burning' }];
cmd = choice(state); assert.equal(cmd.type, 'use-echo-perk');
state = step(state, cmd); assert.ok(state.players.P2.hp > 4, 'Spend Rage to survive');

state = setup(); state.activePlayerId = 'P1';
state.players.P1.hand = [{ instanceId: 'secret-attack', cardId: 'attack-3' }, { instanceId: 'secret-hand', cardId: 'attack-2' }];
state.players.P2.hand = [{ instanceId: 'block', cardId: 'da-blokk' }, { instanceId: 'double', cardId: 'double' }];
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'secret-attack', targetId: 'P2' });
const alternate = structuredClone(state);
alternate.players.P1.hand[0].cardId = 'hello-there'; alternate.pendingAttack!.cardId = 'hello-there'; alternate.pendingAttack!.attackValue = 99;
alternate.log.push('hidden secret');
assert.deepEqual(observeMerylinMatch(state), observeMerylinMatch(alternate));
assert.deepEqual(choice(state), choice(alternate), 'Unrevealed Attack and Hand cannot affect defense');
assert.ok(!JSON.stringify(observeMerylinMatch(state)).includes('secret-attack'));
const random = Math.random;
try { Math.random = () => { throw new Error('Live RNG used in planning'); }; choice(state); } finally { Math.random = random; }

state = setup(); state.players.P2.deck = [{ instanceId: 'd1', cardId: 'fistbolt' }, { instanceId: 'd2', cardId: 'encourage' }];
const reordered = structuredClone(state); reordered.players.P2.deck.reverse();
assert.deepEqual(observeMerylinMatch(state), observeMerylinMatch(reordered));
assert.deepEqual(choice(state), choice(reordered), 'Shuffled draw order must not affect planning');

state = setup(); state.activePlayerId = 'P1';
state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }, { instanceId: 'private-extra', cardId: 'banner' }];
state.players.P2.hand = [{ instanceId: 'block', cardId: 'da-blokk' }, { instanceId: 'own-extra', cardId: 'banner' }];
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'block' });
assert.equal(state.phase, 'choosing-combat-stack');
const locked = step(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'private-extra' });
assert.deepEqual(observeMerylinMatch(state), observeMerylinMatch(locked));
assert.deepEqual(choice(state), choice(locked), 'Private enemy extra Card submission remains hidden');

state = createHotseatTestState(false, 'shinobi', 2, 'orkk');
state = step(state, { type: 'choose-focus-card', playerId: 'P1', cardId: 'hello-there' });
assert.ok(orkkDecisionPending(state, 'P2'));
state = step(state, choice(state)); assert.equal(state.phase, 'active');

for (const phase of [1, 2, 3] as const) {
  state = setup(); state.players.P2.hand = [{ instanceId: 'refine', cardId: 'knee-blast' }, { instanceId: 'negative', cardId: 'exhaust' }];
  state.phase = phase === 3 ? 'choosing-phase-three-card' : 'choosing-phase-card';
  const quests = (state as GameStateWithQuestPhases).questPhases ??= { actionDamageByPlayer: {}, usedQuestIds: [], currentQuest: null, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {} };
  quests.lastQuestWinners = ['P2']; quests.phaseReward = { phase, pendingPlayerIds: ['P2'], completedPlayerIds: [], playerProgress: {} };
  for (let i = 0; i < 8 && quests.phaseReward; i++) {
    state = step(state, choice(state));
    if (!(state as GameStateWithQuestPhases).questPhases?.phaseReward) break;
  }
  assert.equal((state as GameStateWithQuestPhases).questPhases?.phaseReward, null);
}
for (const cardId of ['arkane-arow', 'arm-da-wiz', 'encourage', 'kyk', 'consume-rage'] as const) {
  state = setup(); state.players.P2.hp = 14; state.players.P2.rageStacks = 3;
  state.players.P2.shieldEquipped = cardId !== 'arm-da-wiz';
  state.players.P2.hand = [{ instanceId: 'negative', cardId: 'exhaust' }];
  state.players.P2.spellEcho[2] = { instanceId: 'echo', cardId };
  state = step(state, { type: 'use-echo-perk', playerId: 'P2', position: 3 });
  for (let i = 0; i < 4 && state.phase !== 'active'; i++) state = step(state, choice(state));
  assert.equal(state.phase, 'active', `${cardId} Level 3 completes its choices`);
}
state = setup(); assert.ok(orkkDecisionPending(state, 'P2')); assert.ok(nagrandDecisionPending(state, 'P2'));
state.perkMode = true; assert.equal(chooseOrkkCommand(observeMerylinMatch(state)), null);
state = setup(); (state as GameState & { arenaId: string }).arenaId = 'pipe';
assert.equal(chooseOrkkCommand(observeMerylinMatch(state)), null);
// Sanitized projected states from the complete November 21 recording. No private
// enemy Cards or actual draw order enter the regression planner observations.
const recorded = JSON.parse(readFileSync(new URL('./orkk-2026-11-21.fixture.json', import.meta.url), 'utf8')) as { events: { event: number; state: GameState }[] };
for (const { event, state: snapshot } of recorded.events) {
  const before = JSON.stringify(snapshot);
  const decision = choice(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  if (event === 112 || event === 541) assert.equal(decision.type, 'free-move', `Dump ${event}: gain movement and a Card before wasting an Attack on a friendly Shield or Box.`);
  if (event === 219) assert.ok(decision.type !== 'use-echo-perk' || decision.position !== 1, 'Dump 219: do not reflexively cycle EncouRAGE Level 1.');
  if (event === 351) {
    assert.equal(decision.type, 'dash', 'Dump 351: clear ongoing Burning instead of Guarding while keeping it.');
    const dashed = step(snapshot, decision);
    assert.ok(!dashed.players.P2.hand.some((card) => card.cardId === 'burning'));
  }
  if (event === 563) {
    assert.equal(decision.type, 'end-turn', 'Dump 563: preserve the five useful/required Cards instead of discarding down to Burning alone.');
    const kept = step(snapshot, decision);
    assert.deepEqual(kept.players.P2.hand, snapshot.players.P2.hand);
  }
}

state = setup(); state.players.P1.position = { x: 8, y: 6 }; state.players.P2.position = { x: 2, y: 1 };
state.players.P2.actionsRemaining = 0; state.players.P2.movementRemaining = 0;
state.players.P2.hand = [{ instanceId: 'keep-attack', cardId: 'knee-blast' }];
assert.equal(choice(state).type, 'end-turn', 'Guard is not a free draw when its payment would sacrifice the only useful Card.');

state = setup(); state.players.P1.position = { x: 8, y: 6 }; state.players.P2.position = { x: 2, y: 1 };
state.players.P2.actionsRemaining = 1; state.players.P2.rageStacks = 3; state.players.P2.shieldEquipped = true;
state.players.P2.hand = [{ instanceId: 'develop-next', cardId: 'consume-rage' }];
state.players.P2.spellEcho = [{ instanceId: 'develop-echo', cardId: 'encourage' }, null, null];
assert.equal(choice(state).type, 'end-turn', 'A safe turn can advance EncouRAGE and preserve the next Perk.');
state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(state.players.P2.spellEcho[1]?.cardId, 'encourage');
state = step(state, { type: 'end-turn', playerId: 'P1' });
state.players.P2.freeMoveUsed = true;
const develop = choice(state);
assert.equal(develop.type, 'play-perk');
if (develop.type === 'play-perk') assert.equal(develop.destination, 'echo');
state = step(state, develop); assert.equal(state.players.P2.spellEcho.filter(Boolean).length, 2);

state = setup(); state.players.P2.hp = 1; state.players.P1.hp = 1;
state.players.P2.hand = [{ instanceId: 'win-now', cardId: 'fistbolt' }, { instanceId: 'lethal-burning', cardId: 'burning', sourcePlayerId: 'P1' }];
assert.equal(choice(state).type, 'attack', 'A winning Attack takes priority over lethal Burning Dash or long-term development.');
console.log('Da Orkk bot checks passed: dump regressions, Burning/finishing costs, Hand preservation, Echo development, urgent wins, Rage, Shield/Box discipline, targeting, privacy and RNG isolation.');
