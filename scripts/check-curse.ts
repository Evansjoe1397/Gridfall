import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState } from '../shared/game.ts';

assert.equal(cardDefinition({ instanceId: 'curse-definition', cardId: 'decay' }).levelEffects?.[1], "Add Exhaust to the target's Discard");

const state = createHotseatTestState(true, 'wreckna', 2);
state.objects = [];
state.elevations = {};
state.players.P1.position = { x: 2, y: 2 };
state.players.P2.position = { x: 4, y: 2 };
state.players.P1.hand = [];
state.players.P1.spellEcho = [null, { instanceId: 'curse-two', cardId: 'decay' }, null];
state.players.P2.hand = [{ instanceId: 'existing-card', cardId: 'attack-2' }];
state.players.P2.discard = [];

const activated = applyCommand(state, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(activated.ok, true, 'Curse Level 2 activates.');
const targeted = activated.ok ? applyCommand(activated.state, { type: 'decay-target', playerId: 'P1', targetId: 'P2' }) : activated;
assert.equal(targeted.ok, true, 'Curse Level 2 targets an enemy in range.');
if (targeted.ok) {
  assert.equal(targeted.state.players.P2.discard.filter((card) => card.cardId === 'exhaust').length, 1, "Curse adds exactly one Exhaust to the target's Discard.");
  assert.equal(targeted.state.players.P2.hand.some((card) => card.cardId === 'headache'), false, 'Curse adds no Headache to Hand.');
}

console.log("Curse checks passed: Level 2 adds Exhaust to the target's Discard.");
