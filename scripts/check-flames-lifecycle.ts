import assert from 'node:assert/strict';
import { absorbFlames, applyCommand, createHotseatTestState, drawCards, isBurningSquare, modifySquare, type CardTypeId, type GameCommand, type GameState, type GameStateWithQuestPhases } from '../shared/game.ts';

// Filename reused: export 2026-10-25T13:41:12.636Z, client issues 621/1106.
const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(count: 2 | 3 = 2): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', count, 'fyrebanks');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: true });
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.removedDeck = []; player.spellEcho = [null, null, null];
    player.hp = player.maxHp = 50; player.freeMoveUsed = true; player.movementRemaining = 0;
  }
  state.players.P1.position = cell('E8'); state.players.P2.position = cell('G7');
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
const end = (state: GameState) => step(state, { type: 'end-turn', playerId: state.activePlayerId });
const ignite = (state: GameState, label: string, owner: 'P1' | 'P2' = 'P1') => assert.ok(modifySquare(state, cell(label), 'patch-of-flames', owner));
const burning = (state: GameState, id: 'P1' | 'P2') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;

// Issue 621, client 562/621: E8/D8/C8/D7 persisted into the creator's Round 6.
let state = setup(); state.turn = 5; state.elevations.E8 = 1;
for (const label of ['E8', 'D8', 'C8', 'D7']) ignite(state, label);
state = end(state); assert.equal(state.activePlayerId, 'P2'); assert.ok(isBurningSquare(state, cell('E8')));
state = end(state); assert.equal(state.activePlayerId, 'P1'); assert.equal(state.turn, 6);
assert.equal(burning(state, 'P1'), 0, 'Expiry precedes turn-start Burning on the creator.');
for (const label of ['E8', 'D8', 'C8', 'D7']) { assert.equal(isBurningSquare(state, cell(label)), false); assert.equal(state.flameSquareCreators?.[label], undefined); }
assert.equal(state.elevations.E8, 1, 'Expiry preserves underlying terrain.');

// Own-turn identity, not Round number or any other Fyrebanks' turn, controls expiry.
state = setup(3); state.players.P2.character = 'fyrebanks'; state.players.P3.position = cell('H7');
ignite(state, 'D2', 'P1'); ignite(state, 'C2', 'P2');
state = end(state); assert.equal(state.activePlayerId, 'P2'); assert.ok(isBurningSquare(state, cell('D2'))); assert.ok(!isBurningSquare(state, cell('C2')));
state = end(state); assert.equal(state.activePlayerId, 'P3'); assert.ok(isBurningSquare(state, cell('D2')));
state = end(state); assert.ok(!isBurningSquare(state, cell('D2')));

// Reapplying a Patch refreshes its creator; absorption/extinguishing clears metadata.
state = setup(); ignite(state, 'B2'); ignite(state, 'B2', 'P2');
state = end(state); assert.ok(!isBurningSquare(state, cell('B2')));
state = setup(); state.players.P1.position = cell('B2'); ignite(state, 'C2'); assert.ok(absorbFlames(state, 'P1'));
assert.equal(state.flameSquareCreators?.C2, undefined); assert.equal(state.squareModifications?.C2, undefined);
ignite(state, 'C2'); assert.ok(modifySquare(state, cell('C2'), 'shallow-water'));
assert.equal(state.flameSquareCreators?.C2, undefined); assert.deepEqual(state.squareModifications?.C2, ['shallow-water']);
state = setup(); state.squareModifications = { E8: ['patch-of-flames'] }; // Older snapshots lack ownership.
state = end(end(state)); assert.equal(burning(state, 'P1'), 0); assert.equal(state.squareModifications?.E8, undefined);

// Defensive Cards must attribute flames to the defender, not the active attacker.
for (const cardId of ['counterflame', 'wall-of-fire'] as CardTypeId[]) {
  state = setup(); state.players.P1.position = cell('B2'); state.players.P2.position = cell('C2');
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-2' }]; state.players.P2.hand = [{ instanceId: 'defense', cardId }];
  state.players.P2.traitBlocked = true; // Keep Wall's fire available for the expiry assertion.
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') state = step(state, { type: 'combat-stack-choice', playerId: (state as any).combatStackSelections?.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  state = step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
  assert.equal(state.flameSquareCreators?.B2, 'P2'); state = end(state); assert.equal(state.squareModifications?.B2, undefined);
}

// Issue 1106, client 703–705: four Burning Cards entered Discard and scored The Gambler.
state = setup(); state.players.P1.position = cell('E6'); state.players.P1.hp = 15; state.players.P1.pyroCharges = 1;
const ids = ['P2-burning-184', 'P1-flames-burning-196', 'P1-absorbed-burning-200', 'P1-absorbed-burning-202'];
state.players.P1.hand = ids.map((instanceId) => ({ instanceId, cardId: 'burning' as const }));
(state as GameStateWithQuestPhases).questPhases = { actionDamageByPlayer: {}, usedQuestIds: ['the-gambler'], currentQuest: { id: 'the-gambler', announcedRound: 1, endsAfterRound: 3, winners: [], progress: { P1: 1, P2: 0 } }, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {} };
state = step(state, { type: 'dash', playerId: 'P1' });
assert.equal(state.phase, 'dashing'); assert.equal(state.players.P1.movementRemaining, 6); assert.equal(state.players.P1.hp, 11);
assert.deepEqual(state.players.P1.removedDeck?.map((card) => card.instanceId), ids); assert.equal(state.players.P1.discard.length, 0);
assert.equal((state as GameStateWithQuestPhases).questPhases!.currentQuest!.progress.P1, 1, 'Removal cannot score a discard Quest.');
assert.equal(drawCards(state.players.P1, 5), 0, 'Used Burning cannot be reshuffled and drawn back.');
state.players.P1.discard.push({ instanceId: 'normal-discard', cardId: 'attack-2' }); assert.equal(drawCards(state.players.P1, 1), 1);
assert.equal(state.players.P1.hand[0].cardId, 'attack-2');
state = step(state, { type: 'move', playerId: 'P1', to: cell('E5') }); state = step(state, { type: 'cancel-movement', playerId: 'P1' });
assert.equal(state.players.P1.removedDeck?.length, 4); assert.equal(burning(state, 'P1'), 0, 'Movement undo keeps the paid Burning Removed.');
console.log('Flames lifecycle checks passed: dump 621/1106 fixtures, creator-only expiry before turn-start effects, three-player timing, defensive ownership, refresh/cleanup/legacy state, Removed Dash payment, Quest scoring, reshuffle and movement undo.');
