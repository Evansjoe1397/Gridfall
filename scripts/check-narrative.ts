import assert from 'node:assert/strict';
import { applyCommand, beginNarrativeEffect, createHotseatTestState, narrativeEligibleEnemies, narrativeHpChanged, narrativeStartSquareAvailable, narrativeTargets, type GameState, type GameStateWithNarrative, type NarrativeEffect } from '../shared/game.ts';

function fresh(): GameState {
  const state = createHotseatTestState(true, 'kazka', 2, 'orkk');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P1.turnStartRecord = { position: { x: 2, y: 2 }, hp: 12, round: 1 };
  state.players.P1.hp = 8;
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P2.turnStartRecord = { position: { x: 4, y: 2 }, hp: 14, round: 1 };
  state.players.P2.hp = 10;
  return state;
}

function choose(state: GameState, effect: NarrativeEffect, targetId?: 'P1' | 'P2' | 'P3'): GameState {
  assert.equal(beginNarrativeEffect(state, 'P1'), true);
  const result = applyCommand(state, { type: 'narrative-choice', playerId: 'P1', effect, targetId });
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.equal(result.state.phase, 'active');
  return result.state;
}

let state = fresh();
assert.deepEqual(narrativeEligibleEnemies(state, 'P1'), ['P2']);
assert.deepEqual(narrativeTargets(state, 'P1', 'enemy-position'), ['P2']);
assert.equal(narrativeStartSquareAvailable(state, 'P1'), false, 'An unchanged position is not a Narrative option.');
state = choose(state, 'enemy-position', 'P2');
assert.deepEqual(state.players.P2.position, { x: 4, y: 2 });
assert.deepEqual(state.players.P2.visualMovement?.from, { x: 3, y: 2 });

state = choose(fresh(), 'enemy-hp', 'P2');
assert.equal(state.players.P2.hp, 14);
const higher = fresh();
higher.players.P2.hp = 17;
state = choose(higher, 'enemy-hp', 'P2');
assert.equal(state.players.P2.hp, 14, 'Reversion can also lower HP without ordinary damage resolution.');
const unchangedHp = fresh();
unchangedHp.players.P1.hp = unchangedHp.players.P1.turnStartRecord!.hp;
unchangedHp.players.P2.hp = unchangedHp.players.P2.turnStartRecord!.hp;
assert.equal(narrativeHpChanged(unchangedHp, 'P1'), false);
assert.deepEqual(narrativeTargets(unchangedHp, 'P1', 'enemy-hp'), []);
assert.equal(beginNarrativeEffect(unchangedHp, 'P1'), true);
assert.equal(applyCommand(unchangedHp, { type: 'narrative-choice', playerId: 'P1', effect: 'self-hp' }).ok, false);
assert.equal(applyCommand(unchangedHp, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp' }).ok, false);
assert.equal(applyCommand(unchangedHp, { type: 'narrative-choice', playerId: 'P1', effect: 'self-position' }).ok, false);
assert.equal(applyCommand(unchangedHp, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' }).ok, true);

const selfMove = fresh();
selfMove.players.P1.position = { x: 2, y: 3 };
state = choose(selfMove, 'self-position');
assert.deepEqual(state.players.P1.position, { x: 2, y: 2 });
state = choose(fresh(), 'self-hp');
assert.equal(state.players.P1.hp, 12);

const copied = fresh();
copied.players.P2.removedDeck = [{ instanceId: 'older', cardId: 'headache' }, { instanceId: 'top', cardId: 'exhaust' }];
assert.deepEqual(narrativeTargets(copied, 'P1', 'copy-status'), ['P2']);
state = choose(copied, 'copy-status', 'P2');
assert.equal(state.players.P2.removedDeck.length, 2, 'Copying leaves the Removed Deck intact.');
assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'exhaust').length, 1, 'The top Status is copied into the enemy Hand.');
assert.notEqual(state.players.P2.hand.find((card) => card.cardId === 'exhaust')?.instanceId, 'top', 'The copy has a new identity.');

const automatic = fresh();
assert.equal(beginNarrativeEffect(automatic, 'P1'), true);
const autoResult = applyCommand(automatic, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp' });
assert.equal(autoResult.ok, true, autoResult.ok ? '' : autoResult.error);
assert.equal(autoResult.state.players.P2.hp, 14, 'One enemy is targeted automatically.');
assert.equal(autoResult.state.phase, 'active');

const multiple = createHotseatTestState(true, 'kazka', 3, 'orkk');
multiple.phase = 'active';
multiple.activePlayerId = 'P1';
multiple.objects = [];
multiple.elevations = {};
multiple.players.P1.position = { x: 2, y: 2 };
multiple.players.P2.position = { x: 3, y: 2 };
multiple.players.P3.position = { x: 2, y: 3 };
for (const id of ['P2', 'P3'] as const) {
  multiple.players[id].turnStartRecord = { position: { x: 4, y: id === 'P2' ? 2 : 3 }, hp: 14, round: 1 };
  multiple.players[id].hp = 10;
}
assert.equal(beginNarrativeEffect(multiple, 'P1'), true);
const selecting = applyCommand(multiple, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp' });
assert.equal(selecting.ok, true, selecting.ok ? '' : selecting.error);
assert.equal(selecting.state.phase, 'choosing-narrative-target');
assert.equal((selecting.state as GameStateWithNarrative).narrativeChoice?.selectedEffect, 'enemy-hp');
assert.equal(applyCommand(selecting.state, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-position', targetId: 'P2' }).ok, false, 'The selected effect cannot change during targeting.');
const targeted = applyCommand(selecting.state, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp', targetId: 'P3' });
assert.equal(targeted.ok, true, targeted.ok ? '' : targeted.error);
assert.equal(targeted.state.players.P3.hp, 14);
assert.equal(targeted.state.players.P2.hp, 10);
assert.equal(targeted.state.phase, 'active');
const mixedHp = createHotseatTestState(true, 'kazka', 3, 'orkk');
mixedHp.phase = 'active';
mixedHp.objects = [];
mixedHp.elevations = {};
mixedHp.players.P1.position = { x: 2, y: 2 };
mixedHp.players.P2.position = { x: 3, y: 2 };
mixedHp.players.P3.position = { x: 2, y: 3 };
for (const id of ['P2', 'P3'] as const) mixedHp.players[id].turnStartRecord = { position: { ...mixedHp.players[id].position }, hp: 14, round: 1 };
mixedHp.players.P2.hp = 14;
mixedHp.players.P3.hp = 10;
assert.deepEqual(narrativeTargets(mixedHp, 'P1', 'enemy-hp'), ['P3'], 'Only changed HP targets are highlighted.');
assert.equal(beginNarrativeEffect(mixedHp, 'P1'), true);
const mixedSelection = applyCommand(mixedHp, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp' });
assert.equal(mixedSelection.ok, true);
assert.equal(mixedSelection.state.phase, 'choosing-narrative-target', 'Multiple living enemies still require battlefield targeting.');
assert.equal(applyCommand(mixedSelection.state, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp', targetId: 'P2' }).ok, false);
assert.equal(applyCommand(mixedSelection.state, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' }).ok, true);
assert.equal(beginNarrativeEffect(targeted.state, 'P1'), true);
const cancelSelection = applyCommand(targeted.state, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-hp' });
assert.equal(cancelSelection.ok, true);
const cancelled = applyCommand(cancelSelection.state, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
assert.equal(cancelled.ok, true);
assert.equal(cancelled.state.phase, 'active');

const occupied = fresh();
occupied.players.P1.position = { x: 4, y: 2 };
assert.equal(narrativeStartSquareAvailable(occupied, 'P2'), false);
assert.deepEqual(narrativeTargets(occupied, 'P1', 'enemy-position'), []);
assert.equal(beginNarrativeEffect(occupied, 'P1'), true);
assert.equal(applyCommand(occupied, { type: 'narrative-choice', playerId: 'P1', effect: 'enemy-position', targetId: 'P2' }).ok, false);
assert.equal(applyCommand(occupied, { type: 'narrative-choice', playerId: 'P2', effect: 'refuse' }).ok, false);
const refused = applyCommand(occupied, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
assert.equal(refused.ok, true);
assert.equal(refused.state.phase, 'active');
assert.equal(refused.state.players.P2.hp, 10);

const hidden = fresh();
hidden.players.P2.spectreShadowCloakActive = true;
assert.deepEqual(narrativeEligibleEnemies(hidden, 'P1'), []);
hidden.players.P2.spectreShadowCloakActive = false;
hidden.players.P2.position = { x: 7, y: 2 };
assert.deepEqual(narrativeEligibleEnemies(hidden, 'P1'), [], 'Enemies outside Kazka’s Range 3 cannot be chosen.');
const blocked = fresh();
blocked.players.P2.position = { x: 4, y: 2 };
blocked.objects.push({ id: 'wall', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 3, y: 2 } });
assert.deepEqual(narrativeEligibleEnemies(blocked, 'P1'), [], 'A Wall Object blocks visibility.');
blocked.objects[0].position = { x: 5, y: 2 };
blocked.players.P2.position = { x: 3, y: 2 };
assert.equal(narrativeStartSquareAvailable(blocked, 'P2'), true);
blocked.objects[0].position = { x: 4, y: 2 };
assert.equal(narrativeStartSquareAvailable(blocked, 'P2'), false, 'An Object blocks return to a recorded Square.');

const paused = fresh();
paused.phase = 'defending';
assert.equal(beginNarrativeEffect(paused, 'P1'), true);
const resumed = applyCommand(paused, { type: 'narrative-choice', playerId: 'P1', effect: 'refuse' });
assert.equal(resumed.ok, true);
assert.equal(resumed.state.phase, 'defending', 'The choice returns to the triggering Card’s timing phase.');

console.log('Narrative effect checks passed.');
