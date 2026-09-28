import assert from 'node:assert/strict';
import { CARDS, applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}

function setup(tombPosition?: { x: number; y: number }, inside = false): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'wreckna');
  state.phase = 'active';
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  for (const player of Object.values(state.players)) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
  }
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
  state.players.P2.hand = [
    { instanceId: 'graveyard', cardId: 'graveyard' },
    { instanceId: 'other-defense', cardId: 'brain-freeze' },
  ];
  state.objects = tombPosition ? [{ id: 'tomb', name: 'Tomb', kind: 'tomb', ownerId: 'P2', hp: 3, maxHp: 3, position: tombPosition, heavy: true }] : [];
  state.players.P2.wrecknaInsideTombId = inside ? 'tomb' : null;
  return state;
}

function combat(state: GameState, targetKind: 'player' | 'object' = 'player'): GameState {
  const attacked = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: targetKind === 'object' ? 'tomb' : 'P2', targetKind });
  return step(attacked, { type: 'defend', playerId: 'P2', cardInstanceId: 'graveyard' });
}

assert.equal(CARDS.find((card) => card.id === 'graveyard')?.effectText, 'Value is 4 while adjacent to or inside a Tomb. You can use this Card from inside a Tomb.');

const normal = combat(setup());
assert.equal(normal.combatReveal?.defendTotal, 3, 'Graveyard remains Value 3 away from Tombs.');

const adjacent = combat(setup({ x: 4, y: 2 }));
assert.equal(adjacent.combatReveal?.defendTotal, 4, 'Graveyard has Value 4 while adjacent to a Tomb.');

const insideState = setup({ x: 3, y: 2 }, true);
const directTombAttack = step(insideState, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'tomb', targetKind: 'object' });
assert.equal(directTombAttack.phase, 'defending', 'A direct Attack on an occupied Tomb offers an eligible Tomb defense.');
assert.equal(directTombAttack.pendingAttack?.defenderTombId, 'tomb');
const insideAttack = step(setup({ x: 3, y: 2 }, true), { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2', targetKind: 'player' });
assert.equal(insideAttack.phase, 'defending', 'Targeting entombed Wreckna allows Graveyard as his defense.');
const invalidDefense = applyCommand(insideAttack, { type: 'defend', playerId: 'P2', cardInstanceId: 'other-defense' });
assert.equal(invalidDefense.ok, false, 'Only Graveyard can Defend from inside a Tomb.');
const inside = step(insideAttack, { type: 'defend', playerId: 'P2', cardInstanceId: 'graveyard' });
assert.equal(inside.combatReveal?.defendTotal, 4, 'Graveyard can be used from inside a Tomb and has Value 4.');
assert.equal(inside.objects.some((object) => object.id === 'tomb'), true, 'Using Graveyard no longer sacrifices the Tomb.');

function finishCombat(state: GameState, useDefense = true): GameState {
  state = step(state, useDefense ? { type: 'defend', playerId: 'P2', cardInstanceId: 'graveyard' } : { type: 'pass-defense', playerId: 'P2' });
  if ((state.phase as string) === 'choosing-lightbringer-swap') state = step(state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
  if (state.phase === 'choosing-combat-stack') {
    state = step(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: null });
    state = step(state, { type: 'combat-stack-choice', playerId: 'P2', cardInstanceId: null });
  }
  assert.ok(state.combatReveal, 'Tomb defense uses the combat reveal.');
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
const tombAttack = (state: GameState) => step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'tomb', targetKind: 'object' });

for (const stack of [false, true]) {
  const defendedState = setup({ x: 3, y: 2 }, true);
  (defendedState as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  const defended = finishCombat(tombAttack(defendedState));
  assert.equal(defended.objects.some((object) => object.id === 'tomb'), true, 'A winning Graveyard defense preserves the Tomb.');
  assert.equal(defended.players.P2.wrecknaInsideTombId, 'tomb');

  const losingState = setup({ x: 3, y: 2 }, true);
  losingState.players.P1.character = 'orkk';
  losingState.players.P1.rageStacks = 3;
  (losingState as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  const lost = finishCombat(tombAttack(losingState));
  assert.equal(lost.objects.some((object) => object.id === 'tomb'), false, 'Losing combat destroys the Tomb.');
  assert.equal(lost.players.P2.wrecknaInsideTombId, null);
  assert.equal(lost.players.P2.hp, losingState.players.P2.hp, 'The Tomb absorbs this Attack; combat Damage does not spill into Wreckna.');
}

const tieState = setup({ x: 3, y: 2 }, true);
tieState.players.P1.lightsaberBuff = true;
assert.equal(finishCombat(tombAttack(tieState)).objects.some((object) => object.id === 'tomb'), true, 'A tied combat belongs to the defender and preserves the Tomb.');
const declinedState = setup({ x: 3, y: 2 }, true);
assert.equal(finishCombat(tombAttack(declinedState), false).objects.some((object) => object.id === 'tomb'), false, 'Declining Graveyard destroys the Tomb.');

const effectState = setup({ x: 3, y: 2 }, true);
effectState.players.P1.character = 'magician';
effectState.players.P1.hand = [{ instanceId: 'attack', cardId: 'mana-barrage' }];
effectState.players.P1.manaMode = 'consume';
const effectResult = finishCombat(tombAttack(effectState));
assert.equal(effectResult.objects.some((object) => object.id === 'tomb'), false, 'Mana Barrage post-combat Damage destroys the Tomb even after Graveyard wins combat.');
assert.equal(effectResult.players.P2.hp, effectState.players.P2.hp, 'Post-combat target Damage goes to the Tomb.');

const displacedState = setup({ x: 3, y: 2 }, true);
displacedState.players.P1.character = 'spectre';
displacedState.players.P1.hand = [{ instanceId: 'attack', cardId: 'displace' }];
displacedState.objects.push({ id: 'column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 4, y: 2 } });
assert.equal(finishCombat(tombAttack(displacedState)).objects.some((object) => object.id === 'tomb'), false, 'Blocked Displace destroys the defended Tomb with its extra Damage.');

const swapState = setup({ x: 3, y: 2 }, true);
swapState.players.P1.character = 'merylin';
swapState.players.P1.merylinSummonActive = true;
swapState.players.P1.hand = [{ instanceId: 'attack', cardId: 'lightbringer' }];
const swapped = finishCombat(tombAttack(swapState));
assert.deepEqual(swapped.objects.find((object) => object.id === 'tomb')?.position, { x: 2, y: 2 }, 'Lightbringer swaps the attacked Tomb.');
assert.deepEqual(swapped.players.P2.position, { x: 2, y: 2 }, 'Wreckna remains inside the swapped Tomb.');
assert.equal(swapped.players.P2.wrecknaInsideTombId, 'tomb');

const repentState = setup({ x: 3, y: 2 }, true);
repentState.players.P1.character = 'john-christ';
repentState.players.P1.hand = [{ instanceId: 'attack', cardId: 'repent' }];
const repented = finishCombat(tombAttack(repentState));
assert.equal(repented.objects.some((object) => object.id === 'tomb'), false, 'Repent destroys the attacked Tomb with area Damage.');
assert.equal(repented.players.P2.hp, repentState.players.P2.hp - 2, 'Repent retains its special area Damage exception for Wreckna.');

const survived = finishCombat(tombAttack(setup({ x: 3, y: 2 }, true)));
survived.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-2' }];
survived.players.P1.actionsRemaining = 2;
assert.equal(tombAttack(survived).objects.some((object) => object.id === 'tomb'), false, 'The same surviving Tomb is destroyed on a later Attack without another usable Graveyard.');

const abandoned = finishCombat(tombAttack(setup({ x: 3, y: 2 }, true)));
abandoned.players.P2.wrecknaInsideTombId = null;
abandoned.players.P2.position = { x: 6, y: 6 };
abandoned.players.P2.hand.push({ instanceId: 'graveyard-again', cardId: 'graveyard' });
abandoned.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-2' }];
abandoned.players.P1.actionsRemaining = 2;
assert.equal(tombAttack(abandoned).objects.some((object) => object.id === 'tomb'), false, 'A previously defended Tomb is destroyed immediately when empty.');

const secondDefense = finishCombat(tombAttack(setup({ x: 3, y: 2 }, true)));
secondDefense.players.P2.hand = [{ instanceId: 'graveyard', cardId: 'graveyard' }];
secondDefense.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
secondDefense.players.P1.actionsRemaining = 2;
secondDefense.players.P1.character = 'orkk';
secondDefense.players.P1.rageStacks = 3;
assert.equal(finishCombat(tombAttack(secondDefense)).objects.some((object) => object.id === 'tomb'), false, 'A previously defended Tomb can lose a later combat and be destroyed.');

const replicaState = setup({ x: 3, y: 2 }, true);
replicaState.players.P1.character = 'spectre';
replicaState.players.P1.position = { x: 7, y: 6 };
replicaState.objects.push({ id: 'replica', name: 'Replica', kind: 'spectre-replica', ownerId: 'P1', hp: 1, maxHp: 1, position: { x: 2, y: 2 } });
const replicaAttack = step(replicaState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'tomb', origin: 'replica' });
assert.equal(finishCombat(replicaAttack).objects.some((object) => object.id === 'tomb'), true, 'Replica-origin Attacks also allow Graveyard to protect an occupied Tomb.');

console.log('Graveyard checks passed: Tomb defense wins, losses, effect Damage, and later destruction.');
