import assert from 'node:assert/strict';
import { absorbFlames, applyCommand, createHotseatTestState, modifySquare, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'orkk');
  Object.assign(state, { phase: 'active', activePlayerId: 'P2', objects: [], elevations: {} });
  for (const p of Object.values(state.players)) {
    p.hand = []; p.deck = []; p.discard = []; p.spellEcho = [null, null, null];
    p.hp = p.maxHp = 20; p.freeMoveUsed = true; p.movementRemaining = 0;
  }
  state.players.P1.position = cell('G7'); state.players.P2.position = cell('C2');
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function expectDamage(state: GameState, amount: number): void {
  const stats = state.players.P1.matchStats;
  assert.equal(stats.attackDamage, amount); assert.equal(stats.totalDamage, amount);
  assert.equal(stats.perkDamage, 0); assert.equal(stats.defensiveRetaliationDamage, 0);
  const events = (state as GameState & { damageLog?: { sourceId: string; sourceKind: string; amount: number }[] }).damageLog ?? [];
  assert.equal(events.filter((e) => e.sourceId === 'P1').reduce((total, e) => total + e.amount, 0), amount);
  assert.ok(events.filter((e) => e.sourceId === 'P1').every((e) => e.sourceKind === 'attack'));
}
for (const dash of [false, true]) {
  let state = setup();
  state.players.P2.hand = Array.from({ length: 3 }, (_, i) => ({ instanceId: `burn-${i}`, cardId: 'burning', sourcePlayerId: 'P1' }));
  state = step(state, { type: dash ? 'dash' : 'end-turn', playerId: 'P2' });
  assert.equal(state.players.P2.hp, 17); expectDamage(state, 3);
  assert.equal(state.log.filter((line) => line.includes('Rage from taking damage')).length, 1, 'Stat attribution keeps grouped Burning Rage.');

  state = setup(); state.players.P2.spectreShadowCloakActive = true;
  state.players.P2.hand = [{ instanceId: 'protected', cardId: 'burning', sourcePlayerId: 'P1' }];
  state = step(state, { type: dash ? 'dash' : 'end-turn', playerId: 'P2' });
  assert.equal(state.players.P2.hp, 20); expectDamage(state, 0);

  state = setup(); state.players.P2.hp = 1;
  state.players.P2.hand = Array.from({ length: 3 }, (_, i) => ({ instanceId: `fatal-${i}`, cardId: 'burning', sourcePlayerId: 'P1' }));
  state = step(state, { type: dash ? 'dash' : 'end-turn', playerId: 'P2' }); expectDamage(state, 1);
}

// Terrain Cards retain the creator before the Patch can expire or be absorbed.
let state = setup(); state.players.P2.movementRemaining = 3;
assert.ok(modifySquare(state, cell('D2'), 'patch-of-flames', 'P1'));
state = step(state, { type: 'move', playerId: 'P2', to: cell('D2') });
assert.equal(state.players.P2.hand.find((card) => card.cardId === 'burning')?.sourcePlayerId, 'P1');
state = step(state, { type: 'end-turn', playerId: 'P2' }); expectDamage(state, 1);

state = setup(); state.players.P2.hand = [{ instanceId: 'cost', cardId: 'attack-2' }];
assert.ok(modifySquare(state, cell('D2'), 'patch-of-flames', 'P1'));
state = step(state, { type: 'dash', playerId: 'P2' });
state = step(state, { type: 'discard-card', playerId: 'P2', cardInstanceId: 'cost' });
state = step(state, { type: 'move', playerId: 'P2', to: cell('D2') });
assert.deepEqual(state.pendingDashBurningSources?.P2, ['P1']);
const undo = step(state, { type: 'cancel-movement', playerId: 'P2' });
assert.equal(undo.pendingDashBurningSources?.P2, undefined, 'Movement cancellation restores queued ownership.');
state = step(state, { type: 'end-turn', playerId: 'P2' }); expectDamage(state, 0);
assert.equal(state.players.P2.hand.find((card) => card.cardId === 'burning')?.sourcePlayerId, 'P1');
assert.equal(state.pendingDashBurningSources?.P2, undefined);
state = step(state, { type: 'end-turn', playerId: 'P1' });
state = step(state, { type: 'end-turn', playerId: 'P2' }); expectDamage(state, 1);

state = setup(); state.activePlayerId = 'P1'; state.players.P1.position = cell('F2');
assert.ok(modifySquare(state, cell('D2'), 'patch-of-flames', 'P1'));
state.phase = 'choosing-force-pull-target'; state.forcePull = { casterId: 'P1', level: 1, distance: 1, targetRange: 8, undo: null };
state = step(state, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
state = step(state, { type: 'end-turn', playerId: 'P1' });
state = step(state, { type: 'end-turn', playerId: 'P2' }); expectDamage(state, 0);
assert.equal(state.players.P2.hand.find((card) => card.cardId === 'burning')?.sourcePlayerId, 'P1', 'Forced residence settled at turn completion preserves the creator.');

state = setup(); state.players.P2.character = 'fyrebanks'; state.players.P2.attackRange = 2;
assert.ok(modifySquare(state, cell('D2'), 'patch-of-flames', 'P1')); assert.ok(absorbFlames(state, 'P2'));
assert.equal(state.players.P2.hand.find((card) => card.cardId === 'burning')?.sourcePlayerId, 'P1', 'Absorbing an enemy Patch keeps its creator.');
state = step(state, { type: 'end-turn', playerId: 'P2' }); expectDamage(state, 1);

state = setup(); state.players.P1.character = 'john-christ';
state.players.P2.hand = [{ instanceId: 'john-burning', cardId: 'burning', sourcePlayerId: 'P1' }];
state = step(state, { type: 'end-turn', playerId: 'P2' });
assert.equal(state.players.P1.matchStats.perkDamage, 1); assert.equal(state.players.P1.matchStats.attackDamage, 0, 'Other characters keep existing attribution.');

let ffa = createHotseatTestState(true, 'fyrebanks', 3, 'orkk');
ffa.phase = 'active'; ffa.activePlayerId = 'P2'; ffa.objects = []; ffa.elevations = {};
for (const p of Object.values(ffa.players)) { p.hand = []; p.deck = []; p.discard = []; p.spellEcho = [null, null, null]; }
ffa.players.P3.character = 'fyrebanks';
ffa.players.P2.hand = [
  { instanceId: 'fyre-one', cardId: 'burning', sourcePlayerId: 'P1' },
  { instanceId: 'fyre-three', cardId: 'burning', sourcePlayerId: 'P3' },
  { instanceId: 'self-two', cardId: 'burning', sourcePlayerId: 'P2' },
];
ffa = step(ffa, { type: 'end-turn', playerId: 'P2' });
assert.equal(ffa.players.P1.matchStats.attackDamage, 1); assert.equal(ffa.players.P3.matchStats.attackDamage, 1);
assert.equal(ffa.players.P2.matchStats.totalDamage, 0, 'Multiple Fyrebanks split credit by each Card’s original source.');

state = setup(); state.activePlayerId = 'P1'; state.players.P1.position = cell('B2'); state.players.P2.position = cell('G7');
state.players.P1.hand = [{ instanceId: 'pyrodash', cardId: 'pyrodash' }, { instanceId: 'fuel', cardId: 'burning', sourcePlayerId: 'P2' }];
state.objects = [{ id: 'box', name: 'Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell('C2') }];
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'pyrodash', targetKind: 'object', targetId: 'box' });
expectDamage(state, 0); assert.equal(state.players.P2.matchStats.totalDamage, 0, 'Damage-free Pyrodash payment creates no Damage credit.');

for (const environmental of [false, true]) {
  state = setup(); state.players.P2.character = 'wreckna'; state.players.P2.wrecknaInsideTombId = 'protected-tomb';
  state.objects = [{ id: 'protected-tomb', name: 'Tomb', kind: 'tomb', hp: 3, maxHp: 3, position: state.players.P2.position }];
  state.players.P2.hand = [{ instanceId: 'tomb-burning', cardId: 'burning', sourcePlayerId: 'P1', environmentalBurning: environmental }];
  state = step(state, { type: 'end-turn', playerId: 'P2' });
  assert.equal(state.players.P2.hp, environmental ? 19 : 20, 'Stat attribution preserves existing environmental and enemy-source Tomb protection.');
  expectDamage(state, environmental ? 1 : 0);
}

state = setup(); state.players.P2.character = 'fyrebanks';
state.players.P2.hand = [{ instanceId: 'self-burning', cardId: 'burning', sourcePlayerId: 'P2' }];
state = step(state, { type: 'end-turn', playerId: 'P2' }); expectDamage(state, 0);
assert.equal(state.players.P2.matchStats.totalDamage, 0, 'Self-damage never inflates Damage dealt.');

console.log('Burning statistics passed: Dash/turn-end Attack credit, grouped Rage, prevention/actual HP loss, terrain/deferred/forced/absorbed provenance, undo, other sources and self-damage.');
