import assert from 'node:assert/strict';
import { CARDS, STARTING_DECKS, applyCommand, createHotseatTestState, type CardTypeId, type GameCommand, type GameState, type HotseatCharacterId } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}
function owner(cardId: CardTypeId): HotseatCharacterId {
  const found = Object.entries(STARTING_DECKS).find(([, deck]) => Object.values(deck).flat().includes(cardId));
  return (found?.[0] ?? 'shinobi') as HotseatCharacterId;
}
function setup(attack: CardTypeId, defense: CardTypeId, stack = true, count: 2 | 3 = 2): GameState {
  const state = createHotseatTestState(true, owner(attack), count, owner(defense));
  state.phase = 'active'; state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  state.players.P2.character = owner(defense);
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = [];
    player.hp = player.maxHp = 20;
    player.position = { x: 7, y: 6 };
  }
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.merylinSummonActive = true;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  return state;
}
function attack(state: GameState) { return step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }); }
function defend(state: GameState) { return step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' }); }
function final(state: GameState): GameState { return state.combatReveal?.deferredAfterCombatState ? JSON.parse(state.combatReveal.deferredAfterCombatState) : state; }

const blockers = ['block', 'da-blokk', 'spellblock', 'blessed-block', 'tomb-block', 'decisive-block'] as const;
for (const card of ['blessed-might', 'feint'] as const) {
  const state = defend(attack(setup(card, 'thorns')));
  assert.equal(state.players.P1.hp, 19, `${card} cannot cancel already resolved defensive pre-combat damage`);
}
const privateCards = setup('lightbringer', 'thorns');
privateCards.players.P1.hand.push({ instanceId: 'combat', cardId: 'mythril-helmet' });
let choosing = defend(attack(privateCards));
assert.equal(choosing.phase, 'choosing-lightbringer-swap');
assert.equal(choosing.players.P1.hp, 19);
choosing = step(choosing, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: false });
assert.equal(choosing.phase, 'choosing-combat-stack');
assert.equal(choosing.players.P1.hp, 19, 'Defensive pre-combat damage precedes optional Combat Cards');
choosing = step(choosing, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: 'combat' });
assert.equal(choosing.players.P1.hp, 19, 'A later Mythril Helmet cannot retroactively prevent pre-combat damage');

const replicaState = setup('lightbringer', 'block');
replicaState.players.P1.character = 'spectre';
replicaState.players.P1.position = { x: 7, y: 5 };
replicaState.objects = [{ id: 'replica', name: 'Replica', kind: 'spectre-replica', ownerId: 'P1', position: { x: 2, y: 2 }, hp: 999, maxHp: 999 }];
const replicaAttack = step(replicaState, { type: 'spectre-attack', playerId: 'P1', cardInstanceId: 'attack', origin: 'replica', targetKind: 'player', targetId: 'P2' });
const replicaBlocked = defend(replicaAttack);
assert.notEqual(replicaBlocked.phase, 'choosing-lightbringer-swap');
assert.deepEqual(replicaBlocked.objects.find((object) => object.id === 'replica')?.position, { x: 2, y: 2 });

for (const stack of [false, true]) {
  let undefended = attack(setup('lightbringer', 'defend-1', stack));
  undefended = step(undefended, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(undefended.phase, 'choosing-lightbringer-swap');
  undefended = step(undefended, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
  assert.deepEqual(undefended.players.P1.position, { x: 3, y: 2 });
  assert.ok(undefended.combatReveal);
  for (const blocker of blockers) for (const card of ['lightbringer', 'drain-strength', 'hex', 'fistbolt', 'solitude', 'blessed-might'] as const) {
    const initial = setup(card, blocker, stack);
    initial.players.P2.hand.push({ instanceId: 'spare', cardId: 'defend-1' });
    const result = defend(attack(initial));
    assert.notEqual(result.phase, 'choosing-lightbringer-swap', `${blocker} cancels Lightbringer`);
    assert.notEqual(result.phase, 'choosing-force-disarm-discard', `${blocker} cancels Drain Strength`);
    assert.deepEqual(result.players.P1.position, initial.players.P1.position);
    assert.equal(result.players.P2.hand.some((entry) => entry.instanceId === 'spare'), true);
    assert.equal(result.players.P2.hexMovementPenalty ?? 0, 0);
    assert.equal(final(result).players.P1.rageStacks, 0, `${blocker} cancels both Fistbolt effects`);
    assert.equal(final(result).players.P1.hand.some((entry) => entry.cardId === 'blessing-might'), false);
    assert.equal(applyCommand(result, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true }).ok, false);
  }
  let light = defend(attack(setup('lightbringer', 'thorns', stack)));
  assert.equal(light.phase, 'choosing-lightbringer-swap');
  assert.equal(light.players.P1.hp, 19, 'Thorns resolves before swap offer');
  light = step(light, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
  assert.equal(light.players.P1.hp, 19, 'Resuming swap does not repeat Thorns');
  assert.deepEqual(light.players.P1.position, { x: 3, y: 2 });

  let yamato = defend(attack(setup('lightbringer', 'yamato', stack)));
  assert.equal(yamato.phase, 'choosing-yamato-move', 'Defender choice precedes Attacker choice');
  yamato = step(yamato, { type: 'yamato-move', playerId: 'P2', to: { x: 3, y: 3 } });
  assert.equal(yamato.phase, 'choosing-lightbringer-swap');
  yamato = step(yamato, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
  assert.deepEqual(yamato.players.P1.position, { x: 3, y: 3 });

  const drain = setup('drain-strength', 'thorns', stack);
  drain.players.P2.hand.push({ instanceId: 'spare', cardId: 'defend-1' });
  let draining = attack(drain);
  assert.equal(draining.phase, 'defending', 'Defend selection precedes Drain Strength');
  draining = defend(draining);
  assert.equal(draining.players.P1.hp, 19);
  assert.equal(draining.phase, 'choosing-force-disarm-discard');
  assert.equal(applyCommand(draining, { type: 'force-disarm-discard', playerId: 'P2', cardInstanceId: 'defense' }).ok, false);
  draining = step(draining, { type: 'force-disarm-discard', playerId: 'P2', cardInstanceId: 'spare' });
  assert.equal(draining.players.P1.hp, 19);
  assert.ok(draining.combatReveal);

  const lethal = setup('lightbringer', 'thorns', stack);
  lethal.players.P1.hp = 1;
  const killed = defend(attack(lethal));
  assert.equal(killed.phase, 'finished'); assert.equal(killed.pendingAttack, null);
  assert.deepEqual(killed.players.P1.position, lethal.players.P1.position);
}

// Exercise every printed Attack/Defend pairing in both duel and FFA, with
// intrinsic choices resumed before the private Combat Card stage.
let pairs = 0;
for (const count of [2, 3] as const) for (const attackCard of CARDS.filter((card) => card.kind === 'attack')) for (const defenseCard of CARDS.filter((card) => card.kind === 'defend')) {
  const label = `${attackCard.id}/${defenseCard.id}/${count}`;
  try {
    let state = defend(attack(setup(attackCard.id, defenseCard.id, true, count)));
    if ((state.phase as string) === 'choosing-yamato-move') state = step(state, { type: 'yamato-move', playerId: 'P2', to: null });
    if ((state.phase as string) === 'choosing-lightbringer-swap') state = step(state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
    assert.ok(state.combatReveal || state.phase === 'finished', `Combat did not reach reveal: ${state.phase}`);
    assert.ok(Number.isFinite(state.combatReveal?.attackTotal ?? 0));
    assert.ok(Number.isFinite(state.combatReveal?.defendTotal ?? 0));
    pairs++;
  } catch (error) { throw new Error(label, { cause: error }); }
}
console.log(`Combat ordering checks passed, including ${pairs} Attack/Defend pairings.`);
