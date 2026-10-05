import assert from 'node:assert/strict';
import { applyCommand, createMultiplayerState, type CharacterId, type DamageLogEntry, type GameCommand, type GameState } from '../shared/game.ts';

// Round-trip commands and snapshots as the multiplayer transport does.
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function run(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(wire(state), wire(command));
  assert.equal(result.ok, true, JSON.stringify(command));
  if (!result.ok) throw new Error(result.error);
  return wire(result.state);
}
function setup(attacker: CharacterId, defender: CharacterId): GameState {
  const state = createMultiplayerState({ P1: attacker, P2: defender } as Record<'P1' | 'P2' | 'P3', CharacterId>, 'trench');
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.objects = [];
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [];
  state.players.P2.hand = [];
  state.players.P2.hp = 18;
  state.players.P2.deck = [];
  return state;
}
const damageEvents = (state: GameState): DamageLogEntry[] =>
  (state as GameState & { damageLog?: DamageLogEntry[] }).damageLog ?? [];

for (const defender of ['merylin', 'shinobi', 'magician'] as const) {
  for (const optionalCard of [false, true]) {
    let state = setup('john-christ', defender);
    state.players.P1.hand = [{ instanceId: 'attack', cardId: 'blessed-light' }];
    if (optionalCard) state.players.P1.hand.push({ instanceId: 'banner', cardId: 'banner' });
    state = run(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
    state = run(state, { type: 'pass-defense', playerId: 'P2' });
    if (optionalCard) {
      assert.equal(state.phase, 'choosing-combat-stack');
      state = run(state, { type: 'combat-stack-choice', playerId: 'P1', cardInstanceId: null });
    }
    assert.ok(state.combatReveal?.deferredAfterCombatState);
    assert.equal(state.players.P2.hp, 16, 'Blessed Light deals its 2 Damage once.');
    for (let repeat = 0; repeat < 3; repeat++) {
      state = run(state, { type: 'pass-defense', playerId: 'P2' });
      assert.equal(state.players.P2.hp, 16, 'Repeated Take The Hit cannot apply another hit.');
      assert.equal(damageEvents(state).length, 1);
      assert.equal(state.log.filter((line) => line.includes('declined to defend and received 2 damage.')).length, 1);
    }
    state = run(state, { type: 'ack-combat', playerId: 'P1' });
    state = run(state, { type: 'pass-defense', playerId: 'P2' });
    state = run(state, { type: 'ack-combat', playerId: 'P2' });
    state = run(state, { type: 'ack-combat', playerId: 'P2' });
    assert.equal(state.players.P2.hp, 16);
    assert.equal(damageEvents(state).length, 1);
    assert.equal(state.players.P2.deck.filter((card) => card.cardId === 'exhaust').length, 1);
    assert.equal(state.players.P1.hand.filter((card) => card.cardId === 'blessing-light').length, 1);
  }
}

// Even with both Obi Wan and the thrown Object on High Ground, each collision
// deals 1 Damage. Levels 1–2 stop on impact; only Level 3 can push the hit enemy.
for (const { level, chainCollision } of [1, 2, 3].flatMap((level) => [false, true].map((chainCollision) => ({ level, chainCollision })))) {
  let state = setup('shinobi', 'merylin');
  state.elevations = { B3: 1, C3: 1 };
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 4, y: 2 };
  state.objects = [{ id: 'projectile', name: 'Thrown Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 3, y: 2 } }];
  if (chainCollision) state.objects.push({ id: 'obstacle', name: 'Blocking Pillar', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 5, y: 2 } });
  state.phase = 'choosing-force-throw-target';
  state.forceThrow = { casterId: 'P1', level, distance: level >= 2 ? 4 : 3, targetRange: 4, targetKind: null, targetId: null, undo: null };
  state = run(state, { type: 'force-throw-target', playerId: 'P1', targetKind: 'object', targetId: 'projectile' });
  const command: GameCommand = { type: 'force-throw-direction', playerId: 'P1', to: { x: 4, y: 2 } };
  state = run(state, command);
  const events = damageEvents(state);
  const secondCollision = level === 3 && chainCollision;
  assert.deepEqual(events.map((event) => event.amount), secondCollision ? [1, 1] : [1]);
  assert.deepEqual(events.map((event) => event.hpAfter), secondCollision ? [17, 16] : [17]);
  assert.equal(events.reduce((total, event) => total + event.amount, 0), secondCollision ? 2 : 1, 'Damage Log totals sum individual hits once.');
  assert.equal(state.players.P2.hp, secondCollision ? 16 : 17);
  assert.deepEqual(state.players.P2.position, level === 3 && !chainCollision ? { x: 7, y: 2 } : { x: 4, y: 2 });
  assert.equal(state.log.some((line) => line.includes('collided with Blocking Pillar')), secondCollision);
  assert.ok(events.every((event) => event.sourceKind === 'perk' && event.collision));
  const repeated = applyCommand(wire(state), command);
  assert.equal(repeated.ok, false, 'An already resolved Force Throw cannot be executed twice.');
  assert.deepEqual(damageEvents(repeated.state), events);
}

// Level 3 may directly push an enemy. Both enemies take exactly 1 on impact.
{
  let state = setup('shinobi', 'merylin');
  state.players.P3 = structuredClone(state.players.P2);
  state.players.P3.id = 'P3';
  state.players.P3.name = 'Second enemy';
  state.players.P3.position = { x: 4, y: 2 };
  state.elevations = { B3: 1, C3: 1 };
  state.objects = [{ id: 'stop', name: 'Pillar', kind: 'wall-pillar', hp: 999, maxHp: 999, position: { x: 5, y: 2 } }];
  state.phase = 'choosing-force-throw-target';
  state.forceThrow = { casterId: 'P1', level: 3, distance: 4, targetRange: 4, targetKind: null, targetId: null, undo: null };
  state = run(state, { type: 'force-throw-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
  state = run(state, { type: 'force-throw-direction', playerId: 'P1', to: { x: 4, y: 2 } });
  assert.ok(damageEvents(state).every((event) => event.amount === 1));
  assert.equal(damageEvents(state).find((event) => event.targetId === 'P2')?.amount, 1);
  assert.equal(damageEvents(state).find((event) => event.targetId === 'P3')?.amount, 1);
}

console.log('Duplicate damage checks passed: Blessed Light resolves once across characters and transport retries; Force Throw deals 1 per collision and only transfers pushes at Level 3.');
