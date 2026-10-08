import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, effectiveAttackRange } from '../shared/game.ts';

assert.equal(
  cardDefinition({ instanceId: 'dakkoth-definition', cardId: 'dakkoth' }).levelEffects?.[2],
  'Gain 1 Attack, +1 Attack Range and 1 Movement.',
  'Dakkoth Level 3 describes its additional Attack Range bonus.',
);
assert.equal(cardDefinition({ instanceId: 'dakkoth-definition', cardId: 'dakkoth' }).levelEffects?.[1], 'Sacrifice one of your Tombs, then infuse another Object as a Phylactery. Phylactery of Ritual waives the Tomb sacrifice, but not the sacrifice of an existing Phylactery when replacing it');

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
assert.equal(tombCreated.state.phase, 'choosing-dakkoth-tomb-sacrifice', 'Dakkoth Level 2 must select a Tomb before an infusion target.');
const prematureObject = applyCommand(tombCreated.state, { type: 'dakkoth-phylactery-target', playerId: 'P1', objectId: 'dakkoth-box' });
assert.equal(prematureObject.ok, false, 'A normal Object cannot be selected before the Tomb sacrifice.');
assert.equal(tombCreated.state.objects.some((object) => object.id === tombId), true, 'Rejected selection leaves the Tomb available to sacrifice.');

const tombSacrificed = applyCommand(tombCreated.state, { type: 'dakkoth-tomb-sacrifice', playerId: 'P1', objectId: tombId });
assert.equal(tombSacrificed.ok, true, 'Dakkoth sacrifices its Tomb.');
const objectTargeted = applyCommand(tombSacrificed.state, { type: 'dakkoth-phylactery-target', playerId: 'P1', objectId: 'dakkoth-box' });
assert.equal(objectTargeted.ok, true, 'Dakkoth targets an Object for its Phylactery.');
const completed = applyCommand(objectTargeted.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' });
assert.equal(completed.ok, true, 'Dakkoth Level 3 completes.');

assert.equal(completed.state.players.P1.actionsRemaining, 1, 'Dakkoth Level 3 does not grant a general Action.');
assert.equal(completed.state.players.P1.spellsingerExtraAttacks, 1, 'Dakkoth Level 3 grants 1 Attack-only Action.');
assert.equal(completed.state.players.P1.movementRemaining, 3, 'Dakkoth Level 3 grants 1 MOV.');
assert.equal(completed.state.players.P1.dakkothRangeBonus, 2, 'Dakkoth Level 3 adds +1 Attack Range to its Level 1 bonus.');
assert.equal(effectiveAttackRange(completed.state, completed.state.players.P1), 4, 'Wreckna has +2 total Attack Range from Dakkoth Level 3.');

const attackOnly = structuredClone(completed.state);
attackOnly.players.P1.actionsRemaining = 0;
attackOnly.players.P1.hand = [{ instanceId: 'bonus-attack', cardId: 'attack-2' }, { instanceId: 'status-cost', cardId: 'pinned' }];
assert.equal(applyCommand(attackOnly, { type: 'remove-status', playerId: 'P1', cardInstanceId: 'status-cost' }).ok, false, 'The extra Attack cannot pay for a status removal Action.');
const bonusAttack = applyCommand(attackOnly, { type: 'attack', playerId: 'P1', cardInstanceId: 'bonus-attack', targetId: 'dakkoth-box', targetKind: 'object' });
assert.equal(bonusAttack.ok, true, 'The extra Attack allows an Attack when general Actions are exhausted.');
assert.equal(bonusAttack.state.players.P1.spellsingerExtraAttacks, 0, 'Playing the Attack spends the extra Attack allowance.');
assert.equal(bonusAttack.state.players.P1.actionsRemaining, 0, 'The extra Attack does not create general Actions.');

const ended = applyCommand(completed.state, { type: 'end-turn', playerId: 'P1' });
assert.equal(ended.ok, true, 'Wreckna can end the turn after Dakkoth resolves.');
assert.equal(ended.state.players.P1.spellsingerExtraAttacks, 0, 'The extra Attack expires at turn end.');
assert.equal(ended.state.players.P1.dakkothRangeBonus, 2, 'Dakkoth Attack Range remains active through the enemy turn.');
const enemyEnded = applyCommand(ended.state, { type: 'end-turn', playerId: 'P2' });
assert.equal(enemyEnded.ok, true, 'The enemy can end their turn.');
assert.equal(enemyEnded.state.activePlayerId, 'P1', 'Wreckna begins the next turn.');
assert.equal(enemyEnded.state.players.P1.dakkothRangeBonus, 0, 'All temporary Dakkoth Attack Range expires at the start of Wreckna\'s next turn.');

const ritual = createHotseatTestState(true, 'wreckna', 2);
ritual.objects = [
  { id: 'ritual-source', name: 'Ritual Reliquary', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 4, y: 4 }, phylacteryType: 'ritual', phylacteryOwnerId: 'P1' },
  { id: 'ritual-target', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 3 } },
];
ritual.players.P1.position = { x: 2, y: 2 };
ritual.players.P2.position = { x: 8, y: 7 };
ritual.players.P1.hand = [];
ritual.players.P1.spellEcho = [null, { instanceId: 'dakkoth-two', cardId: 'dakkoth' }, null];
const ritualActivated = applyCommand(ritual, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
assert.equal(ritualActivated.ok, true);
const ritualTomb = applyCommand(ritualActivated.state, { type: 'dakkoth-tomb-square', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(ritualTomb.ok, true);
assert.equal(ritualTomb.state.phase, 'choosing-dakkoth-phylactery-target', 'Ritual alone waives the Tomb sacrifice.');
const ritualInfusion = applyCommand(ritualTomb.state, { type: 'dakkoth-phylactery-target', playerId: 'P1', objectId: 'ritual-target' });
assert.equal(ritualInfusion.ok, true);
assert.equal(ritualInfusion.state.objects.some((object) => object.kind === 'tomb'), true, 'The waived Tomb sacrifice preserves the created Tomb.');

console.log('Dakkoth checks passed.');
