import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, isBurningSquare, modifySquare, summonLens, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function setup(stack = true, attack: CardTypeId = 'attack-3'): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = { x: 2, y: 1 }; state.players.P2.position = { x: 3, y: 1 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'counterflame' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function choices(state: GameState, attackerCombat: string | null = null, defenderCombat: string | null = null): GameState {
  while (state.phase === 'choosing-combat-stack' || state.phase === 'choosing-exhaust') {
    if (state.phase === 'choosing-exhaust') {
      const choice = state.combatReveal!.exhaust!;
      state = step(state, { type: 'exhaust-decision', playerId: choice.eligible.find((id) => !choice.decided.includes(id))!, use: false });
    } else {
      const selected = (state as any).combatStackSelections ?? {};
      const playerId = selected.P1 === undefined ? 'P1' : 'P2';
      state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: playerId === 'P1' ? attackerCombat : defenderCombat });
    }
  }
  return state;
}
function fight(state: GameState, value?: number, attackerCombat: string | null = null, defenderCombat: string | null = null): GameState {
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  if (value !== undefined) state.pendingAttack!.attackValue = value;
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  return choices(state, attackerCombat, defenderCombat);
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const burning = (state: GameState, id: 'P1' | 'P2' = 'P1') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
const burn = (state: GameState, id: 'P1' | 'P2' = 'P2') => state.players[id].hand.push({ instanceId: `old-burning-${id}`, cardId: 'burning' });
const card = cardDefinition({ instanceId: '', cardId: 'counterflame' });
assert.equal(card.name, 'Counterflame'); assert.equal(card.kind, 'defend'); assert.equal(card.value, 2);
assert.equal(card.effectText, "Create Patch of Flames on Attacker's Square after combat. If you lost this combat or received a negative effect as a result of it - apply Burning to Attacker.");
for (const id of ['P1', 'P2'] as const) assert.ok(createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks').players[id].hand.some((card) => card.cardId === 'counterflame'));

for (const stack of [false, true]) {
  for (const value of [1, 2, 3]) {
    let state = fight(setup(stack), value);
    assert.equal(state.combatReveal?.defendBase, 2); assert.equal(burning(state), 0, 'No retaliation before acknowledgement.');
    assert.equal(isBurningSquare(state, state.players.P1.position), false, 'No terrain fire before acknowledgement.');
    state = acknowledge(state); assert.equal(burning(state), value > 2 ? 1 : 0, 'Only a lost combat triggers the outcome branch.');
    assert.ok(isBurningSquare(state, state.players.P1.position), 'Patch creation does not require a loss or negative effect.');
    state = step(state, { type: 'ack-combat', playerId: 'P1' }); assert.equal(burning(state), value > 2 ? 1 : 0, 'No repeated retaliation.');
    assert.equal(state.players.P2.discard.filter((card) => card.cardId === 'counterflame').length, 1);
  }
  let state = setup(stack); burn(state); state = acknowledge(fight(state, 1));
  assert.equal(burning(state), 0, 'Existing Burning alone is not a new negative effect.');
  state = setup(stack, 'arch-beam'); state = acknowledge(fight(state));
  assert.equal(burning(state, 'P2'), 1); assert.equal(burning(state), 1, 'A tied Arch Beam applies Burning, enabling Counterflame.');
  state = setup(stack, 'cut-them-legs'); state = acknowledge(fight(state, 1));
  assert.equal(burning(state), 1, 'New Pinned triggers even when Counterflame wins.');
  state = setup(stack, 'dragon-claws'); burn(state); state = acknowledge(fight(state));
  assert.equal(burning(state), 2, 'Absorbed Burning plus one retaliation for pre-combat Damage.');
  state = setup(stack, 'hex'); state.players.P1.character = 'wreckna'; state = acknowledge(fight(state));
  assert.equal(state.players.P2.hexMovementPenalty, 1); assert.equal(burning(state), 1, 'Actual MOV theft counts on a tie.');
  state = setup(stack, 'displace'); state.players.P1.character = 'spectre'; state = acknowledge(fight(state));
  assert.deepEqual(state.players.P2.position, { x: 4, y: 1 }); assert.equal(burning(state), 1, 'Forced movement counts on a tie.');
  state = setup(stack, 'mana-barrage'); state.players.P1.character = 'magician'; state.players.P1.manaMode = 'consume';
  state = acknowledge(fight(state, 1)); assert.equal(burning(state), 1, 'After-combat effect Damage counts when the combat was won.');
  state = setup(stack, 'feint'); state = acknowledge(fight(state, 3));
  assert.equal(burning(state), 0, 'Feint cancels Counterflame even on a loss.');
  assert.equal(isBurningSquare(state, state.players.P1.position), false, 'Feint also cancels Patch creation.');
  state = setup(stack); state.players.P2.hp = 1; state = acknowledge(fight(state, 3));
  assert.equal(burning(state), 0, 'A defeated defender does not retaliate.');
  state = setup(stack); state.players.P2.traitBlocked = true; state = acknowledge(fight(state, 3));
  assert.equal(burning(state), 1, 'Card effects do not require an active Trait.');
  state = setup(stack, 'pyrodash'); state = fight(state);
  assert.equal(burning(state), 0); state = acknowledge(state);
  assert.ok(state.players.P1.visualMovement?.path.length); assert.equal(burning(state, 'P2'), 1);
  assert.ok(isBurningSquare(state, state.players.P1.position), 'Patch follows the attacker to their final Pyrodash landing Square.');
  assert.equal(burning(state), 1, 'Deferred Pyrodash Burning triggers retaliation only after the route.');
  assert.equal(state.pendingCounterflame, undefined);
  state = setup(stack, 'drain-strength'); state.players.P1.character = 'wreckna';
  state.players.P2.hand.push({ instanceId: 'spare-defense', cardId: 'defend-1' });
  state = fight(state, 1); assert.equal(state.phase, 'choosing-force-disarm-discard');
  state = step(state, { type: 'force-disarm-discard', playerId: 'P2', cardInstanceId: 'spare-defense' });
  state = acknowledge(choices(state)); assert.equal(burning(state), 1, 'A forced extra discard counts even on a win.');
  state = setup(stack); state.players.P2.hand.push({ instanceId: 'banner', cardId: 'banner' }); state.players.P2.movementRemaining = 3;
  state = acknowledge(fight(state, 1)); assert.equal(burning(state), 0, 'Automatically consuming our own Banner does not count.');
  state = setup(stack, 'attack-2'); state.players.P2.position = { x: 4, y: 1 }; state.players.P1.lensBurningReady = true;
  assert.ok(summonLens(state, 'P1', { x: 3, y: 1 }));
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects[0].id });
  state = step(state, { type: 'lens-target', playerId: 'P1', targetId: 'P2', targetKind: 'player' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  state = acknowledge(choices(state)); assert.equal(burning(state, 'P2'), 1);
  assert.equal(burning(state), 0, 'Summon Lens applies after both Card effects and cannot retroactively trigger Counterflame.');
  for (const water of ['water', 'shallow-water'] as const) {
    state = setup(stack); assert.ok(modifySquare(state, state.players.P1.position, water));
    state = acknowledge(fight(state, 3));
    assert.equal(isBurningSquare(state, state.players.P1.position), false, 'Water prevents Patch of Flames normally.');
    assert.equal(burning(state), 1, 'Water does not cancel the independent conditional Burning.');
  }
  state = setup(stack); state.players.P1.character = 'spectre'; state.players.P1.position = { x: 8, y: 7 };
  state.objects.push({ id: 'attacking-replica', name: 'Replica', kind: 'spectre-replica', ownerId: 'P1', hp: 999, maxHp: 999, position: { x: 2, y: 1 } });
  state = step(state, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', origin: 'replica', targetKind: 'player', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  state = acknowledge(choices(state));
  assert.ok(isBurningSquare(state, { x: 2, y: 1 }), 'Burn the attacking replica Square.');
  assert.equal(isBurningSquare(state, state.players.P1.position), false, 'Do not burn the distant replica owner Square.');
}

let state = setup(true, 'arch-beam'); state.players.P1.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
state = acknowledge(fight(state, undefined, 'heated')); assert.equal(burning(state), 0, 'Attacker Heated Debate cancels retaliation.');
assert.equal(isBurningSquare(state, state.players.P1.position), false, 'Heated Debate cancels Patch creation too.');
state = setup(true, 'arch-beam'); state.players.P2.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
state = acknowledge(fight(state, undefined, null, 'heated')); assert.equal(burning(state), 0, 'Cancelled Arch Beam Burning is not received.');
state = setup(true, 'mana-barrage'); state.players.P1.character = 'magician'; state.players.P1.manaMode = 'consume';
state.players.P2.hand.push({ instanceId: 'helmet', cardId: 'mythril-helmet' });
state = acknowledge(fight(state, 1, null, 'helmet')); assert.equal(burning(state), 0, 'Prevented effect Damage does not trigger.');
state = setup(true); state.players.P1.hand.push({ instanceId: 'shield', cardId: 'blessing-shield' });
state = acknowledge(fight(state, 3, 'shield')); assert.equal(burning(state), 0, 'Attacker can select Blessing Shield to prevent retaliation.');
state = setup(true, 'arch-beam'); state.players.P1.hand.push({ instanceId: 'shield', cardId: 'blessing-shield' });
state = acknowledge(fight(state, undefined, 'shield')); assert.equal(burning(state), 0, 'Shield is applicable to the negative-effect branch on a tie.');
state = setup(true, 'dragon-claws'); burn(state); state.players.P2.hand.push({ instanceId: 'helmet', cardId: 'mythril-helmet' });
state = acknowledge(fight(state, undefined, null, 'helmet'));
assert.equal(burning(state), 2, 'A later Helmet cannot undo pre-combat Damage: absorbed Burning plus Counterflame retaliation.');
state = setup(true, 'pyrodash'); state.players.P1.hand.push({ instanceId: 'shield', cardId: 'blessing-shield' });
state = acknowledge(fight(state, undefined, 'shield')); assert.equal(burning(state), 0, 'Protection is selectable for deferred Pyrodash-triggered retaliation.');
console.log('Counterflame checks passed: outcomes/ties, existing/new/prevented negatives, Damage/status/MOV theft/movement/discards, deferred Pyrodash, Lens ordering, cancellation, trait blocking, defeat and starting Hand.');
