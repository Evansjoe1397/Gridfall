import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, `${command.type}: ${result.error ?? ''}`);
  return result.state;
}

function setup(cardId: 'fireball' | 'firebolt'): GameState {
  const state = createHotseatTestState(true, 'magician', 2, 'merylin');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'reward', cardId }];
  state.players.P1.deck = []; state.players.P1.discard = [];
  return state;
}

function absent(state: GameState, cardId: CardTypeId) {
  const player = state.players.P1;
  assert.equal([...player.hand, ...player.deck, ...player.discard, ...player.spellEcho.filter(card => card != null)].some(card => card.cardId === cardId), false, `${cardId} must not enter a recycled pile.`);
}

for (const cardId of ['fireball', 'firebolt'] as const) {
  let used = step(setup(cardId), { type: 'play-perk', playerId: 'P1', cardInstanceId: 'reward', destination: 'direct' });
  used = step(used, { type: 'fireball-target', playerId: 'P1', targetId: 'P2' });
  absent(used, cardId);

  const handLimit = setup(cardId);
  handLimit.phase = 'choosing-end-discard';
  const discarded = step(handLimit, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'reward' });
  absent(discarded, cardId);

  const dash = setup(cardId);
  dash.phase = 'choosing-dash-discard';
  dash.players.P1.freeMoveUsed = true;
  dash.dashCancellation = { previousMovementRemaining: 0, discardedCard: null };
  const dashDiscarded = step(dash, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'reward' });
  absent(dashDiscarded, cardId);
  const cancelled = step(dashDiscarded, { type: 'cancel-dash', playerId: 'P1' });
  absent(cancelled, cardId);
}

console.log('Firebolt and Fireball are removed after use, hand-limit discard, and Dash discard, including Dash cancellation.');
