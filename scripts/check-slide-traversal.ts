import assert from 'node:assert/strict';
import { applyCommand, createPipeTestState, createTrenchTestState, movementPath, type Cell, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: GameCommand): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};
const modes = ['spirit', 'swiftform', 'windwalker', 'dance', 'jump', 'shizzle', 'shadow'] as const;
type Mode = typeof modes[number];
const setup = (mode: Mode, origin = 'C6'): GameState => {
  const character = mode === 'spirit' ? 'john-christ' : mode === 'windwalker' ? 'merylin' : mode === 'shizzle' ? 'magician' : mode === 'shadow' ? 'spectre' : 'shinobi';
  const state = createTrenchTestState(false, character, 'dummy');
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = [];
  state.players.P1.position = cell(origin); state.players.P2.position = cell('H8');
  state.players.P1.freeMoveUsed = true; state.players.P1.movementRemaining = 6;
  if (mode === 'spirit') state.players.P1.spiritForm = true;
  if (mode === 'swiftform') state.players.P1.swiftformCanPassEnemies = true;
  if (mode === 'windwalker') state.players.P1.windwalkerUnrestrictedMovement = true;
  if (mode === 'dance') { state.phase = 'dance-through'; state.danceThrough = { playerId: 'P1', stepsRemaining: 3, enemyUnderfoot: null, damagePrevented: false }; }
  if (mode === 'jump') { state.phase = 'double-jump'; state.doubleJump = { playerId: 'P1', stepsRemaining: 2, enemyUnderfoot: null, resumePhase: 'active' }; }
  if (mode === 'shizzle') { state.phase = 'shizzle-move'; state.shizzle = { casterId: 'P1', level: 1, stepsRemaining: 2, consume: true, enemyUnderfoot: null, started: false, undo: null }; }
  if (mode === 'shadow') Object.assign(state, { spectreShadow: { casterId: 'P1', level: 1, originPosition: cell(origin), trail: [cell('C7'), cell('C8'), cell('C4'), cell('C5')], undo: null } });
  return state;
};
const move = (state: GameState, label: string) => step(state, { type: 'move', playerId: 'P1', to: cell(label) });
const assertNoSlide = (state: GameState, label: string, context: string) => {
  assert.deepEqual(state.players.P1.position, cell(label), `${context}: stop at the chosen Square without a Slide.`);
  assert.equal(state.log.some((entry) => entry.includes('slid automatically')), false, `${context}: no automatic Slide log.`);
  assert.equal(state.objectPushAnimations.some((event) => event.callout?.text === 'Slide'), false, `${context}: no Slide callout.`);
  assert.equal(state.players.P1.visualMovement?.slideEffectsIgnored, true, `${context}: presentation must not infer a Slide.`);
};

for (const mode of modes) {
  const entered = move(setup(mode), 'C7');
  assertNoSlide(entered, 'C7', mode);
  // C7 is a Slide, but not a Trench: every adjacent free Square is an exit.
  for (const exit of ['B6', 'C6', 'D6', 'B7', 'D7', 'B8', 'C8', 'D8']) {
    const exited = move(entered, exit);
    assert.deepEqual(exited.players.P1.position, cell(exit), `${mode}: may leave C7 for adjacent ${exit}.`);
    assert.equal(exited.players.P1.visualMovement?.path.length, 1, `${mode}: the exit is one adjacent step.`);
  }
  const trench = move(setup(mode, 'C3'), 'C4');
  assertNoSlide(trench, 'C4', `${mode} on a Trench Slide`);
  trench.players.P1.movementRemaining = 1;
  for (const exit of ['C3', 'D3']) {
    assert.equal(applyCommand(trench, { type: 'move', playerId: 'P1', to: cell(exit) }).ok, false, `${mode}: a Trench Slide cannot be used to climb onto High Ground.`);
    if (['spirit', 'swiftform', 'windwalker', 'shadow'].includes(mode)) assert.notDeepEqual(movementPath(trench, trench.players.P1, cell(exit)), [cell(exit)], `${mode}: pathfinding must not offer the forbidden ascent.`);
  }
  assert.deepEqual(move(trench, 'B4').players.P1.position, cell('B4'), `${mode}: a Trench Slide still permits a non-High-Ground exit.`);
}

for (const mode of modes) {
  // Windwalker crosses occupants inside a route and never stops on one.
  if (mode === 'windwalker') continue;
  for (const occupant of ['enemy', 'box'] as const) {
    if (mode === 'swiftform' && occupant === 'box') continue;
    const state = setup(mode);
    if (occupant === 'enemy') state.players.P2.position = cell('C7');
    else state.objects.push({ id: 'slide-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('C7') });
    const entered = move(state, 'C7');
    assertNoSlide(entered, 'C7', `${mode} through ${occupant}`);
    const exited = move(entered, 'D6');
    assert.deepEqual(exited.players.P1.position, cell('D6'));
    assert.deepEqual(exited.players.P2.position, state.players.P2.position, 'Passing does not push the enemy.');
    assert.equal(exited.players.P2.hp, state.players.P2.hp, 'Passing causes no Slide collision Damage.');
    if (occupant === 'box') assert.deepEqual(exited.objects[0].position, cell('C7'), 'Passing leaves the Box on the Slide.');
  }
}
for (const occupant of ['enemy', 'box'] as const) {
  const state = setup('windwalker');
  state.players.P1.movementRemaining = 2;
  if (occupant === 'enemy') state.players.P2.position = cell('C7');
  else state.objects.push({ id: 'windwalker-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('C7') });
  const crossed = move(state, 'C8');
  assert.deepEqual(crossed.players.P1.visualMovement?.path, [cell('C7'), cell('C8')]);
  assertNoSlide(crossed, 'C8', `Windwalker through ${occupant}`);
  assert.equal(crossed.players.P1.movementRemaining, 0);
  assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell('C7') }).ok, false, 'Windwalker must finish beyond the occupied Slide.');
}

const linearShizzle = setup('shizzle');
linearShizzle.phase = 'choosing-shizzle-destination'; linearShizzle.shizzle!.consume = false;
assertNoSlide(step(linearShizzle, { type: 'shizzle-destination', playerId: 'P1', to: cell('C8') }), 'C8', 'Linear Shizzle across a Slide');
const trenchLine = setup('shizzle', 'C5');
trenchLine.phase = 'choosing-shizzle-destination'; trenchLine.shizzle!.consume = false;
assert.equal(applyCommand(trenchLine, { type: 'shizzle-destination', playerId: 'P1', to: cell('C7') }).ok, false, 'Linear Shizzle cannot cross a forbidden Trench Slide ascent as an intermediate step.');

const shadowEntry = setup('shadow', 'C5');
Object.assign(shadowEntry, { spectreShadow: { casterId: 'P1', level: 1, originPosition: cell('A1'), trail: [cell('D6')], undo: null } });
shadowEntry.players.P1.movementRemaining = 1;
assert.notDeepEqual(movementPath(shadowEntry, shadowEntry.players.P1, cell('D6')), [cell('D6')], 'Entering the shadow trail cannot bypass the Trench Slide ascent restriction.');
assert.equal(applyCommand(shadowEntry, { type: 'move', playerId: 'P1', to: cell('D6') }).ok, false);

const pipe = createPipeTestState(false, 'shinobi', 'dummy');
pipe.phase = 'active'; pipe.activePlayerId = 'P1'; pipe.players.P1.freeMoveUsed = true;
pipe.objects = []; pipe.players.P1.position = cell('D3'); pipe.players.P2.position = cell('H8');
pipe.players.P1.movementRemaining = 4;
const ordinaryPipe = move(pipe, 'E3');
assert.deepEqual(ordinaryPipe.players.P1.position, cell('F3'), 'Ordinary movement still triggers the Pipe Slide.');
pipe.players.P1.swiftformCanPassEnemies = true;
const traversingPipe = move(pipe, 'E3');
assertNoSlide(traversingPipe, 'E3', 'Swiftform on the Pipe');
assert.deepEqual(move(traversingPipe, 'D3').players.P1.position, cell('D3'), 'A Pipe Slide-only Square permits a High Ground exit.');

const ordinary = setup('swiftform'); ordinary.players.P1.swiftformCanPassEnemies = false;
assert.deepEqual(move(ordinary, 'C7').players.P1.position, cell('C8'), 'Without a traversal ability, ordinary Slide effects remain active.');
console.log('Slide traversal checks passed.');
