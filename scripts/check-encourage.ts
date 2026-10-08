import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type GameState } from '../shared/game.ts';

function setup(level: 1 | 2 | 3, rage: number): GameState {
  const state = createHotseatTestState(true, 'orkk', 2, 'shinobi');
  state.phase = 'active'; state.activePlayerId = 'P1';
  const player = state.players.P1;
  player.hand = [];
  player.deck = [{ instanceId: 'deck-draw', cardId: 'attack-2' }];
  player.discard = [{ instanceId: 'discard-draw', cardId: 'defend-1' }];
  player.spellEcho = [null, null, null];
  player.spellEcho[level - 1] = { instanceId: 'encourage', cardId: 'encourage' };
  player.rageStacks = rage;
  return state;
}
function use(state: GameState, level: 1 | 2 | 3): GameState {
  const result = applyCommand(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}
assert.equal(cardDefinition({ instanceId: '', cardId: 'encourage' }).levelEffects?.[2], 'Set Rage to 3, if below. Also draw 1 random Card from your Discard');
for (const level of [1, 2, 3] as const) for (const rage of [0, 1, 2, 3, 4, 6]) for (const doubleRage of [false, true]) {
  const state = setup(level, rage);
  state.players.P1.doubleRageUntilEnemyTurnEnd = doubleRage;
  const result = use(state, level);
  const player = result.players.P1;
  assert.equal(player.rageStacks, level === 3 ? Math.max(3, rage) : rage + Number(level === 2), 'Level 3 sets a floor of 3 without increasing Rage already at/above 3; earlier levels retain their effects.');
  assert.ok(player.hand.some((card) => card.instanceId === 'deck-draw'));
  assert.equal(player.hand.some((card) => card.instanceId === 'discard-draw'), level === 3);
  assert.equal(player.discard.length, level === 3 ? 0 : 1);
  assert.equal(player.actionsRemaining, 1);
  assert.equal(player.perkUsed, true);
}
for (const sample of [0, 0.999]) {
  const state = setup(3, 0);
  state.players.P1.discard.push({ instanceId: 'discard-pinned', cardId: 'pinned' });
  const originalRandom = Math.random;
  let result: GameState;
  try { Math.random = () => sample; result = use(state, 3); }
  finally { Math.random = originalRandom; }
  assert.ok(result.players.P1.hand.some((card) => card.instanceId === (sample === 0 ? 'discard-draw' : 'discard-pinned')), 'Recovery randomly selects across the Discard pile.');
  assert.equal(result.players.P1.discard.length, 1);
  assert.equal(result.players.P1.pinnedStacks, sample === 0 ? 0 : 1);
}
const empty = setup(3, 1);
empty.players.P1.deck = []; empty.players.P1.discard = [];
const emptyResult = use(empty, 3);
assert.equal(emptyResult.players.P1.rageStacks, 3, 'Empty Card piles do not prevent the Rage floor.');
assert.equal(emptyResult.players.P1.hand.length, 0);
console.log('EncouRAGE checks passed.');
