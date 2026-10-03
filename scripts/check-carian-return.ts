import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

for (const returnActive of [false, true]) {
  for (const forfeit of [false, true]) {
    let state = createHotseatTestState(false, 'magician', 2);
    state.phase = 'active';
    state.activePlayerId = 'P1';
    state.objects = [];
    state.elevations = {};
    state.players.P1.position = { x: 2, y: 2 };
    state.players.P2.position = { x: 4, y: 2 };
    state.players.P2.character = 'merylin';
    state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
    state.players.P2.hand = [{ instanceId: 'yamato', cardId: 'yamato' }];
    state.players.P2.carianReturnNextDefend = returnActive;
    const hpBefore = state.players.P2.hp;

    state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
    state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'yamato' });
    assert.equal(state.phase as string, 'choosing-yamato-move');
    assert.equal(state.players.P2.carianReturnNextDefend, returnActive, 'Choosing movement does not consume the return effect yet.');
    state = step(state, { type: 'yamato-move', playerId: 'P2', to: forfeit ? { x: 5, y: 2 } : null });
    const reveal = state.combatReveal as NonNullable<GameState['combatReveal']> & { forfeitReason?: string; defendCardReturnedToHand?: boolean };
    assert.ok(reveal.deferredAfterCombatState);
    if (forfeit) {
      assert.equal(reveal.forfeitReason, 'Combat forfeited: out of range');
      assert.equal(reveal.defendCardReturnedToHand, returnActive, 'The summary reports the actual return.');
    }
    const expiresAt = reveal.expiresAt;
    state = step(state, { type: 'ack-combat', playerId: 'P1', combatExpiresAt: expiresAt });
    state = step(state, { type: 'ack-combat', playerId: 'P2', combatExpiresAt: expiresAt });
    assert.equal(state.players.P2.hand.some((card) => card.instanceId === 'yamato'), returnActive, 'Carian Stance returns the same Yamato after regular or forfeited combat.');
    assert.equal(state.players.P2.discard.some((card) => card.instanceId === 'yamato'), !returnActive, 'Returned Yamato is absent from Discard.');
    assert.equal(state.players.P2.carianReturnNextDefend, false, 'The next-Defend return effect is consumed.');
    assert.equal(state.players.P1.discard.some((card) => card.instanceId === 'attack'), true, 'The Attack Card stays discarded.');
    assert.equal(state.players.P2.merylinSummonActive, true, 'Yamato grants Summon.');
    if (forfeit) assert.equal(state.players.P2.hp, hpBefore, 'Forfeited combat deals no combat Damage.');
  }
}

console.log('Carian Stance Yamato return checks passed.');
