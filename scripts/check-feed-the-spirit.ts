import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, feedSpiritDefenseBonus, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.error}`);
  return result.state;
}
function setup(spirit: boolean, stack: boolean, heated = false): GameState {
  const state = createHotseatTestState(true, 'dummy', 2, 'john-christ');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; }
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P2.hp = 10;
  state.players.P2.spiritForm = spirit;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
  if (heated) state.players.P1.hand.push({ instanceId: 'cancel', cardId: 'heated-debate' });
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'feed-the-spirit' }, { instanceId: 'blessing', cardId: 'blessing-light' }];
  return state;
}
function fight(state: GameState, heated = false): GameState {
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selections = (state as GameState & { combatStackSelections?: Record<string, unknown> }).combatStackSelections ?? {};
    const playerId = selections.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: playerId === 'P1' && heated ? 'cancel' : null });
  }
  return state;
}
function acknowledge(state: GameState): GameState {
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
assert.equal(cardDefinition({ instanceId: '', cardId: 'feed-the-spirit' }).value, 0);
assert.match(cardDefinition({ instanceId: '', cardId: 'feed-the-spirit' }).effectText!, /^Defend value is 1 in Spirit Form\./);
for (const stack of [false, true]) {
  let state = setup(false, stack);
  assert.equal(feedSpiritDefenseBonus(state.players.P2, 'feed-the-spirit'), 0);
  state = fight(state);
  assert.equal(state.combatReveal?.defendTotal, 0);
  assert.equal(state.players.P2.hp, 7, 'Combat Damage applies now; post-combat healing waits for acknowledgment.');
  state = acknowledge(state);
  assert.equal(state.players.P2.spiritForm, true);
  assert.equal(state.players.P2.hp, 9, 'Lose 3 combat HP, then restore 2 for entering Spirit Form.');
  assert.equal(state.pendingAttack?.feedSpiritCombatDamage, 3);
  assert.equal(state.phase, 'mana-blast-offer');
  assert.ok(!applyCommand(state, { type: 'feed-spirit-decision', playerId: 'P1', cardInstanceId: 'blessing' }).ok);
  state = step(state, { type: 'feed-spirit-decision', playerId: 'P2', cardInstanceId: 'blessing' });
  assert.equal(state.players.P2.hp, 12);
  assert.ok(!state.players.P2.hand.some((card) => card.instanceId === 'blessing'));
  assert.ok(!state.players.P2.discard.some((card) => card.instanceId === 'blessing'));

  state = setup(true, stack);
  assert.equal(feedSpiritDefenseBonus(state.players.P2, 'feed-the-spirit'), 1);
  assert.equal(feedSpiritDefenseBonus(state.players.P2, 'feed-the-spirit', true), 0);
  state = fight(state);
  assert.equal(state.combatReveal?.defendTotal, 1);
  assert.ok(state.combatReveal?.defendModifiers?.some((modifier) => modifier.source === 'Feed the Spirit · Spirit Form'));
  state = acknowledge(state);
  assert.equal(state.players.P2.hp, 8, 'Already in Spirit Form: block 1, lose 2, receive no entry healing.');
  assert.equal(state.pendingAttack?.feedSpiritCombatDamage, 2);
  state = step(state, { type: 'feed-spirit-decision', playerId: 'P2', cardInstanceId: 'blessing' });
  assert.equal(state.players.P2.hp, 10, 'Blessing restores only actual combat HP lost.');

  state = acknowledge(fight(setup(false, stack)));
  state = step(state, { type: 'feed-spirit-decision', playerId: 'P2', cardInstanceId: null });
  assert.equal(state.players.P2.hp, 9);
  assert.ok(state.players.P2.hand.some((card) => card.instanceId === 'blessing'));

  for (const spirit of [false, true]) {
    state = fight(setup(spirit, stack, true), true);
    assert.equal(state.combatReveal?.defendTotal, Number(spirit), 'Heated Debate preserves Spirit Form defense value.');
    state = acknowledge(state);
    assert.equal(state.players.P2.hp, spirit ? 8 : 7);
    assert.equal(state.phase, 'active', 'Cancellation suppresses healing and the Blessing-removal offer.');
  }
}
console.log('Feed the Spirit checks passed.');
