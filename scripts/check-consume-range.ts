import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, effectiveAttackRange, effectiveMoveRange, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}
const state = createHotseatTestState(true, 'magician', 2, 'dummy');
state.objects = []; state.elevations = {}; state.phase = 'choosing-mana-mode'; state.pendingManaChoice = 'P1';
state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 5, y: 2 };
state.players.P1.manaPoints = 3;
state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-2' }];
state.players.P1.deck = [];
const movement = effectiveMoveRange(state.players.P1);
assert.equal(effectiveAttackRange(state, state.players.P1), 2);
const generating = step(state, { type: 'mana-choice', playerId: 'P1', consume: false });
assert.equal(applyCommand(generating, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }).ok, false);
const consuming = step(state, { type: 'mana-choice', playerId: 'P1', consume: true });
assert.equal(consuming.players.P1.manaPoints, 0);
assert.equal(effectiveAttackRange(consuming, consuming.players.P1), 3);
assert.equal(effectiveMoveRange(consuming.players.P1), movement, 'Consume must not grant MOV');
assert.equal(applyCommand(consuming, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }).ok, true);
const box = structuredClone(consuming);
box.objects = [{ id: 'box', name: 'Box', kind: 'wooden-box', position: { x: 2, y: 5 }, hp: 3, maxHp: 3 }];
assert.equal(applyCommand(box, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'box', targetKind: 'object' }).ok, true);
const moved = step(consuming, { type: 'free-move', playerId: 'P1' });
assert.equal(moved.players.P1.movementRemaining, movement);
const ended = step(consuming, { type: 'end-turn', playerId: 'P1' });
assert.equal(ended.players.P1.manaMode, 'generate');
assert.equal(effectiveAttackRange(ended, ended.players.P1), 2, 'Consume Range expires with the mode at turn end');
assert.equal(effectiveMoveRange(ended.players.P1), movement);
console.log('Consume Range checks passed (no MOV bonus).');
