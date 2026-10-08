import assert from 'node:assert/strict';
import { LORDAERON_ARENA, randomLordaeronHighgroundBoxSpawn } from '../shared/arenas.ts';
import { createHotseatTestState, createLordaeronMultiplayerState, createMultiplayerState, type GameState } from '../shared/game.ts';

const label = ({ x, y }: { x: number; y: number }) => `${String.fromCharCode(64 + x)}${y + 1}`;
const checkStartingBoxes = (state: GameState) => {
  const boxes = state.objects.filter((object) => object.kind === 'wooden-box');
  const squares = boxes.map((box) => label(box.position));
  assert.equal(boxes.length, 4, 'A Free For All starts with three fixed Boxes and one random High Ground Box.');
  assert.deepEqual(squares.slice(0, 3), LORDAERON_ARENA.boxes, 'The original Boxes keep their Squares.');
  assert.ok(LORDAERON_ARENA.highground.includes(squares[3]), 'The extra Box starts on High Ground.');
  assert.equal(new Set(squares).size, boxes.length, 'Boxes occupy distinct Squares.');
  assert.ok(boxes.every((box) => box.hp === 3 && box.maxHp === 3 && box.respawnEligible), 'The new Box follows ordinary Box rules.');
  assert.ok(!state.objects.some((object) => object.kind !== 'wooden-box' && label(object.position) === squares[3]), 'The High Ground Box does not overlap another Object.');
  assert.ok(!Object.values(state.players).some((player) => label(player.position) === squares[3]), 'The High Ground Box does not overlap a starting character.');
};

assert.equal(randomLordaeronHighgroundBoxSpawn(() => 0), LORDAERON_ARENA.highground[0]);
assert.equal(randomLordaeronHighgroundBoxSpawn(() => 0.999), LORDAERON_ARENA.highground.at(-1));
for (let index = 0; index < 32; index++) {
  const online = createLordaeronMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'magician' });
  checkStartingBoxes(online);
  checkStartingBoxes(createHotseatTestState(true, 'magician', 3));
}
assert.equal(createMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'magician' }).objects.filter((object) => object.kind === 'wooden-box').length, 6, 'Two-player Nagrand setup is unchanged.');

console.log('Free For All High Ground Box checks passed.');
