import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand) {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.error);
  return result.state;
}

for (const choice of ['heal', 'cleanse', 'cancel'] as const) {
  for (const hasEffect of [true, false]) {
    let state = createHotseatTestState(true, 'magician', 2, 'merylin');
    state.phase = 'active';
    const player = state.players.P1;
    player.hp = player.maxHp - (hasEffect ? 2 : 0);
    player.hand = [{ instanceId: 'sweet-test', cardId: 'sweet-potato' }];
    player.deck = hasEffect ? [{ instanceId: 'status-test', cardId: 'headache' }] : [];
    const originalHp = player.hp;
    state = step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'sweet-test', destination: 'direct' });
    assert.equal(state.objectPushAnimations.some(event => event.sweetPotato), false);
    state = step(state, { type: 'sweet-potato-choice', playerId: 'P1', choice });
    const events = state.objectPushAnimations.filter(event => event.sweetPotato);
    assert.equal(events.length, choice === 'cancel' ? 0 : 1);
    if (choice !== 'cancel') assert.deepEqual(events[0].sweetPotato, { playerId: 'P1', choice });
    assert.equal(state.players.P1.hp, choice === 'heal' ? player.maxHp : originalHp);
    assert.equal(state.players.P1.deck.length, choice === 'cleanse' ? 0 : Number(hasEffect));
    if (choice === 'cancel') assert.equal(state.players.P1.hand.some(card => card.instanceId === 'sweet-test'), true);
  }
}
console.log('Sweet Potato: heal, cleanse, cancel, and zero-effect uses passed.');
