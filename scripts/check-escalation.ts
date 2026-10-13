import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type GameCommand, type GameState, type GameStateWithNarrative } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, `${command.type}: ${result.error ?? ''}`);
  return result.state;
}

function fresh(simultaneous = false): GameState {
  const state = createHotseatTestState(true, 'kazka', 2, 'orkk');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: simultaneous });
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.removedDeck = [];
    player.hp = player.maxHp = 18;
    player.shieldEquipped = false;
  }
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.turnStartRecord = { position: { x: 2, y: 2 }, hp: 18, round: 1 };
  state.players.P2.turnStartRecord = { position: { x: 3, y: 2 }, hp: 18, round: 1 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'escalation' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }];
  return state;
}

function attack(state: GameState): GameState {
  const attacked = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  assert.equal(attacked.pendingAttack?.attackValue, 2);
  return attacked;
}

function defend(state: GameState): GameState {
  return step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
}

function acknowledge(state: GameState): GameState {
  assert.ok(state.combatReveal?.deferredAfterCombatState);
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}

const definition = cardDefinition({ instanceId: '', cardId: 'escalation' });
assert.equal(definition.name, '(Escalation)');
assert.equal(definition.kind, 'attack');
assert.equal(definition.narrative, true);
assert.equal(definition.value, 2);
assert.equal(createHotseatTestState(true, 'kazka', 2, 'orkk').players.P1.hand.some((card) => card.cardId === 'escalation'), true);

for (const simultaneous of [false, true]) {
  for (const condition of ['none', 'hand', 'top-removed', 'both', 'buried-removed', 'deck', 'discard'] as const) {
    let state = fresh(simultaneous);
    const target = state.players.P2;
    if (condition === 'hand' || condition === 'both') target.hand.push({ instanceId: 'headache-hand', cardId: 'headache' });
    if (condition === 'top-removed' || condition === 'both' || condition === 'buried-removed') target.removedDeck = [{ instanceId: 'removed-headache', cardId: 'headache' }];
    if (condition === 'buried-removed') target.removedDeck!.push({ instanceId: 'removed-top', cardId: 'exhaust' });
    if (condition === 'deck' || condition === 'discard') target[condition].push({ instanceId: 'stored-headache', cardId: 'headache' });
    const originalHandHeadaches = target.hand.filter((card) => card.cardId === 'headache').length;
    const bonusDamage = ['hand', 'top-removed', 'both'].includes(condition) ? 1 : 0;
    state = defend(attack(state));
    assert.equal(state.players.P2.hp, 17 - bonusDamage, `${condition}: one combat Damage plus conditional pre-combat Damage.`);
    assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, originalHandHeadaches, 'New Headache waits for the combat result.');
    assert.notEqual(state.phase, 'choosing-narrative');
    state = acknowledge(state);
    assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, originalHandHeadaches + 1);
    assert.equal(state.phase, 'choosing-narrative');
    assert.equal((state as GameStateWithNarrative).narrativeChoice?.kazkaId, 'P1');
    assert.equal(state.players.P1.discard.some((card) => card.cardId === 'escalation'), true, 'Escalation is discarded normally.');
    state = step(state, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp' });
    assert.equal(state.players.P2.hp, 18, 'The lone enemy can be reverted after Headache is added.');
    assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, originalHandHeadaches + 1);
    assert.equal(state.phase, 'active');
  }

  const blocked = fresh(simultaneous);
  blocked.players.P2.hand = [{ instanceId: 'defense', cardId: 'decisive-block' }, { instanceId: 'headache', cardId: 'headache' }];
  let state = acknowledge(defend(attack(blocked)));
  assert.equal(state.players.P2.hp, 18, 'Block cancels pre-combat Damage.');
  assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 1);
  assert.equal(state.phase, 'active', 'Block cancels the Attack Card’s Narration as well as its Status effect.');

  const calm = fresh(simultaneous);
  calm.players.P1.hand.push({ instanceId: 'pinned', cardId: 'pinned' });
  calm.players.P2.hand = [{ instanceId: 'defense', cardId: 'calmness' }, { instanceId: 'headache', cardId: 'headache' }];
  state = acknowledge(defend(attack(calm)));
  assert.equal(state.players.P2.hp, 18, 'Damage negation covers the pre-combat Damage.');
  assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 2, 'Negating Damage does not cancel Status Cards.');
  assert.equal(state.phase, 'choosing-narrative');

  // A separate Combat Card must not replay the pre-combat damage or cancel the user's own Attack.
  const doubleNarration = fresh(simultaneous);
  doubleNarration.players.P1.hand.push({ instanceId: 'debate', cardId: 'heated-debate' });
  doubleNarration.players.P2.hand.push({ instanceId: 'headache', cardId: 'headache' });
  state = defend(attack(doubleNarration));
  assert.equal(state.phase, 'choosing-combat-stack');
  assert.equal(state.players.P2.hp, 17, 'Damage happens before optional Combat Card selection.');
  state = step(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'debate' });
  assert.equal(state.players.P2.hp, 16, 'Pre-combat Damage occurs only once.');
  state = acknowledge(state);
  assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 2);
  state = step(state, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
  assert.equal(state.phase, 'active', 'Only Escalation triggers Narration; Heated Debate cancels the enemy Card instead.');
}

// A Shield can Block Headache without cancelling Kazka's own Narration effect.
let state = fresh(true);
state.players.P2.hand = [{ instanceId: 'defense', cardId: 'graveyard' }, { instanceId: 'shield', cardId: 'blessing-shield' }];
state = defend(attack(state));
state = step(state, { type: 'combat-stack-choice', playerId: 'P2', cardInstanceId: 'shield' });
state = acknowledge(state);
assert.equal(state.players.P2.hand.some((card) => card.cardId === 'headache'), false);
assert.equal(state.phase, 'choosing-narrative');

// A later optional Damage shield cannot retroactively erase pre-combat Damage.
state = fresh(true);
state.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }, { instanceId: 'headache', cardId: 'headache' }, { instanceId: 'helmet', cardId: 'mythril-helmet' }];
state = defend(attack(state));
assert.equal(state.players.P2.hp, 17);
state = step(state, { type: 'combat-stack-choice', playerId: 'P2', cardInstanceId: 'helmet' });
state = acknowledge(state);
assert.equal(state.players.P2.hp, 17);
assert.equal(state.phase, 'choosing-narrative');

const lethal = fresh();
lethal.players.P2.hp = 1;
lethal.players.P2.hand.push({ instanceId: 'headache', cardId: 'headache' });
state = defend(attack(lethal));
assert.equal(state.phase, 'finished');
assert.equal(state.pendingAttack, null);
assert.equal(state.combatReveal, null, 'Pre-combat defeat aborts combat rather than opening a stale result.');

const object = fresh();
object.objects = [{ id: 'box', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
state = step(object, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'box' });
assert.equal(state.phase, 'choosing-narrative', 'A Narrative Attack on an Object still triggers Kazka’s own Narration.');
assert.equal(state.players.P2.hand.some((card) => card.cardId === 'headache'), false);

console.log('Escalation checks passed in both combat modes.');
