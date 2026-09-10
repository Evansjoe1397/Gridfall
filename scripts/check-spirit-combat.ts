import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}
function setup(card: CardTypeId, defense: CardTypeId | null, spirit = true): GameState {
  const state = createHotseatTestState(true, 'john-christ', 2, 'dummy');
  state.phase = 'active'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.spiritForm = spirit; state.players.P1.attackRange = spirit ? 1 : 3;
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; }
  state.players.P1.hand = [{ instanceId: 'attack', cardId: card }];
  if (defense) state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  return state;
}
function attack(state: GameState) { return step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }); }
function defend(state: GameState, card: CardTypeId | null) { return step(state, card ? { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' } : { type: 'pass-defense', playerId: 'P2' }); }
function acknowledge(state: GameState) {
  assert.ok(state.combatReveal);
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  assert.equal(state.players.P1.spiritForm, true, 'First acknowledgement cannot finish the combat');
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
function noNewJudgement(state: GameState) { assert.equal(state.players.P1.hand.some((card) => card.cardId === 'judgement'), false, 'Damage while still in Spirit Form must not create a fresh Judgement'); }

for (const stack of [false, true]) for (const defense of ['counterspell', 'thorns', 'block', null] as const) {
  const initial = setup('judgement', defense);
  (initial as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  initial.players.P2.manaPoints = 1;
  let state = attack(initial);
  assert.equal(state.players.P1.spiritForm, true, 'Attack declaration retains Spirit Form');
  assert.equal(state.players.P1.attackRange, 1);
  state = defend(state, defense);
  assert.equal(state.players.P1.spiritForm, true, 'Result preview retains Spirit Form');
  state = acknowledge(state);
  assert.equal(state.players.P1.spiritForm, false);
  assert.equal(state.players.P1.attackRange, 3);
  if (defense === 'counterspell' || defense === 'thorns') assert.equal(state.players.P1.hp, initial.players.P1.hp - 1);
  noNewJudgement(state);
  assert.equal(state.log.filter((line) => line.includes('left Spirit Form')).length, 1);
}

const repentInitial = setup('repent', null);
let repent = acknowledge(defend(attack(repentInitial), null));
assert.equal(repent.players.P1.hp, repentInitial.players.P1.hp - 1);
assert.equal(repent.players.P1.spiritForm, false); noNewJudgement(repent);

const flurryInitial = setup('judgement', 'flurry-defensive-strikes');
flurryInitial.players.P1.hand.push({ instanceId: 'spare', cardId: 'attack-2' });
let flurry = defend(attack(flurryInitial), 'flurry-defensive-strikes');
flurry = acknowledge(flurry);
assert.equal(flurry.phase, 'flurry-offer');
assert.equal(flurry.players.P1.spiritForm, true, 'Defender post-combat choices must finish too');
flurry = step(flurry, { type: 'flurry-decline', playerId: 'P2' });
assert.equal(flurry.players.P1.spiritForm, false); noNewJudgement(flurry);

let frost = acknowledge(defend(attack(setup('frostmourne', null)), null));
assert.equal(frost.phase, 'choosing-frostmourne');
assert.equal(frost.players.P1.spiritForm, true);
const frostHp = frost.players.P1.hp;
frost = step(frost, { type: 'frostmourne-decision', playerId: 'P1', use: true });
assert.equal(frost.players.P1.hp, frostHp - 1);
assert.equal(frost.players.P1.spiritForm, false); noNewJudgement(frost);

const ordinary = setup('attack-2', 'counterspell', false); ordinary.players.P2.manaPoints = 1;
let entered = defend(attack(ordinary), 'counterspell');
entered = step(entered, { type: 'ack-combat', playerId: 'P1' });
entered = step(entered, { type: 'ack-combat', playerId: 'P2' });
assert.equal(entered.players.P1.spiritForm, true, 'An attack initiated outside Spirit Form may still enter it from damage');
assert.equal(entered.players.P1.hand.some((card) => card.cardId === 'judgement'), true);

for (const card of ['repent', 'judgement', 'frostmourne'] as const) {
  const state = setup(card, null);
  state.objects = [{ id: 'box', name: 'Box', kind: 'wooden-box', position: { x: 2, y: 3 }, hp: 3, maxHp: 3 }];
  let result = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'box' });
  if (card === 'frostmourne') {
    assert.equal(result.players.P1.spiritForm, true);
    result = step(result, { type: 'frostmourne-decision', playerId: 'P1', use: true });
  }
  assert.equal(result.players.P1.spiritForm, false); noNewJudgement(result);
}
console.log('Spirit Form combat completion checks passed.');
