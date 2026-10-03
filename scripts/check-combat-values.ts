import assert from 'node:assert/strict';
import { applicableCombatCardInstanceIds, applyCommand, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, result.error);
  return result.state;
}
function setup(attack: CardTypeId, defense: CardTypeId, stack = true): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'dummy');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  for (const player of Object.values(state.players)) {
    player.hp = player.maxHp = 20; player.hand = []; player.deck = []; player.discard = [];
  }
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  return state;
}
function reveal(state: GameState): GameState {
  return step(step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }), { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
}

for (const stack of [true, false]) {
  for (const attack of ['attack-2', 'attack-3'] as const) {
    const initial = setup(attack, 'decisive-block', stack);
    initial.players.P1.hand.push({ instanceId: 'light', cardId: 'blessing-light' });
    const state = reveal(initial);
    if (attack === 'attack-2') {
      assert.ok(state.combatReveal?.deferredAfterCombatState, 'A reduction that only turns a blocked hit into a tie is skipped');
      assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'light'));
    } else assert.equal(state.phase, stack ? 'choosing-combat-stack' : 'choosing-blessing-light', 'A reduction that allows Damage remains available');
  }
  const zero = setup('attack-2', 'feed-the-spirit', stack);
  zero.players.P1.hand.push({ instanceId: 'light', cardId: 'blessing-light' });
  assert.ok(reveal(zero).combatReveal?.deferredAfterCombatState, 'A zero Defend Value cannot be usefully reduced');

  const excessive = setup('attack-2', 'decisive-block', stack);
  excessive.players.P2.hand.push({ instanceId: 'mockery', cardId: 'vicious-mockery' });
  assert.ok(reveal(excessive).combatReveal?.deferredAfterCombatState, 'Already sufficient Defense does not offer a bonus');
  const useful = setup('attack-3', 'defend-1', stack);
  useful.players.P2.hand.push({ instanceId: 'mockery', cardId: 'vicious-mockery-1' });
  assert.equal(reveal(useful).phase, stack ? 'choosing-combat-stack' : 'choosing-vicious-mockery', 'Partial Damage prevention is still useful');

  const negated = setup('attack-3', 'calmness', stack);
  negated.players.P1.hand.push({ instanceId: 'pinned', cardId: 'pinned' }, { instanceId: 'light', cardId: 'blessing-light' });
  negated.players.P1.pinnedStacks = 1;
  negated.players.P2.hand.push({ instanceId: 'mockery', cardId: 'vicious-mockery' });
  assert.ok(reveal(negated).combatReveal?.deferredAfterCombatState, 'Active damage negation skips both Defense boosts and reductions');

  const possible = setup('attack-2', 'decisive-block', stack);
  possible.players.P1.hand.push({ instanceId: 'enemy-boost', cardId: 'vicious-mockery' });
  possible.players.P2.hand.push({ instanceId: 'defense-boost', cardId: 'vicious-mockery' });
  const choices = reveal(possible);
  if (stack) assert.ok(applicableCombatCardInstanceIds(choices, 'P2').includes('defense-boost'), 'Defense remains available against a possible private Attack boost');
  else assert.ok(choices.combatReveal?.viciousMockery?.eligible.includes('P2'), 'Local Defense remains available while an Attack boost is undecided');
}

for (const cardId of ['banner', 'helmet', 'vicious-mockery', 'vicious-mockery-1'] as const) {
  const safe = setup('attack-2', 'decisive-block');
  safe.players.P2.hand.push({ instanceId: 'bonus', cardId });
  assert.ok(reveal(safe).combatReveal?.deferredAfterCombatState, `${cardId}: useless Defense bonus is skipped`);
  const hit = setup('attack-3', 'defend-1');
  hit.players.P2.hand.push({ instanceId: 'bonus', cardId });
  assert.ok(applicableCombatCardInstanceIds(reveal(hit), 'P2').includes('bonus'), `${cardId}: meaningful Defense bonus remains selectable`);
}

console.log('Combat Value checks passed: excessive Defense, useful reductions, zero Values, partial prevention, negation, and undecided Attack boosts.');
