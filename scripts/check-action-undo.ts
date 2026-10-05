import assert from 'node:assert/strict';
import { applyCommand, canUndoLastAction, canUndoMovement, createMultiplayerState, perkUseEventForTransition, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function setup(cardId: CardTypeId = 'swiftform'): GameState {
  const state = createMultiplayerState({ P1: 'shinobi', P2: 'shinobi', P3: 'shinobi' });
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.actionsRemaining = 3; player.movementRemaining = 8; player.freeMoveUsed = true;
    player.perkUsed = false; player.hp = player.maxHp;
  }
  state.players.P1.hand = [{ instanceId: 'perk', cardId }, { instanceId: 'attack', cardId: 'attack-2' }, { instanceId: 'cost', cardId: 'defend-1' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  // Multiplayer transports history through JSON state snapshots.
  return JSON.parse(JSON.stringify(result.state)) as GameState;
}
const perk: GameCommand = { type: 'play-perk', playerId: 'P1', cardInstanceId: 'perk', destination: 'direct' };
const undo: GameCommand = { type: 'undo-last-action', playerId: 'P1' };
const cancel: GameCommand = { type: 'cancel-movement', playerId: 'P1' };
const move = (x: number, y = 2): GameCommand => ({ type: 'move', playerId: 'P1', to: { x, y } });
function gameplay(state: GameState) {
  const copy = structuredClone(state);
  delete copy.perkUndo; delete copy.perkUndoRevision; delete copy.movementUndo;
  copy.log = [];
  for (const player of Object.values(copy.players)) { delete player.visualMovement; delete player.visualMovementCause; }
  return copy;
}

// Both requested shortcut sequences restore every gameplay field, not just position.
for (const cancellations of [[undo, undo, undo], [cancel, undo, cancel]]) {
  const initial = setup();
  const moved = step(initial, move(2, 3));
  const cast = step(moved, perk);
  let state = step(cast, move(2, 4));
  assert.ok(canUndoMovement(state, 'P1'));
  state = step(state, cancellations[0]);
  assert.deepEqual(gameplay(state), gameplay(cast));
  assert.ok(canUndoLastAction(state, 'P1'));
  state = step(state, cancellations[1]);
  assert.deepEqual(gameplay(state), gameplay(moved));
  assert.ok(canUndoMovement(state, 'P1'));
  state = step(state, cancellations[2]);
  assert.deepEqual(gameplay(state), gameplay(initial));
  assert.equal(canUndoLastAction(state, 'P1'), false);
}

for (const command of [
  { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' },
  { type: 'guard', playerId: 'P1' }, { type: 'dash', playerId: 'P1' }, { type: 'end-turn', playerId: 'P1' },
] satisfies GameCommand[]) {
  const state = step(step(setup(), perk), command);
  assert.equal(state.perkUndo, null, `${command.type} commits the Perk`);
  assert.equal(state.movementUndo, null);
  assert.equal(applyCommand(state, undo).ok, false);
  if (command.type === 'dash') {
    const cancelled = step(state, { type: 'cancel-dash', playerId: 'P1' });
    assert.equal(canUndoLastAction(cancelled, 'P1'), false, 'Cancelling Dash must not resurrect the Perk checkpoint');
  }
}

{
  const initial = setup();
  initial.players.P1.hand.push({ instanceId: 'second', cardId: 'swiftform' });
  initial.players.P1.spellsingerExtraPerkUses = 1;
  const first = step(initial, perk);
  const walked = step(first, move(2, 3));
  const second = step(walked, { ...perk, cardInstanceId: 'second' });
  const restored = step(second, undo);
  assert.deepEqual(gameplay(restored), gameplay(walked));
  assert.equal(canUndoLastAction(restored, 'P1'), false, 'Only the second Perk is undoable');
}

// Targeting is part of a single transaction, including deterministic damage.
{
  const initial = setup('arcane-missle');
  const targeting = step(initial, perk);
  assert.ok(canUndoLastAction(targeting, 'P1'));
  assert.deepEqual(gameplay(step(targeting, undo)), gameplay(initial));
  const event = perkUseEventForTransition(initial, perk, targeting);
  assert.equal(event, null);
  const restored = step(targeting, undo);
  assert.equal(perkUseEventForTransition(targeting, undo, restored), null, 'Undo must not announce a cancelled Perk');
  const resolved = step(targeting, { type: 'arcane-missle-target', playerId: 'P1', targetId: 'P2' });
  assert.ok(resolved.players.P2.hp < initial.players.P2.hp);
  assert.deepEqual(gameplay(step(resolved, undo)), gameplay(initial));
  assert.equal(applyCommand(resolved, { ...undo, playerId: 'P2' }).ok, false);
}

for (const cardId of ['encourage', 'monarch-flush-perk'] as const) {
  const initial = setup(cardId);
  initial.players.P1.deck = [{ instanceId: 'draw', cardId: 'attack-3' }];
  initial.players.P2.hand = [{ instanceId: 'hidden', cardId: 'defend-1' }];
  const state = step(initial, perk);
  assert.equal(canUndoLastAction(state, 'P1'), false, `${cardId} exposes information`);
  assert.equal(state.movementUndo, null);
}

{
  const initial = setup('mind-tricks');
  const targeted = step(initial, perk);
  assert.ok(canUndoLastAction(targeted, 'P1'));
  const revealed = step(targeted, { type: 'mind-tricks-discard', playerId: 'P1', cardInstanceId: 'cost' });
  assert.equal(canUndoLastAction(revealed, 'P1'), false);
}

{
  const initial = setup('sap');
  initial.players.P2.hand = [{ instanceId: 'a', cardId: 'defend-1' }, { instanceId: 'b', cardId: 'block' }];
  const cast = step(initial, perk);
  const choice = step(cast, { type: 'sap-target', playerId: 'P1', targetId: 'P2' });
  assert.equal(choice.phase, 'choosing-sap-defend');
  assert.equal(canUndoLastAction(choice, 'P1'), false, 'An opponent choice commits the Perk immediately');
}

{
  const initial = setup('inner-peace');
  initial.players.P1.spellEcho[1] = { instanceId: 'random-perk', cardId: 'inner-peace' };
  initial.players.P1.deck = [{ instanceId: 'status-a', cardId: 'headache' }, { instanceId: 'status-b', cardId: 'exhaust' }];
  const result = step(initial, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
  assert.equal(result.players.P1.deck.length, 1);
  assert.equal(canUndoLastAction(result, 'P1'), false, 'Random removal from Deck cannot be rerolled');
}

{
  const initial = setup('force-throw');
  initial.objects = [{ id: 'box', kind: 'wooden-box', name: 'Box', hp: 3, maxHp: 3, position: { x: 2, y: 3 } }];
  const cast = step(initial, perk);
  const targeted = step(cast, { type: 'force-throw-target', playerId: 'P1', targetKind: 'object', targetId: 'box' });
  const resolved = step(targeted, { type: 'force-throw-direction', playerId: 'P1', to: { x: 2, y: 4 } });
  assert.notDeepEqual(resolved.objects[0].position, initial.objects[0].position);
  assert.deepEqual(gameplay(step(resolved, undo)), gameplay(initial), 'Objects and queued animations restore with the Perk');
}

{
  const initial = setup('arcane-missle');
  const moved = step(initial, move(2, 3));
  const targeted = step(moved, perk);
  const cancelled = step(targeted, { type: 'cancel-targeting', playerId: 'P1' });
  assert.ok(canUndoMovement(cancelled, 'P1'), 'Escape cancellation also restores the earlier movement checkpoint');
  assert.deepEqual(gameplay(step(cancelled, cancel)), gameplay(initial));
}

{
  const initial = setup();
  initial.players.P1.spellEcho[1] = { instanceId: 'echo', cardId: 'swiftform' };
  const cast = step(initial, { type: 'use-echo-perk', playerId: 'P1', position: 2 });
  assert.deepEqual(gameplay(step(cast, undo)), gameplay(initial), 'Echo cycling and costs restore together');
  const failed = applyCommand(cast, { type: 'attack', playerId: 'P1', cardInstanceId: 'missing', targetId: 'P2' });
  assert.equal(failed.ok, false);
  assert.ok(canUndoLastAction(cast, 'P1'), 'Rejected commands leave history intact');
  const castAgain = step(step(cast, undo), { type: 'use-echo-perk', playerId: 'P1', position: 2 });
  assert.equal(step(castAgain, undo).perkUndoRevision, 2, 'Undo notifications remain monotonic');
}
console.log('Action undo checks passed: chained movement, Perks, barriers, targeting, information, ownership, and Echo restoration.');
