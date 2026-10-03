import assert from 'node:assert/strict';
import { applicableCombatCardInstanceIds, applyCommand, createHotseatTestState, resolveMultiplayerCombatStack, type CardTypeId, type GameCommand, type GameState, type PlayerId } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, result.error);
  return result.state;
}

function setup(attack: CardTypeId, defense: CardTypeId, protection: CardTypeId, holder: PlayerId = 'P2', stack = true): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'dummy');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  for (const player of Object.values(state.players)) {
    player.hp = player.maxHp = 20; player.hand = []; player.deck = []; player.discard = [];
  }
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  state.players[holder].hand.push({ instanceId: 'protection', cardId: protection });
  return state;
}

function reveal(state: GameState): GameState {
  return step(step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }), { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
}

for (const stack of [false, true]) {
  for (const protection of ['blessing-shield', 'mythril-helmet', 'blessing-faith'] as const) {
    const state = reveal(setup('attack-2', 'decisive-block', protection, 'P2', stack));
    assert.ok(state.combatReveal?.deferredAfterCombatState, `${protection}: harmless combat skips the offer (${stack})`);
    assert.ok(state.players.P2.hand.some((card) => card.instanceId === 'protection'), 'Unused protection stays in Hand');

    const damaging = reveal(setup('attack-3', 'defend-1', protection, 'P2', stack));
    assert.equal(damaging.phase, protection === 'blessing-faith' ? 'choosing-blessing-faith' : stack ? 'choosing-combat-stack' : 'choosing-mythril-helmet');
  }

  const cancelled = reveal(setup('hello-there', 'decisive-block', 'blessing-shield', 'P2', stack));
  assert.ok(cancelled.combatReveal?.deferredAfterCombatState, 'Cancelled Attack effects cannot justify Shield');
  const status = reveal(setup('hello-there', 'defend-1', 'blessing-shield', 'P2', stack));
  assert.equal(status.phase, stack ? 'choosing-combat-stack' : 'choosing-mythril-helmet', 'Shield can help against status-only effects');
  for (const protection of ['mythril-helmet', 'blessing-faith'] as const) {
    assert.ok(reveal(setup('hello-there', 'defend-1', protection, 'P2', stack)).combatReveal?.deferredAfterCombatState, 'Damage protection cannot block a status-only effect');
  }

  const attackerShield = reveal(setup('attack-3', 'defend-1', 'blessing-shield', 'P1', stack));
  assert.ok(attackerShield.combatReveal?.deferredAfterCombatState, 'Attacker Shield does not protect their opponent');
  const preCombatOnly = reveal(setup('attack-2', 'thorns', 'blessing-shield', 'P1', stack));
  assert.ok(preCombatOnly.combatReveal?.deferredAfterCombatState, 'Shield cannot prevent already resolved pre-combat damage');

  const retaliation = setup('attack-2', 'counterspell', 'blessing-shield', 'P1', stack);
  retaliation.players.P2.manaPoints = 1;
  assert.equal(reveal(retaliation).phase, stack ? 'choosing-combat-stack' : 'choosing-mythril-helmet', 'Shield remains useful against defensive retaliation');

  const selfDamage = reveal(setup('repent', 'defend-1', 'blessing-shield', 'P1', stack));
  assert.ok(selfDamage.combatReveal?.deferredAfterCombatState, 'Shield cannot absorb self-inflicted Repent damage');
  for (const protection of ['blessing-shield', 'mythril-helmet', 'blessing-faith'] as const) {
    const effect = setup('hello-there', 'defend-1', protection, 'P2', stack);
    effect.players.P2.hand.push({ instanceId: 'pinned', cardId: 'pinned' }); effect.players.P2.pinnedStacks = 1;
    assert.ok(!reveal(effect).combatReveal?.deferredAfterCombatState, 'Card-effect Damage still justifies protection when combat Values deal none');
  }
}

const pinned = setup('attack-3', 'calmness', 'mythril-helmet');
pinned.players.P1.hand.push({ instanceId: 'pinned', cardId: 'pinned' }); pinned.players.P1.pinnedStacks = 1;
assert.ok(reveal(pinned).combatReveal?.deferredAfterCombatState, 'Existing damage negation makes Helmet redundant');

const redirect = setup('attack-3', 'redirect', 'blessing-shield');
redirect.players.P2.character = 'merylin';
redirect.objects.push({ id: 'box', kind: 'wooden-box', name: 'Box', hp: 3, maxHp: 3, position: { x: 3, y: 3 } });
assert.equal(reveal(redirect).phase, 'choosing-combat-stack', 'Shield is still useful when it saves a Redirect Object');

const boosted = setup('attack-2', 'decisive-block', 'blessing-shield');
boosted.players.P1.hand.push({ instanceId: 'boost', cardId: 'vicious-mockery' });
const choices = reveal(boosted);
assert.ok(applicableCombatCardInstanceIds(choices, 'P2').includes('protection'), 'Keep protection available against a possible private attack boost');
const snapshot = JSON.stringify(choices);
applicableCombatCardInstanceIds(choices, 'P2');
assert.equal(JSON.stringify(choices), snapshot, 'Forecasts cannot mutate live combat');

const both = setup('attack-3', 'defend-1', 'mythril-helmet');
both.players.P1.hand.push({ instanceId: 'attacker-helmet', cardId: 'mythril-helmet' });
const simultaneous = resolveMultiplayerCombatStack(reveal(both), { P1: ['attacker-helmet'], P2: ['protection'] });
assert.ok(simultaneous.ok, 'Both private protection selections are validated before either is applied');

console.log('Combat protection checks passed: harmless hits, statuses, cancellations, retaliation, existing protection, and private choices.');
