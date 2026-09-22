import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, queueBlessingCard, type GameState } from '../shared/game.ts';

function endTurn(state: GameState): GameState {
  const result = applyCommand(state, { type: 'end-turn', playerId: state.activePlayerId });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

for (const legacyStacks of [0, 1, 5]) {
  let state = createHotseatTestState(true, 'john-christ', 2, 'dummy');
  state.activePlayerId = 'P2';
  state.players.P1.hp = 8;
  state.players.P1.stoicShell = true;
  state.players.P1.stoicShellStacks = legacyStacks;
  for (let turn = 0; turn < 3; turn++) {
    state = endTurn(state);
    assert.equal(state.activePlayerId, 'P1');
    assert.equal(state.players.P1.hp, 9 + turn, 'Heal exactly 1 HP on every turn, regardless of legacy Stacks.');
    assert.equal(state.players.P1.stoicShellStacks, 0);
    assert.equal(state.players.P1.stoicShellHealAmount, 1);
    assert.equal(state.players.P1.stoicShellHealedTurn, state.turn);
    assert.ok(state.players.P1.stoicShellHealEventId);
    assert.equal(state.players.P1.stoicShell, true);
    state = endTurn(state);
  }
}

for (const missingHp of [0, 1]) {
  const state = createHotseatTestState(true, 'john-christ', 2, 'dummy');
  state.activePlayerId = 'P2';
  state.players.P1.hp = state.players.P1.maxHp - missingHp;
  state.players.P1.stoicShell = true;
  state.players.P1.stoicShellStacks = 5;
  const healed = endTurn(state).players.P1;
  assert.equal(healed.hp, healed.maxHp);
  assert.equal(healed.stoicShellHealAmount, missingHp);
  assert.equal(healed.stoicShell, true);
  if (!missingHp) assert.equal(healed.stoicShellHealEventId, null);
}

const blocked = createHotseatTestState(true, 'john-christ', 2, 'dummy');
blocked.activePlayerId = 'P2';
assert.equal(queueBlessingCard(blocked.players.P1, 'blessing-swiftness'), true);
const blockResolved = endTurn(blocked);
assert.equal(blockResolved.blessingAnimations.at(-1)?.source, 'block');
assert.equal(blockResolved.blessingAnimations.at(-1)?.cardId, 'blessing-swiftness');

const perkState = createHotseatTestState(true, 'john-christ', 2, 'dummy');
perkState.phase = 'active';
perkState.players.P1.hand = [{ instanceId: 'prayer', cardId: 'blessed-prayer' }];
perkState.players.P1.deck = [];
perkState.players.P1.discard = [];
const perkResult = applyCommand(perkState, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'prayer', destination: 'direct' });
assert.equal(perkResult.ok, true);
if (!perkResult.ok) throw new Error(perkResult.error);
assert.equal(perkResult.state.blessingAnimations.at(-1)?.source, 'perk');
assert.equal(perkResult.state.blessingAnimations.at(-1)?.cardId, 'blessing-prayer');
console.log('Stoic Shell checks passed (flat 1 HP, repeated turns, legacy Stacks, HP cap).');
