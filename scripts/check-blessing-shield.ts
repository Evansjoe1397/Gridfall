import assert from 'node:assert/strict';
import { applicableCombatCardInstanceIds, applyCommand, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}
function setup(attackCard: CardTypeId, defenseCard: CardTypeId, holder: 'P1' | 'P2' = 'P2', stack = true): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'dummy');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  for (const player of Object.values(state.players)) { player.hp = player.maxHp = 20; player.hand = []; player.deck = []; player.discard = []; }
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attackCard }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defenseCard }];
  state.players[holder].hand.push({ instanceId: 'shield', cardId: 'blessing-shield' });
  return state;
}
function resolve(initial: GameState, holder: 'P1' | 'P2' = 'P2', stack = true) {
  let state = step(initial, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  state = step(state, stack ? { type: 'combat-stack-choice', playerId: holder, cardInstanceId: 'shield' } : { type: 'blessing-shield-decision', playerId: holder, use: true });
  assert.ok(state.combatReveal?.deferredAfterCombatState);
  return { visible: state, result: JSON.parse(state.combatReveal!.deferredAfterCombatState!) as GameState };
}

for (const stack of [true, false]) {
  const { visible, result } = resolve(setup('attack-3', 'defend-1', 'P2', stack), 'P2', stack);
  assert.equal(visible.combatReveal?.combatDamage, 1);
  assert.equal(result.players.P2.hp, 19, 'Shield absorbs one ordinary combat Damage');
  assert.equal(result.players.P2.matchStats.combatDamageBlocked, 2, 'Defense and Shield prevention are counted once');
}

for (const combatDamage of [false, true]) {
  const state = setup('hello-there', 'defend-1');
  state.players.P1.lightsaberBuff = combatDamage;
  state.players.P2.hand.push({ instanceId: 'pinned-one', cardId: 'pinned' }, { instanceId: 'pinned-two', cardId: 'pinned' });
  state.players.P2.pinnedStacks = 2;
  const { result } = resolve(state);
  assert.equal(result.players.P2.hp, combatDamage ? 16 : 17, 'One damage pool covers combat OR effect Damage, never both');
  assert.equal(result.players.P2.hand.some((card) => card.cardId === 'headache'), false, 'The status block survives damage absorption');
}

const enforce = resolve(setup('enforce', 'defend-1')).result;
assert.equal(enforce.players.P2.hp, 20);
assert.equal(enforce.players.P2.hand.some((card) => card.cardId === 'panic'), false);
assert.equal(enforce.players.P2.hand.some((card) => card.cardId === 'headache'), true, 'Only the first negative Status is blocked');

const counter = setup('attack-2', 'counterspell', 'P1');
counter.players.P2.manaPoints = 1;
const countered = resolve(counter, 'P1').result;
assert.equal(countered.players.P1.hp, 20, 'Attacker still absorbs Defend Card effect Damage');
assert.equal(countered.players.P1.deck.some((card) => card.cardId === 'headache'), false);

for (const stack of [true, false]) {
  const initial = setup('repent', 'defend-1', 'P1', stack);
  initial.players.P1.character = 'john-christ';
  const { visible, result } = resolve(initial, 'P1', stack);
  assert.equal(visible.players.P1.hp, 20, 'Self-damage waits for combat acknowledgement');
  assert.equal(result.players.P1.hp, 20, 'Shield absorbs Repent self-damage');
  assert.equal(result.players.P1.spiritForm, false, 'Prevented self-damage does not activate Spirit Form');
  assert.equal(result.players.P2.hp, 18, 'Repent still damages the adjacent enemy');
  assert.equal(result.players.P1.hand.some((card) => card.instanceId === 'shield'), false, 'Used Shield leaves Hand');
  assert.equal([...result.players.P1.deck, ...result.players.P1.discard].some((card) => card.instanceId === 'shield'), false, 'Used Shield cannot be drawn again');

  let declined = step(initial, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  declined = step(declined, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  declined = step(declined, stack
    ? { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: null }
    : { type: 'blessing-shield-decision', playerId: 'P1', use: false });
  const after = JSON.parse(declined.combatReveal!.deferredAfterCombatState!) as GameState;
  assert.equal(after.players.P1.hp, 19, 'Declining Shield retains Repent self-damage');
  assert.ok(after.players.P1.hand.some((card) => card.instanceId === 'shield'), 'Declining keeps Shield');

  const fragile = structuredClone(initial);
  fragile.players.P1.hp = 1;
  const saved = resolve(fragile, 'P1', stack).result;
  assert.equal(saved.players.P1.hp, 1, 'Shield lets John survive the first stage at 1 HP');
  assert.equal(saved.players.P2.hp, 18, 'Surviving through Shield enables Repent area Damage');
  assert.ok(saved.spellProjectiles.some((event) => event.style === 'repent-fire'), 'Surviving through Shield enables area animation');

  const blocked = setup('repent', 'decisive-block', 'P1', stack);
  blocked.players.P1.character = 'john-christ';
  let cancelled = step(blocked, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  cancelled = step(cancelled, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  assert.equal(applicableCombatCardInstanceIds(cancelled, 'P1').includes('shield'), false, 'Cancelled Repent does not offer a useless Shield');
  assert.notEqual(cancelled.phase, 'choosing-mythril-helmet', 'Legacy flow skips Shield when self-damage is cancelled');
}
console.log('Blessing: Shield combat/effect damage checks passed.');
