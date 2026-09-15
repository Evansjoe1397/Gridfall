import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}
function settled(state: GameState): GameState {
  return state.combatReveal?.deferredAfterCombatState ? JSON.parse(state.combatReveal.deferredAfterCombatState) : state;
}
function setup(consume: boolean): GameState {
  const state = createHotseatTestState(true, 'magician', 2, 'dummy');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'snowball', cardId: 'snowball-effect' }];
  state.players.P1.deck = consume ? [{ instanceId: 'drawn', cardId: 'attack-2' }] : [];
  state.players.P1.discard = [];
  state.players.P2.hand = []; state.players.P2.deck = []; state.players.P2.discard = [];
  state.players.P1.manaMode = consume ? 'consume' : 'generate';
  return state;
}

for (const consume of [false, true]) {
  const initial = setup(consume);
  const declared = step(initial, { type: 'attack', playerId: 'P1', cardInstanceId: 'snowball', targetId: 'P2' });
  assert.equal(declared.players.P1.hand.some((card) => card.instanceId === 'snowball'), false, 'Snowball must not return before combat resolves.');
  assert.equal(declared.players.P1.discard.some((card) => card.instanceId === 'snowball'), true);
  const resolved = settled(step(declared, { type: 'pass-defense', playerId: 'P2' }));
  assert.equal(resolved.players.P1.hand.some((card) => card.instanceId === 'snowball'), true, 'Snowball returns after combat.');
  assert.equal(resolved.players.P1.discard.some((card) => card.instanceId === 'snowball'), false);
  assert.equal(resolved.phase, consume ? 'choosing-snowball-discard' : 'active');
  assert.equal(resolved.players.P1.hand.some((card) => card.instanceId === 'drawn'), consume, 'Consume still draws exactly after combat.');
}

for (const consume of [false, true]) {
  const state = setup(consume);
  state.players.P2.position = { x: 7, y: 6 };
  state.objects = [{ id: 'box', name: 'Box', kind: 'wooden-box', position: { x: 3, y: 2 }, hp: 3, maxHp: 3 }];
  const resolved = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'snowball', targetKind: 'object', targetId: 'box' });
  assert.equal(resolved.players.P1.hand.some((card) => card.instanceId === 'snowball'), true, 'Snowball returns after Object combat.');
  assert.equal(resolved.phase, consume ? 'choosing-snowball-discard' : 'active');
  assert.equal(resolved.players.P1.hand.some((card) => card.instanceId === 'drawn'), consume);
}
console.log('Snowball Effect checks passed: post-combat return and unchanged Consume effect.');
