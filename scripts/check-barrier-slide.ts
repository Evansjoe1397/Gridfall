import assert from 'node:assert/strict';
import { applyCommand, createPipeTestState, createTrenchTestState, type GameState, type GameCommand, type Cell } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.state;
}
function setup(from = 'E6', defenderAt = 'F5', stack = false, trench = false): GameState {
  const state = trench ? createTrenchTestState(true, 'magician', 'merylin') : createPipeTestState(true, 'magician', 'merylin');
  state.phase = 'active'; state.activePlayerId = 'P2'; state.turn = 6; state.objects = [];
  Object.assign(state, { simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.hp = player.maxHp = 20; player.actionsRemaining = 2; player.freeMoveUsed = true;
  }
  state.players.P1.position = cell(defenderAt);
  state.players.P2.position = cell(from);
  state.players.P2.hp = 12;
  state.players.P2.merylinSummonActive = true;
  state.players.P2.windwalkerActive = true;
  state.players.P2.hand = [{ instanceId: 'frost', cardId: 'frostmourne' }];
  state.players.P1.hand = [{ instanceId: 'barrier', cardId: 'arcane-barrier' }];
  state.pipeTurnIndex = 11; state.pipeFloodUntil = { 2: 14 };
  return state;
}
function fight(state: GameState): GameState {
  state = step(state, { type: 'attack', playerId: 'P2', cardInstanceId: 'frost', targetId: 'P1' });
  state = step(state, { type: 'defend', playerId: 'P1', cardInstanceId: 'barrier' });
  while (state.phase === 'choosing-combat-stack') {
    const selections = (state as GameState & { combatStackSelections?: Partial<Record<'P1' | 'P2', unknown>> }).combatStackSelections ?? {};
    state = step(state, { type: 'combat-stack-choice', playerId: selections.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  }
  state = step(state, { type: 'ack-combat', playerId: 'P2' });
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  assert.equal(state.phase, 'choosing-frostmourne');
  assert.deepEqual(state.pendingAttack?.attackerPosition, state.players.P2.position, 'Post-combat choices use the final slid position.');
  return step(state, { type: 'frostmourne-decision', playerId: 'P2', use: false });
}
for (const stack of [false, true]) {
  // Dump "Push and Slide.jsonl": issue 784, combat commands 698–720.
  // Logan F5 pushes Merylin E6 -> D7 (Slide) -> C8; zone 1 is dry.
  const recorded = setup('E6', 'F5', stack);
  if (stack) recorded.players.P2.hand.push({ instanceId: 'helmet', cardId: 'mythril-helmet' });
  const fixed = fight(recorded);
  assert.equal(fixed.players.P2.hp, 12, 'Entering the Slide from High Ground deals no Fall Damage.');
  assert.deepEqual(fixed.players.P2.position, cell('C8'));
  assert.deepEqual(fixed.players.P2.visualMovement?.from, cell('E6'));
  assert.deepEqual(fixed.players.P2.visualMovement?.path, [cell('D7'), cell('C8')]);
  assert.equal(fixed.players.P2.visualMovement?.slideEffectsIgnored, false);
  assert.ok(fixed.objectPushAnimations.some((event) => event.callout?.playerId === 'P2' && event.callout.text === 'Slide'));
  assert.ok(!fixed.objectPushAnimations.some((event) => event.callout?.playerId === 'P2' && event.callout.text === 'Fall'));
  assert.deepEqual(fixed.objectPushAnimations.find((event) => event.arcaneBarrier)?.to, cell('D7'), 'The ward still pushes to the first Slide Square.');

  const dry = fight(setup('D3', 'C3', stack));
  assert.deepEqual(dry.players.P2.visualMovement?.path, [cell('E3'), cell('F3'), cell('G3'), cell('H3')], 'Zone 2 flooding continues the Slide to the edge.');
  assert.equal(dry.players.P2.hp, 12);
  const unflooded = setup('D3', 'C3', stack); unflooded.pipeFloodUntil = {};
  const short = fight(unflooded);
  assert.deepEqual(short.players.P2.position, cell('F3'));
  assert.equal(short.players.P2.hp, 12);

  const blocked = setup('E6', 'F5', stack);
  blocked.objects = [{ id: 'wall', kind: 'wall-pillar', name: 'Column', hp: 999, maxHp: 999, position: cell('C8') }];
  const stopped = fight(blocked);
  assert.deepEqual(stopped.players.P2.position, cell('D7'));
  assert.equal(stopped.players.P2.hp, 12, 'A blocked Slide exit still does not cause a fall on entry.');

  const collision = setup('E6', 'F5', stack);
  collision.players.P3 = structuredClone(collision.players.P1);
  Object.assign(collision.players.P3, { id: 'P3', name: 'Bystander', position: cell('C8'), hp: 10, hand: [] });
  const collided = fight(collision);
  assert.equal(collided.players.P2.hp, 12);
  assert.equal(collided.players.P3.hp, 9, 'Normal Slide collision Damage still applies.');
  const pulse = collided.objectPushAnimations.find((event) => event.arcaneBarrier)!;
  assert.ok(collided.objectPushAnimations.some((event) => event.damage?.playerId === 'P3' && event.afterBarrierAnimationId === pulse.id), 'Slide collision Damage waits for the ward presentation.');

  const falling = fight(setup('E6', 'E5', stack));
  assert.deepEqual(falling.players.P2.position, cell('E7'));
  assert.equal(falling.players.P2.hp, 12, 'Staying on High Ground causes no fall.');
  // E7 is also High Ground in Pipe; use Trench for a true unprotected drop.
  const trench = fight(setup('C3', 'D3', stack, true));
  assert.deepEqual(trench.players.P2.position, cell('B3'));
  assert.equal(trench.players.P2.hp, 11, 'A forced drop onto ordinary Low Ground still deals 1 Fall Damage.');
  const trenchSlide = fight(setup('C3', 'C2', stack, true));
  assert.deepEqual(trenchSlide.players.P2.position, cell('C5'));
  assert.equal(trenchSlide.players.P2.hp, 12);
}
console.log('Arcane Barrier Slide checks passed: recorded E6–D7–C8 push, both combat modes, dry/flooded Slides, blocked exits, collisions, Trench, and ordinary falls.');
