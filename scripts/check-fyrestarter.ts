import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, effectiveMoveRange, isBurningSquare, modifySquare, movementCost, summonLens, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (x: number, y = 1) => ({ x, y });
function setup(): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', objects: [], elevations: {}, simultaneousCombatStack: true });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell(2); state.players.P2.position = cell(7, 5);
  state.players.P1.hp = 10; state.players.P2.hp = 30; state.players.P2.maxHp = 30;
  state.players.P1.hand = [{ instanceId: 'perk', cardId: 'fyrestarter' }, { instanceId: 'attack', cardId: 'attack-2' }, { instanceId: 'cost', cardId: 'defend-1' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function use(state: GameState, level: 1 | 2 | 3): GameState {
  if (level === 1) return step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'perk', destination: 'direct' });
  state.players.P1.hand = state.players.P1.hand.filter((card) => card.instanceId !== 'perk');
  state.players.P1.spellEcho[level - 1] = { instanceId: 'perk', cardId: 'fyrestarter' };
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
}
const choose = (state: GameState, use: boolean) => step(state, { type: 'fyrestarter-dash', playerId: 'P1', use });
const move = (state: GameState, x: number, y = 1) => step(state, { type: 'move', playerId: 'P1', to: cell(x, y) });
const ignite = (state: GameState, x = 2, y = 2) => assert.ok(modifySquare(state, cell(x, y), 'patch-of-flames'));
const burning = (state: GameState, count = 1) => { for (let i = 0; i < count; i++) state.players.P1.hand.push({ instanceId: `burn-${i}`, cardId: 'burning' }); };
const fireCount = (state: GameState) => Object.values(state.squareModifications ?? {}).filter((mods) => mods.includes('patch-of-flames')).length;
const def = cardDefinition({ instanceId: '', cardId: 'fyrestarter' });
assert.equal(def.kind, 'perk'); assert.equal(def.levelEffects?.length, 3);
for (const player of Object.values(createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks').players)) assert.equal([...player.hand, ...player.deck].some((card) => card.cardId === 'fyrestarter'), false, 'fyrestarter is outside the base starting pool.');

for (const level of [1, 2, 3] as const) {
  let state = setup(); ignite(state); state = use(state, level);
  assert.equal(state.phase, 'choosing-fyrestarter-dash'); assert.equal(state.players.P1.pyroCharges, 1);
  assert.equal(state.players.P1.hp, 11); assert.equal(state.players.P1.actionsRemaining, 1);
  assert.equal(state.players.P1.freeMoveUsed, false, 'No unsolicited Free Move/draw is needed to use this Perk.');
  assert.equal(state.players.P1.fyrestarterBurningProtection ?? false, level >= 2);
  assert.equal(applyCommand(state, { type: 'fyrestarter-dash', playerId: 'P2', use: true }).ok, false);
  state = choose(state, false); assert.equal(state.phase, 'active'); assert.equal(state.players.P1.fyrestarter, undefined);
  assert.equal(state.players.P1.pyroCharges, 1); assert.ok(state.players.P1.hand.some((card) => card.cardId === 'burning'), 'Declining keeps absorption without paying Dash.');

  state = setup(); ignite(state); state = choose(use(state, level), true);
  assert.equal(state.phase, 'active'); assert.equal(state.activePlayerId, 'P1');
  assert.equal(state.players.P1.hp, level >= 2 ? 11 : 10);
  assert.equal(state.players.P1.movementRemaining, 3, 'Normal Dash MOV + 1 Burning bonus; Charge is not spent.');
  assert.equal(state.players.P1.pyroCharges, 1); assert.equal(state.players.P1.fyrestarter?.ignorePenalties, true);
  assert.ok(!state.players.P1.discard.some((card) => card.cardId === 'burning'));
  assert.ok(state.players.P1.removedDeck?.some((card) => card.cardId === 'burning'));
  state = move(state, 5); assert.equal(state.activePlayerId, 'P1'); assert.equal(state.phase, 'active');
  assert.equal(state.players.P1.movementRemaining, 0); assert.equal(state.players.P1.fyrestarter, undefined, 'Exhaustion finishes this Dash without ending the turn.');
  assert.equal(fireCount(state), level === 3 ? 3 : 0);
}

// Manual Card payment, cancellation, no free Dash/bonus and unchanged normal finishing Dash.
let state = use(setup(), 1); state = choose(state, true); assert.equal(state.phase, 'choosing-dash-discard');
assert.equal(applyCommand(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'missing' }).ok, false);
state = step(state, { type: 'cancel-dash', playerId: 'P1' }); assert.equal(state.phase, 'active'); assert.equal(state.players.P1.fyrestarter, undefined);
state = choose(use(setup(), 1), true); state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'cost' });
assert.equal(state.players.P1.movementRemaining, 2); assert.equal(state.players.P1.fyrestarter?.ignorePenalties, undefined);
state = step(state, { type: 'cancel-dash', playerId: 'P1' }); assert.equal(state.players.P1.movementRemaining, 0); assert.ok(state.players.P1.hand.some((card) => card.instanceId === 'cost'));
state = setup(); state.players.P1.hand = [{ instanceId: 'perk', cardId: 'fyrestarter' }]; state = use(state, 1);
assert.equal(applyCommand(state, { type: 'fyrestarter-dash', playerId: 'P1', use: true }).ok, false); state = choose(state, false);

// No Charges preserves the ordinary random Burning Dash gate, but never ends the turn.
state = setup(); burning(state); state = choose(use(state, 1), true);
assert.equal(state.activePlayerId, 'P1'); assert.equal(state.phase, 'active'); assert.equal(state.players.P1.fyrestarter, undefined);
assert.ok(state.players.P1.removedDeck?.some((card) => card.cardId === 'burning'));
assert.equal(state.players.P1.pyroCharges ?? 0, 0);

// Burning payment ignores stat penalties, Panic and water MOV surcharge only for this Dash.
state = setup(); ignite(state); state.players.P1.hexMovementPenalty = 3; state.players.P1.spiritSiphonedMovement = 2;
state.players.P1.hand.push({ instanceId: 'pin', cardId: 'pinned' }); state.players.P1.pinnedStacks = 1;
state.players.P1.discard.push({ instanceId: 'boom', cardId: 'boomerang' });
assert.equal(effectiveMoveRange(state.players.P1), 0);
state = use(state, 1); state.players.P1.hand.push({ instanceId: 'panic', cardId: 'panic' }); state = choose(state, true);
assert.equal(effectiveMoveRange(state.players.P1), 2); assert.equal(state.players.P1.movementRemaining, 3);
assert.equal(movementCost(state, state.players.P1, [cell(3, 2)]), 1, 'Water surcharge is ignored.');
state = move(state, 3, 2); assert.equal(state.players.P1.movementRemaining, 2);
state = choose(state, false); assert.equal(effectiveMoveRange(state.players.P1), 0);
assert.equal(state.players.P1.pinnedStacks, 1, 'Penalty immunity does not Remove statuses.');
assert.equal(applyCommand(state, { type: 'move', playerId: 'P1', to: cell(4, 2) }).ok, false, 'Panic resumes after Dash.');

// Saved MOV survives, leftover Dash MOV does not; attacking ends immunity before combat.
state = setup(); state.players.P1.movementRemaining = 2; ignite(state); state = choose(use(state, 1), true);
state = move(state, 3); state.players.P2.position = cell(4);
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
assert.equal(state.phase, 'defending'); assert.equal(state.players.P1.fyrestarter, undefined); assert.equal(state.players.P1.movementRemaining, 2);
state = setup(); ignite(state); state = choose(use(state, 1), true);
state = step(state, { type: 'free-move', playerId: 'P1' }); assert.equal(state.players.P1.fyrestarter, undefined); assert.equal(state.players.P1.movementRemaining, 2);

// Invalid Actions and cancelled Lens targeting preserve the active Dash exactly.
state = setup(); ignite(state); state = choose(use(state, 1), true);
const invalid = applyCommand(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'missing', targetId: 'P2' });
assert.equal(invalid.ok, false); assert.deepEqual(invalid.state, state);
assert.ok(summonLens(state, 'P1', cell(3))); const beforeLens = JSON.stringify(state);
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects[0].id });
assert.equal(state.players.P1.fyrestarter, undefined); state = step(state, { type: 'cancel-targeting', playerId: 'P1' });
assert.equal(JSON.stringify(state), beforeLens);

// Level 3 cap, departure placement, action interruption and exact movement undo.
state = setup(); ignite(state); state.players.P1.moveRange = 5; state = choose(use(state, 3), true);
const before = JSON.stringify(state); state = move(state, 6);
assert.equal(fireCount(state), 3); assert.ok(isBurningSquare(state, cell(2))); assert.ok(!isBurningSquare(state, cell(6)), 'Trail is left behind, not under the destination.');
assert.equal(state.players.P1.fyrestarter?.patchesCreated, 3);
state = step(state, { type: 'cancel-movement', playerId: 'P1' });
assert.deepEqual(state.players.P1.position, JSON.parse(before).players.P1.position); assert.equal(fireCount(state), 0);
assert.equal(state.players.P1.fyrestarter?.patchesCreated, 0); state = move(state, 6); state = choose(state, false);
state.players.P1.movementRemaining = 1; state = move(state, 7); assert.equal(fireCount(state), 3, 'Trail stops when this Dash ends.');
state = setup(); state.players.P1.position = cell(3, 2); burning(state); state.players.P1.pyroCharges = 1;
state = choose(use(state, 3), true); state = move(state, 2, 2);
assert.equal(fireCount(state), 0); assert.equal(state.players.P1.fyrestarter?.patchesCreated, 0, 'Water blocks creation without spending a successful Patch slot.');
state = move(state, 2); assert.ok(isBurningSquare(state, cell(2, 2))); assert.equal(fireCount(state), 1);

// Immunity survives declining Dash and end-turn hand-limit choices, then expires.
state = setup(); burning(state); state = choose(use(state, 2), false); const hp = state.players.P1.hp;
state.players.P1.freeMoveUsed = true; state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(state.players.P1.hp, hp); assert.equal(state.players.P1.fyrestarterBurningProtection, undefined);
state.players.P2.freeMoveUsed = true; state = step(state, { type: 'end-turn', playerId: 'P2' });
state.players.P1.freeMoveUsed = true; state = step(state, { type: 'end-turn', playerId: 'P1' }); assert.equal(state.players.P1.hp, hp - 1);
state = setup(); burning(state); state = choose(use(state, 2), false);
for (let i = 0; i < 6; i++) state.players.P1.hand.push({ instanceId: `extra-${i}`, cardId: 'attack-2' });
state.players.P1.freeMoveUsed = true; state = step(state, { type: 'end-turn', playerId: 'P1' }); assert.equal(state.phase, 'choosing-end-discard');
assert.equal(state.players.P1.fyrestarterBurningProtection, true); assert.equal(state.players.P1.hp, 10);
while (state.players.P1.hand.length > 5) state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: state.players.P1.hand.find((card) => card.cardId === 'attack-2')!.instanceId });
state = step(state, { type: 'end-turn', playerId: 'P1' }); assert.equal(state.players.P1.hp, 10); assert.equal(state.players.P1.fyrestarterBurningProtection, undefined);

// Refusing and undoing the deterministic Perk restores Charge/heal/terrain and all choices.
state = setup(); ignite(state); state = use(state, 3); state = choose(state, false);
state = step(state, { type: 'undo-last-action', playerId: 'P1' }); assert.equal(state.players.P1.hp, 10); assert.equal(state.players.P1.pyroCharges ?? 0, 0);
assert.equal(state.players.P1.fyrestarterBurningProtection, undefined); assert.equal(fireCount(state), 1);
state = setup(); state.players.P1.traitBlocked = true; ignite(state); state = use(state, 3);
assert.equal(state.players.P1.pyroCharges ?? 0, 0); state = choose(state, false); assert.equal(state.players.P1.fyrestarterBurningProtection, true, 'Card effects remain enabled when absorption Trait is blocked.');
console.log('Fyrestarter checks passed: levels, absorption/optional Dash, costs, Charge control, movement immunity, action interruption, trail cap, Burning protection/expiry, cancellation and undo.');
