import assert from 'node:assert/strict';
import { applyCommand, beginWrecknaPhylacteryChoice, createHotseatTestState, type GameState } from '../shared/game.ts';

function board(withRitual = false): GameState {
  const state = createHotseatTestState(true, 'wreckna', 2);
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 8, y: 7 };
  state.objects = [
    { id: 'old-a', name: 'Distant Reliquary', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 8, y: 6 }, phylacteryType: withRitual ? 'ritual' : 'might', phylacteryOwnerId: 'P1' },
    { id: 'old-b', name: 'Other Reliquary', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 7, y: 6 }, phylacteryType: 'wisdom', phylacteryOwnerId: 'P1' },
    { id: 'new-target', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 3 } },
  ];
  return state;
}

function activeCount(state: GameState): number {
  return state.objects.filter((object) => object.phylacteryOwnerId === 'P1' && object.phylacteryType).length;
}

const base = board();
const startingHp = base.players.P1.hp;
const selected = beginWrecknaPhylacteryChoice(base, 'P1', 'new-target', { hp: 1 });
assert.equal(selected.ok, true);
assert.equal(selected.state.phase, 'choosing-wreckna-phylactery');
assert.equal(selected.state.players.P1.hp, startingHp, 'Original HP cost waits until replacement.');
assert.equal(beginWrecknaPhylacteryChoice(base, 'P1', 'old-a').ok, false, 'An infused Object cannot be infused again.');
const typed = applyCommand(selected.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'ritual' });
assert.equal(typed.ok, true);
assert.equal(typed.state.phase, 'choosing-wreckna-phylactery-replace');
assert.equal(applyCommand(typed.state, { type: 'wreckna-phylactery-replace', playerId: 'P1', objectId: 'new-target' }).ok, false);
const cancelled = applyCommand(typed.state, { type: 'wreckna-phylactery-decline', playerId: 'P1' });
assert.equal(cancelled.ok, true);
assert.equal(activeCount(cancelled.state), 2);
assert.equal(cancelled.state.players.P1.hp, startingHp);
const replaced = applyCommand(typed.state, { type: 'wreckna-phylactery-replace', playerId: 'P1', objectId: 'old-a' });
assert.equal(replaced.ok, true, 'An active Phylactery can be sacrificed at global range.');
assert.equal(replaced.state.objects.some((object) => object.id === 'old-a'), false);
assert.equal(replaced.state.objects.find((object) => object.id === 'new-target')?.phylacteryType, 'ritual');
assert.equal(activeCount(replaced.state), 2);
assert.equal(replaced.state.players.P1.hp, startingHp - 1);

const ritual = board(true);
const ritualSelected = beginWrecknaPhylacteryChoice(ritual, 'P1', 'new-target', { hp: 1 });
assert.equal(ritualSelected.ok, true);
const ritualTyped = applyCommand(ritualSelected.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' });
assert.equal(ritualTyped.ok, true);
const ritualReplaced = applyCommand(ritualTyped.state, { type: 'wreckna-phylactery-replace', playerId: 'P1', objectId: 'old-a' });
assert.equal(ritualReplaced.ok, true, 'Ritual never waives the active Phylactery sacrifice.');
assert.equal(ritualReplaced.state.objects.some((object) => object.id === 'old-a'), false);
assert.equal(ritualReplaced.state.players.P1.hp, ritual.players.P1.hp, 'Ritual still waives the original HP cost.');
assert.equal(activeCount(ritualReplaced.state), 2);

const dakkoth = board();
dakkoth.players.P1.hand = [];
dakkoth.players.P1.spellEcho = [null, { instanceId: 'replace-dakkoth', cardId: 'dakkoth' }, null];
const activated = applyCommand(dakkoth, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(activated.ok, true);
const tombCreated = applyCommand(activated.state, { type: 'dakkoth-tomb-square', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(tombCreated.ok, true);
assert.equal(tombCreated.state.phase, 'choosing-dakkoth-phylactery-target', 'Dakkoth selects the new target before either replacement cost.');
const dakkothCancelled = applyCommand(tombCreated.state, { type: 'wreckna-phylactery-decline', playerId: 'P1' });
assert.equal(dakkothCancelled.ok, true);
assert.equal(activeCount(dakkothCancelled.state), 2);
const targeted = applyCommand(tombCreated.state, { type: 'dakkoth-phylactery-target', playerId: 'P1', objectId: 'new-target' });
assert.equal(targeted.ok, true);
const dakkothTyped = applyCommand(targeted.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'ritual' });
assert.equal(dakkothTyped.ok, true);
const oldDestroyed = applyCommand(dakkothTyped.state, { type: 'wreckna-phylactery-replace', playerId: 'P1', objectId: 'old-a' });
assert.equal(oldDestroyed.ok, true);
assert.equal(oldDestroyed.state.phase, 'choosing-dakkoth-tomb-sacrifice');
assert.equal(oldDestroyed.state.objects.some((object) => object.id === 'old-a'), false);
assert.equal(oldDestroyed.state.objects.find((object) => object.id === 'new-target')?.phylacteryType, undefined);
const tombId = oldDestroyed.state.objects.find((object) => object.kind === 'tomb' && object.ownerId === 'P1')?.id;
assert.ok(tombId);
const completed = applyCommand(oldDestroyed.state, { type: 'dakkoth-tomb-sacrifice', playerId: 'P1', objectId: tombId });
assert.equal(completed.ok, true);
assert.equal(completed.state.objects.find((object) => object.id === 'new-target')?.phylacteryType, 'ritual');
assert.equal(activeCount(completed.state), 2);

const ritualDakkoth = board(true);
ritualDakkoth.players.P1.hand = [];
ritualDakkoth.players.P1.spellEcho = [null, { instanceId: 'ritual-replace-dakkoth', cardId: 'dakkoth' }, null];
const ritualDakkothActivated = applyCommand(ritualDakkoth, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(ritualDakkothActivated.ok, true);
const ritualDakkothTomb = applyCommand(ritualDakkothActivated.state, { type: 'dakkoth-tomb-square', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(ritualDakkothTomb.ok, true);
const ritualDakkothTargeted = applyCommand(ritualDakkothTomb.state, { type: 'dakkoth-phylactery-target', playerId: 'P1', objectId: 'new-target' });
assert.equal(ritualDakkothTargeted.ok, true);
const ritualDakkothTyped = applyCommand(ritualDakkothTargeted.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' });
assert.equal(ritualDakkothTyped.ok, true);
assert.equal(ritualDakkothTyped.state.phase, 'choosing-wreckna-phylactery-replace', 'Ritual cannot skip the replacement sacrifice.');
const ritualDakkothReplaced = applyCommand(ritualDakkothTyped.state, { type: 'wreckna-phylactery-replace', playerId: 'P1', objectId: 'old-a' });
assert.equal(ritualDakkothReplaced.ok, true);
assert.equal(ritualDakkothReplaced.state.objects.some((object) => object.id === 'old-a'), false, 'Even the Ritual Phylactery can be sacrificed for replacement.');
assert.equal(ritualDakkothReplaced.state.objects.some((object) => object.kind === 'tomb' && object.ownerId === 'P1'), true, 'Ritual waives only Dakkoth\'s ordinary Tomb cost.');
assert.equal(ritualDakkothReplaced.state.objects.find((object) => object.id === 'new-target')?.phylacteryType, 'might');
assert.equal(activeCount(ritualDakkothReplaced.state), 2);

console.log('Phylactery replacement checks passed.');
