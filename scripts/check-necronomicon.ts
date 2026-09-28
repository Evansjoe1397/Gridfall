import assert from 'node:assert/strict';
import { CARDS, applyCommand, canDefendInsideTomb, cardDefinition, createHotseatTestState, createWrecknaTomb, type GameCommand, type GameState } from '../shared/game.ts';

assert.deepEqual(
  cardDefinition({ instanceId: 'necronomicon-definition', cardId: 'necronomicon' }).levelEffects,
  ['Infuse a Tomb to create a Phylactery', "Teleport into the infused Tomb. Can use any Defend Card from inside a Tomb until the start of Wreckna's next turn", 'Restore 1 HP and draw 1 Card'],
  'Necronomicon displays its current cumulative level effects.',
);

function setup(level: 2 | 3, playerCount: 2 | 3 = 2) {
  const state = createHotseatTestState(true, 'wreckna', playerCount);
  state.objects = [];
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 1 };
  state.players.P2.position = { x: 8, y: 7 };
  state.players.P1.hand = [];
  state.players.P1.hp = 13;
  state.players.P1.deck = [{ instanceId: `necronomicon-level-${level}-draw`, cardId: 'attack-2' }];
  state.players.P1.spellEcho = level === 2
    ? [null, { instanceId: 'necronomicon-two', cardId: 'necronomicon' }, null]
    : [null, null, { instanceId: 'necronomicon-three', cardId: 'necronomicon' }];
  const tomb = createWrecknaTomb(state, 'P1', { x: 3, y: 2 });
  assert.ok(tomb, 'The Necronomicon scenario creates a Tomb.');
  return { state, tomb };
}

for (const level of [2, 3] as const) {
  const { state, tomb } = setup(level);
  const activated = applyCommand(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
  assert.equal(activated.ok, true, `Necronomicon Level ${level} activates.`);
  const targeted = applyCommand(activated.state, { type: 'necronomicon-tomb-target', playerId: 'P1', objectId: tomb.id });
  assert.equal(targeted.ok, true, `Necronomicon Level ${level} targets an uninfused Tomb.`);
  const completed = applyCommand(targeted.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' });
  assert.equal(completed.ok, true, `Necronomicon Level ${level} completes after choosing a Phylactery type.`);
  assert.equal(completed.state.phase, 'active', 'Necronomicon returns play to the active phase.');
  assert.equal(completed.state.objects.find((object) => object.id === tomb.id)?.phylacteryType, 'might', 'The selected Tomb becomes a Phylactery.');
  assert.deepEqual(completed.state.players.P1.position, tomb.position, 'Level 2 teleports Wreckna to the infused Tomb.');
  assert.equal(completed.state.players.P1.wrecknaInsideTombId, tomb.id, 'Wreckna enters the infused Tomb.');
  assert.deepEqual(completed.state.players.P1.visualMovement, { from: { x: 2, y: 1 }, path: [{ ...tomb.position }], sourceCardId: 'necronomicon' }, 'The teleport produces movement presentation data.');
  assert.equal(completed.state.players.P1.necronomiconTombDefenseActive, true, 'Level 2 and Level 3 grant temporary Tomb defense permission.');
  assert.equal(completed.state.players.P1.hp, level === 3 ? 14 : 13, 'Only Level 3 restores 1 HP.');
  assert.equal(completed.state.players.P1.hand.some((card) => card.instanceId === `necronomicon-level-${level}-draw`), level === 3, 'Only Level 3 draws 1 Card.');
}

const step = (state: GameState, command: GameCommand): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};
function infuse(playerCount: 2 | 3): GameState {
  const { state, tomb } = setup(2, playerCount);
  let current = step(state, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
  current = step(current, { type: 'necronomicon-tomb-target', playerId: 'P1', objectId: tomb.id });
  return step(current, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' });
}

for (const playerCount of [2, 3] as const) {
  let current = infuse(playerCount);
  for (const card of CARDS.filter((entry) => entry.kind === 'defend')) {
    assert.equal(canDefendInsideTomb(current.players.P1, { instanceId: 'defense', cardId: card.id }), true, `${card.name} can be used from inside a Tomb while Necronomicon is active.`);
  }
  current = step(current, { type: 'end-turn', playerId: 'P1' });
  for (const opponent of playerCount === 2 ? ['P2'] as const : ['P2', 'P3'] as const) {
    assert.equal(current.activePlayerId, opponent);
    assert.equal(current.players.P1.necronomiconTombDefenseActive, true, 'Permission lasts through each opponent turn.');
    current = step(current, { type: 'end-turn', playerId: opponent });
  }
  assert.equal(current.activePlayerId, 'P1');
  assert.equal(current.players.P1.necronomiconTombDefenseActive, false, 'Permission expires at the beginning of Wreckna\'s next turn.');
  assert.equal(canDefendInsideTomb(current.players.P1, { instanceId: 'defense', cardId: 'brain-freeze' }), false);
  assert.equal(canDefendInsideTomb(current.players.P1, { instanceId: 'defense', cardId: 'graveyard' }), true, 'Graveyard retains its intrinsic Tomb defense after expiry.');
}

let defended = infuse(2);
const defendedTombId = defended.players.P1.wrecknaInsideTombId!;
defended.players.P1.hand = [{ instanceId: 'brain-freeze', cardId: 'brain-freeze' }];
defended.players.P2.position = { x: 2, y: 2 };
defended.players.P2.hand = [{ instanceId: 'attack', cardId: 'attack-2' }];
defended = step(defended, { type: 'end-turn', playerId: 'P1' });
defended = step(defended, { type: 'attack', playerId: 'P2', cardInstanceId: 'attack', targetKind: 'object', targetId: defendedTombId });
assert.equal(defended.phase, 'defending', 'A held non-Graveyard defense can protect the occupied Tomb.');
defended = step(defended, { type: 'defend', playerId: 'P1', cardInstanceId: 'brain-freeze' });
defended = step(defended, { type: 'ack-combat', playerId: 'P1' });
defended = step(defended, { type: 'ack-combat', playerId: 'P2' });
assert.equal(defended.objects.some((object) => object.id === defendedTombId), true, 'Winning with a non-Graveyard defense preserves the Tomb.');
defended = step(defended, { type: 'end-turn', playerId: 'P2' });
assert.equal(defended.players.P1.necronomiconTombDefenseActive, false);
defended.players.P1.hand = [{ instanceId: 'another-brain-freeze', cardId: 'brain-freeze' }];
defended.players.P2.hand = [{ instanceId: 'another-attack', cardId: 'attack-2' }];
defended = step(defended, { type: 'end-turn', playerId: 'P1' });
defended = step(defended, { type: 'attack', playerId: 'P2', cardInstanceId: 'another-attack', targetKind: 'object', targetId: defendedTombId });
assert.equal(defended.objects.some((object) => object.id === defendedTombId), false, 'After expiry, a non-Graveyard card no longer prevents immediate Tomb destruction.');

console.log('Necronomicon checks passed: teleport, any Tomb defense, and next-turn expiry in duels and three-player matches.');
