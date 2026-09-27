import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, hasLineOfSight, type GameState } from '../shared/game.ts';

const state = createHotseatTestState(true, 'wreckna', 2, 'merylin');
state.elevations = {};
state.players.P1.position = { x: 3, y: 3 }; // C4
state.players.P2.position = { x: 4, y: 2 }; // D3
state.players.P1.hand = [{ instanceId: 'lich-attack', cardId: 'attack-2' }];
state.players.P2.hand = [{ instanceId: 'merylin-attack', cardId: 'attack-2' }];
state.players.P2.merylinSummonActive = true;
state.objects = [
  { id: 'north-tomb', name: 'Tomb', kind: 'tomb', hp: 3, maxHp: 3, position: { x: 3, y: 2 } }, // C3
  { id: 'south-tomb', name: 'Tomb', kind: 'tomb', hp: 3, maxHp: 3, position: { x: 4, y: 3 } }, // D4
];
assert.equal(hasLineOfSight(state, state.players.P1.position, state.players.P2.position), false, 'Diagonal Tombs close the corner between C4 and D3.');
assert.equal(hasLineOfSight(state, state.players.P2.position, state.players.P1.position), false, 'The same corner blocks sight in reverse.');
assert.equal(applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'lich-attack', targetId: 'P2', targetKind: 'player' }).ok, false, 'Wreckna cannot attack Merylin through the two Tombs.');
const merylinTurn = structuredClone(state) as GameState;
merylinTurn.activePlayerId = 'P2';
assert.equal(applyCommand(merylinTurn, { type: 'attack', playerId: 'P2', cardInstanceId: 'merylin-attack', targetId: 'P1', targetKind: 'player' }).ok, false, 'Merylin cannot attack Wreckna through the two Tombs.');
state.objects.pop();
assert.equal(hasLineOfSight(state, state.players.P1.position, state.players.P2.position), true, 'One Tomb leaves the diagonal corner open.');

console.log('Tomb corner line-of-sight checks passed.');
