import assert from 'node:assert/strict';
import { CARDS, applyCommand, createHotseatTestState, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}

function settled(state: GameState): GameState {
  return state.combatReveal?.deferredAfterCombatState ? JSON.parse(state.combatReveal.deferredAfterCombatState) : state;
}

function setup(stack: boolean, tombs = 0, holdTombBlock = false, attackCard: 'attack-3' | 'blessed-might' = 'attack-3'): GameState {
  const state = createHotseatTestState(true, attackCard === 'blessed-might' ? 'john-christ' : 'shinobi', 2, 'wreckna');
  state.phase = 'active';
  state.elevations = {};
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  for (const player of Object.values(state.players)) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.hp = player.maxHp = 20;
  }
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attackCard }];
  state.players.P2.hand = [{ instanceId: 'graveyard', cardId: 'graveyard' }];
  const tombBlock = { instanceId: 'tomb-block', cardId: 'tomb-block' as const };
  if (holdTombBlock) state.players.P2.hand.push(tombBlock);
  else state.players.P2.deck.push(tombBlock);
  state.objects = Array.from({ length: tombs }, (_, index) => ({
    id: `tomb-${index + 1}`,
    name: `Tomb ${index + 1}`,
    kind: 'tomb' as const,
    ownerId: index === 0 ? 'P1' as const : 'P2' as const,
    hp: 3,
    maxHp: 3,
    position: { x: 5 + index, y: 5 },
    heavy: true,
  }));
  return state;
}

function combat(state: GameState): GameState {
  const attacked = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  return step(attacked, { type: 'defend', playerId: 'P2', cardInstanceId: 'graveyard' });
}

assert.equal(CARDS.find((card) => card.id === 'graveyard')?.effectText, 'Before combat: If Tomb Block is in your Hand, then value of this card is 4. Otherwise, after combat: you may sacrifice a Tomb to return Tomb Block in your Hand.');

for (const stack of [false, true]) {
  const heldCombat = combat(setup(stack, 1, true));
  assert.equal(heldCombat.combatReveal?.attackTotal, 3, 'Graveyard no longer reduces the Attack Value.');
  assert.equal(heldCombat.combatReveal?.defendTotal, 4, 'Tomb Block in Hand makes Graveyard Value 4.');
  assert.equal(settled(heldCombat).phase, 'active', 'Holding Tomb Block suppresses the sacrifice offer.');

  const noTomb = settled(combat(setup(stack, 0)));
  assert.equal(noTomb.phase, 'active', 'No Tomb means no Graveyard popup.');
  assert.equal(noTomb.players.P2.deck.some((card) => card.instanceId === 'tomb-block'), true, 'Tomb Block does not return without a Tomb sacrifice.');

  const offered = settled(combat(setup(stack, 2)));
  assert.equal(offered.phase, 'choosing-graveyard-tomb');
  assert.deepEqual((offered as GameState & { graveyard?: { objectIds: string[] } }).graveyard?.objectIds, ['tomb-1', 'tomb-2'], 'Every Tomb on the map is offered, regardless of ownership.');
  assert.equal(offered.players.P2.hand.some((card) => card.cardId === 'tomb-block'), false, 'The card returns only after accepting the offer.');

  const refused = step(offered, { type: 'graveyard-tomb-choice', playerId: 'P2', objectId: null });
  assert.equal(refused.phase, 'active');
  assert.equal(refused.objects.filter((object) => object.kind === 'tomb').length, 2);
  assert.equal(refused.players.P2.deck.some((card) => card.cardId === 'tomb-block'), true);

  const accepted = step(settled(combat(setup(stack, 2))), { type: 'graveyard-tomb-choice', playerId: 'P2', objectId: 'tomb-1' });
  assert.equal(accepted.phase, 'active');
  assert.equal(accepted.objects.some((object) => object.id === 'tomb-1'), false, 'The selected Tomb is destroyed.');
  assert.equal(accepted.objects.some((object) => object.id === 'tomb-2'), true, 'Unselected Tombs remain.');
  assert.equal(accepted.players.P2.hand.some((card) => card.instanceId === 'tomb-block'), true, 'Tomb Block returns to Hand.');
  assert.equal(accepted.players.P2.deck.some((card) => card.instanceId === 'tomb-block'), false);

  const cancelled = settled(combat(setup(stack, 1, false, 'blessed-might')));
  assert.notEqual(cancelled.phase, 'choosing-graveyard-tomb', 'Blessed Might cancels Graveyard\'s post-combat sacrifice effect.');
  assert.equal(cancelled.objects.some((object) => object.kind === 'tomb'), true);
}

console.log('Graveyard checks passed: conditional Value 4, gated post-combat offer, refusal, selected Tomb sacrifice, and cancellation.');
