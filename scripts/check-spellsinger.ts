import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, distance, type BoardObject, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.error}`);
  return result.state;
}
function setup(level = 1, stack = false): GameState {
  const state = createHotseatTestState(true, 'merylin', 2, 'dummy');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.hp = player.maxHp = 20; player.shieldEquipped = false; }
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.spellEcho = [null, null, null];
  state.players.P1.spellEcho[level - 1] = { instanceId: 'stance', cardId: 'spellsinger-stance' };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-2' }];
  return state;
}
function cast(state: GameState, level = 1): GameState { return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level }); }
function reveal(state: GameState, defense = false): GameState {
  state.players.P1.merylinSummonActive = true;
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, defense ? { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' } : { type: 'pass-defense', playerId: 'P2' });
  while (state.phase === 'choosing-combat-stack') {
    const selections = (state as GameState & { combatStackSelections?: Record<string, unknown> }).combatStackSelections ?? {};
    state = step(state, { type: 'combat-stack-choice', playerId: selections.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  }
  return state;
}
function finish(state: GameState): GameState {
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
const box = (position = { x: 4, y: 2 }): BoardObject => ({ id: 'box', name: 'Box', kind: 'wooden-box', position, hp: 3, maxHp: 3 });

for (const level of [1, 2, 3]) {
  const initial = setup(level);
  initial.players.P1.deck = [{ instanceId: 'hidden', cardId: 'excalibur' }];
  let state = cast(initial, level);
  assert.equal(state.players.P1.spellsingerSmartPush, true);
  assert.equal(state.players.P1.spellsingerExtraPerkUses, 1);
  assert.equal(state.players.P1.spellsingerExtraAttacks ?? 0, Number(level >= 2));
  assert.equal(state.players.P1.merylinSummonActive, level === 3, 'Summon moved from Level 2 to Level 3.');
  assert.equal(state.players.P1.knownTopCardId, null, 'The former Deck reveal effect is gone.');
  assert.equal(state.players.P1.deck.length, 1);
  if (level === 1) {
    state.players.P1.hand.push({ instanceId: 'followup', cardId: 'carian-stance' });
    state = step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'followup', destination: 'direct' });
    assert.equal(state.players.P1.spellsingerExtraPerkUses, 0);
    assert.equal(state.players.P1.merylinSummonActive, true);
  }
}
let selection = setup(3);
selection.players.P1.discard = [{ instanceId: 'older', cardId: 'excalibur' }, { instanceId: 'newer', cardId: 'pinned' }];
selection = cast(selection, 3);
assert.equal(selection.phase, 'choosing-spellsinger-discard');
assert.equal(selection.players.P1.merylinSummonActive, false, 'Draw happens before Summon.');
assert.ok(!applyCommand(selection, { type: 'spellsinger-discard', playerId: 'P2', cardInstanceId: 'older' }).ok);
assert.ok(!applyCommand(selection, { type: 'spellsinger-discard', playerId: 'P1', cardInstanceId: 'attack' }).ok);
selection = step(selection, { type: 'spellsinger-discard', playerId: 'P1', cardInstanceId: 'newer' });
assert.equal(selection.phase, 'active');
assert.equal(selection.players.P1.merylinSummonActive, true);
assert.deepEqual(selection.players.P1.discard.map((card) => card.instanceId), ['older']);
assert.equal(selection.players.P1.pinnedStacks, 1);
assert.equal(selection.players.P1.pinnedGainedThisTurn, 1);
assert.equal(selection.players.P1.hand.find((card) => card.instanceId === 'newer')?.revealedToOpponent, true);

for (const stack of [false, true]) {
  let state = cast(setup(1, stack));
  state.objects = [box()];
  state = reveal(state);
  const baselineHp = state.players.P2.hp;
  assert.equal(state.objects.length, 1, 'Smart Push waits for the result acknowledgment.');
  state = finish(state);
  assert.deepEqual(state.players.P2.position, { x: 4, y: 2 });
  assert.equal(state.players.P2.hp, baselineHp - 1);
  assert.equal(state.objects.length, 0);
  assert.equal(state.players.P1.spellsingerSmartPush, false);
  assert.equal(state.players.P1.matchStats?.objectsDestroyed, 1);
  assert.equal(state.players.P2.visualMovement?.sourceCardId, 'spellsinger-stance');
  assert.ok(state.objectPushAnimations.some((event) => event.objectId === 'box' && event.destroy));

  const falling = cast(setup(1, stack));
  falling.elevations = { C3: 1 };
  state = reveal(falling);
  const fallHp = state.players.P2.hp;
  state = finish(state);
  assert.equal(distance({ x: 3, y: 2 }, state.players.P2.position), 1);
  assert.equal(state.players.P2.hp, fallHp - 1);
  assert.equal(state.players.P1.spellsingerSmartPush, false);

  const noDestination = cast(setup(1, stack));
  noDestination.objects = [{ id: 'wall', name: 'Column', kind: 'wall-pillar', position: { x: 4, y: 2 }, hp: 999, maxHp: 999 }];
  state = finish(reveal(noDestination));
  assert.deepEqual(state.players.P2.position, { x: 3, y: 2 });
  assert.equal(state.objects.length, 1, 'Columns cannot be destroyed by Smart Push.');
  assert.equal(state.players.P1.spellsingerSmartPush, false, 'A successful hit consumes the buff even without a valid destination.');

  const missed = cast(setup(1, stack));
  missed.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }];
  missed.players.P1.hand[0].cardId = 'attack-2';
  missed.players.P2.hand[0].cardId = 'decisive-block';
  state = finish(reveal(missed, true));
  assert.equal(state.players.P1.spellsingerSmartPush, true, 'A blocked hit does not consume Smart Push.');

  const extra = cast(setup(2, stack), 2);
  extra.players.P1.actionsRemaining = 0;
  state = finish(reveal(extra));
  assert.equal(state.players.P1.spellsingerExtraAttacks, 0, 'Level 2 grants a usable extra Attack even with no ordinary Actions left.');
}
// Smart Push remains pending until a successful enemy hit, rather than ending with the turn allowances.
const combined = cast(setup());
combined.elevations = { C3: 1 };
combined.objects = [box()];
let result = reveal(combined);
const combinedHp = result.players.P2.hp;
result = finish(result);
assert.deepEqual(result.players.P2.position, { x: 4, y: 2 });
assert.equal(result.players.P2.hp, combinedHp - 2, 'A collision onto lower ground applies both collision and fall Damage.');

const immutable = cast(setup());
immutable.objects = [{ id: 'button', name: 'Flood Button', kind: 'pipe-button', position: { x: 4, y: 2 }, hp: 999, maxHp: 999 }];
result = finish(reveal(immutable));
assert.equal(result.objects.length, 1);
assert.deepEqual(result.players.P2.position, { x: 3, y: 2 });

const objectsOnly = cast(setup());
objectsOnly.players.P1.merylinSummonActive = true;
objectsOnly.players.P2.position = { x: 8, y: 7 };
objectsOnly.objects = [box({ x: 3, y: 2 })];
result = step(objectsOnly, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'box' });
assert.equal(result.players.P1.spellsingerSmartPush, true, 'Attacking an Object does not consume the next enemy-hit buff.');

const replica = cast(setup());
replica.players.P1.merylinSummonActive = true;
replica.players.P2.character = 'spectre';
replica.players.P2.position = { x: 8, y: 7 };
replica.objects = [{ id: 'enemy-replica', name: 'Replica', kind: 'spectre-replica', ownerId: 'P2', position: { x: 3, y: 2 }, hp: 999, maxHp: 999 }, box()];
result = step(replica, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', origin: 'spectre', targetKind: 'replica', targetId: 'enemy-replica' });
result = step(result, { type: 'pass-defense', playerId: 'P2' });
const replicaHp = result.players.P2.hp;
result = finish(result);
assert.deepEqual(result.objects.find((object) => object.id === 'enemy-replica')?.position, { x: 4, y: 2 });
assert.deepEqual(result.players.P2.position, { x: 8, y: 7 }, 'Push moves the hit replica rather than its distant owner.');
assert.equal(result.players.P2.hp, replicaHp - 1);
assert.ok(!result.objects.some((object) => object.id === 'box'));

let persistent = cast(setup());
for (const p of Object.values(persistent.players)) p.hand = [];
persistent = step(persistent, { type: 'end-turn', playerId: 'P1' });
assert.equal(persistent.players.P1.spellsingerSmartPush, true);
assert.equal(persistent.players.P1.spellsingerExtraPerkUses, 0);
// Slide entry bridges the height change, so it is not a damaging fall destination.
const slideFall = cast(setup());
Object.assign(slideFall, { arenaId: 'trench' });
slideFall.elevations = Object.fromEntries(['B2', 'C2', 'D2', 'B3', 'C3', 'D3', 'B4'].map((label) => [label, 1]));
const slideHit = reveal(slideFall);
const slideHp = slideHit.players.P2.hp;
const actualFall = finish(slideHit);
assert.deepEqual(actualFall.players.P2.position, { x: 4, y: 3 }, 'Smart Push skips the C4 Slide and selects D4 for an actual damaging fall.');
assert.equal(actualFall.players.P2.hp, slideHp - 1);

console.log('Spellsinger Stance and Smart Push checks passed.');
