import assert from 'node:assert/strict';
import { applyCommand, applicableCombatCardInstanceIds, cardDefinition, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.error}`);
  return result.state;
}
function fresh(stack = false): GameState {
  const state = createHotseatTestState(true, 'merylin', 2, 'shinobi');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const p of Object.values(state.players)) { p.hand = []; p.deck = []; p.discard = []; p.removedDeck = []; p.hp = p.maxHp = 18; p.shieldEquipped = false; }
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P1.merylinSummonActive = true;
  state.players.P1.freeMoveUsed = true;
  state.players.P2.position = { x: 3, y: 3 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-2' }, { instanceId: 'power', cardId: 'overpower' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }, { instanceId: 'defender-power', cardId: 'overpower' }];
  return state;
}
function fight(state: GameState, pass = false): GameState {
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  return step(state, pass ? { type: 'pass-defense', playerId: 'P2' } : { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
}
function choose(state: GameState, use = true): GameState {
  while (state.phase === 'choosing-combat-stack') {
    const selections = (state as GameState & { combatStackSelections?: Record<string, unknown> }).combatStackSelections ?? {};
    const playerId = selections.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: playerId === 'P1' && use ? 'power' : null });
  }
  return state;
}
function acknowledge(state: GameState): GameState {
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
assert.equal(cardDefinition({ instanceId: '', cardId: 'overpower' }).kind, 'combat');
assert.equal(cardDefinition({ instanceId: '', cardId: 'overpower' }).narrative, undefined);
for (const stack of [false, true]) for (const pass of [false, true]) {
  let state = fight(fresh(stack), pass);
  assert.equal(state.phase, 'choosing-combat-stack', 'Overpower is available in both combat modes.');
  assert.ok(applicableCombatCardInstanceIds(state, 'P1').includes('power'));
  assert.ok(!applicableCombatCardInstanceIds(state, 'P2').includes('defender-power'), 'Overpower only modifies an Attack Card.');
  state = choose(state);
  assert.equal(state.combatReveal?.attackTotal, 3);
  assert.ok(state.combatReveal?.attackModifiers?.some((modifier) => modifier.source === 'Overpower' && modifier.value === 1));
  state = acknowledge(state);
  assert.equal(state.players.P2.hp, pass ? 15 : 16);
  assert.ok(![...state.players.P1.hand, ...state.players.P1.discard, ...state.players.P1.deck].some((card) => card.instanceId === 'power'));

  state = acknowledge(choose(fight(fresh(stack), pass), false));
  assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'power'), 'Declining combat use retains the Card.');
}
for (const stack of [false, true]) {
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
    const source = fresh(stack);
    source.players.P1.position = { x: 4, y: 3 };
    source.players.P2.position = { x: 4 + dx, y: 3 + dy };
    assert.ok(applicableCombatCardInstanceIds(fight(source), 'P1').includes('power'), 'Every adjacent diagonal qualifies.');
  }
  for (const dx of [-2, 2]) for (const dy of [-2, 2]) {
    const source = fresh(stack);
    source.players.P1.position = { x: 4, y: 3 };
    source.players.P2.position = { x: 4 + dx, y: 3 + dy };
    source.players.P1.hand[0].cardId = 'excalibur';
    let state = fight(source);
    assert.ok(applicableCombatCardInstanceIds(state, 'P1').includes('power'), 'Excalibur qualifies across one intervening diagonal Square.');
    const before = state.combatReveal!.attackTotal;
    state = choose(state);
    assert.equal(state.combatReveal?.attackTotal, before + 1);
  }
  for (const [dx, dy, cardId] of [[1, 0, 'attack-2'], [0, 1, 'attack-2'], [2, 0, 'excalibur'], [0, 2, 'excalibur'], [2, 2, 'attack-2'], [3, 3, 'attack-2']] as const) {
    const source = fresh(stack);
    source.players.P1.attackRange = 4;
    source.players.P1.position = { x: 4, y: 3 };
    source.players.P2.position = { x: 4 + dx, y: 3 + dy };
    source.players.P1.hand[0].cardId = cardId;
    const state = fight(source);
    assert.ok(!applicableCombatCardInstanceIds(state, 'P1').includes('power'), 'Cardinal targets and longer diagonals without the Excalibur exception do not qualify.');
    if (state.phase === 'choosing-combat-stack') assert.ok(!applyCommand(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'power' }).ok);
    const settled = acknowledge(choose(state, false));
    assert.ok(settled.players.P1.hand.some((card) => card.instanceId === 'power'), 'An unavailable Overpower remains in Hand.');
  }
}
for (const command of ['guard', 'dash'] as const) {
  const source = fresh();
  source.players.P1.deck = [{ instanceId: 'draw', cardId: 'attack-3' }];
  const result = step(source, { type: command, playerId: 'P1' });
  assert.ok(!result.players.P1.hand.some((card) => card.instanceId === 'power'));
  assert.ok(result.players.P1.hand.some((card) => card.instanceId === 'attack'));
  assert.ok(!result.players.P1.discard.some((card) => card.cardId === 'overpower'));
  assert.equal(result.phase === 'choosing-guard-discard' || result.phase === 'choosing-dash-discard', false, 'Finishing Move discard resolves automatically.');
}
let limited = fresh();
limited.players.P1.hand.push({ instanceId: 'power2', cardId: 'overpower' }, ...[1, 2, 3, 4].map((id) => ({ instanceId: `ordinary-${id}`, cardId: 'attack-2' as const })));
limited = step(limited, { type: 'end-turn', playerId: 'P1' });
assert.equal(limited.players.P1.hand.length, 5);
assert.ok(!limited.players.P1.hand.some((card) => card.cardId === 'overpower'), 'Multiple copies pay the required Hand-limit discards first.');

// An optional additional end-turn discard also chooses Overpower first.
let optional = fresh(); optional.phase = 'choosing-end-discard';
optional = step(optional, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'attack' });
assert.ok(optional.players.P1.hand.some((card) => card.instanceId === 'attack'));
assert.ok(!optional.players.P1.hand.some((card) => card.cardId === 'overpower'));

// Forced Attack/Defend discard costs use Overpower even though its type is Combat.
for (const cardKind of ['attack', 'defend'] as const) {
  let state = fresh(); state.phase = 'choosing-force-disarm-discard';
  state.forceDisarm = { targetId: 'P1', cardKind };
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  assert.ok(!state.players.P1.hand.some((card) => card.cardId === 'overpower'));
  assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'attack'));
  assert.equal(state.phase, 'active');
}
let weaver = fresh(); weaver.phase = 'choosing-weaver-story';
weaver.players.P2.character = 'kazka';
weaver.players.P2.deck = [{ instanceId: 'kazka-draw', cardId: 'attack-2' }];
weaver.weaverChoice = { targetId: 'P1', kazkaId: 'P2' };
weaver = step(weaver, { type: 'weaver-choice', playerId: 'P1', choice: 'discard', cardInstanceId: 'attack' });
assert.ok(weaver.players.P1.hand.some((card) => card.instanceId === 'attack'));
assert.ok(!weaver.players.P1.hand.some((card) => card.cardId === 'overpower'));
assert.ok(weaver.players.P2.hand.some((card) => card.instanceId === 'kazka-draw'));
console.log('Overpower checks passed.');
