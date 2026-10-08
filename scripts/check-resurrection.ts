import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, cellLabel, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

function cellFromLabel(label: string) {
  return { x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 };
}

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

for (const origin of ['H4', 'H5', 'D3']) {
  for (const blocked of [false, true]) {
    const state = createHotseatTestState(false, 'magician', 2, 'john-christ');
    state.phase = 'active';
    state.pendingManaChoice = null;
    state.objects = [];
    state.elevations = {};
    state.players.P2.position = cellFromLabel(origin);
    state.players.P1.position = { x: state.players.P2.position.x - 1, y: state.players.P2.position.y };
    state.players.P1.hand = [{ instanceId: 'attack', cardId: 'arcane-bolt' }];
    state.players.P2.hand = [{ instanceId: 'defend', cardId: 'resurrection' }];
    state.players.P2.deck = [{ instanceId: 'draw', cardId: 'cleanse' }];
    const destination = origin === 'H4' ? 'H5' : 'H4';
    if (blocked) {
      for (const label of ['H4', 'H5'].filter((label) => label !== origin)) {
        state.objects.push({ id: `box-${label}`, name: 'Wooden Box', hp: 1, maxHp: 1, position: cellFromLabel(label), kind: 'wooden-box' });
      }
    }
    let result = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
    result = step(result, { type: 'defend', playerId: 'P2', cardInstanceId: 'defend' });
    if (blocked) assert.ok(result.players.P2.hp < state.players.P2.hp, `${origin}: blocked teleport must not negate Damage`);
    else assert.equal(result.players.P2.hp, state.players.P2.hp, `${origin}: successful teleport negates Damage`);
    result = step(result, { type: 'ack-combat', playerId: 'P1' });
    result = step(result, { type: 'ack-combat', playerId: 'P2' });
    assert.deepEqual(result.players.P2.position, cellFromLabel(blocked ? origin : destination));
    assert.equal(result.players.P2.hand.some((card) => card.instanceId === 'draw'), true, 'Always draw 1 Card');
    if (!blocked) {
      assert.equal(result.players.P2.hp, state.players.P2.hp - 1, 'Successful teleport without Stoic Shell costs 1 HP.');
      assert.deepEqual(result.players.P2.visualMovement?.from, cellFromLabel(origin));
      assert.deepEqual(result.players.P2.visualMovement?.path, [cellFromLabel(destination)]);
    }
  }
}

console.log('Resurrection destination and damage checks passed.');

function setup(stack: boolean, shell = false, attack: CardTypeId = 'attack-3'): GameState {
  const state = createHotseatTestState(true, 'magician', 2, 'john-christ');
  state.phase = 'active'; state.activePlayerId = 'P1';
  (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = stack;
  state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P1.manaMode = attack === 'mana-barrage' ? 'consume' : 'generate';
  state.players.P2.hand = [{ instanceId: 'resurrection', cardId: 'resurrection' }];
  state.players.P2.deck = [{ instanceId: 'draw', cardId: 'cleanse' }];
  state.players.P2.discard = [];
  state.players.P2.stoicShell = shell;
  state.players.P2.stoicShellStacks = shell ? 1 : 0;
  return state;
}
function fight(state: GameState): GameState {
  return step(step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' }), { type: 'defend', playerId: 'P2', cardInstanceId: 'resurrection' });
}
function acknowledge(state: GameState): GameState {
  state = step(state, { type: 'ack-combat', playerId: 'P1' });
  return step(state, { type: 'ack-combat', playerId: 'P2' });
}
assert.equal(cardDefinition({ instanceId: '', cardId: 'resurrection' }).effectText, "Negate all Damage and teleport to your Base. Draw 1 Card. Don't negate Damage if the teleport is impossible. If John has Stoic Shell - remove it, otherwise John loses 1 HP after teleportation.");

for (const stack of [false, true]) {
  for (const shell of [false, true]) for (const attack of ['attack-3', 'mana-barrage'] as const) {
    const initial = setup(stack, shell, attack);
    const revealed = fight(initial);
    assert.equal(revealed.players.P2.hp, initial.players.P2.hp, 'Resurrection negates combat Damage; its cost waits for teleportation.');
    assert.deepEqual(revealed.players.P2.position, initial.players.P2.position, 'Teleportation waits for reveal acknowledgement.');
    const result = acknowledge(revealed);
    assert.ok(['H4', 'H5'].includes(cellLabel(result.players.P2.position)));
    assert.equal(result.players.P2.hp, initial.players.P2.hp - Number(!shell), 'Successful teleport consumes Shell or costs exactly 1 HP.');
    assert.equal(result.players.P2.stoicShell, false);
    assert.equal(result.players.P2.stoicShellStacks, 0);
    assert.equal(result.players.P2.spiritForm, false, 'HP loss is a cost, not Damage that activates Spirit Form.');
    assert.ok(result.players.P2.hand.some((card) => card.instanceId === 'draw'));
    assert.equal(result.players.P1.matchStats!.totalDamage, 0, 'Neither negated Damage nor the HP cost credits enemy Damage statistics.');
    assert.ok(result.players.P2.visualMovement?.sourceCardId === 'resurrection');
  }
  for (const reason of ['occupied-base', 'panic', 'cancelled'] as const) {
    const initial = setup(stack, false, reason === 'cancelled' ? 'blessed-might' : 'attack-3');
    if (reason === 'occupied-base') initial.objects = [
      { id: 'base-1', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 8, y: 3 } },
      { id: 'base-2', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 8, y: 4 } },
    ];
    if (reason === 'panic') initial.players.P2.hand.push({ instanceId: 'panic', cardId: 'panic' });
    const revealed = fight(initial);
    assert.equal(revealed.players.P2.hp, initial.players.P2.hp - 3, `Unavailable teleport (${reason}, stack=${stack}) cannot negate combat Damage.`);
    const result = acknowledge(revealed);
    assert.equal(result.players.P2.hp, initial.players.P2.hp - 3, 'An unsuccessful teleport does not charge the extra HP cost.');
    assert.deepEqual(result.players.P2.position, initial.players.P2.position);
    assert.equal(result.players.P2.hand.some((card) => card.instanceId === 'draw'), reason !== 'cancelled', 'Unavailable destinations still draw; effect cancellation prevents the draw.');
    assert.ok(!result.log.some((line) => line.includes('HP after Resurrection teleportation')));
  }
  for (const shell of [false, true]) {
    const lethalCost = setup(stack, shell);
    lethalCost.players.P2.hp = 1;
    const result = acknowledge(fight(lethalCost));
    assert.ok(['H4', 'H5'].includes(cellLabel(result.players.P2.position)), 'Even a lethal HP cost happens after teleportation.');
    assert.equal(result.players.P2.hp, shell ? 1 : 0);
    assert.equal(result.phase, shell ? 'active' : 'finished');
    assert.equal(result.winner, shell ? null : 'P1');
  }
}
console.log('Resurrection teleport and cost checks passed.');
