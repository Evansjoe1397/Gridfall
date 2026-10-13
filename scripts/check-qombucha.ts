import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type CardTypeId, type GameCommand, type GameState, type PlayerId } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, `${command.type}: ${result.error ?? ''}`);
  return result.state;
}

function fresh(simultaneous = false): GameState {
  const state = createHotseatTestState(true, 'kazka', 2, 'orkk');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: simultaneous });
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = []; player.removedDeck = [];
    player.hp = player.maxHp = 18;
    player.shieldEquipped = false;
  }
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.turnStartRecord = { position: { x: 2, y: 2 }, hp: 18, round: 1 };
  state.players.P2.turnStartRecord = { position: { x: 3, y: 2 }, hp: 18, round: 1 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'qombucha' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }];
  return state;
}

function attack(state: GameState): GameState {
  return step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
}

function defense(state: GameState, pass = false): GameState {
  return step(state, pass ? { type: 'pass-defense', playerId: 'P2' } : { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
}

function acknowledge(state: GameState): GameState {
  state = choose(state);
  while (state.phase === 'choosing-exhaust') {
    const choice = state.combatReveal!.exhaust!;
    const playerId = choice.eligible.find((id) => !choice.decided.includes(id))!;
    state = step(state, { type: 'exhaust-decision', playerId, use: false });
  }
  assert.ok(state.combatReveal?.deferredAfterCombatState, 'Combat effects must wait for the result window.');
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}

function countDebates(state: GameState, id: PlayerId = 'P1'): number {
  return state.players[id].hand.filter((card) => card.cardId === 'heated-debate').length;
}

const initial = createHotseatTestState(true, 'kazka', 2, 'orkk');
assert.equal(initial.players.P1.hand.some((card) => card.cardId === 'qombucha'), true);
assert.equal(countDebates(initial), 0, 'Heated Debate is created by Qombucha, rather than a starting Card.');
assert.equal(cardDefinition({ instanceId: '', cardId: 'qombucha' }).value, 1);
assert.equal(cardDefinition({ instanceId: '', cardId: 'heated-debate' }).kind, 'combat');
assert.equal(cardDefinition({ instanceId: '', cardId: 'heated-debate' }).narrative, true);

function choose(state: GameState, choices: Partial<Record<'P1' | 'P2', string | null>> = {}): GameState {
  for (let attempt = 0; state.phase === 'choosing-combat-stack' && attempt < 2; attempt++) {
    const submitted = (state as GameState & { combatStackSelections?: Partial<Record<PlayerId, string[]>> }).combatStackSelections ?? {};
    const pending = state.pendingAttack!;
    const id = [pending.attackerId, pending.defenderId].find((id) => submitted[id] === undefined)!;
    state = step(state, { type: 'combat-stack-choice', playerId: id, cardInstanceId: choices[id as 'P1' | 'P2'] ?? null });
  }
  return state;
}
function heated(state: GameState, id: 'P1' | 'P2'): void {
  state.players[id].hand.push({ instanceId: 'debate-' + id, cardId: 'heated-debate' });
}

for (const simultaneous of [false, true]) {
  for (const defenseId of ['defend-1', 'not-a-shinobi', 'graveyard'] as CardTypeId[]) {
    let state = fresh(simultaneous);
    state.players.P2.hand = [{ instanceId: 'defense', cardId: defenseId }];
    state = attack(state);
    assert.equal(state.pendingAttack?.attackValue, 2);
    state = defense(state);
    const notWon = defenseId !== 'defend-1';
    assert.equal(state.combatReveal?.combatWinnerId, notWon ? 'P2' : 'P1');
    assert.equal(countDebates(state), 0, 'Creation waits for the combat result.');
    assert.equal(countDebates(acknowledge(state)), Number(notWon), 'Both losses and ties create Heated Debate.');
  }
  for (const pile of ['hand', 'deck', 'discard'] as const) {
    for (const status of ['headache', 'exhaust', 'pinned', 'burning', 'panic'] as CardTypeId[]) {
      let state = fresh(simultaneous);
      state.players.P2.hand = [{ instanceId: 'defense', cardId: 'graveyard' }];
      state.players.P2[pile].push({ instanceId: 'negative', cardId: status });
      state = attack(state);
      assert.equal(state.pendingAttack?.attackValue, 1, 'Negative Cards anywhere in the owned piles prevent 2 ATT.');
      assert.equal(countDebates(acknowledge(defense(state))), 1);
      const winning = fresh(simultaneous);
      winning.players.P2[pile].push({ instanceId: 'negative', cardId: status });
      assert.equal(countDebates(acknowledge(defense(attack(winning), true))), 0, 'A win creates no Card despite negative Status Cards.');
    }
  }
  const harmlessWin = fresh(simultaneous);
  harmlessWin.players.P1.hand.push({ instanceId: 'pinned', cardId: 'pinned' });
  harmlessWin.players.P2.hand = [{ instanceId: 'defense', cardId: 'calmness' }];
  let state = acknowledge(defense(attack(harmlessWin)));
  assert.equal(state.players.P2.hp, 18);
  assert.equal(countDebates(state), 0, 'Damage negation does not turn a win into a loss.');
  const blocked = fresh(simultaneous);
  blocked.players.P2.hand = [{ instanceId: 'defense', cardId: 'decisive-block' }];
  assert.equal(countDebates(acknowledge(defense(attack(blocked)))), 0, 'Attack effect Blocks cancel creation.');

  const shield = fresh(simultaneous);
  shield.players.P2.character = 'magician';
  shield.players.P2.hand = [{ instanceId: 'defense', cardId: 'mana-shield' }];
  heated(shield, 'P1');
  state = defense(attack(shield));
  assert.equal(state.players.P2.manaPoints, 1, 'Mana generation precedes Heated Debate.');
  state = choose(state, { P1: 'debate-P1' });
  assert.equal(state.combatReveal?.defendTotal, 1, 'Printed DEF and the generated Mana remain in combat.');
  state = acknowledge(state);
  assert.equal(state.players.P2.manaPoints, 1, 'Post-combat Mana depletion is cancelled.');
  assert.equal(state.players.P2.hand.some((card) => card.cardId === 'mana-shield'), false, 'Post-combat Hand return is cancelled.');
  assert.equal(state.players.P2.discard.some((card) => card.cardId === 'mana-shield'), true);
  assert.equal(state.phase, 'active', 'Heated Debate no longer triggers Narration.');

  for (const pass of [false, true]) {
    const escalation = fresh(simultaneous);
    escalation.players.P1.hand = [{ instanceId: 'attack', cardId: 'escalation' }];
    escalation.players.P2.hand.push({ instanceId: 'headache', cardId: 'headache' });
    heated(escalation, 'P2');
    state = defense(attack(escalation), pass);
    assert.equal(state.players.P2.hp, 17, 'Enemy pre-combat Damage is preserved.');
    state = acknowledge(choose(state, { P2: 'debate-P2' }));
    assert.equal(state.players.P2.hp, pass ? 15 : 16, 'Combat Damage remains.');
    assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 1, 'Enemy post-combat Headache is cancelled.');
    assert.equal(state.phase, 'active', 'Enemy post-combat Narration is cancelled.');
    assert.equal(countDebates(state, 'P2'), 0, 'Any combatant can use Heated Debate, and it is consumed.');
  }

  const cancelCreation = fresh(simultaneous);
  cancelCreation.players.P2.hand.push({ instanceId: 'headache', cardId: 'headache' });
  heated(cancelCreation, 'P2');
  assert.equal(countDebates(acknowledge(choose(defense(attack(cancelCreation)), { P2: 'debate-P2' }))), 0);

  const counterspell = fresh(simultaneous);
  counterspell.players.P2.character = 'magician';
  counterspell.players.P2.manaPoints = 1;
  counterspell.players.P2.hand = [{ instanceId: 'defense', cardId: 'counterspell' }];
  heated(counterspell, 'P1');
  state = acknowledge(choose(defense(attack(counterspell)), { P1: 'debate-P1' }));
  assert.equal(state.players.P1.hp, 18, 'Enemy post-combat retaliation is cancelled.');
  assert.equal(state.players.P1.deck.some((card) => card.cardId === 'headache'), false);
  assert.equal(countDebates(state), 1, 'A loss still creates a new Card after the old one is used.');

  const thorns = fresh(simultaneous);
  thorns.players.P2.character = 'john-christ';
  thorns.players.P2.hand = [{ instanceId: 'defense', cardId: 'thorns' }];
  heated(thorns, 'P1');
  state = defense(attack(thorns));
  assert.equal(state.players.P1.hp, 17, 'Defensive pre-combat Damage is preserved.');
  assert.equal(acknowledge(choose(state, { P1: 'debate-P1' })).players.P1.hp, 17);

  const noEnemyCard = fresh(simultaneous);
  heated(noEnemyCard, 'P1');
  state = defense(attack(noEnemyCard), true);
  assert.notEqual(state.phase, 'choosing-combat-stack', 'An attacker cannot cancel an absent Defend Card.');
  assert.equal(countDebates(acknowledge(state)), 1);

  const keep = fresh(simultaneous);
  heated(keep, 'P1');
  assert.equal(countDebates(acknowledge(choose(defense(attack(keep))))), 1, 'Declining keeps the Card.');
  const frozen = fresh(simultaneous);
  frozen.players.P2.hand = [{ instanceId: 'defense', cardId: 'brain-freeze' }];
  heated(frozen, 'P1');
  state = acknowledge(defense(attack(frozen)));
  assert.equal(state.players.P1.hand.some((card) => card.instanceId === 'debate-P1'), true, 'Brain Freeze blocks attacking Combat Cards.');

  const grimoire = fresh(simultaneous);
  grimoire.players.P1.hand = [{ instanceId: 'attack', cardId: 'grimoire-cleanse' }];
  grimoire.players.P2.hand.push({ instanceId: 'kept', cardId: 'attack-2' });
  heated(grimoire, 'P2');
  state = acknowledge(choose(defense(attack(grimoire)), { P2: 'debate-P2' }));
  assert.equal(state.phase, 'active', 'Cancellation does not leave a mandatory post-combat discard pending.');
  assert.equal(state.pendingAttack, null);
  assert.equal(state.players.P2.hand.some((card) => card.instanceId === 'kept'), true);

  const hello = fresh(simultaneous);
  hello.players.P1.hand = [{ instanceId: 'attack', cardId: 'hello-there' }];
  hello.players.P2.hand.push({ instanceId: 'pinned', cardId: 'pinned' });
  heated(hello, 'P2');
  state = choose(defense(attack(hello), true), { P2: 'debate-P2' });
  assert.equal(state.combatReveal?.afterCombatAttackDamage, 0, 'Post-combat Damage is cancelled even when no Defend Card was played.');
  state = acknowledge(state);
  assert.equal(state.players.P2.hand.some((card) => card.cardId === 'headache'), false);

  const barrage = fresh(simultaneous);
  barrage.players.P1.character = 'magician';
  barrage.players.P1.manaMode = 'generate';
  barrage.players.P1.manaPoints = 3;
  barrage.players.P1.hand = [{ instanceId: 'attack', cardId: 'mana-barrage' }];
  heated(barrage, 'P2');
  state = choose(defense(attack(barrage), true), { P2: 'debate-P2' });
  assert.equal(state.phase, 'choosing-mana-barrage', 'The enemy’s during-combat Mana choice remains available.');
  state = step(state, { type: 'mana-barrage-decision', playerId: 'P1', use: true });
  assert.equal(state.players.P1.manaPoints, 2);
  const combatDamage = state.combatReveal!.combatDamage!;
  assert.equal(combatDamage, cardDefinition({ instanceId: '', cardId: 'mana-barrage' }).value + 1, 'The paid during-combat Damage is preserved.');
  state = acknowledge(state);
  assert.equal(state.players.P2.hp, 18 - combatDamage);
  assert.equal(state.players.P1.manaPoints, 3, 'Character-trait Mana generation is unaffected.');

  const consume = fresh(simultaneous);
  consume.players.P1.character = 'magician';
  consume.players.P1.manaMode = 'consume';
  consume.players.P1.hand = [{ instanceId: 'attack', cardId: 'mana-barrage' }];
  heated(consume, 'P2');
  state = choose(defense(attack(consume), true), { P2: 'debate-P2' });
  assert.equal(state.combatReveal?.afterCombatAttackDamage, 0, 'The Consume post-combat bonus is cancelled.');
  const hpAfterCombat = state.players.P2.hp;
  state = acknowledge(state);
  assert.equal(state.players.P2.hp, hpAfterCombat);
}

let state = fresh(true);
state.players.P1.hand = [{ instanceId: 'attack', cardId: 'escalation' }];
state.players.P2.character = 'magician';
state.players.P2.hand = [{ instanceId: 'defense', cardId: 'mana-shield' }, { instanceId: 'headache', cardId: 'headache' }];
heated(state, 'P1'); heated(state, 'P2');
state = acknowledge(choose(defense(attack(state)), { P1: 'debate-P1', P2: 'debate-P2' }));
assert.equal(state.phase, 'active', 'Both sides cancel enemy effects without triggering Narration.');
assert.equal(state.players.P2.hand.filter((card) => card.cardId === 'headache').length, 1);
assert.equal(state.players.P2.manaPoints, 1);

state = fresh(true);
state.players.P2.carianReturnNextDefend = true;
heated(state, 'P1');
state = acknowledge(choose(defense(attack(state)), { P1: 'debate-P1' }));
assert.equal(state.players.P2.hand.some((card) => card.cardId === 'defend-1'), true, 'An unrelated Perk return is preserved.');

for (const phase of ['choosing-end-discard', 'choosing-dash-discard'] as const) {
  state = fresh();
  state.phase = phase;
  state.players.P1.hand = [{ instanceId: 'debate', cardId: 'heated-debate' }];
  state.players.P1.freeMoveUsed = true;
  if (phase === 'choosing-dash-discard') state.dashCancellation = { previousMovementRemaining: 0, discardedCard: null };
  state = step(state, { type: 'discard-card', playerId: 'P1', cardInstanceId: 'debate' });
  if (phase === 'choosing-dash-discard') state = step(state, { type: 'cancel-dash', playerId: 'P1' });
  assert.equal([...state.players.P1.hand, ...state.players.P1.deck, ...state.players.P1.discard, ...(state.players.P1.removedDeck ?? [])].some((card) => card.cardId === 'heated-debate'), false);
}
console.log('Qombucha and Heated Debate checks passed in both combat modes.');
