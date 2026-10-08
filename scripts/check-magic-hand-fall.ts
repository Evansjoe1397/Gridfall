import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState } from '../shared/game.ts';

// Fall Damage is separate from Magic Hand's damage-free collisions, including
// momentum transferred from a thrown Box to an enemy.
for (const targetKind of ['object', 'player'] as const) {
  for (const highGround of [false, true]) {
    const state = createHotseatTestState(true);
    state.players.P1.position = { x: 1, y: 0 };
    state.players.P2.position = { x: 4, y: 0 };
    state.elevations = highGround ? { D1: 1 } : {};
    state.objects = [{ id: 'fall-magic-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 2, y: 0 } }];
    state.phase = 'choosing-magic-hand-target';
    state.magicHand = { casterId: 'P1', level: targetKind === 'player' ? 3 : 1, distance: targetKind === 'player' ? 16 : 3, consume: false, targetKind: null, targetId: null, undo: null };
    const hp = state.players.P2.hp;
    const targeted = applyCommand(state, { type: 'magic-hand-target', playerId: 'P1', targetKind, targetId: targetKind === 'player' ? 'P2' : 'fall-magic-box' });
    assert.equal(targeted.ok, true);
    if (!targeted.ok) throw new Error(targeted.error);
    const resolved = applyCommand(targeted.state, { type: 'magic-hand-direction', playerId: 'P1', to: { x: 5, y: 0 } });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) throw new Error(resolved.error);
    assert.deepEqual(resolved.state.players.P2.position, { x: 5, y: 0 });
    assert.equal(resolved.state.players.P2.hp, hp - (highGround ? 1 : 0), `${targetKind} Magic Hand push applies exactly 1 Fall Damage from High Ground and no collision Damage.`);
    assert.equal(resolved.state.objectPushAnimations.some((event) => event.callout?.playerId === 'P2' && event.callout.text === 'Fall'), highGround);
  }
}

console.log('Magic Hand fall Damage checks passed.');
