import assert from 'node:assert/strict';
import { applyCommand, createTrenchTestState, movementCost, movementPath, type Cell, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const setup = (): GameState => {
  const state = createTrenchTestState(true, 'john-christ', 'orkk');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.players.P1.position = cell('C7');
  state.players.P2.position = cell('C7');
  state.players.P1.spiritForm = true;
  state.players.P1.spiritEnemyUnderfoot = 'P2';
  state.players.P1.movementRemaining = 1;
  return state;
};

for (const label of ['C6', 'D6']) {
  const state = setup();
  const destination = cell(label);
  const path = movementPath(state, state.players.P1, destination);
  assert.deepEqual(path, [destination], `John can leave Da Orkk on C7 directly for ${label}.`);
  assert.equal(movementCost(state, state.players.P1, path), 1);
  const result = applyCommand(state, { type: 'move', playerId: 'P1', to: destination });
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  if (result.ok) {
    assert.deepEqual(result.state.players.P1.position, destination);
    assert.equal(result.state.players.P1.spiritEnemyUnderfoot, null);
  }
}

const noOverlap = setup();
noOverlap.players.P2.position = cell('H8');
noOverlap.players.P1.spiritEnemyUnderfoot = null;
assert.notDeepEqual(movementPath(noOverlap, noOverlap.players.P1, cell('C6')), [cell('C6')], 'Spirit Form alone does not waive Slide ascent.');
assert.equal(applyCommand(noOverlap, { type: 'move', playerId: 'P1', to: cell('C6') }).ok, false);

const blockedTrait = setup();
blockedTrait.players.P1.traitBlocked = true;
assert.notDeepEqual(movementPath(blockedTrait, blockedTrait.players.P1, cell('C6')), [cell('C6')], 'Blocked Spirit Form cannot waive Slide ascent.');

console.log('Spirit Form High Ground exit checks passed.');
