import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type Cell, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function setup(mana = 2): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'magician');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
  state.players.P2.hand = [{ instanceId: 'blink', cardId: 'blink' }];
  state.players.P2.manaPoints = mana;
  return state;
}

function choose(destination: Cell) {
  let state = setup();
  const startingHp = state.players.P2.hp;
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
  assert.equal(state.phase, 'choosing-blink-teleport');
  assert.equal(state.players.P2.manaPoints, 0, 'Mana is spent before choosing the destination');
  assert.deepEqual(state.players.P2.position, { x: 3, y: 2 });
  state = step(state, { type: 'blink-teleport', playerId: 'P2', to: destination });
  assert.ok(state.combatReveal, 'Destination choice resolves into a combat window');
  assert.deepEqual(state.players.P2.position, { x: 3, y: 2 }, 'Visible position stays put while combat window is open');
  assert.deepEqual((state.combatReveal as typeof state.combatReveal & { blinkTeleport: { to: Cell } }).blinkTeleport.to, destination);
  const afterClose = step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
  assert.deepEqual(afterClose.players.P2.position, destination, 'Teleport commits when combat window closes');
  assert.equal(afterClose.players.P2.visualMovement?.sourceCardId, 'blink');
  return { state, afterClose, startingHp };
}

const reachable = choose({ x: 2, y: 3 });
assert.equal(reachable.state.combatReveal?.combatDamage, 3, 'Reachable Blink destination allows normal combat damage');
assert.equal(reachable.afterClose.players.P2.hp, reachable.startingHp - 3);
assert.equal((reachable.state.combatReveal as typeof reachable.state.combatReveal & { blinkTeleport: { missed: boolean } }).blinkTeleport.missed, false);

const missed = choose({ x: 5, y: 5 });
assert.equal(missed.state.combatReveal?.combatDamage, 0);
assert.equal(missed.afterClose.players.P2.hp, missed.startingHp);
assert.equal(missed.afterClose.pendingAttack, null);
assert.equal((missed.state.combatReveal as typeof missed.state.combatReveal & { blinkTeleport: { missed: boolean } }).blinkTeleport.missed, true);
assert.equal(missed.afterClose.players.P2.discard.some((card) => card.cardId === 'blink'), true);
assert.equal(missed.afterClose.players.P1.discard.some((card) => card.cardId === 'attack-3'), true);

const noMana = setup(0);
const attacked = step(noMana, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
const defended = step(attacked, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
assert.notEqual(defended.phase, 'choosing-blink-teleport');
assert.ok(defended.players.P2.hp < noMana.players.P2.hp, 'Blink without Mana does not prevent combat damage');

console.log('Blink timing, combat, and forfeit checks passed.');
