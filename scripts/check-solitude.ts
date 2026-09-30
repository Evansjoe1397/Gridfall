import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState } from '../shared/game.ts';

const card = cardDefinition({ instanceId: 'solitude', cardId: 'solitude' });
assert.match(card.effectText!, /Attack Value is 5/);
assert.doesNotMatch(card.effectText!, /Before combat|\+2 ATT/i);

for (const attackType of ['attack', 'spectre-attack'] as const) {
  for (const crowded of [false, true]) {
    for (const defense of ['block', 'pass'] as const) {
      const state = createHotseatTestState(true, 'spectre', 2, 'dummy');
      state.phase = 'active';
      state.activePlayerId = 'P1';
      state.elevations = {};
      state.players.P1.position = { x: 2, y: 2 };
      state.players.P2.position = { x: 3, y: 2 };
      state.players.P1.hand = [{ instanceId: 'solitude', cardId: 'solitude' }];
      state.players.P2.hand = [{ instanceId: 'block', cardId: 'block' }];
      state.objects = crowded ? [{ id: 'column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 4, y: 3 } }] : [];
      const attack = applyCommand(state, { type: attackType, playerId: 'P1', cardInstanceId: 'solitude', origin: 'spectre', targetKind: 'player', targetId: 'P2' });
      assert.equal(attack.ok, true);
      if (!attack.ok) continue;
      const expected = crowded ? 3 : 5;
      assert.equal(attack.state.pendingAttack?.attackValue, expected, `${attackType}: condition is checked at declaration`);
      const resolved = applyCommand(attack.state, defense === 'block'
        ? { type: 'defend', playerId: 'P2', cardInstanceId: 'block' }
        : { type: 'pass-defense', playerId: 'P2' });
      assert.equal(resolved.ok, true);
      if (!resolved.ok) continue;
      assert.equal(resolved.state.combatReveal?.attackTotal, expected, `${attackType}: ${defense} preserves the conditional value`);
      assert.equal(resolved.state.players.P2.hp, state.players.P2.hp - expected + (defense === 'block' ? 2 : 0));
    }
  }
}

console.log('Solitude conditional value and cancellation checks passed.');
