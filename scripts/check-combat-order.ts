import assert from 'node:assert/strict';
import { CARDS, STARTING_DECKS, applyCommand, cardDefinition, createHotseatTestState, type CardTypeId, type GameCommand, type GameState, type HotseatCharacterId } from '../shared/game.ts';

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
  if (defense === 'blink') state.players.P2.manaPoints = 1;
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

const brainFreezeWithMovement = setup('attack-2', 'brain-freeze');
brainFreezeWithMovement.players.P1.movementRemaining = 2;
const frozenWithMovement = defend(attack(brainFreezeWithMovement));
assert.equal(frozenWithMovement.players.P1.movementRemaining, 1, 'Brain Freeze steals one unspent MOV from the attacker.');
assert.equal(frozenWithMovement.players.P1.hexMovementPenalty, 1);
assert.equal(frozenWithMovement.players.P2.brainFreezeMovementBonus, 1);
assert.equal(frozenWithMovement.players.P1.brainFreezeCombatBlocked, true);
const afterFrozenAttackTurn = step(final(frozenWithMovement), { type: 'end-turn', playerId: 'P1' });
assert.equal(afterFrozenAttackTurn.players.P2.brainFreezeMovementBonus, 1, 'The stolen MOV remains available for Wreckna\'s turn.');
const afterWrecknaTurn = step(afterFrozenAttackTurn, { type: 'end-turn', playerId: 'P2' });
assert.equal(afterWrecknaTurn.players.P2.brainFreezeMovementBonus, 0, 'Brain Freeze movement expires after Wreckna\'s turn.');
const brainFreezeWithoutMovement = setup('attack-2', 'brain-freeze');
brainFreezeWithoutMovement.players.P1.movementRemaining = 0;
const frozenWithoutMovement = defend(attack(brainFreezeWithoutMovement));
assert.equal(frozenWithoutMovement.players.P1.hexMovementPenalty ?? 0, 0, 'Brain Freeze cannot steal MOV when the attacker has none left.');
assert.equal(frozenWithoutMovement.players.P2.brainFreezeMovementBonus ?? 0, 0);
assert.equal(frozenWithoutMovement.players.P1.brainFreezeCombatBlocked, true, 'Brain Freeze still blocks Combat Cards and Effects with no MOV to steal.');
const immortalityDefense = defend(attack(setup('attack-3', 'immortality')));
assert.equal(immortalityDefense.combatReveal?.defendBase, 2, 'Immortality has base Defend Value 2.');

assert.equal(cardDefinition({ instanceId: '', cardId: 'thorns' }).effectText, "Deal 1 Damage to the Attacker before combat. After combat: if John entered Spirit Form, annul the Attacker's unspent movement.");
for (const stack of [false, true]) {
  const initial = setup('attack-3', 'thorns', stack);
  initial.players.P1.movementRemaining = 3;
  initial.players.P1.freeMoveUsed = true;
  const revealed = defend(attack(initial));
  assert.equal(revealed.players.P1.hp, 19, 'Thorns still deals its 1 Damage before combat.');
  assert.equal(revealed.players.P1.movementRemaining, 3, 'Thorns does not annul MOV before the combat reveal finishes.');
  const resolved = final(revealed);
  assert.equal(resolved.players.P2.spiritForm, true);
  const holyThorns = resolved.objectPushAnimations.filter(event => event.thorns);
  assert.equal(holyThorns.length, 1, 'One Thorns presentation survives combat resolution.');
  assert.equal(holyThorns[0].thorns?.spirit, false, 'Later combat damage must not recolor normal-form Thorns.');
  assert.equal(holyThorns[0].damage?.amount, 1, 'Retaliation damage travels with its impact presentation.');
  assert.equal(resolved.players.P1.movementRemaining, 0, 'Entering Spirit Form in this combat annuls the attacker\'s unspent MOV.');
  assert.equal(resolved.players.P1.movementAnnulledByBlessedSwiftness, true);
  assert.equal(resolved.players.P1.hand.some((card) => card.cardId === 'burning'), false);
  let acknowledged = step(revealed, { type: 'ack-combat', playerId: 'P1' });
  acknowledged = step(acknowledged, { type: 'ack-combat', playerId: 'P2' });
  assert.equal(acknowledged.players.P1.movementRemaining, 0);
  assert.equal(applyCommand(acknowledged, { type: 'move', playerId: 'P1', to: { x: 2, y: 3 } }).ok, false, 'The attacker cannot spend annulled MOV.');
  const ended = step(acknowledged, { type: 'end-turn', playerId: 'P1' });
  assert.equal(ended.players.P1.movementAnnulledByBlessedSwiftness, false, 'The annulment marker expires at the affected turn end.');

  for (const scenario of ['blocked-damage', 'already-spirit', 'blocked-trait', 'cancelled-effect', 'windwalker', 'zero-movement'] as const) {
    const candidate = setup(scenario === 'blocked-damage' ? 'attack-2' : scenario === 'cancelled-effect' ? 'blessed-might' : 'attack-3', 'thorns', stack);
    candidate.players.P1.character = 'shinobi';
    candidate.players.P1.movementRemaining = scenario === 'zero-movement' ? 0 : 3;
    if (scenario === 'already-spirit') candidate.players.P2.spiritForm = true;
    if (scenario === 'blocked-trait') candidate.players.P2.traitBlocked = true;
    if (scenario === 'windwalker') {
      candidate.players.P1.character = 'merylin';
      candidate.players.P1.windwalkerUnrestrictedMovement = true;
    }
    const result = final(defend(attack(candidate)));
    assert.equal(result.players.P1.movementRemaining, scenario === 'zero-movement' ? 0 : 3, `${scenario}: Thorns respects the Spirit Form entry condition, effect cancellation, and MOV immunity.`);
    assert.equal(result.players.P1.movementAnnulledByBlessedSwiftness, scenario === 'zero-movement');
    assert.equal(result.players.P1.hand.some((card) => card.cardId === 'burning'), false);
    assert.equal(result.players.P1.hp, 19, 'Thorns pre-combat Damage remains independent of its after-combat effect.');
    assert.equal(result.objectPushAnimations.find(event => event.thorns)?.thorns?.spirit, scenario === 'already-spirit', 'Thorns preserves the defending form across deferred combat state.');
  }

  const spiritAttacker = setup('attack-3', 'thorns', stack);
  spiritAttacker.players.P1.character = 'john-christ';
  spiritAttacker.players.P1.spiritForm = true;
  spiritAttacker.players.P1.freeMoveUsed = true;
  spiritAttacker.players.P1.movementRemaining = 1;
  spiritAttacker.players.P1.johnCumulativeMovementRemaining = 4;
  let finishedSpiritAttack = defend(attack(spiritAttacker));
  finishedSpiritAttack = step(finishedSpiritAttack, { type: 'ack-combat', playerId: 'P1' });
  finishedSpiritAttack = step(finishedSpiritAttack, { type: 'ack-combat', playerId: 'P2' });
  assert.equal(finishedSpiritAttack.players.P1.spiritForm, false);
  assert.equal(finishedSpiritAttack.players.P1.johnCumulativeMovementRemaining, 0, 'Thorns also annuls John\'s stored cumulative MOV.');
  assert.equal(finishedSpiritAttack.players.P1.movementRemaining, 0, 'Leaving Spirit Form cannot restore annulled MOV.');
}

for (const stack of [false, true]) {
  let undefended = attack(setup('lightbringer', 'defend-1', stack));
  undefended = step(undefended, { type: 'pass-defense', playerId: 'P2' });
  assert.equal(undefended.phase, 'choosing-lightbringer-swap');
  undefended = step(undefended, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
  assert.deepEqual(undefended.players.P1.position, { x: 3, y: 2 });
  assert.ok(undefended.combatReveal);
  for (const blocker of blockers) for (const card of ['lightbringer', 'drain-strength', 'bone-chill', 'hex', 'fistbolt', 'solitude', 'blessed-might'] as const) {
    const initial = setup(card, blocker, stack);
    initial.players.P2.hand.push({ instanceId: 'spare', cardId: 'defend-1' });
    const result = defend(attack(initial));
    assert.notEqual(result.phase, 'choosing-lightbringer-swap', `${blocker} cancels Lightbringer`);
    assert.notEqual(result.phase, 'choosing-force-disarm-discard', `${blocker} cancels Drain Strength`);
    assert.deepEqual(result.players.P1.position, initial.players.P1.position);
    assert.equal(result.players.P2.hand.some((entry) => entry.instanceId === 'spare'), true);
    assert.equal(result.players.P2.hexMovementPenalty ?? 0, 0);
    if (card === 'bone-chill') assert.equal(result.combatReveal?.attackTotal, 3, `${blocker} cancels Bone Chill's melee Value bonus`);
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
    if ((state.phase as string) === 'choosing-blink-teleport') state = step(state, { type: 'blink-teleport', playerId: 'P2', to: { x: 3, y: 3 } });
    if ((state.phase as string) === 'choosing-lightbringer-swap') state = step(state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: true });
    assert.ok(state.combatReveal || state.phase === 'finished', `Combat did not reach reveal: ${state.phase}`);
    assert.ok(Number.isFinite(state.combatReveal?.attackTotal ?? 0));
    assert.ok(Number.isFinite(state.combatReveal?.defendTotal ?? 0));
    pairs++;
  } catch (error) { throw new Error(label, { cause: error }); }
}
console.log(`Combat ordering checks passed, including ${pairs} Attack/Defend pairings.`);
