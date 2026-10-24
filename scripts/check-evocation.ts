import assert from 'node:assert/strict';
import { applyCommand, canUndoLastAction, cardDefinition, createHotseatTestState, effectiveAttackRange, isBurningSquare, modifySquare, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function setup(): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', objects: [], elevations: {}, simultaneousCombatStack: true });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = { x: 2, y: 1 }; state.players.P2.position = { x: 3, y: 1 };
  state.players.P1.hp = 10;
  state.players.P1.hand = [{ instanceId: 'perk', cardId: 'evocation' }, { instanceId: 'attack', cardId: 'attack-2' }];
  state.players.P1.deck = [{ instanceId: 'later', cardId: 'attack-3' }, { instanceId: 'after-attack', cardId: 'defend-1' }, { instanceId: 'initial-draw', cardId: 'defend-1' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function use(state: GameState, level: 1 | 2 | 3): GameState {
  if (level === 1) return step(state, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'perk', destination: 'direct' });
  const card = state.players.P1.hand.find((entry) => entry.instanceId === 'perk')!;
  state.players.P1.hand = state.players.P1.hand.filter((entry) => entry.instanceId !== 'perk');
  state.players.P1.spellEcho[level - 1] = card;
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
}
const has = (state: GameState, id: string) => state.players.P1.hand.some((card) => card.instanceId === id);
const burn = (state: GameState) => state.players.P2.hand.push({ instanceId: 'burning', cardId: 'burning' });
function fight(state: GameState, defense: CardTypeId = 'defend-1'): GameState {
  state.players.P2.hand = state.players.P2.hand.filter((card) => card.instanceId !== 'defense');
  state.players.P2.hand.push({ instanceId: 'defense', cardId: defense });
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const submitted = (state as any).combatStackSelections ?? {};
    state = step(state, { type: 'combat-stack-choice', playerId: submitted.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });

const card = cardDefinition({ instanceId: '', cardId: 'evocation' });
assert.equal(card.kind, 'perk'); assert.equal(card.value, 1);
assert.deepEqual(card.levelEffects, ['Draw 1 card', 'Absorb Flames in Range', 'Gain 1 Att Range until the end of turn. Draw a card after the next Attack.']);
assert.ok(createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks').players.P1.deck.some((entry) => entry.cardId === 'evocation'));

for (const level of [1, 2, 3] as const) {
  let state = setup(); burn(state);
  state = use(state, level);
  assert.ok(has(state, 'initial-draw'), `Level ${level} includes the Level 1 draw.`);
  assert.equal(state.players.P1.actionsRemaining, 1); assert.equal(state.players.P1.perkUsed, true);
  assert.equal(state.players.P1.pyroCharges, level >= 2 ? 1 : 0);
  assert.equal(effectiveAttackRange(state, state.players.P1), level === 3 ? 3 : 2);
  assert.equal(state.players.P1.evocationNextAttackDraws ?? 0, level === 3 ? 1 : 0);
  assert.equal(has(state, 'after-attack'), false, 'The next-Attack reward is not drawn at activation.');
  if (level >= 2) assert.equal(state.players.P1.spellEcho[0]?.cardId, 'evocation', 'Echo activation cycles the Perk to Level 1.');
}

let inserted = step(setup(), { type: 'play-perk', playerId: 'P1', cardInstanceId: 'perk', destination: 'echo' });
assert.equal(inserted.players.P1.spellEcho[0]?.cardId, 'evocation'); assert.ok(has(inserted, 'initial-draw'));
assert.equal(inserted.players.P1.evocationNextAttackDraws ?? 0, 0, 'Hand insertion executes only Level 1.');

for (const level of [2, 3] as const) {
  let state = setup(); state.players.P2.position = { x: 5, y: 1 }; burn(state);
  state = use(state, level);
  assert.equal(state.players.P1.pyroCharges, level === 3 ? 1 : 0, 'Level 3 extends absorption to Range 3 before Level 2 resolves.');
  assert.equal(effectiveAttackRange(state, state.players.P1), level === 3 ? 3 : 2);
}
let state = setup(); state.players.P2.position = { x: 7, y: 7 };
assert.ok(modifySquare(state, { x: 5, y: 1 }, 'patch-of-flames'));
state = use(state, 3);
assert.equal(isBurningSquare(state, { x: 5, y: 1 }), false, 'The Level 3 ordering also applies to Patch absorption.');
assert.equal(state.players.P1.pyroCharges, 1);

for (const defense of ['defend-1', 'block', 'decisive-block'] as CardTypeId[]) {
  state = use(setup(), 3);
  state = fight(state, defense);
  assert.equal(has(state, 'after-attack'), false, 'Combat acknowledgement gates the delayed draw.');
  state = acknowledge(state);
  assert.ok(has(state, 'after-attack'), 'Evocation draws after the next Attack even if its Card effects were cancelled.');
  assert.equal(state.players.P1.evocationNextAttackDraws, 0);
  state.players.P1.actionsRemaining = 1;
  state.players.P1.hand.push({ instanceId: 'attack', cardId: 'attack-2' });
  state = acknowledge(fight(state));
  assert.equal(has(state, 'later'), false, 'A second Attack does not reuse the reward.');
}

state = use(setup(), 3);
state = step(state, { type: 'end-turn', playerId: 'P1' });
assert.equal(effectiveAttackRange(state, state.players.P1), 2, 'Only the Range bonus expires at turn end.');
assert.equal(state.players.P1.evocationNextAttackDraws, 1);
state = step(state, { type: 'end-turn', playerId: 'P2' });
state = acknowledge(fight(state));
assert.ok(has(state, 'after-attack'), 'The next-Attack draw can be used in a later turn.');
assert.equal(state.players.P1.evocationNextAttackDraws, 0);

state = setup(); state.players.P1.evocationNextAttackDraws = 1;
state = use(state, 3); assert.equal(state.players.P1.evocationNextAttackDraws, 2);
state = acknowledge(fight(state));
assert.ok(has(state, 'after-attack') && has(state, 'later'), 'Separate activations each grant one next-Attack draw.');

state = setup(); burn(state); state.players.P1.pyroCharges = 2; state.players.P2.position = { x: 5, y: 1 };
const fireballHp = state.players.P2.hp;
state = use(state, 3);
assert.equal(state.players.P1.pyroCharges, 0);
assert.equal(state.players.P2.hp, fireballHp - 2, 'Range-first ordering also extends a discharge triggered by absorption.');
assert.equal(state.players.P1.evocationNextAttackDraws, 1, 'A Pyro Fireball is not the next played Attack.');
assert.equal(has(state, 'after-attack'), false);

state = use(setup(), 3);
state.players.P1.hand = state.players.P1.hand.filter((entry) => entry.instanceId !== 'attack');
state.players.P1.hand.push({ instanceId: 'attack', cardId: 'arch-beam' });
state = fight(state);
assert.equal(state.pendingAttack?.fyrePoints, 3); assert.equal(state.combatReveal?.attackTotal, 3, 'Evocation Range increases Focus Lens FP on the next melee Attack.');

state = use(setup(), 3);
state.players.P2.position = { x: 7, y: 7 };
state.objects.push({ id: 'box', kind: 'wooden-box', name: 'Box', hp: 3, maxHp: 3, position: { x: 3, y: 1 } });
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'box' });
assert.ok(has(state, 'after-attack')); assert.equal(state.players.P1.evocationNextAttackDraws, 0);

state = use(setup(), 3);
state.players.P1.hand = state.players.P1.hand.filter((entry) => entry.instanceId !== 'attack');
state.players.P1.hand.push({ instanceId: 'attack', cardId: 'dragon-claws' });
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
state.players.P2.hand.push({ instanceId: 'burning', cardId: 'burning' }); state.players.P2.hp = 1;
state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
assert.equal(state.winner, 'P1'); assert.ok(has(state, 'after-attack'), 'A lethal pre-combat Attack still completes the Perk reward.');

state = use(setup(), 3);
state.players.P1.hand = state.players.P1.hand.filter((entry) => entry.instanceId !== 'attack');
state.players.P1.hand.push({ instanceId: 'attack', cardId: 'dragon-claws' });
state.players.P2.hand = [{ instanceId: 'defense', cardId: 'yamato' }];
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
state = step(state, { type: 'yamato-move', playerId: 'P2', to: { x: 4, y: 1 } });
assert.equal(has(state, 'after-attack'), false);
state = acknowledge(state); assert.ok(has(state, 'after-attack'), 'An evaded Attack still consumes the Perk draw once.');

state = setup(); state.players.P1.deck = []; burn(state);
state = use(state, 3);
assert.equal(canUndoLastAction(state, 'P1'), true, 'A deterministic activation with no draw can be undone.');
state = step(state, { type: 'undo-last-action', playerId: 'P1' });
assert.equal(state.players.P1.evocationRangeBonus ?? 0, 0); assert.equal(state.players.P1.evocationNextAttackDraws ?? 0, 0);
assert.equal(state.players.P1.pyroCharges, 0); assert.ok(state.players.P2.hand.some((entry) => entry.cardId === 'burning'));
assert.equal(state.players.P1.hp, 10);

console.log('Evocation checks passed: cumulative levels, Level 3 Range-first absorption, temporary Range, delayed next-Attack draws, cancellation, persistence, Objects, evasion, lethal cleanup and undo.');
