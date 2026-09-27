import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, effectiveMoveRange, type GameState } from '../shared/game.ts';

const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};
const ready = (): GameState => {
  const state = createHotseatTestState(true, 'merylin', 2);
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 3 };
  state.players.P2.position = { x: 3, y: 3 };
  state.players.P1.freeMoveUsed = true;
  state.players.P1.movementRemaining = 0;
  state.players.P1.spellEcho = [null, null, { instanceId: 'barbarian-l3', cardId: 'barbarian-stance' }];
  state.players.P1.hand = [{ instanceId: 'next-attack', cardId: 'attack-2' }];
  return state;
};

assert.equal(cardDefinition({ instanceId: 'description', cardId: 'barbarian-stance' }).levelEffects?.[2], 'Restore all MOV. Your next Attack applies Headache to its target');

let state = step(ready(), { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(state.players.P1.movementRemaining, effectiveMoveRange(state.players.P1), 'Level 3 restores movement from zero.');
assert.equal(state.players.P1.barbarianNextAttackHeadache, true);
assert.equal(state.players.P1.merylinSummonActive, true);
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'next-attack', targetId: 'P2', targetKind: 'player' });
assert.equal(state.pendingAttack?.barbarianHeadache, true);
assert.equal(state.players.P1.barbarianNextAttackHeadache, false, 'The effect is consumed by the next Attack.');
state = step(state, { type: 'pass-defense', playerId: 'P2' });
state = step(state, { type: 'ack-combat', playerId: 'P1' });
state = step(state, { type: 'ack-combat', playerId: 'P2' });
assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 1, 'Headache enters the target Hand after combat.');
assert.equal(state.players.P2.deck.some((card) => card.cardId === 'headache'), false);
assert.equal(state.players.P2.discard.some((card) => card.cardId === 'headache'), false);

let blocked = step(ready(), { type: 'use-echo-perk', playerId: 'P1', position: 3 });
blocked.players.P2.hand = [{ instanceId: 'blocking-card', cardId: 'block' }];
blocked = step(blocked, { type: 'attack', playerId: 'P1', cardInstanceId: 'next-attack', targetId: 'P2', targetKind: 'player' });
blocked = step(blocked, { type: 'defend', playerId: 'P2', cardInstanceId: 'blocking-card' });
blocked = step(blocked, { type: 'ack-combat', playerId: 'P1' });
blocked = step(blocked, { type: 'ack-combat', playerId: 'P2' });
assert.equal(blocked.players.P2.hand.filter((card) => card.cardId === 'headache').length, 1, 'Blocking the Attack Card effect does not cancel Barbarian Stance.');

let objectAttack = ready();
objectAttack.players.P2.position = { x: 8, y: 4 };
objectAttack.objects = [{ id: 'barbarian-box', name: 'Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: { x: 3, y: 3 } }];
objectAttack = step(objectAttack, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
objectAttack = step(objectAttack, { type: 'attack', playerId: 'P1', cardInstanceId: 'next-attack', targetId: 'barbarian-box', targetKind: 'object' });
assert.equal(objectAttack.players.P1.barbarianNextAttackHeadache, false, 'An Attack against an Object consumes the one-use effect.');
assert.equal(objectAttack.players.P2.hand.some((card) => card.cardId === 'headache'), false, 'An Object Attack gives no player Headache.');

let penalized = ready();
penalized.players.P1.hand.push({ instanceId: 'movement-penalty', cardId: 'pinned' });
penalized.players.P1.hexMovementPenalty = 1;
penalized = step(penalized, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(effectiveMoveRange(penalized.players.P1), 0, 'Level 3 no longer ignores movement penalties.');
assert.equal(penalized.players.P1.movementRemaining, 0);

let expired = step(ready(), { type: 'use-echo-perk', playerId: 'P1', position: 3 });
expired = step(expired, { type: 'end-turn', playerId: 'P1' });
assert.equal(expired.players.P1.barbarianNextAttackHeadache, true, 'The next-Attack effect persists until an Attack is played.');

console.log('Barbarian Stance checks passed.');
