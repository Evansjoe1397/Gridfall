import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type CardTypeId, type GameCommand, type GameState, type HotseatCharacterId } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
function setup(defense: CardTypeId, character: HotseatCharacterId = 'shinobi') {
  const state = createHotseatTestState(true, 'john-christ', 2, character);
  state.phase = 'active'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; }
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'blessed-might' }];
  state.players.P2.hand = [{ instanceId: 'defend', cardId: defense }];
  return state;
}
function resolve(state: GameState) {
  const attacking = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  const defended = step(attacking, { type: 'defend', playerId: 'P2', cardInstanceId: 'defend' });
  return settled(defended);
}
function settled(state: GameState): GameState {
  return state.combatReveal?.deferredAfterCombatState ? JSON.parse(state.combatReveal.deferredAfterCombatState) : state;
}
function hasBlessing(state: GameState) { return state.players.P1.hand.some((card) => card.cardId === 'blessing-might'); }

for (const card of ['thorns', 'flurry-defensive-strikes'] as const) {
  const state = setup(card, card === 'thorns' ? 'john-christ' : 'shinobi');
  const result = resolve(state);
  assert.equal(result.players.P1.hp, state.players.P1.hp - 1, `${card} pre-combat damage survives`);
  assert.equal(result.players.P1.hand.some((entry) => entry.cardId === 'burning'), false);
  assert.notEqual(result.phase, 'flurry-offer');
  assert.equal(hasBlessing(result), true);
}
const mana = setup('mana-shield', 'magician');
mana.players.P2.manaPoints = 1;
const shielded = resolve(mana);
assert.equal(shielded.players.P2.hp, mana.players.P2.hp - 1, 'Generated Mana contributes to DEF');
assert.equal(shielded.players.P2.manaPoints, 2, 'Mana generation survives; post-combat Mana loss is cancelled');

const graveyard = setup('graveyard', 'wreckna');
graveyard.players.P2.hand.push({ instanceId: 'tomb', cardId: 'tomb-block' });
const grave = resolve(graveyard);
assert.equal(grave.log.some((line) => line.includes('Graveyard decreased') && line.includes('by 2')), true);
assert.equal(hasBlessing(grave), true);

const brain = resolve(setup('brain-freeze', 'wreckna'));
assert.equal(brain.players.P1.brainFreezeCombatBlocked, true);
assert.equal(hasBlessing(brain), true, 'Brain Freeze does not cancel the played Attack Card');

const jump = setup('double-jump');
jump.players.P1.hand.push({ instanceId: 'pin', cardId: 'pinned' });
jump.players.P1.pinnedStacks = 1;
const jumped = resolve(jump);
assert.equal(jumped.players.P2.hp, jump.players.P2.hp, 'Double Jump retains its Pinned-based DEF bonus');
assert.equal(jumped.doubleJump, null, 'Double Jump post-combat movement is cancelled');

let yamato = step(setup('yamato', 'merylin'), { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
yamato = step(yamato, { type: 'defend', playerId: 'P2', cardInstanceId: 'defend' });
assert.equal(yamato.phase, 'choosing-yamato-move');
yamato = settled(step(yamato, { type: 'yamato-move', playerId: 'P2', to: { x: 3, y: 3 } }));
assert.deepEqual(yamato.players.P2.position, { x: 3, y: 3 });
assert.equal(yamato.players.P2.merylinSummonActive, false, 'Yamato post-combat Summon is cancelled');

const counter = setup('counterspell', 'magician'); counter.players.P2.manaPoints = 1;
const countered = resolve(counter);
assert.equal(countered.players.P1.hp, counter.players.P1.hp);
assert.equal(countered.players.P1.deck.some((card) => card.cardId === 'headache'), false);
for (const card of ['block', 'da-blokk', 'spellblock', 'blessed-block', 'tomb-block', 'decisive-block'] as const) {
  const result = resolve(setup(card));
  assert.equal(hasBlessing(result), false, `${card} cancels Blessed Might first`);
}
const blink = setup('blink', 'magician'); blink.players.P2.manaPoints = 1;
const blinked = resolve(blink);
assert.equal(blinked.players.P2.hp, blink.players.P2.hp, 'Prepared damage prevention is retained');
assert.notEqual(blinked.phase, 'choosing-blink-teleport');
console.log('Blessed Might timing checks passed.');
