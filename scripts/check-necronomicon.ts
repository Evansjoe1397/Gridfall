import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, createWrecknaTomb } from '../shared/game.ts';

assert.deepEqual(
  cardDefinition({ instanceId: 'necronomicon-definition', cardId: 'necronomicon' }).levelEffects,
  ['Infuse a Tomb to create a Phylactery', 'Teleport into infused Tomb', 'Restore 1 HP, draw 1 card'],
  'Necronomicon displays its current cumulative level effects.',
);

function setup(level: 2 | 3) {
  const state = createHotseatTestState(true, 'wreckna', 2);
  state.objects = [];
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
  assert.deepEqual(completed.state.players.P1.visualMovement, { from: { x: 2, y: 1 }, path: [{ ...tomb.position }] }, 'The teleport produces movement presentation data.');
  assert.equal(completed.state.players.P1.hp, level === 3 ? 14 : 13, 'Only Level 3 restores 1 HP.');
  assert.equal(completed.state.players.P1.hand.some((card) => card.instanceId === `necronomicon-level-${level}-draw`), level === 3, 'Only Level 3 draws 1 Card.');
}

console.log('Necronomicon checks passed.');
