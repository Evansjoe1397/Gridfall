import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createPipeTestState, effectiveMoveRange, isShallowWater, movementCost, movementPath, type Cell, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};

assert.equal(cardDefinition({ instanceId: 'windwalker-description', cardId: 'windwalker-stance' }).levelEffects?.[2], 'Can move from any Square to any Square. Ignore negative movement effects.');
let state = createPipeTestState(true, 'merylin', 'dummy');
state.phase = 'active'; state.activePlayerId = 'P1';
state.pipeTurnIndex = 0; state.pipeFloodUntil = { 1: 5, 2: 5 };
state.players.P1.position = cell('B5');
state.players.P2.position = cell('H7');
state.players.P1.freeMoveUsed = true;
state.players.P1.movementRemaining = 1;
state.players.P1.hexMovementPenalty = 1;
state.players.P1.hand = [{ instanceId: 'windwalker-pinned', cardId: 'pinned' }];
state.players.P1.spellEcho = [null, null, { instanceId: 'windwalker-level-three', cardId: 'windwalker-stance' }];
assert.equal(isShallowWater(state, cell('A6')), true);
assert.equal(isShallowWater(state, cell('G1')), true);
assert.equal(movementCost(state, state.players.P1, [cell('A6')]), 2, 'Entering Shallow Water normally costs 2 MOV.');

state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(state.players.P1.windwalkerUnrestrictedMovement, true);
assert.equal(effectiveMoveRange(state.players.P1), 5, 'Level 3 ignores Pinned and stolen MOV penalties.');
assert.equal(state.players.P1.movementRemaining, 5, 'Level 3 restores movement lost to active penalties.');
assert.deepEqual(movementPath(state, state.players.P1, cell('C8')), [cell('C8')], 'A remote Water Square is reached directly.');
assert.equal(movementCost(state, state.players.P1, movementPath(state, state.players.P1, cell('C8'))), 1, 'Entering Shallow Water costs only 1 MOV.');
assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell('A5') }).ok, false, 'An occupied Column Square is not a legal destination.');
assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell('H7') }).ok, false, 'An occupied character Square is not a legal destination.');

state = step(state, { type: 'move', playerId: 'P1', to: cell('C8') });
assert.equal(state.players.P1.movementRemaining, 4);
state.players.P1.hand.push({ instanceId: 'windwalker-panic', cardId: 'panic' });
assert.equal(movementCost(state, state.players.P1, movementPath(state, state.players.P1, cell('G1'))), 1, 'Water to Water ignores the exit surcharge.');
state = step(state, { type: 'move', playerId: 'P1', to: cell('G1') });
assert.equal(state.players.P1.movementRemaining, 3, 'Panic does not block Level 3 movement.');
state = step(state, { type: 'move', playerId: 'P1', to: cell('E4') });
assert.equal(state.players.P1.movementRemaining, 2, 'Leaving Water for a remote dry Square costs 1 MOV.');

state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.players.P1.windwalkerUnrestrictedMovement, false, 'Level 3 movement expires at turn end.');
assert.equal(effectiveMoveRange(state.players.P1), 2, 'Movement penalties apply again after Windwalker expires.');

console.log('Windwalker Stance checks passed.');
