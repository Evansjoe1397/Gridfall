import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, effectiveAttackRange, narrativeEligibleEnemies, type GameState } from '../shared/game.ts';

function fresh(): GameState {
  const state = createHotseatTestState(true, 'kazka', 2, 'orkk');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 6, y: 2 };
  state.players.P1.actionsRemaining = 2;
  state.players.P1.perkUsed = false;
  state.players.P1.hand = [{ instanceId: 'story', cardId: 'once-upon-a-time' }];
  state.players.P1.deck = [
    { instanceId: 'lower', cardId: 'attack-2' },
    { instanceId: 'upper', cardId: 'defend-1' },
  ];
  state.players.P1.discard = [];
  return state;
}

function use(state: GameState, level: 1 | 2 | 3): GameState {
  if (level > 1) {
    state.players.P1.hand = [];
    state.players.P1.spellEcho[level - 1] = { instanceId: 'story', cardId: 'once-upon-a-time' };
  }
  const command = level === 1
    ? { type: 'play-perk' as const, playerId: 'P1' as const, cardInstanceId: 'story', destination: 'direct' as const }
    : { type: 'use-echo-perk' as const, playerId: 'P1' as const, position: level };
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}

const definition = cardDefinition({ instanceId: 'story', cardId: 'once-upon-a-time' });
assert.equal(definition.kind, 'perk');
assert.equal(definition.narrative, true);
assert.equal(createHotseatTestState(true, 'kazka', 2, 'orkk').players.P1.hand.some((card) => card.cardId === 'once-upon-a-time'), true);

let state = use(fresh(), 1);
assert.equal(state.phase, 'choosing-once-upon-return');
assert.deepEqual(state.players.P1.hand.map((card) => card.instanceId), ['upper', 'lower']);
assert.equal(state.players.P1.actionsRemaining, 1);
assert.equal(applyCommand(state, { type: 'once-upon-return', playerId: 'P2', cardInstanceId: 'upper' }).ok, false);
assert.equal(applyCommand(state, { type: 'once-upon-return', playerId: 'P1', cardInstanceId: 'story' }).ok, false);
let result = applyCommand(state, { type: 'once-upon-return', playerId: 'P1', cardInstanceId: 'upper' });
assert.equal(result.ok, true, result.ok ? '' : result.error);
state = result.state;
assert.equal(state.phase, 'active');
assert.equal(state.players.P1.deck.at(-1)?.instanceId, 'upper');
assert.equal(state.players.P1.knownTopCardId, 'defend-1');
assert.deepEqual(state.players.P1.hand.map((card) => card.instanceId), ['lower']);

state = use(fresh(), 2);
assert.equal(state.phase, 'choosing-once-upon-return');
result = applyCommand(state, { type: 'once-upon-return', playerId: 'P1', cardInstanceId: 'lower' });
assert.equal(result.ok, true, result.ok ? '' : result.error);
state = result.state;
assert.equal(state.phase, 'choosing-narrative');
assert.equal(state.players.P1.deck.at(-1)?.instanceId, 'lower');
result = applyCommand(state, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
assert.equal(result.ok, true, result.ok ? '' : result.error);
assert.equal(result.state.phase, 'active');

state = use(fresh(), 3);
assert.equal(state.phase, 'choosing-narrative');
assert.equal(state.players.P1.deck.length, 0);
assert.deepEqual(state.players.P1.hand.map((card) => card.instanceId), ['upper', 'lower']);
assert.equal(effectiveAttackRange(state, state.players.P1), 4);
assert.deepEqual(narrativeEligibleEnemies(state, 'P1'), ['P2'], 'The Level 3 Range applies before the Narrative choice.');
result = applyCommand(state, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
assert.equal(result.ok, true, result.ok ? '' : result.error);
state = result.state;
result = applyCommand(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(result.ok, true, result.ok ? '' : result.error);
assert.equal(effectiveAttackRange(result.state, result.state.players.P1), 3, 'The Range bonus expires at turn end.');

state = fresh();
state.players.P1.deck = [{ instanceId: 'only', cardId: 'pinned' }];
state.players.P1.hand = [];
state.players.P1.spellEcho[0] = { instanceId: 'story', cardId: 'once-upon-a-time' };
result = applyCommand(state, { type: 'use-echo-perk', playerId: 'P1', position: 1 });
assert.equal(result.ok, true, result.ok ? '' : result.error);
state = result.state;
assert.equal(state.phase, 'active', 'A single available Card is returned without a choice.');
assert.equal(state.players.P1.deck.at(-1)?.instanceId, 'only');
assert.equal(state.players.P1.pinnedStacks, 0, 'Returning a newly drawn Pinned Card clears its Hand effect.');

state = fresh();
state.players.P1.deck = [];
state = use(state, 3);
assert.equal(state.phase, 'choosing-narrative', 'Level 3 still triggers Narrative when no Cards are available to draw.');
assert.equal(effectiveAttackRange(state, state.players.P1), 4);

console.log('(Once upon a time) checks passed.');
