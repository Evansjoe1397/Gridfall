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
assert.equal(reachable.state.combatReveal?.combatDamage, 0, 'Blink misses even when its destination is in range');
assert.equal(reachable.afterClose.players.P2.hp, reachable.startingHp);
assert.equal((reachable.state.combatReveal as typeof reachable.state.combatReveal & { blinkTeleport: { missed: boolean } }).blinkTeleport.missed, true);

const missed = choose({ x: 5, y: 5 });
assert.equal(missed.state.combatReveal?.combatDamage, 0);
assert.equal(missed.afterClose.players.P2.hp, missed.startingHp);
assert.equal(missed.afterClose.pendingAttack, null);
assert.equal((missed.state.combatReveal as typeof missed.state.combatReveal & { blinkTeleport: { missed: boolean } }).blinkTeleport.missed, true);
assert.equal((missed.state.combatReveal as typeof missed.state.combatReveal & { forfeitReason?: string }).forfeitReason, undefined, 'A missed attack still resolves combat.');
assert.equal(missed.afterClose.players.P2.discard.some((card) => card.cardId === 'blink'), true);
assert.equal(missed.afterClose.players.P1.discard.some((card) => card.cardId === 'attack-3'), true);

let blessed = setup();
blessed.players.P1.character = 'john-christ';
blessed.players.P1.hand = [{ instanceId: 'attack', cardId: 'blessed-light' }];
blessed = step(blessed, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
blessed = step(blessed, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
blessed = step(blessed, { type: 'blink-teleport', playerId: 'P2', to: { x: 5, y: 5 } });
assert.equal((blessed.combatReveal as typeof blessed.combatReveal & { blinkTeleport: { missed: boolean } }).blinkTeleport.missed, true);
blessed = step(step(blessed, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
assert.equal(blessed.players.P1.hand.some((card) => card.cardId === 'blessing-light'), true, 'Blessed Light still creates its self Blessing after a miss.');
assert.equal(blessed.players.P2.deck.some((card) => card.cardId === 'exhaust'), false, 'The missed attack cannot put Exhaust in the defender Deck.');

let saber = setup();
saber.players.P1.hand = [{ instanceId: 'attack', cardId: 'light-the-saber' }];
saber = step(saber, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
saber = step(saber, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
saber = step(saber, { type: 'blink-teleport', playerId: 'P2', to: { x: 5, y: 5 } });
saber = step(step(saber, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
assert.equal(saber.players.P1.lightsaberBuff, true, 'Light the Saber still gives the attacker its own buff.');
assert.equal(saber.players.P2.pinnedStacks, 0, 'The missed attack cannot Pin the defender.');

let barrage = setup();
barrage.players.P1.character = 'magician';
barrage.players.P1.manaMode = 'consume';
barrage.players.P1.hand = [{ instanceId: 'attack', cardId: 'mana-barrage' }];
const barrageHp = barrage.players.P2.hp;
barrage = step(barrage, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
barrage = step(barrage, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
barrage = step(barrage, { type: 'blink-teleport', playerId: 'P2', to: { x: 7, y: 7 } });
barrage = step(step(barrage, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
assert.equal(barrage.players.P2.hp, barrageHp, 'Blink miss prevents guaranteed after-combat effect Damage.');

const noMana = setup(0);
noMana.players.P2.hand.push({ instanceId: 'extra-cost', cardId: 'spellblock' });
const attacked = step(noMana, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
let defended = step(attacked, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
assert.equal(defended.phase, 'choosing-blink-discard');
assert.equal(applyCommand(defended, { type: 'blink-discard', playerId: 'P2', cardInstanceId: 'blink' }).ok, false, 'Blink cannot pay its own extra cost');
defended = step(defended, { type: 'blink-discard', playerId: 'P2', cardInstanceId: 'extra-cost' });
assert.equal(defended.phase, 'choosing-blink-teleport');
assert.equal(defended.players.P2.discard.some((card) => card.instanceId === 'extra-cost'), true);
defended = step(defended, { type: 'blink-teleport', playerId: 'P2', to: { x: 5, y: 5 } });
assert.equal(defended.combatReveal?.combatDamage, 0);
defended = step(step(defended, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
assert.equal(defended.players.P2.hp, noMana.players.P2.hp, 'Blink without Mana still prevents combat damage');
assert.deepEqual(defended.players.P2.position, { x: 5, y: 5 });

const noExtraCard = setup(0);
const noExtraAttack = step(noExtraCard, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
let noExtraDefense = step(noExtraAttack, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
assert.ok(noExtraDefense.combatReveal, 'Blink still resolves combat with no extra cost available');
assert.equal(noExtraDefense.combatReveal.defendBase, 0);
assert.equal(noExtraDefense.combatReveal.combatDamage, 3, 'Effect-less Blink does not negate damage');
assert.equal((noExtraDefense.combatReveal as typeof noExtraDefense.combatReveal & { blinkTeleport?: unknown }).blinkTeleport, undefined);
noExtraDefense = step(step(noExtraDefense, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
assert.deepEqual(noExtraDefense.players.P2.position, { x: 3, y: 2 }, 'Effect-less Blink does not teleport');
assert.equal(noExtraDefense.players.P2.hp, noExtraCard.players.P2.hp - 3);

const onBase = setup(0);
onBase.players.P1.position = { x: 7, y: 3 };
onBase.players.P2.position = { x: 8, y: 3 };
const onBaseAttack = step(onBase, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
const onBaseDefense = step(onBaseAttack, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
assert.equal(onBaseDefense.combatReveal?.defendTotal, 1, 'Effect-less Blink still receives own Base bonus');
assert.equal(onBaseDefense.combatReveal?.combatDamage, 2);

let panicked = setup();
panicked.players.P2.hand.push({ instanceId: 'panic', cardId: 'panic' });
panicked = step(panicked, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
panicked = step(panicked, { type: 'defend', playerId: 'P2', cardInstanceId: 'blink' });
assert.equal(panicked.phase, 'choosing-blink-teleport', 'Panic does not suppress Blink teleport');
panicked = step(panicked, { type: 'blink-teleport', playerId: 'P2', to: { x: 5, y: 5 } });
panicked = step(step(panicked, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
assert.deepEqual(panicked.players.P2.position, { x: 5, y: 5 });

console.log('Blink timing, combat, and missed-attack checks passed.');
