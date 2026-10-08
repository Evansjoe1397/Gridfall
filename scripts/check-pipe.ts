import assert from 'node:assert/strict';
import { THE_PIPE_ARENA, randomPipeBoxSpawns } from '../shared/arenas.ts';
import { applyCommand, beginWrecknaPhylacteryChoice, canAttackTargetSquare, chainLightningCanTarget, createMultiplayerState, createPipeTestState, hasLineOfSight, isShallowWater, movementCost, movementPath, type Cell, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};
const boxLabels = (state: GameState): string[] => state.objects.filter((object) => object.kind === 'wooden-box').map((object) => `${String.fromCharCode(64 + object.position.x)}${object.position.y + 1}`);
const withoutBoxes = (state: GameState): GameState => { state.objects = state.objects.filter((object) => object.kind !== 'wooden-box'); return state; };
const checkPipeBoxes = (state: GameState): void => {
  const boxes = boxLabels(state);
  assert.equal(boxes.length, 6, 'A Pipe match starts with exactly six Boxes.');
  assert.equal(new Set(boxes).size, 6, 'Boxes cannot share a Square.');
  assert.deepEqual(boxes.slice(0, 2), ['B5', 'G4'], 'The two fixed Boxes always spawn.');
  THE_PIPE_ARENA.boxSpawnGroups!.forEach((group) => assert.equal(boxes.filter((label) => group.includes(label)).length, 1, 'Each random group contributes one Box.'));
  for (const label of boxes) assert.ok(![...THE_PIPE_ARENA.pillars, ...THE_PIPE_ARENA.buttonSquares!, ...THE_PIPE_ARENA.bases.P1, ...THE_PIPE_ARENA.bases.P2].includes(label), 'A Box cannot overlap a Column, Button, or Base.');
};

assert.deepEqual(THE_PIPE_ARENA.pillars, ['A5', 'H4']);
assert.deepEqual(THE_PIPE_ARENA.drawSquares, ['A8', 'B8', 'G1', 'H1']);
assert.deepEqual(THE_PIPE_ARENA.slideSquares, ['C1', 'E1', 'E2', 'E3', 'D6', 'D7', 'D8', 'F8']);
assert.equal(THE_PIPE_ARENA.trenchSquares?.length, 18);
assert.ok(THE_PIPE_ARENA.highgroundProtected.includes('B5'));
assert.ok(!THE_PIPE_ARENA.highgroundProtected.includes('A5'));
assert.deepEqual(randomPipeBoxSpawns(() => 0), ['A4', 'E5', 'A6', 'F1']);
assert.deepEqual(randomPipeBoxSpawns(() => 0.999), ['D3', 'H5', 'C8', 'H3']);

let state = createPipeTestState(true, 'shinobi', 'dummy');
checkPipeBoxes(state);
checkPipeBoxes(createMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'magician' }, 'pipe'));
for (let index = 0; index < 20; index++) checkPipeBoxes(createPipeTestState(true, 'shinobi', 'dummy'));
assert.deepEqual(state.players.P1.position, cell('A2'));
assert.deepEqual(state.players.P2.position, cell('H7'));
assert.equal(isShallowWater(state, cell('B8')), false);
assert.equal(canAttackTargetSquare(state, cell('D4'), cell('B5')), true);
assert.equal(hasLineOfSight(state, cell('C4'), cell('C2')), true, 'The Button does not block line of sight.');
withoutBoxes(state);

const spiritButton = withoutBoxes(createPipeTestState(true, 'john-christ', 'dummy'));
spiritButton.players.P1.position = cell('B3');
spiritButton.players.P1.freeMoveUsed = true;
spiritButton.players.P1.movementRemaining = 2;
assert.equal(applyCommand(spiritButton, { type: 'move', playerId: 'P1', to: cell('C3') }).ok, false, 'A character outside Spirit Form cannot enter the Button Square.');
spiritButton.players.P1.spiritForm = true;
let throughButton = step(spiritButton, { type: 'move', playerId: 'P1', to: cell('C3') });
assert.equal(throughButton.players.P1.spiritObjectUnderfoot, 'pipe-button-1');
assert.equal(applyCommand(throughButton, { type: 'end-turn', playerId: 'P1' }).ok, false, 'John must walk through the Button rather than stop there.');
throughButton = step(throughButton, { type: 'move', playerId: 'P1', to: cell('D3') });
assert.deepEqual(throughButton.players.P1.position, cell('D3'));
assert.equal(throughButton.players.P1.spiritObjectUnderfoot, null);
assert.ok(throughButton.objects.some((object) => object.id === 'pipe-button-1'), 'Spirit traversal leaves the Button intact.');

const attackState = withoutBoxes(createPipeTestState(true, 'merylin', 'dummy'));
attackState.players.P1.position = cell('B3');
attackState.players.P2.position = cell('B7');
attackState.players.P1.hand = [{ instanceId: 'pipe-attack', cardId: 'attack-2' }];
attackState.players.P1.merylinSummonActive = true;
assert.equal(applyCommand(attackState, { type: 'attack', playerId: 'P1', cardInstanceId: 'pipe-attack', targetId: 'pipe-button-1', targetKind: 'object' }).ok, false, 'Ordinary Attack Cards cannot target a Button, as with a Column.');
assert.equal(isShallowWater(attackState, cell('B8')), false, 'A rejected Attack does not press the Button.');
attackState.players.P1.hand = [{ instanceId: 'pipe-moonlight', cardId: 'moonlight' }];
const afterAttack = step(attackState, { type: 'attack', playerId: 'P1', cardInstanceId: 'pipe-moonlight', targetId: 'pipe-button-1', targetKind: 'object' });
assert.ok(afterAttack.objects.some((object) => object.id === 'pipe-button-1'), 'Attacking a Button never destroys it.');
assert.equal(isShallowWater(afterAttack, cell('B8')), true, 'Moonlight can target the Button, as with a Column, and activates it.');
assert.equal(afterAttack.players.P1.actionsRemaining, attackState.players.P1.actionsRemaining - 1, 'Moonlight spends the Attack Card Action only.');

const fixedButton = withoutBoxes(createPipeTestState(true, 'wreckna', 'dummy')) as GameState & Record<string, any>;
fixedButton.players.P1.position = cell('B3');
fixedButton.players.P2.position = cell('B7');
const buttonPosition = { ...fixedButton.objects.find((object) => object.id === 'pipe-button-1')!.position };
const startingHp = fixedButton.players.P1.hp;
assert.equal(beginWrecknaPhylacteryChoice(fixedButton, 'P1', 'pipe-button-1', { hp: 1 }).ok, false, 'Shared Phylactery creation rejects a Button.');
assert.equal(fixedButton.players.P1.hp, startingHp, 'Rejected infusion does not charge HP.');
const staleInfusion = structuredClone(fixedButton);
staleInfusion.phase = 'choosing-wreckna-phylactery';
staleInfusion.wrecknaPhylacteryChoice = { casterId: 'P1', objectId: 'pipe-button-1', availableTypes: ['might'], sacrificeHp: 0 };
assert.equal(applyCommand(staleInfusion, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' }).ok, false, 'A stale pending choice cannot infuse a Button.');
for (const [phase, pendingKey, commandType] of [
  ['choosing-test-phylactery-target', 'testPhylactery', 'test-phylactery-target'],
  ['choosing-lichdom-target', 'lichdom', 'lichdom-target'],
  ['choosing-dakkoth-phylactery-target', 'dakkoth', 'dakkoth-phylactery-target'],
] as const) {
  const pending = structuredClone(fixedButton);
  pending.phase = phase;
  pending[pendingKey] = { casterId: 'P1', level: 2, stage: 'target', undo: null };
  assert.equal(applyCommand(pending, { type: commandType, playerId: 'P1', objectId: 'pipe-button-1' }).ok, false, `${commandType} cannot infuse a Button.`);
}
const chainState = withoutBoxes(createPipeTestState(true, 'magician', 'dummy'));
chainState.players.P1.position = cell('B3');
chainState.players.P2.position = cell('H7');
chainState.phase = 'choosing-chain-lightning-target';
chainState.chainLightning = { casterId: 'P1', level: 1, bounces: 0, bounceRange: 1, undo: null };
assert.equal(chainLightningCanTarget(chainState, 'P1', 'pipe-button-1', 'object'), true, 'Chain Lightning can initially target a Button, as with a Column.');
const chained = step(chainState, { type: 'chain-lightning-target', playerId: 'P1', targetId: 'pipe-button-1', targetKind: 'object' });
assert.deepEqual(chained.objects.find((object) => object.id === 'pipe-button-1')?.position, buttonPosition, 'Chain Lightning leaves the Button in place.');

for (const [phase, pendingKey, command] of [
  ['choosing-force-pull-target', 'forcePull', { type: 'force-pull-target', playerId: 'P1', targetKind: 'object', targetId: 'pipe-button-1' }],
  ['choosing-force-throw-target', 'forceThrow', { type: 'force-throw-target', playerId: 'P1', targetKind: 'object', targetId: 'pipe-button-1' }],
  ['choosing-magic-hand-target', 'magicHand', { type: 'magic-hand-target', playerId: 'P1', targetKind: 'object', targetId: 'pipe-button-1' }],
  ['choosing-kyk-target', 'forceThrow', { type: 'kyk-target', playerId: 'P1', objectId: 'pipe-button-1' }],
  ['choosing-preparation-teleport', 'preparation', { type: 'preparation-teleport', playerId: 'P1', objectId: 'pipe-button-1' }],
] as const) {
  const pending = structuredClone(fixedButton);
  pending.phase = phase;
  pending[pendingKey] = { casterId: 'P1', level: 3, targetRange: 4, undo: null };
  assert.equal(applyCommand(pending, command as Parameters<typeof applyCommand>[1]).ok, false, `${command.type} cannot move a Button.`);
  assert.deepEqual(pending.objects.find((object) => object.id === 'pipe-button-1')?.position, buttonPosition);
}

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
  const slideState = withoutBoxes(createPipeTestState(false, 'shinobi', 'orkk'));
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
const unfloodedSlide = withoutBoxes(createPipeTestState(false, 'shinobi', 'orkk'));
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
