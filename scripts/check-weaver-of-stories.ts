import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, removeCard, type GameState } from '../shared/game.ts';

function step(state: GameState, command: Parameters<typeof applyCommand>[1]): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}

function removeStatuses(state: GameState, count: number): void {
  for (let index = 0; index < count; index++) {
    const instanceId = `removed-${state.players.P2.removedDeck?.length ?? 0}-${index}`;
    state.players.P2.discard.push({ instanceId, cardId: 'exhaust' });
    assert.ok(removeCard(state.players.P2, instanceId));
  }
}

let state = createHotseatTestState(true, 'kazka', 2, 'orkk');
state.players.P1.hp = 15;
state.players.P1.deck = [{ instanceId: 'kazka-draw', cardId: 'attack-2' }];
state.players.P2.hp = 12;
state.players.P2.hand = [{ instanceId: 'enemy-discard', cardId: 'attack-3' }];
state.players.P2.deck = [{ instanceId: 'enemy-draw', cardId: 'attack-2' }];
state.players.P2.discard = [{ instanceId: 'ordinary', cardId: 'defend-1' }];
removeCard(state.players.P2, 'ordinary');
assert.equal(state.players.P2.removedDeck?.length, 0, 'Only negative Status Cards enter Removed Deck.');
state.players.P2.hand.push({ instanceId: 'removed-from-hand', cardId: 'headache' });
assert.ok(removeCard(state.players.P2, 'removed-from-hand'));
state.players.P2.deck.push({ instanceId: 'removed-from-deck', cardId: 'panic' });
assert.ok(removeCard(state.players.P2, 'removed-from-deck'));
assert.deepEqual(state.players.P2.removedDeck?.map((card) => card.instanceId), ['removed-from-hand', 'removed-from-deck']);
state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.phase, 'active', 'Two Removed cards do not trigger a choice.');
assert.equal(state.activePlayerId, 'P2');
assert.deepEqual(state.players.P2.turnStartRecord?.position, state.players.P2.position);
assert.equal(state.players.P2.turnStartRecord?.hp, 12);

removeStatuses(state, 1);
state.players.P2.position = { x: state.players.P2.position.x - 1, y: state.players.P2.position.y };
const recordedStart = structuredClone(state.players.P2.turnStartRecord);
state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(state.phase, 'choosing-weaver-story', 'The third Removed card triggers at the end of the current turn.');
assert.equal(state.activePlayerId, 'P2', 'Turn finalization waits for the choice.');
assert.equal(state.weaverChoice?.targetId, 'P2');
assert.equal(state.weaverChoiceLastRound, 1);
assert.deepEqual(state.players.P2.turnStartRecord, recordedStart, 'The turn-start record remains while the hologram is active.');
assert.equal(state.players.P2.weaverHologramExpired, false);
assert.equal(applyCommand(state, { type: 'weaver-choice', playerId: 'P1', choice: 'draw' }).ok, false, 'Only the affected enemy chooses.');
state = step(state, { type: 'weaver-choice', playerId: 'P2', choice: 'draw' });
assert.equal(state.players.P2.hp, 11);
assert.ok(state.players.P2.hand.some((card) => card.instanceId === 'enemy-draw'));
assert.equal(state.players.P1.hp, 16);
assert.equal(state.phase, 'active');
assert.equal(state.activePlayerId, 'P1');
assert.equal(state.turn, 2);

removeStatuses(state, 3);
state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.phase, 'choosing-weaver-story', 'Three new Removed cards can trigger in the following round.');
assert.equal(state.weaverChoiceLastRound, 2);
assert.equal(applyCommand(state, { type: 'weaver-choice', playerId: 'P2', choice: 'discard', cardInstanceId: 'missing' }).ok, false);
state = step(state, { type: 'weaver-choice', playerId: 'P2', choice: 'discard', cardInstanceId: 'enemy-discard' });
assert.ok(state.players.P2.discard.some((card) => card.instanceId === 'enemy-discard'));
assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'kazka-draw'));
assert.equal(state.activePlayerId, 'P2');

removeStatuses(state, 3);
state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(state.phase, 'active', 'A second choice cannot occur in the same round.');
assert.equal(state.turn, 3);
state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.phase, 'choosing-weaver-story', 'Unresolved new removals wait for the next round.');

let returned = createHotseatTestState(true, 'kazka', 2, 'orkk');
returned.players.P2.hand = [];
const original = structuredClone(returned.players.P1.position);
returned.players.P1.position = { x: original.x + 1, y: original.y };
returned.players.P1.position = original;
returned = step(returned, { type: 'end-turn', playerId: 'P1' });
assert.equal(returned.players.P1.weaverHologramExpired, true, 'A Hologram expires when its owner ends on the starting Square.');
returned = step(returned, { type: 'end-turn', playerId: 'P2' });
assert.equal(returned.players.P1.weaverHologramExpired, false, 'The next turn starts a fresh Hologram lifecycle.');
assert.deepEqual(returned.players.P1.turnStartRecord?.position, original);

let freeForAll = createHotseatTestState(true, 'kazka', 3);
freeForAll.players.P2.hand = [{ instanceId: 'p2-choice', cardId: 'attack-2' }];
freeForAll.players.P3.hand = [{ instanceId: 'p3-choice', cardId: 'attack-2' }];
for (const id of ['P2', 'P3'] as const) for (let index = 0; index < 3; index++) {
  const instanceId = `${id}-negative-${index}`;
  freeForAll.players[id].discard.push({ instanceId, cardId: 'exhaust' });
  removeCard(freeForAll.players[id], instanceId);
}
freeForAll = step(freeForAll, { type: 'end-turn', playerId: 'P1' });
assert.equal(freeForAll.weaverChoice?.targetId, 'P2', 'The first eligible enemy receives this Round’s Choice Event.');
freeForAll = step(freeForAll, { type: 'weaver-choice', playerId: 'P2', choice: 'discard', cardInstanceId: 'p2-choice' });
freeForAll = step(freeForAll, { type: 'end-turn', playerId: 'P2' });
freeForAll = step(freeForAll, { type: 'end-turn', playerId: 'P3' });
assert.equal(freeForAll.turn, 2);
assert.equal(freeForAll.phase, 'active', 'Only one enemy receives an event per Round.');
freeForAll = step(freeForAll, { type: 'end-turn', playerId: 'P1' });
assert.equal(freeForAll.weaverChoice?.targetId, 'P3', 'Another eligible enemy receives a Choice Event in the following Round.');

console.log('Weaver of Stories checks passed.');
