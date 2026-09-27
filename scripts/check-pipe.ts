import assert from 'node:assert/strict';
import { THE_PIPE_ARENA } from '../shared/arenas.ts';
import { applyCommand, canAttackTargetSquare, createPipeTestState, hasLineOfSight, isShallowWater, movementCost, movementPath, type Cell, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};

assert.deepEqual(THE_PIPE_ARENA.pillars, ['A5', 'H4']);
assert.deepEqual(THE_PIPE_ARENA.drawSquares, ['A8', 'B8', 'G1', 'H1']);
assert.deepEqual(THE_PIPE_ARENA.slideSquares, ['C1', 'E1', 'E2', 'E3', 'D6', 'D7', 'D8', 'F8']);
assert.equal(THE_PIPE_ARENA.trenchSquares?.length, 18);
assert.ok(THE_PIPE_ARENA.highgroundProtected.includes('B5'));
assert.ok(!THE_PIPE_ARENA.highgroundProtected.includes('A5'));

let state = createPipeTestState(true, 'shinobi', 'dummy');
assert.deepEqual(state.players.P1.position, cell('A2'));
assert.deepEqual(state.players.P2.position, cell('H7'));
assert.equal(isShallowWater(state, cell('B8')), false);
assert.equal(canAttackTargetSquare(state, cell('D4'), cell('B5')), true);
assert.equal(hasLineOfSight(state, cell('C4'), cell('C2')), true, 'The Button does not block line of sight.');

const attackState = createPipeTestState(true, 'shinobi', 'dummy');
attackState.players.P1.position = cell('B3');
attackState.players.P2.position = cell('B7');
attackState.players.P1.hand = [{ instanceId: 'pipe-attack', cardId: 'attack-2' }];
const afterAttack = step(attackState, { type: 'attack', playerId: 'P1', cardInstanceId: 'pipe-attack', targetId: 'pipe-button-1', targetKind: 'object' });
assert.ok(afterAttack.objects.some((object) => object.id === 'pipe-button-1'), 'Attacking a Button never destroys it.');
assert.equal(isShallowWater(afterAttack, cell('B8')), true, 'An Attack Card activates the Button.');
assert.equal(afterAttack.players.P1.actionsRemaining, attackState.players.P1.actionsRemaining - 1, 'Attacking spends the Attack Card Action only.');

state.players.P1.position = cell('B3');
state.players.P2.position = cell('B7');
state = step(state, { type: 'press-pipe-button', playerId: 'P1', buttonId: 'pipe-button-1' });
assert.equal(state.players.P1.actionsRemaining, 1, 'Pressing a Button spends one Action.');
assert.equal(isShallowWater(state, cell('B8')), true);
assert.equal(isShallowWater(state, cell('G1')), false);
assert.equal(THE_PIPE_ARENA.drawSquares.includes('B8'), true);

state.players.P1.position = cell('B5');
assert.equal(movementCost(state, state.players.P1, movementPath(state, state.players.P1, cell('B6'))), 2, 'Entering shallow water costs two MOV.');
assert.equal(movementCost(state, { ...state.players.P1, position: cell('B6') }, [cell('B7')]), 2, 'Water to water pays only the exit surcharge.');
assert.equal(movementCost(state, { ...state.players.P1, position: cell('B6') }, [cell('B5')]), 2, 'Leaving water costs two MOV.');
state.players.P1.movementRemaining = 1;
assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell('B6') }).ok, false);
state.players.P1.movementRemaining = 2;
state = step(state, { type: 'move', playerId: 'P1', to: cell('B6') });
assert.equal(state.players.P1.movementRemaining, 0);
state.players.P1.movementRemaining = 1;
assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell('A7') }).ok, false, 'One MOV cannot move between shallow-water Squares.');
state.players.P1.movementRemaining = 2;
state = step(state, { type: 'move', playerId: 'P1', to: cell('A7') });
assert.equal(state.players.P1.movementRemaining, 0, 'A water-to-water move spends exactly two MOV.');

state.players.P1.position = cell('B3');
state = step(state, { type: 'press-pipe-button', playerId: 'P1', buttonId: 'pipe-button-1' });
assert.equal(state.players.P1.actionsRemaining, 0);
assert.equal(isShallowWater(state, cell('G1')), true, 'An already flooded closer zone makes the other zone flood.');
const noAction = applyCommand(state, { type: 'press-pipe-button', playerId: 'P1', buttonId: 'pipe-button-1' });
assert.equal(noAction.ok, false, 'Pressing cannot activate a Button with no Actions remaining.');
assert.equal(isShallowWater(noAction.state, cell('G1')), true, 'A rejected press leaves flooding unchanged.');
state.players.P1.actionsRemaining = 1;
state = step(state, { type: 'press-pipe-button', playerId: 'P1', buttonId: 'pipe-button-1' });
assert.equal(state.players.P1.actionsRemaining, 0);
assert.equal(isShallowWater(state, cell('G1')), false, 'When both zones are flooded, the farther zone drains.');

state.players.P1.hand = [];
state.players.P2.hand = [];
for (let index = 0; index < 4; index++) state = step(state, { type: 'end-turn', playerId: state.activePlayerId });
assert.equal(isShallowWater(state, cell('B8')), false, 'Flooding expires after four player turns including activation.');

function waterSlide(from: string, slide: string, floodedZone: 1 | 2, enemyAt = 'H7'): GameState {
  const slideState = createPipeTestState(false, 'shinobi', 'orkk');
  slideState.phase = 'active';
  slideState.activePlayerId = 'P1';
  slideState.players.P1.position = cell(from);
  slideState.players.P1.movementRemaining = 10;
  slideState.players.P2.position = cell(enemyAt);
  slideState.pipeTurnIndex = 0;
  slideState.pipeFloodUntil = { [floodedZone]: 4 };
  return step(slideState, { type: 'move', playerId: 'P1', to: cell(slide) });
}

const edgeSlide = waterSlide('D3', 'E3', 2);
assert.deepEqual(edgeSlide.players.P1.position, cell('H3'), 'The Slide continues across every flooded Square until the board edge.');
assert.deepEqual(edgeSlide.players.P1.visualMovement?.path.slice(-4), [cell('E3'), cell('F3'), cell('G3'), cell('H3')]);
const drySlide = waterSlide('D1', 'E2', 2);
assert.deepEqual(drySlide.players.P1.position, cell('G4'), 'The Slide enters the first dry Square, then stops.');
const zoneOneSlide = waterSlide('E8', 'D7', 1);
assert.deepEqual(zoneOneSlide.players.P1.position, cell('B5'), 'Zone 1 water also continues until a dry Square.');
const collisionSlide = waterSlide('D3', 'E3', 2, 'G3');
assert.deepEqual(collisionSlide.players.P1.position, cell('G3'), 'A character collision stops the water Slide.');
assert.deepEqual(collisionSlide.players.P2.position, cell('H3'), 'The struck character is pushed by the existing Slide collision rule.');
assert.equal(collisionSlide.players.P2.hp, collisionSlide.players.P2.maxHp - 1, 'The struck character takes Slide collision Damage.');
const blockedCollisionSlide = waterSlide('D3', 'E3', 2, 'H3');
assert.deepEqual(blockedCollisionSlide.players.P1.position, cell('G3'), 'The slider stops before a character that cannot be pushed past the board edge.');
assert.deepEqual(blockedCollisionSlide.players.P2.position, cell('H3'));
assert.equal(blockedCollisionSlide.players.P2.hp, blockedCollisionSlide.players.P2.maxHp - 1);
const unfloodedSlide = createPipeTestState(false, 'shinobi', 'orkk');
unfloodedSlide.phase = 'active';
unfloodedSlide.activePlayerId = 'P1';
unfloodedSlide.players.P1.position = cell('D3');
unfloodedSlide.players.P1.movementRemaining = 10;
assert.deepEqual(step(unfloodedSlide, { type: 'move', playerId: 'P1', to: cell('E3') }).players.P1.position, cell('F3'), 'An unflooded Slide moves only one extra Square.');

const burningWater = createPipeTestState(false, 'magician', 'dummy');
burningWater.phase = 'active';
burningWater.activePlayerId = 'P1';
burningWater.players.P1.position = cell('B6');
burningWater.pipeFloodUntil = { 1: 4 };
burningWater.players.P1.hand = [
  { instanceId: 'water-burning-1', cardId: 'burning', sourcePlayerId: 'P2' },
  { instanceId: 'water-burning-2', cardId: 'burning', sourcePlayerId: 'P2' },
];
const burningWaterHp = burningWater.players.P1.hp;
const extinguished = step(burningWater, { type: 'end-turn', playerId: 'P1' });
assert.equal(extinguished.players.P1.hp, burningWaterHp - 2, 'Each Burning Card still deals 1 Damage at turn end.');
assert.equal(extinguished.players.P1.hand.some((card) => card.cardId === 'burning'), false, 'Ending on flooded Shallow Water Removes Burning without Dash.');
assert.deepEqual(extinguished.players.P1.position, cell('B6'), 'Extinguishing Burning does not move the character.');

const burningDry = createPipeTestState(false, 'magician', 'dummy');
burningDry.phase = 'active';
burningDry.activePlayerId = 'P1';
burningDry.players.P1.position = cell('B6');
burningDry.players.P1.hand = [{ instanceId: 'dry-burning', cardId: 'burning', sourcePlayerId: 'P2' }];
const burningDryHp = burningDry.players.P1.hp;
const stillBurning = step(burningDry, { type: 'end-turn', playerId: 'P1' });
assert.equal(stillBurning.players.P1.hp, burningDryHp - 1);
assert.equal(stillBurning.players.P1.hand.some((card) => card.cardId === 'burning'), true, 'A dry Trench Square does not Remove Burning.');

console.log('The Pipe checks passed.');
