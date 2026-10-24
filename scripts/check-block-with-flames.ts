import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function setup(attack: CardTypeId = 'arch-beam', stack = true): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks');
  Object.assign(state, { activePlayerId: 'P1', phase: 'active', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = { x: 2, y: 1 }; state.players.P2.position = { x: 3, y: 1 };
  state.players.P2.hp = 10;
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'block-with-flames' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function fight(state: GameState, heated = false): GameState {
  if (heated) state.players.P1.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const submitted = (state as any).combatStackSelections ?? {};
    const playerId = submitted.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P1' ? 'heated' : null });
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const burn = (state: GameState, id: 'P1' | 'P2' = 'P1') => state.players[id].hand.push({ instanceId: `burn-${id}`, cardId: 'burning' });
const burning = (state: GameState, id: 'P1' | 'P2' = 'P1') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;

const card = cardDefinition({ instanceId: '', cardId: 'block-with-flames' });
assert.equal(card.name, 'Block with Flames'); assert.equal(card.kind, 'defend'); assert.equal(card.value, 1);
for (const id of ['P1', 'P2'] as const) assert.ok(createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks').players[id].hand.some((entry) => entry.cardId === 'block-with-flames'));
for (const stack of [false, true]) {
  let state = fight(setup('arch-beam', stack));
  assert.equal(state.combatReveal?.attackTotal, 0, 'The Block cancels Arch Beam FP before combat.');
  assert.equal(burning(state), 0); assert.equal(burning(state, 'P2'), 0);
  assert.equal(state.players.P2.pyroCharges, 0);
  state = step(state, { type: 'ack-combat', playerId: 'P1' }); assert.equal(burning(state), 0);
  state = step(state, { type: 'ack-combat', playerId: 'P2' });
  assert.equal(burning(state), 1); assert.equal(burning(state, 'P2'), 0, 'Arch Beam cannot apply its own after-combat Burning.');
  assert.equal(state.players.P2.hp, 10); assert.equal(state.players.P2.pyroCharges, 0, 'Applying Burning grants no Charge or healing.');
  assert.equal(state.players.P1.pyroCharges, 0, 'The attacker gains no Charge from ordinary Burning.');

  state = setup('arch-beam', stack); burn(state);
  state = fight(state); assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.players.P2.hp, 10);
  state = acknowledge(state); assert.equal(state.players.P2.pyroCharges, 1); assert.equal(state.players.P2.hp, 11);
  assert.equal(burning(state), 1); assert.equal(burning(state, 'P2'), 0, 'This is a Charge reward, not Absorb Flames.');
  assert.ok(state.players.P1.hand.some((entry) => entry.instanceId === 'burn-P1'));
  assert.equal(state.players.P2.discard.filter((entry) => entry.cardId === 'block-with-flames').length, 1);
  state = acknowledge(state); assert.equal(state.players.P2.pyroCharges, 1, 'Repeated acknowledgements cannot repeat the reward.');

  state = setup('dragon-claws', stack); burn(state, 'P2');
  state = acknowledge(fight(state));
  assert.equal(state.players.P2.hp, 9, 'Only base 2 ATT minus 1 DEF lands; Dragon Claws pre-combat Damage is cancelled.');
  assert.equal(burning(state, 'P2'), 1, 'The Attack cannot absorb the defender Burning.');
  assert.equal(burning(state), 1); assert.equal(state.players.P1.pyroCharges, 0);
  assert.ok(!state.log.some((line) => line.startsWith('Dragon Claws dealt')));
  state = acknowledge(fight(setup('pyrodash', stack)));
  assert.deepEqual(state.players.P1.position, { x: 2, y: 1 }); assert.equal(state.pyrodash, undefined);

  for (const attack of ['feint', 'blessed-might'] as CardTypeId[]) {
    state = setup(attack, stack); burn(state); state = acknowledge(fight(state));
    assert.equal(state.players.P2.pyroCharges, 1, `${attack} cannot cancel the reward after its own effect is blocked.`);
  }
  for (const alreadyBurning of [false, true]) {
    state = setup('arch-beam', stack); if (alreadyBurning) burn(state);
    state = acknowledge(fight(state, true));
    assert.equal(burning(state), Number(alreadyBurning)); assert.equal(state.players.P2.pyroCharges, 0);
    assert.equal(state.players.P2.hp, 10, 'Heated Debate cancels the reward but does not restore Arch Beam FP.');
  }

  state = setup('arch-beam', stack); state.players.P2.pyroCharges = 2; burn(state);
  state = acknowledge(fight(state));
  assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.players.P2.hp, 11);
  assert.equal(state.players.P1.hp, 16); assert.equal(burning(state), 2);
  assert.equal(state.spellProjectiles.at(-1)?.style, 'pyro-discharge'); assert.equal(state.spellProjectiles.at(-1)?.casterId, 'P2');
}

let state = setup('attack-3'); state.players.P1.position = { x: 6, y: 1 }; state.players.P1.attackRange = 3;
state.players.P2.pyroCharges = 2; burn(state);
state = acknowledge(fight(state)); assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.spellProjectiles.length, 0, 'Three Charges are spent with no discharge target in Range.');
state = setup(); state.players.P2.traitBlocked = true; burn(state);
state = acknowledge(fight(state)); assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.players.P2.hp, 10);
state = setup(); state.players.P2.traitBlocked = true;
state = acknowledge(fight(state)); assert.equal(burning(state), 1, 'Blocking the Trait does not cancel the Card Burning effect.');
state = setup('attack-3'); state.players.P2.hp = 1; burn(state);
state = acknowledge(fight(state)); assert.equal(state.players.P2.hp, 0); assert.equal(state.players.P2.pyroCharges, 0); assert.equal(state.phase, 'finished');
state = setup('hex'); state.players.P1.character = 'wreckna'; state.players.P2.movementRemaining = 2;
state = acknowledge(fight(state)); assert.equal(state.players.P2.movementRemaining, 2, 'Block with Flames also cancels the early Hex movement steal.');
console.log('Block with Flames checks passed: setup, before-combat cancellation, Burning/Charge branches, delayed one-shot reward, healing/discharge/no-target, Heated Debate, blocking cancellers, Trait blocking, lethal cleanup and Hex.');
