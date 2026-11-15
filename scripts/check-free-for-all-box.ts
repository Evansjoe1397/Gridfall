import assert from 'node:assert/strict';
import { LORDAERON_ARENA, randomLordaeronHighgroundBoxSpawn, randomLordaeronInteriorBoxSpawns } from '../shared/arenas.ts';
import { applyCommand, createHotseatTestState, createLordaeronMultiplayerState, createMultiplayerState, type GameState } from '../shared/game.ts';

const label = ({ x, y }: { x: number; y: number }) => `${String.fromCharCode(64 + x)}${y + 1}`;
const checkStartingBoxes = (state: GameState) => {
  const boxes = state.objects.filter((object) => object.kind === 'wooden-box');
  const squares = boxes.map((box) => label(box.position));
  assert.equal(boxes.length, 6, 'Lordaeron starts with three fixed Boxes, one random High Ground Box and two random interior Boxes.');
  assert.deepEqual(squares.slice(0, 3), LORDAERON_ARENA.boxes, 'The original Boxes keep their Squares.');
  assert.ok(LORDAERON_ARENA.highground.includes(squares[3]), 'The extra Box starts on High Ground.');
  assert.equal(new Set(squares).size, boxes.length, 'Boxes occupy distinct Squares.');
  assert.ok(boxes.every((box) => box.hp === 3 && box.maxHp === 3 && box.respawnEligible), 'The new Box follows ordinary Box rules.');
  assert.ok(!state.objects.some((object) => object.kind !== 'wooden-box' && label(object.position) === squares[3]), 'The High Ground Box does not overlap another Object.');
  assert.ok(!Object.values(state.players).some((player) => label(player.position) === squares[3]), 'The High Ground Box does not overlap a starting character.');
  for (const square of squares.slice(4)) {
    const x = square.charCodeAt(0) - 64; const y = Number(square.slice(1));
    assert.ok(x > 1 && x < LORDAERON_ARENA.width && y > 1 && y < LORDAERON_ARENA.height, 'Extra Boxes avoid board edges.');
    assert.ok(![...LORDAERON_ARENA.highground, ...LORDAERON_ARENA.highgroundProtected, ...LORDAERON_ARENA.drawSquares, ...Object.values(LORDAERON_ARENA.bases).flat(), ...(LORDAERON_ARENA.slideSquares ?? [])].includes(square), 'Extra Boxes use uncolored Squares.');
    assert.equal(state.objects.filter((object) => label(object.position) === square).length, 1);
    assert.ok(!Object.values(state.players).some((player) => label(player.position) === square));
  }
};

assert.equal(randomLordaeronHighgroundBoxSpawn(() => 0), LORDAERON_ARENA.highground[0]);
assert.equal(randomLordaeronHighgroundBoxSpawn(() => 0.999), LORDAERON_ARENA.highground.at(-1));
assert.deepEqual(LORDAERON_ARENA.slideSquares, ['C5', 'F5', 'D3']);
for (const random of [() => 0, () => 0.999]) {
  assert.equal(new Set(randomLordaeronInteriorBoxSpawns(random)).size, 2, 'Even repeated random values produce distinct Boxes.');
}
for (let index = 0; index < 32; index++) {
  const online = createLordaeronMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'magician' });
  checkStartingBoxes(online);
  checkStartingBoxes(createHotseatTestState(true, 'magician', 3));
}
assert.equal(createMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'magician' }).objects.filter((object) => object.kind === 'wooden-box').length, 6, 'Two-player Nagrand setup is unchanged.');

const cell = (square: string) => ({ x: square.charCodeAt(0) - 64, y: Number(square.slice(1)) - 1 });
for (const [origin, slide, destination] of [['D5', 'C5', 'B5'], ['E5', 'F5', 'G5'], ['D4', 'D3', 'D2']]) {
  const state = createHotseatTestState(true, 'magician', 3);
  state.phase = 'active'; state.objects = [];
  state.players.P1.position = cell(origin); state.players.P1.movementRemaining = 1;
  const result = applyCommand(state, { type: 'move', playerId: 'P1', to: cell(slide) });
  assert.ok(result.ok, `${origin} to ${slide} must be legal`);
  if (!result.ok) throw new Error(result.error);
  assert.deepEqual(result.state.players.P1.position, cell(destination), `${slide} triggers the normal free Slide from High Ground`);
  assert.equal(result.state.players.P1.hp, state.players.P1.hp, 'Entering a Slide from High Ground does not cause Fall Damage');
}

console.log('Lordaeron Box setup and Slide checks passed.');
