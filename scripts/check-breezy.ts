import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, dealDamage, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(stack = true, attack: CardTypeId = 'attack-3'): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell('D4'); state.players.P2.position = cell('E4'); state.players.P2.hp = 10;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }]; state.players.P2.hand = [{ instanceId: 'defense', cardId: 'breezy' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function fight(state: GameState, attackerCombat: CardTypeId | null = null): GameState {
  if (attackerCombat) state.players.P1.hand.push({ instanceId: 'combat', cardId: attackerCombat });
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack' || state.phase === 'choosing-exhaust') {
    if (state.phase === 'choosing-exhaust') {
      const choice = state.combatReveal!.exhaust!;
      state = step(state, { type: 'exhaust-decision', playerId: choice.eligible.find((id) => !choice.decided.includes(id))!, use: false });
    } else {
      const selected = (state as any).combatStackSelections ?? {}; const playerId = selected.P1 === undefined ? 'P1' : 'P2';
      state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: playerId === 'P1' && attackerCombat ? 'combat' : null });
    }
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const count = (state: GameState, id: 'P1' | 'P2', cardId: CardTypeId) => state.players[id].hand.filter((card) => card.cardId === cardId).length;
function burn(state: GameState, id: 'P1' | 'P2', count = 1): void {
  for (let index = 0; index < count; index++) state.players[id].hand.push({ instanceId: `old-${id}-${index}`, cardId: 'burning' });
}
const removed = (state: GameState, id: 'P1' | 'P2') => (state.players[id].removedDeck ?? []).filter((card) => card.cardId === 'burning').length;
const card = cardDefinition({ instanceId: '', cardId: 'breezy' });
assert.equal(card.name, 'Breezy'); assert.equal(card.kind, 'defend'); assert.equal(card.value, 1);
assert.match(card.effectText!, /Remove your Burning/);
for (const player of Object.values(createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks').players)) assert.equal([...player.hand, ...player.deck].some((card) => card.cardId === 'breezy'), false, 'breezy is outside the base starting pool.');

for (const stack of [false, true]) {
  for (const [attackerBurning, defenderBurning] of [[false,false],[true,false],[false,true],[true,true]]) {
    let state = setup(stack); if (attackerBurning) burn(state, 'P1'); if (defenderBurning) burn(state, 'P2');
    state = fight(state);
    assert.equal(state.combatReveal?.defendBase, 1);
    assert.equal(state.players.P2.hp, attackerBurning || defenderBurning ? 10 : 8);
    assert.equal(count(state, 'P2', 'burning'), 0);
    assert.equal(count(state, 'P1', 'burning'), attackerBurning && defenderBurning ? 1 : 0, 'Defender is prioritized; attacker Burning remains if both were Burning.');
    assert.equal(removed(state, 'P2'), defenderBurning ? 1 : 0);
    assert.equal(removed(state, 'P1'), attackerBurning && !defenderBurning ? 1 : 0);
    assert.equal(count(state, 'P1', 'exhaust'), 0, 'Exhaust waits for acknowledged after-combat effects.');
    state = acknowledge(state); assert.equal(count(state, 'P1', 'exhaust'), 1);
    assert.equal(state.players.P1.pyroCharges, 0); assert.equal(state.players.P2.pyroCharges, 0, 'Burning removal is not absorption.');
    assert.equal(state.players.P2.discard.filter((card) => card.cardId === 'breezy').length, 1, 'Breezy itself is discarded normally.');
  }
  let state = setup(stack); burn(state, 'P1', 2); burn(state, 'P2', 3);
  state = acknowledge(fight(state)); assert.equal(removed(state, 'P2'), 3); assert.equal(count(state, 'P1', 'burning'), 2);
  state = setup(stack); state.players.P2.deck = [{ instanceId: 'stored', cardId: 'burning' }];
  state = acknowledge(fight(state)); assert.equal(state.players.P2.hp, 8, 'Burning stored outside Hand does not activate Breezy.');
  assert.equal(state.players.P2.deck[0].cardId, 'burning');
  state = setup(stack, 'arch-beam'); state = acknowledge(fight(state));
  assert.equal(state.players.P2.hp, 9); assert.equal(count(state, 'P2', 'burning'), 1, 'Late Burning cannot retroactively activate the pre-combat condition.');
  state = setup(stack, 'dragon-claws'); burn(state, 'P2'); state = acknowledge(fight(state));
  assert.equal(state.players.P2.hp, 10, 'Remove Burning before Dragon Claws checks its pre-combat condition.'); assert.equal(removed(state, 'P2'), 1);
  state = setup(stack, 'mana-barrage'); state.players.P1.character = 'magician'; state.players.P1.manaMode = 'consume'; burn(state, 'P2');
  state = acknowledge(fight(state)); assert.equal(state.players.P2.hp, 10, 'Combat and guaranteed after-combat Card Damage are negated.');
  state = setup(stack, 'cut-them-legs'); burn(state, 'P2'); state = acknowledge(fight(state));
  assert.equal(state.players.P2.hp, 10); assert.equal(count(state, 'P2', 'pinned'), 1, 'Damage negation does not prevent negative Status Cards.');
  for (const cancel of ['feint', 'blessed-might'] as const) {
    state = setup(stack, cancel); burn(state, 'P2'); state = acknowledge(fight(state));
    assert.equal(state.players.P2.hp, 10); assert.equal(removed(state, 'P2'), 1); assert.equal(count(state, 'P1', 'exhaust'), 0, 'Attack cancellation affects Exhaust, not resolved pre-combat protection.');
  }
  state = setup(stack); state.players.P2.traitBlocked = true; state.players.P2.hp = 1; burn(state, 'P2');
  state = acknowledge(fight(state)); assert.equal(state.players.P2.hp, 1); assert.equal(count(state, 'P1', 'exhaust'), 1);
  state = setup(stack); state.players.P2.hp = 1; state = acknowledge(fight(state));
  assert.equal(state.players.P2.hp, 0); assert.equal(count(state, 'P1', 'exhaust'), 0, 'Defeated defender does not apply Exhaust.');
  state = setup(stack, 'pyrodash'); state.players.P1.position = cell('E5'); state.players.P2.position = cell('D5'); state.elevations = { E5: 1 };
  state.objects.push({ id: 'stop', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('C5') }); burn(state, 'P1');
  state = acknowledge(fight(state)); assert.equal(state.players.P2.hp, 10, 'Deferred Pyrodash pass Damage remains protected.');
  assert.equal(count(state, 'P2', 'burning'), 1); assert.equal(state.players.P1.visualMovement?.path.length, 4);
  state = setup(stack, 'dance-through'); burn(state, 'P2'); state = acknowledge(fight(state)); assert.equal(state.phase, 'dance-through');
  assert.equal(dealDamage(state, state.players.P2, 2, false, 'P1', 'attack', true), 0, 'Deferred combat movement retains protection.');
  state = step(state, { type: 'end-dance', playerId: 'P1' });
  assert.equal(dealDamage(state, state.players.P2, 2, false, 'P1', 'attack', true), 2, 'Protection expires when the deferred movement ends.');
}
let state = setup(); burn(state, 'P2'); state = acknowledge(fight(state, 'heated-debate'));
assert.equal(state.players.P2.hp, 10); assert.equal(removed(state, 'P2'), 1); assert.equal(count(state, 'P1', 'exhaust'), 0);
state = setup(); burn(state, 'P2'); state = acknowledge(fight(state, 'blessing-shield'));
assert.equal(count(state, 'P1', 'exhaust'), 0, 'Normal status protection can stop Exhaust.');
console.log('Breezy checks passed: Burning condition/priority/removal, persistent combat Damage negation, normal/late statuses, ordered effects, Exhaust/cancellation/protection, deferred Pyrodash/Dance Through, expiry and starting Hand.');
