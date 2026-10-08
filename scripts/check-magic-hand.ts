import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, magicHandDestinationValid, type Cell, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}
function setup(level: 1 | 2 | 3, consume = false, origin: Cell = { x: 3, y: 2 }): GameState {
  let state = createHotseatTestState(true, 'magician', 2, 'shinobi');
  state.phase = 'active'; state.activePlayerId = 'P1';
  state.players.P1.position = { x: 1, y: 1 };
  state.players.P2.position = { x: 8, y: 7 };
  state.players.P1.hand = [];
  state.players.P1.manaMode = consume ? 'consume' : 'generate';
  state.objects = [{ id: 'target', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { ...origin } }];
  const card = { instanceId: 'magic', cardId: 'magic-hand' as const };
  if (level === 1) {
    state.players.P1.hand = [card];
    state = step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'magic', destination: 'direct' });
  } else {
    state.players.P1.spellEcho = [null, null, null];
    state.players.P1.spellEcho[level - 1] = card;
    state = step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
  }
  return state;
}
function select(state: GameState): GameState { return step(state, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'target' }); }

for (const level of [1, 2, 3] as const) for (const consume of [false, true]) {
  for (const distance of [1, 2, 3]) for (const diagonal of [false, true]) {
    const targeted = select(setup(level, consume));
    const destination = { x: 3 + distance, y: 2 + (diagonal ? distance : 0) };
    assert.ok(magicHandDestinationValid(targeted, destination));
    const moved = step(targeted, { type: 'magic-hand-direction', playerId: 'P1', to: destination });
    assert.deepEqual(moved.objects.find((object) => object.id === 'target')?.position, destination, 'Objects stop at the clicked Square instead of always using the maximum distance.');
    assert.equal(moved.magicHand, null);
    assert.equal(moved.players.P1.actionsRemaining, consume ? 2 : 1);
    assert.equal(moved.players.P1.manaPoints, consume ? 0 : 1);
    assert.equal(moved.objectPushAnimations.find((event) => event.objectId === 'target')?.path?.length, distance);
  }
}
for (const level of [1, 2] as const) {
  const targeted = select(setup(level));
  for (const to of [{ x: 7, y: 2 }, { x: 5, y: 3 }, { x: 3, y: 2 }, { x: 9, y: 2 }]) {
    assert.equal(magicHandDestinationValid(targeted, to), false);
    assert.equal(applyCommand(targeted, { type: 'magic-hand-direction', playerId: 'P1', to }).ok, false);
    assert.deepEqual(targeted.objects[0].position, { x: 3, y: 2 }, 'Invalid choices leave the target and targeting state untouched.');
    assert.equal(targeted.phase, 'choosing-magic-hand-direction');
  }
}
const global = select(setup(3));
const globalMoved = step(global, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 8, y: 2 } });
assert.deepEqual(globalMoved.objects[0].position, { x: 8, y: 2 });
const far = setup(1, false, { x: 7, y: 6 });
assert.equal(applyCommand(far, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'target' }).ok, false);
assert.equal(select(setup(2, false, { x: 7, y: 6 })).phase, 'choosing-magic-hand-direction');

for (const kind of ['tomb', 'orkk-shield'] as const) {
  const targeted = select(setup(3));
  targeted.objects[0].kind = kind;
  targeted.objects[0].heavy = true;
  assert.equal(magicHandDestinationValid(targeted, { x: 5, y: 2 }), false);
  const moved = step(targeted, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 4, y: 2 } });
  assert.deepEqual(moved.objects[0].position, { x: 4, y: 2 }, 'Heavy Objects retain the one-Square limit.');
}
const collision = select(setup(1));
collision.objects.push({ id: 'obstacle', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 5, y: 2 } });
const collided = step(collision, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 6, y: 2 } });
assert.deepEqual(collided.objects.find((object) => object.id === 'target')?.position, { x: 4, y: 2 });
assert.deepEqual(collided.objects.find((object) => object.id === 'obstacle')?.position, { x: 6, y: 2 }, 'Only the selected remaining distance transfers through collisions.');
assert.ok(collided.objects.every((object) => object.hp === 3));

for (const distance of [1, 2, 3]) for (const diagonal of [false, true]) {
  const enemy = setup(3);
  enemy.players.P2.position = { x: 4, y: 1 };
  const enemySelected = step(enemy, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  const destination = { x: 4 + distance, y: 1 + (diagonal ? distance : 0) };
  assert.ok(magicHandDestinationValid(enemySelected, destination));
  const enemyPushed = step(enemySelected, { type: 'magic-hand-direction', playerId: 'P1', to: destination });
  assert.deepEqual(enemyPushed.players.P2.position, destination, 'Level 3 enemy targets stop at the selected Square.');
  assert.equal(enemyPushed.players.P2.hp, enemy.players.P2.hp, 'A clear Magic Hand push deals no Damage.');
  assert.equal(enemyPushed.players.P2.visualMovement?.path.length, distance);
}

const objectHitsCharacter = select(setup(3));
objectHitsCharacter.players.P2.position = { x: 5, y: 2 };
const characterCollision = step(objectHitsCharacter, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 7, y: 2 } });
assert.deepEqual(characterCollision.objects[0].position, { x: 4, y: 2 });
assert.deepEqual(characterCollision.players.P2.position, { x: 7, y: 2 }, 'Only the two unused steps transfer from an Object to a character.');
assert.equal(characterCollision.players.P2.visualMovement?.path.length, 2);
assert.equal(characterCollision.players.P2.hp, objectHitsCharacter.players.P2.hp, 'Transferred movement deals no collision Damage.');

const characterHitsObject = setup(3);
characterHitsObject.players.P2.position = { x: 4, y: 2 };
characterHitsObject.objects[0].position = { x: 6, y: 2 };
const characterTargeted = step(characterHitsObject, { type: 'magic-hand-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
const objectCollision = step(characterTargeted, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 7, y: 2 } });
assert.deepEqual(objectCollision.players.P2.position, { x: 5, y: 2 });
assert.deepEqual(objectCollision.objects[0].position, { x: 7, y: 2 }, 'Only the one unused step transfers from a character to an Object.');
assert.equal(objectCollision.objects[0].hp, 3);

const chained = select(setup(3));
chained.objects.push(
  { id: 'first', name: 'First Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 5, y: 2 } },
  { id: 'second', name: 'Second Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 7, y: 2 } },
);
const chainedCollision = step(chained, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 8, y: 2 } });
assert.deepEqual(chainedCollision.objects.map((object) => object.position), [{ x: 4, y: 2 }, { x: 6, y: 2 }, { x: 8, y: 2 }], 'Each collision passes along only its remaining travel distance.');
assert.ok(chainedCollision.objects.every((object) => object.hp === 3));
console.log('Magic Hand destination checks passed.');
