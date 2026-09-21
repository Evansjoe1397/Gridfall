import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, effectiveAttackRange } from '../shared/game.ts';

assert.equal(
  cardDefinition({ instanceId: 'dakkoth-definition', cardId: 'dakkoth' }).levelEffects?.[2],
  'Gain 1 Action, +1 Att. Range until the start of your next turn and 1 MOV',
  'Dakkoth Level 3 describes its additional Attack Range bonus.',
);

const state = createHotseatTestState(true, 'wreckna', 2);
state.objects = [{ id: 'dakkoth-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 5, y: 2 } }];
state.players.P1.position = { x: 2, y: 2 };
state.players.P2.position = { x: 8, y: 7 };
state.players.P1.hand = [];
state.players.P1.spellEcho = [null, null, { instanceId: 'dakkoth-three', cardId: 'dakkoth' }];

const activated = applyCommand(state, { type: 'use-echo-perk', playerId: 'P1', position: 3 });
assert.equal(activated.ok, true, 'Dakkoth Level 3 activates.');
assert.equal(activated.state.players.P1.dakkothRangeBonus, 1, 'Dakkoth Level 1 first grants +1 Attack Range.');

const tombCreated = applyCommand(activated.state, { type: 'dakkoth-tomb-square', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(tombCreated.ok, true, 'Dakkoth creates a Tomb.');
const tombId = tombCreated.state.objects.find((object) => object.kind === 'tomb')?.id;
assert.ok(tombId, 'Dakkoth created a Tomb that can be sacrificed.');

const tombSacrificed = applyCommand(tombCreated.state, { type: 'dakkoth-tomb-sacrifice', playerId: 'P1', objectId: tombId });
assert.equal(tombSacrificed.ok, true, 'Dakkoth sacrifices its Tomb.');
const objectTargeted = applyCommand(tombSacrificed.state, { type: 'dakkoth-phylactery-target', playerId: 'P1', objectId: 'dakkoth-box' });
assert.equal(objectTargeted.ok, true, 'Dakkoth targets an Object for its Phylactery.');
const completed = applyCommand(objectTargeted.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' });
assert.equal(completed.ok, true, 'Dakkoth Level 3 completes.');

assert.equal(completed.state.players.P1.actionsRemaining, 2, 'Dakkoth Level 3 grants 1 Action.');
assert.equal(completed.state.players.P1.movementRemaining, 3, 'Dakkoth Level 3 grants 1 MOV.');
assert.equal(completed.state.players.P1.dakkothRangeBonus, 2, 'Dakkoth Level 3 adds +1 Attack Range to its Level 1 bonus.');
assert.equal(effectiveAttackRange(completed.state, completed.state.players.P1), 4, 'Wreckna has +2 total Attack Range from Dakkoth Level 3.');

const ended = applyCommand(completed.state, { type: 'end-turn', playerId: 'P1' });
assert.equal(ended.ok, true, 'Wreckna can end the turn after Dakkoth resolves.');
assert.equal(ended.state.players.P1.dakkothRangeBonus, 2, 'Dakkoth Attack Range remains active through the enemy turn.');
const enemyEnded = applyCommand(ended.state, { type: 'end-turn', playerId: 'P2' });
assert.equal(enemyEnded.ok, true, 'The enemy can end their turn.');
assert.equal(enemyEnded.state.activePlayerId, 'P1', 'Wreckna begins the next turn.');
assert.equal(enemyEnded.state.players.P1.dakkothRangeBonus, 0, 'All temporary Dakkoth Attack Range expires at the start of Wreckna\'s next turn.');

console.log('Dakkoth checks passed.');
