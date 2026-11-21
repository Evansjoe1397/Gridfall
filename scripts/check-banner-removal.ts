import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, drawCards, type GameCommand, type GameState } from '../shared/game.ts';

function setup(cardId: 'banner' | 'banner-draw', stack: boolean): GameState {
  const state = createHotseatTestState(stack, 'magician', 2, 'merylin');
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
  }
  state.players.P1.hand = [{ instanceId: 'reward', cardId }];
  state.players.P1.freeMoveUsed = true; state.players.P1.movementRemaining = 4;
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function removed(state: GameState): void {
  const player = state.players.P1;
  assert.ok(![...player.hand, ...player.deck, ...player.discard].some((card) => card.instanceId === 'reward'));
  assert.ok(!player.spellEcho.some((card) => card?.instanceId === 'reward'));
  assert.equal(drawCards(player, 10), 0, 'The discarded Banner cannot be reshuffled and drawn again.');
}

for (const stack of [false, true]) for (const cardId of ['banner', 'banner-draw'] as const) {
  assert.match(cardDefinition({ instanceId: '', cardId }).effectText!, /Remove when Discarded for any reason\./);

  let state = setup(cardId, stack);
  state.phase = 'choosing-end-discard';
  state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'reward' });
  assert.equal(state.players.P1.movementRemaining, 3, 'Discarding Banner removes its unspent MOV bonus.');
  removed(state);

  state = setup(cardId, stack);
  state.players.P1.hand.push(...Array.from({ length: 5 }, (_, i) => ({ instanceId: `kept-${i}`, cardId: 'attack-2' as const })));
  state = step(state, { type: 'end-turn', playerId: 'P1' });
  assert.equal(state.players.P1.hand.length, 5, 'Mandatory hand-limit discard still selects Banner automatically.');
  removed(state);

  state = step(setup(cardId, stack), { type: 'dash', playerId: 'P1' });
  assert.equal(state.phase, 'dashing', 'Banner can still pay for Dash automatically.');
  removed(state);
  state = step(state, { type: 'cancel-dash', playerId: 'P1' });
  removed(state);

  state = setup(cardId, stack);
  state.phase = 'choosing-force-disarm-discard';
  state.forceDisarm = { targetId: 'P1', cardKind: 'attack' };
  state = step(state, { type: 'force-disarm-discard', playerId: 'P1', cardInstanceId: 'reward' });
  removed(state);

  state = setup(cardId, stack);
  state.players.P1.deck = [{ instanceId: 'guard-draw', cardId: 'defend-1' }];
  state = step(state, { type: 'guard', playerId: 'P1' });
  assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'guard-draw'), 'Guard discards Banner instead of the drawn Card.');
  removed(state);
}
console.log('Both Banner rewards: descriptions, optional/automatic hand-limit discard, MOV adjustment, Guard, forced discard, Dash/cancellation and no recycling passed in both combat modes.');
