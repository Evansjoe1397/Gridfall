import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type BoardObject, type GameCommand, type GameState, type HotseatCharacterId } from '../shared/game.ts';

function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.state;
}

function setup(attackerCharacter: HotseatCharacterId, object: BoardObject, simultaneousCombatStack: boolean): GameState {
  const state = createHotseatTestState(true, attackerCharacter, 2, 'merylin');
  state.phase = 'active'; state.activePlayerId = 'P1'; state.elevations = {};
  (state as GameState & { simultaneousCombatStack?: boolean }).simultaneousCombatStack = simultaneousCombatStack;
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  for (const player of Object.values(state.players)) {
    player.hand = []; player.deck = []; player.discard = [];
  }
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'attack-3' }];
  state.players.P2.hand = [{ instanceId: 'redirect', cardId: 'redirect' }];
  state.objects = [
    object,
    { id: 'permanent-wall', name: 'Arena Wall', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 2, y: 1 } },
  ];
  return state;
}

for (const simultaneousCombatStack of [false, true]) {
  for (const testCase of [
    {
      attackerCharacter: 'orkk' as const,
      object: { id: 'orkk-shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield' as const, ownerId: 'P1' as const, hp: 3, maxHp: 3, heavy: true, position: { x: 3, y: 1 } },
    },
    {
      attackerCharacter: 'wreckna' as const,
      object: { id: 'wreckna-tomb', name: "Wreckna's Tomb", kind: 'tomb' as const, ownerId: 'P1' as const, hp: 3, maxHp: 3, heavy: true, position: { x: 3, y: 1 } },
    },
  ]) {
    const initial = setup(testCase.attackerCharacter, testCase.object, simultaneousCombatStack);
    const defenderHp = initial.players.P2.hp;
    const attacked = step(initial, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
    const redirected = step(attacked, { type: 'defend', playerId: 'P2', cardInstanceId: 'redirect' });
    assert.equal(redirected.objects.some((object) => object.id === testCase.object.id), false, `${testCase.object.name} is destroyed by Redirect.`);
    assert.equal(redirected.objects.some((object) => object.id === 'permanent-wall'), true, 'An unselected permanent arena wall remains standing.');
    assert.equal(redirected.players.P2.hp, defenderHp, 'The redirected point of combat Damage does not reach Merylin.');
    assert.equal(redirected.objectPushAnimations.some((animation) => animation.objectId === testCase.object.id && animation.destroy), true, 'Redirect emits the destruction animation.');
    assert.equal(redirected.log.some((line) => line.includes(`Redirect sent 1 combat Damage into ${testCase.object.name}`)), true);
  }

  const columnOnly = setup('orkk', { id: 'unused-box', name: 'Unused Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 8, y: 8 } }, simultaneousCombatStack);
  const defenderHp = columnOnly.players.P2.hp;
  const attacked = step(columnOnly, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  const redirected = step(attacked, { type: 'defend', playerId: 'P2', cardInstanceId: 'redirect' });
  assert.equal(redirected.objects.some((object) => object.id === 'permanent-wall'), true, 'A permanent arena column remains after absorbing Redirect.');
  assert.equal(redirected.players.P2.hp, defenderHp, 'The arena column absorbs one point of combat Damage.');
  assert.equal(redirected.objectPushAnimations.some((animation) => animation.objectId === 'permanent-wall' && animation.objectCallout?.text === 'Redirect (column)' && !animation.destroy), true, 'The surviving column emits the Redirect callout.');
}

console.log("Redirect object checks passed: Shields and Tombs are destructible, while permanent columns absorb and remain standing in both combat-stack modes.");
