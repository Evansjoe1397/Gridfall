import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, `${command.type}: ${result.error ?? ''}`);
  return result.state;
}

assert.equal(cardDefinition({ instanceId: 'description', cardId: 'mana-shield' }).effectText,
  'Generate 1 Mana Point before combat. Gain +1 Defend Value per stored Mana Point. After combat: remove 1 Mana Point per Damage blocked (up to 2). Do not remove Mana Points if you had 3 stored before combat. Then return this Card to your Hand.');

let cancelled = createHotseatTestState(true, 'john-christ', 2, 'magician');
cancelled.objects = []; cancelled.elevations = {};
cancelled.players.P1.position = { x: 2, y: 2 };
cancelled.players.P2.position = { x: 3, y: 2 };
cancelled.players.P1.hand = [{ instanceId: 'blessed-attack', cardId: 'blessed-might' }];
cancelled.players.P2.hand = [{ instanceId: 'cancelled-defense', cardId: 'mana-shield' }];
cancelled.players.P2.manaPoints = 1;
cancelled = step(cancelled, { type: 'attack', playerId: 'P1', cardInstanceId: 'blessed-attack', targetId: 'P2' });
cancelled = step(cancelled, { type: 'defend', playerId: 'P2', cardInstanceId: 'cancelled-defense' });
const cancelledResult: GameState = cancelled.combatReveal?.deferredAfterCombatState ? JSON.parse(cancelled.combatReveal.deferredAfterCombatState) : cancelled;
assert.equal(cancelledResult.players.P2.manaPoints, 2, 'Blessed Might does not undo Mana Shield generation before combat.');
assert.equal(cancelledResult.players.P2.hand.some((card) => card.instanceId === 'cancelled-defense'), false, 'Blessed Might cancels the after-combat return.');
assert.equal(cancelledResult.players.P2.discard.some((card) => card.instanceId === 'cancelled-defense'), true);

for (const stack of [false, true]) {
  for (const stored of [0, 1, 2, 3]) {
    for (const attackValue of [0, 1, 2, 3, 5]) {
      let state = createHotseatTestState(true, 'shinobi', 2, 'magician');
      state.objects = []; state.elevations = {};
      (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
      state.players.P1.position = { x: 2, y: 2 };
      state.players.P2.position = { x: 3, y: 2 };
      for (const player of Object.values(state.players)) {
        player.hand = []; player.deck = []; player.discard = [];
        player.hp = player.maxHp = 20;
        player.baseDefenseBonus = 0;
      }
      state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
      state.players.P2.hand = [{ instanceId: 'defense', cardId: 'mana-shield' }];
      state.players.P2.manaPoints = stored;
      state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
      state.pendingAttack!.attackValue = attackValue;
      state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
      if (state.phase === 'choosing-combat-stack') {
        state = step(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: null });
        state = step(state, { type: 'combat-stack-choice', playerId: 'P2', cardInstanceId: null });
      }
      const defenseValue = Math.min(3, stored + 1);
      assert.equal(state.pendingAttack?.manaShieldManaBeforeCombat, stored, 'The original Mana count survives combat choices.');
      assert.equal(Boolean(state.pendingAttack?.manaShieldManaGenerated), stored < 3);
      assert.equal(state.combatReveal?.defendTotal, defenseValue, 'Generated Mana contributes to Defend Value.');
      assert.ok(state.combatReveal?.deferredAfterCombatState);
      assert.equal(state.players.P2.hand.some((card) => card.instanceId === 'defense'), false, 'Mana Shield stays discarded during the combat reveal.');
      const resolved: GameState = JSON.parse(state.combatReveal!.deferredAfterCombatState!);
      const spent = stored === 3 ? 0 : Math.min(defenseValue, attackValue, 2);
      assert.equal(resolved.players.P2.manaPoints, defenseValue - spent, `stored=${stored}, attack=${attackValue}, stack=${stack}`);
      assert.equal(resolved.players.P2.hand.filter((card) => card.instanceId === 'defense').length, 1, 'The same Mana Shield returns to Hand after combat.');
      assert.equal(resolved.players.P2.discard.some((card) => card.instanceId === 'defense'), false, 'Returned Mana Shield is removed from Discard.');
      const returnLogIndex = resolved.log.findIndex((line) => line.includes('Mana Shield returned'));
      assert.ok(returnLogIndex >= 0, 'The card return is logged.');
      if (stored < 3) assert.ok(returnLogIndex < resolved.log.findIndex((line) => line.includes('Mana Shield blocked')), 'Mana is removed before the card returns.');
      if (stored === 3) {
        assert.equal(resolved.log.some(line => /Mana Shield (generated|blocked)/.test(line)), false, 'Full Mana adds no generation or spending presentation.');
      }
    }
  }
}

console.log('Mana Shield checks passed: 0–3 starting Mana, 0–5 Attack Value, capped spending, full-Mana exemption, and both combat modes.');
