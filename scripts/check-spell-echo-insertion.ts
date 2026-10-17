import assert from 'node:assert/strict';
import { applyCommand, allowsAnySpellEchoReplacement, canTargetSpellEchoSlotForInsertion, canUndoLastAction, createHotseatTestState, enablePerkMode, type GameState, type GameCommand, type CardInstance } from '../shared/game.ts';

function setup(enabled = true): GameState {
  const state = createHotseatTestState(true, 'merylin', 2, 'shinobi');
  state.phase = 'active'; state.activePlayerId = 'P1'; state.objects = []; state.elevations = {};
  if (enabled) enablePerkMode(state);
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null];
    player.actionsRemaining = 2; player.perkUsed = false; player.freeMoveUsed = true;
    player.movementRemaining = 0;
  }
  state.players.P1.hand = [{ instanceId: 'new', cardId: 'windwalker-stance' }];
  state.players.P1.spellEcho = [
    { instanceId: 'old1', cardId: 'carian-stance', revealedToOpponent: true },
    { instanceId: 'old2', cardId: 'barbarian-stance', revealedToOpponent: true },
    { instanceId: 'old3', cardId: 'kamelot-stance', revealedToOpponent: true },
  ];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return JSON.parse(JSON.stringify(result.state));
}
const insert = (position?: number): GameCommand => ({ type: 'play-perk', playerId: 'P1', cardInstanceId: 'new', destination: 'echo', replaceExisting: true, ...(position === undefined ? {} : { echoPosition: position }) });
const ids = (cards: (CardInstance | null)[]) => cards.map((card) => card?.instanceId ?? null);
for (const enabled of [false, true]) for (let mask = 0; mask < 8; mask++) for (const position of [1, 2, 3]) {
  const initial = setup(enabled);
  for (let index = 0; index < 3; index++) if (!(mask & (1 << index))) initial.players.P1.spellEcho[index] = null;
  const original = structuredClone(initial);
  assert.equal(allowsAnySpellEchoReplacement(initial), enabled);
  const allowed = position === 1 || enabled && Boolean(initial.players.P1.spellEcho[position - 1]);
  assert.equal(canTargetSpellEchoSlotForInsertion(initial, 'P1', position), allowed);
  const result = applyCommand(initial, insert(position));
  assert.equal(result.ok, allowed);
  assert.deepEqual(initial, original, 'Commands preserve their source state.');
  if (!result.ok) continue;
  const player = result.state.players.P1;
  const expected = ids(initial.players.P1.spellEcho);
  const removed = expected[position - 1];
  for (let index = position - 1; index > 0; index--) expected[index] = expected[index - 1];
  expected[0] = 'new';
  assert.deepEqual(ids(player.spellEcho), expected);
  assert.deepEqual(ids(player.discard), removed ? [removed] : []);
  if (removed) assert.equal(player.discard[0].revealedToOpponent, false);
  assert.ok(!player.hand.some((card) => card.instanceId === 'new'));
  assert.equal(player.spellEcho[0]?.revealedToOpponent, true);
  assert.equal(player.actionsRemaining, 1);
  assert.equal(player.perkUsed, true);
  assert.equal(player.movementRemaining, 1, 'The inserted Perk executes only Level 1.');
  assert.equal(player.windwalkerMoveBonus ?? 0, 0);
  assert.ok(!player.windwalkerUnrestrictedMovement);
  assert.deepEqual(result.state.players.P2, initial.players.P2);
  assert.equal(canUndoLastAction(result.state, 'P1'), true);
  const undone = step(result.state, { type: 'undo-last-action', playerId: 'P1' });
  assert.deepEqual(undone.players.P1.spellEcho, initial.players.P1.spellEcho);
  assert.deepEqual(undone.players.P1.hand, initial.players.P1.hand);
  assert.deepEqual(undone.players.P1.discard, initial.players.P1.discard);
  assert.equal(undone.players.P1.actionsRemaining, 2);
  assert.equal(undone.players.P1.perkUsed, false);
}
// Omitted position retains the existing wire protocol behavior, also outside Perk Mode.
assert.deepEqual(ids(step(setup(false), insert()).players.P1.spellEcho), ['new', 'old2', 'old3']);
for (const position of [0, 4, 1.5, -1]) assert.equal(applyCommand(setup(), insert(position)).ok, false);
for (const position of [1, 2, 3]) {
  const state = setup();
  assert.equal(applyCommand(state, { ...insert(position), replaceExisting: false }).ok, false);
  state.players.P1.actionsRemaining = 0;
  assert.equal(applyCommand(state, insert(position)).ok, false);
  state.players.P1.actionsRemaining = 2; state.players.P1.perkUsed = true;
  assert.equal(applyCommand(state, insert(position)).ok, false);
  state.players.P1.spellsingerExtraPerkUses = 1;
  const extra = step(state, insert(position));
  assert.equal(extra.players.P1.spellsingerExtraPerkUses, 0);
}
const wrongOwner = setup();
wrongOwner.players.P2.hand = [{ instanceId: 'new', cardId: 'swiftform' }];
assert.equal(applyCommand(wrongOwner, { ...insert(2), playerId: 'P2' }).ok, false);
assert.equal(applyCommand(setup(), { ...insert(2), destination: 'direct' }).ok, false);
const noLevels = setup(); noLevels.players.P1.hand = [{ instanceId: 'new', cardId: 'fireball' }];
assert.equal(applyCommand(noLevels, insert(2)).ok, false);
const ephemeral = setup(); ephemeral.players.P1.spellEcho[2]!.oneTimeCopy = true;
assert.equal(step(ephemeral, insert(3)).players.P1.discard.length, 0, 'Existing one-use copy removal rules are preserved.');

// Cancelling a targeted Perk restores the replacement and all shifted Cards.
const targeted = setup();
targeted.players.P1.character = 'magician';
targeted.players.P1.hand = [{ instanceId: 'new', cardId: 'magic-hand' }];
const choosing = step(targeted, insert(3));
assert.equal(choosing.phase, 'choosing-magic-hand-target');
assert.deepEqual(ids(choosing.players.P1.spellEcho), ['new', 'old1', 'old2']);
const cancelled = step(choosing, { type: 'cancel-targeting', playerId: 'P1' });
assert.deepEqual(cancelled.players.P1.spellEcho, targeted.players.P1.spellEcho);
assert.deepEqual(cancelled.players.P1.hand, targeted.players.P1.hand);
assert.deepEqual(cancelled.players.P1.discard, targeted.players.P1.discard);
assert.equal(cancelled.players.P1.actionsRemaining, targeted.players.P1.actionsRemaining);
console.log('Spell Echo insertion checks passed: 48 mode/occupancy/slot combinations, Level 1 effects, costs, validation, ownership, JSON transport, undo, and targeting cancellation.');
