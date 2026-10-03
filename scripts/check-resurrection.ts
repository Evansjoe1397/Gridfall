import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function cellFromLabel(label: string) {
  return { x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 };
}

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

for (const origin of ['H4', 'H5', 'D3']) {
  for (const blocked of [false, true]) {
    const state = createHotseatTestState(false, 'magician', 2, 'john-christ');
    state.phase = 'active';
    state.pendingManaChoice = null;
    state.objects = [];
    state.elevations = {};
    state.players.P2.position = cellFromLabel(origin);
    state.players.P1.position = { x: state.players.P2.position.x - 1, y: state.players.P2.position.y };
    state.players.P1.hand = [{ instanceId: 'attack', cardId: 'arcane-bolt' }];
    state.players.P2.hand = [{ instanceId: 'defend', cardId: 'resurrection' }];
    state.players.P2.deck = [{ instanceId: 'draw', cardId: 'cleanse' }];
    const destination = origin === 'H4' ? 'H5' : 'H4';
    if (blocked) {
      for (const label of ['H4', 'H5'].filter((label) => label !== origin)) {
        state.objects.push({ id: `box-${label}`, name: 'Wooden Box', hp: 1, maxHp: 1, position: cellFromLabel(label), kind: 'wooden-box' });
      }
    }
    let result = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
    result = step(result, { type: 'defend', playerId: 'P2', cardInstanceId: 'defend' });
    if (blocked) assert.ok(result.players.P2.hp < state.players.P2.hp, `${origin}: blocked teleport must not negate Damage`);
    else assert.equal(result.players.P2.hp, state.players.P2.hp, `${origin}: successful teleport negates Damage`);
    result = step(result, { type: 'ack-combat', playerId: 'P1' });
    result = step(result, { type: 'ack-combat', playerId: 'P2' });
    assert.deepEqual(result.players.P2.position, cellFromLabel(blocked ? origin : destination));
    assert.equal(result.players.P2.hand.some((card) => card.instanceId === 'draw'), true, 'Always draw 1 Card');
    if (!blocked) {
      assert.deepEqual(result.players.P2.visualMovement?.from, cellFromLabel(origin));
      assert.deepEqual(result.players.P2.visualMovement?.path, [cellFromLabel(destination)]);
    }
  }
}

console.log('Resurrection destination and damage checks passed.');
