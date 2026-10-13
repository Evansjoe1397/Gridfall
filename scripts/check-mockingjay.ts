import assert from 'node:assert/strict';
import { applyCommand, applicableCombatCardInstanceIds, cardDefinition, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.error}`);
  return result.state;
}
function fresh(stack: boolean, defense: CardTypeId = 'defend-1'): GameState {
  const state = createHotseatTestState(true, 'kazka', 2, 'orkk');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const p of Object.values(state.players)) {
    p.hand = []; p.deck = []; p.discard = []; p.removedDeck = [];
    p.hp = p.maxHp = 18; p.shieldEquipped = false;
    p.turnStartRecord = { position: { ...p.position }, hp: 18, round: 1 };
  }
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'mockingjay' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  state.players.P1.deck = [{ instanceId: 'drawn', cardId: 'attack-2' }];
  return state;
}
function attack(state: GameState): GameState { return step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }); }
function defend(state: GameState): GameState { return step(attack(state), { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' }); }
function choice(state: GameState, value: 'discard' | 'draw'): GameState { return step(state, { type: 'mockingjay-defense-choice', playerId: 'P2', choice: value }); }
function settle(state: GameState, defenderCard: string | null = null): GameState {
  while (state.phase === 'choosing-combat-stack') {
    const selections = (state as GameState & { combatStackSelections?: Record<string, unknown> }).combatStackSelections ?? {};
    const playerId = selections.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: playerId === 'P2' ? defenderCard : null });
  }
  while (state.phase === 'choosing-exhaust') {
    const pending = state.combatReveal!.exhaust!;
    state = step(state, { type: 'exhaust-decision', playerId: pending.eligible.find((id) => !pending.decided.includes(id))!, use: false });
  }
  assert.ok(state.combatReveal?.deferredAfterCombatState, `Missing deferred combat in ${state.phase}`);
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
assert.equal(cardDefinition({ instanceId: '', cardId: 'mockingjay' }).value, 1);
assert.equal(cardDefinition({ instanceId: '', cardId: 'mockingjay' }).narrative, undefined);
assert.match(cardDefinition({ instanceId: '', cardId: 'mockingjay' }).specialEffectText!, /After combat/);
assert.ok(createHotseatTestState(true, 'kazka', 2).players.P1.hand.some((card) => card.cardId === 'mockingjay'));

for (const stack of [false, true]) {
  let state = defend(fresh(stack));
  assert.equal(state.phase, 'choosing-mockingjay-defense');
  assert.equal(state.combatReveal?.attackCardId, 'mockingjay');
  assert.equal(state.combatReveal?.defendCardId, 'defend-1');
  assert.equal(state.players.P2.hp, 18);
  assert.equal(state.players.P1.deck.length, 1);
  assert.ok(!applyCommand(state, { type: 'ack-combat', playerId: 'P2' }).ok);
  assert.ok(!applyCommand(state, { type: 'mockingjay-defense-choice', playerId: 'P1', choice: 'discard' }).ok);
  state = choice(state, 'draw');
  assert.equal(state.players.P1.deck.length, 1, 'Draw waits for result acknowledgment.');
  state = settle(state);
  assert.equal(state.players.P2.hp, 18, 'Keeping defense preserves its value.');
  assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'drawn'));
  assert.notEqual(state.phase, 'choosing-mockingjay-narrative', 'No Narrative Card means no offer.');

  for (const defenseId of ['thorns', 'mana-shield', 'oracle'] as CardTypeId[]) {
    const source = fresh(stack, defenseId);
    source.players.P2.manaPoints = 0;
    if (defenseId === 'oracle') source.players.P2.hand[0].oracleValue = 1;
    source.players.P1.hand.push(...(['banner', 'exhaust', 'heated-debate', 'overpower'] as CardTypeId[]).map((cardId) => ({ instanceId: cardId, cardId })));
    state = choice(defend(source), 'discard');
    assert.equal(state.combatReveal?.defendCardId, null);
    assert.equal(state.combatReveal?.defendTotal, 0);
    assert.equal(state.players.P1.hp, 18, 'Discarded defense cannot cause pre-combat damage.');
    assert.equal(state.players.P2.manaPoints, 0, 'Discarded Mana Shield cannot generate Mana.');
    assert.deepEqual(applicableCombatCardInstanceIds(state, 'P1'), []);
    state = settle(state);
    assert.ok(state.players.P1.hand.some((card) => card.cardId === 'banner'));
    assert.ok(state.players.P2.discard.some((card) => card.instanceId === 'defense'));
    assert.equal(state.players.P1.deck.length, 1, 'Discard choice grants no draw.');
    assert.equal(state.phase, 'choosing-mockingjay-narrative');
    assert.ok(!applyCommand(state, { type: 'mockingjay-narrative-choice', playerId: 'P1', cardInstanceId: 'banner' }).ok);
    state = step(state, { type: 'mockingjay-narrative-choice', playerId: 'P1', cardInstanceId: 'heated-debate' });
    assert.equal(state.phase, 'choosing-narrative');
    assert.ok(!state.players.P1.hand.some((card) => card.cardId === 'heated-debate'));
    assert.ok(!state.players.P1.discard.some((card) => card.cardId === 'heated-debate'));
    state = step(state, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
    assert.equal(state.phase, 'active');
  }
  for (const blocking of ['block', 'spellblock', 'decisive-block'] as CardTypeId[]) {
    const source = fresh(stack, blocking);
    source.players.P1.hand.push({ instanceId: 'story', cardId: 'once-upon-a-time' });
    state = defend(source);
    assert.notEqual(state.phase, 'choosing-mockingjay-defense');
    state = settle(state);
    assert.equal(state.players.P1.deck.length, 1);
    assert.notEqual(state.phase, 'choosing-mockingjay-narrative');
  }
  const source = fresh(stack);
  source.players.P1.deck = [{ instanceId: 'story', cardId: 'once-upon-a-time' }];
  state = settle(choice(defend(source), 'draw'));
  assert.equal(state.phase, 'choosing-mockingjay-narrative', 'Newly drawn Narrative Cards qualify.');
  assert.ok(!applyCommand(state, { type: 'mockingjay-narrative-choice', playerId: 'P2', cardInstanceId: 'story' }).ok);
  state = step(state, { type: 'mockingjay-narrative-choice', playerId: 'P1', cardInstanceId: 'story' });
  assert.equal(state.phase, 'choosing-narrative');
  assert.ok(state.players.P1.discard.some((card) => card.instanceId === 'story'));
  assert.equal(state.players.P1.actionsRemaining, 1, 'Narrative spending consumes no extra Action.');

  const canceled = fresh(stack);
  canceled.players.P2.hand.push({ instanceId: 'cancel', cardId: 'heated-debate' });
  canceled.players.P1.hand.push({ instanceId: 'story', cardId: 'once-upon-a-time' });
  state = settle(choice(defend(canceled), 'draw'), 'cancel');
  assert.equal(state.players.P1.deck.length, 1, 'Heated Debate cancels post-combat draw.');
  assert.notEqual(state.phase, 'choosing-mockingjay-narrative', 'Heated Debate cancels optional Narrative effect.');

  const jump = fresh(stack, 'double-jump');
  jump.players.P1.hand.push({ instanceId: 'story', cardId: 'once-upon-a-time' });
  state = settle(choice(defend(jump), 'draw'));
  assert.equal(state.phase, 'choosing-mockingjay-narrative');
  state = step(state, { type: 'mockingjay-narrative-choice', playerId: 'P1', cardInstanceId: null });
  assert.equal(state.phase, 'double-jump', 'Declining resumes the defender’s pending post-combat movement.');
  assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'story'));

  const resume = fresh(stack, 'double-jump');
  resume.players.P1.hand.push({ instanceId: 'story', cardId: 'escalation' });
  state = settle(choice(defend(resume), 'draw'));
  state = step(state, { type: 'mockingjay-narrative-choice', playerId: 'P1', cardInstanceId: 'story' });
  state = step(state, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
  assert.equal(state.phase, 'double-jump', 'Narrative resolution also resumes the pending movement.');
  assert.ok(!state.players.P2.hand.some((card) => card.cardId === 'headache'), 'Spending Escalation does not play its Attack effects.');

  state = settle(step(attack(fresh(stack)), { type: 'pass-defense', playerId: 'P2' }));
  assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'drawn'));
}
console.log('Mockingjay checks passed.');
