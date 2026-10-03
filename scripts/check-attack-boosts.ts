import assert from 'node:assert/strict';
import { applicableCombatCardInstanceIds, applyCommand, combatAttackBoostApplicable, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

const boosts: CardTypeId[] = ['blessing-might', 'blessing-light', 'vicious-mockery', 'vicious-mockery-1', 'banner'];
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, result.error);
  return result.state;
}
function setup(defense: CardTypeId, active: boolean, stack = true): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'dummy');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  for (const player of Object.values(state.players)) {
    player.hp = player.maxHp = 20; player.hand = []; player.deck = []; player.discard = [];
  }
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }, ...boosts.filter((id) => stack || id !== 'banner').map((cardId) => ({ instanceId: cardId, cardId }))];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  if (defense === 'calmness' && active) {
    state.players.P1.hand.push({ instanceId: 'pinned', cardId: 'pinned' }); state.players.P1.pinnedStacks = 1;
  }
  if (defense === 'devour' && active) {
    state.players.P2.character = 'spectre';
    state.objects.push({ id: 'replica', kind: 'spectre-replica', ownerId: 'P2', name: 'Replica', hp: 1, maxHp: 1, position: { x: 4, y: 2 } });
  }
  if (defense === 'resurrection' && !active) state.players.P2.hand.push({ instanceId: 'panic', cardId: 'panic' });
  if (defense === 'immortality') {
    state.players.P2.character = 'wreckna';
    if (active) state.objects.push({ id: 'phylactery', kind: 'tomb', name: 'Phylactery', hp: 3, maxHp: 3, phylacteryOwnerId: 'P2', phylacteryType: 'might', position: { x: 5, y: 5 } });
  }
  return state;
}
function reveal(state: GameState): GameState {
  return step(step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }), { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
}

for (const defense of ['calmness', 'devour', 'resurrection', 'immortality'] as const) {
  for (const stack of [true, false]) {
    const state = reveal(setup(defense, true, stack));
    assert.ok(state.combatReveal?.deferredAfterCombatState, `${defense}: active protection skips attack boost offers (${stack})`);
    assert.equal(state.combatReveal.combatDamage, 0);
    assert.ok(boosts.filter((id) => stack || id !== 'banner').every((id) => state.players.P1.hand.some((card) => card.instanceId === id)), 'Skipped boosts stay in Hand');
    assert.equal(applicableCombatCardInstanceIds(state, 'P1').length, 0);

    const inactive = reveal(setup(defense, false, stack));
    assert.equal(inactive.phase, stack ? 'choosing-combat-stack' : 'choosing-blessing-might', `${defense}: unmet protection condition keeps boosts available`);
    if (stack) assert.deepEqual(applicableCombatCardInstanceIds(inactive, 'P1').filter((id) => id !== 'blessing-light'), boosts.filter((id) => id !== 'blessing-light'));
  }
}

let blink = setup('blink', true);
blink.players.P2.manaPoints = 1;
blink = reveal(blink);
blink = step(blink, { type: 'blink-teleport', playerId: 'P2', to: { x: 5, y: 5 } });
assert.ok(blink.combatReveal?.deferredAfterCombatState, 'An activated Blink miss skips attack boosters');

for (const flag of ['blessingFaithApplied', 'mythrilHelmetApplied'] as const) {
  const state = reveal(setup('defend-1', false));
  state.pendingAttack![flag] = true;
  assert.equal(combatAttackBoostApplicable(state), false);
  assert.deepEqual(applicableCombatCardInstanceIds(state, 'P1'), [], `${flag}: already applied protection hides all attack boosters`);
}

const might = setup('calmness', true);
might.players.P1.character = 'wreckna'; might.players.P1.movementRemaining = 1;
might.objects.push({ id: 'might', kind: 'tomb', name: 'Might', hp: 3, maxHp: 3, phylacteryOwnerId: 'P1', phylacteryType: 'might', position: { x: 5, y: 5 } });
assert.ok(reveal(might).combatReveal?.deferredAfterCombatState, 'A useless Phylactery of Might does not hold the Combat Stack open');

const barrage = setup('calmness', true, false);
barrage.players.P1.hand = [{ instanceId: 'attack', cardId: 'mana-barrage' }, { instanceId: 'pinned', cardId: 'pinned' }];
barrage.players.P1.manaPoints = 1;
const barrageResult = reveal(barrage);
assert.ok(barrageResult.combatReveal?.deferredAfterCombatState, 'Active damage negation skips Mana Barrage spending');
assert.equal(barrageResult.players.P1.manaPoints, 1, 'Skipped Mana Barrage spending keeps Mana');

console.log('Attack boost checks passed for active/inactive Calmness, Devour, Resurrection, Immortality, Blink, Faith, Helmet, Might, and Mana Barrage.');
