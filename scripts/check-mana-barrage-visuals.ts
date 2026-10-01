import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand) {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}

for (const mode of ['decline', 'spend', 'consume', 'no-mana'] as const) {
  for (const defended of [false, true]) {
    let state = createHotseatTestState(true, 'magician', 2, 'dummy');
    state.objects = [];
    state.elevations = {};
    state.players.P1.position = { x: 2, y: 2 };
    state.players.P2.position = { x: 3, y: 2 };
    state.players.P1.manaMode = mode === 'consume' ? 'consume' : 'generate';
    state.players.P1.manaPoints = mode === 'no-mana' ? 0 : 2;
    state.players.P1.hand = [{ cardId: 'mana-barrage', instanceId: 'barrage' }];
    state.players.P2.hand = defended ? [{ cardId: 'defend-1', instanceId: 'defense' }] : [];
    state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'barrage', targetId: 'P2' });
    state = step(state, defended ? { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' } : { type: 'pass-defense', playerId: 'P2' });
    if (state.phase === 'choosing-mana-barrage') state = step(state, { type: 'mana-barrage-decision', playerId: 'P1', use: mode === 'spend' });
    assert.ok(state.combatReveal?.deferredAfterCombatState, 'The presentation survives combat confirmation and network serialization.');
    const resolved: GameState = JSON.parse(state.combatReveal!.deferredAfterCombatState!);
    const damage = resolved.objectPushAnimations.flatMap(event => event.damage ? [event.damage] : []);
    const combat = damage.filter(event => event.presentationTiming === 'mana-barrage-combat');
    const bonus = damage.filter(event => event.presentationTiming === 'mana-barrage-bonus');
    assert.equal(combat.length, 1);
    assert.equal(combat[0].amount, defended ? 2 : 3, 'The first number uses resolved combat damage, excluding the bonus.');
    assert.equal(Boolean(combat[0].effect), false);
    assert.equal(bonus.length, mode === 'spend' || mode === 'consume' ? 1 : 0);
    if (bonus.length) {
      assert.equal(bonus[0].amount, mode === 'consume' ? 2 : 1);
      assert.equal(bonus[0].effect, true, 'The second damage event must use the purple effect-damage style.');
    }
  }
}
console.log('Mana Barrage damage presentation checks passed: decline, spend, Consume, no Mana, and defended combat.');

for (const stack of [false, true]) {
  let state = createHotseatTestState(true, 'magician', 2, 'merylin');
  state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.manaMode = 'consume';
  state.players.P1.hand = [{ instanceId: 'barrage', cardId: 'mana-barrage' }];
  state.players.P2.hand = [{ instanceId: 'block', cardId: 'decisive-block' }];
  state.players.P2.hp = 20;
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'barrage', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'block' });
  if (state.phase === 'choosing-combat-stack') {
    state = step(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: null });
    state = step(state, { type: 'combat-stack-choice', playerId: 'P2', cardInstanceId: null });
  }
  assert.equal(state.combatReveal?.attackModifiers?.some(modifier => modifier.source === 'Mana Barrage Consume'), true, 'The card still describes its Consume effect.');
  assert.ok(state.combatReveal?.deferredAfterCombatState);
  const resolved: GameState = JSON.parse(state.combatReveal!.deferredAfterCombatState!);
  assert.equal(resolved.players.P2.hp, 20, 'Decisive Block cancels Mana Barrage Consume after-combat Damage.');
  assert.equal(resolved.objectPushAnimations.some(event => event.damage?.presentationTiming === 'mana-barrage-bonus'), false, 'No cancelled bonus Damage animation is queued.');
  assert.equal(resolved.log.some(line => line.includes('Mana Barrage (Consume) dealt')), false, 'The cancelled effect is not logged as dealt.');
}

console.log('Decisive Block cancels Mana Barrage Consume in both combat modes.');
