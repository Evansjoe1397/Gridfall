import assert from 'node:assert/strict';
import { applyCommand, cardDefinition, createHotseatTestState, modifySquare, summonLens, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(stack = true): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell('D4'); state.players.P2.position = cell('E4');
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'pocket-lens' }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'defend-1' }];
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function fight(state: GameState, defense: CardTypeId = 'defend-1', heated = false, declared = false): GameState {
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  if (heated) state.players.P2.hand.push({ instanceId: 'heated', cardId: 'heated-debate' });
  if (!declared) state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selected = (state as any).combatStackSelections ?? {};
    const playerId = selected.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: heated && playerId === 'P2' ? 'heated' : null });
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const lenses = (state: GameState) => state.objects.filter((object) => object.kind === 'lens');
const held = (state: GameState) => state.players.P1.hand.some((card) => card.instanceId === 'attack');
const burning = (state: GameState, id: 'P1' | 'P2' = 'P2') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;
const object = (id: string, at: string, kind: 'wooden-box' | 'wall-pillar' = 'wooden-box') => ({ id, name: id, kind, position: cell(at), hp: 1, maxHp: 1 });
const card = cardDefinition({ instanceId: '', cardId: 'pocket-lens' });
assert.equal(card.name, 'Pocket Lens'); assert.equal(card.kind, 'attack'); assert.equal(card.value, 2);
assert.ok(createHotseatTestState(false, 'fyrebanks', 2, 'fyrebanks').players.P1.hand.some((card) => card.cardId === 'pocket-lens'));
for (const stack of [false, true]) {
  // Both creation Cards share one global Lens, including across owners.
  let sequence = setup(stack);
  sequence.players.P1.hand.push({ instanceId: 'summon-first', cardId: 'lens' });
  sequence = step(sequence, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'summon-first', destination: 'direct' });
  sequence = step(sequence, { type: 'lens-square', playerId: 'P1', to: cell('C3') });
  const summonedId = lenses(sequence)[0].id;
  sequence = acknowledge(fight(sequence));
  assert.equal(lenses(sequence).length, 1); assert.notEqual(lenses(sequence)[0].id, summonedId);
  assert.deepEqual(lenses(sequence)[0].position, cell('D4'), 'Pocket Lens replaces a Lens created by Summon Lens.');
  const pocketId = lenses(sequence)[0].id;
  sequence = step(sequence, { type: 'end-turn', playerId: 'P1' });
  sequence.players.P2.hand.push({ instanceId: 'summon-second', cardId: 'lens' });
  sequence = step(sequence, { type: 'play-perk', playerId: 'P2', cardInstanceId: 'summon-second', destination: 'direct' });
  sequence = step(sequence, { type: 'lens-square', playerId: 'P2', to: cell('F4') });
  assert.equal(lenses(sequence).length, 1); assert.notEqual(lenses(sequence)[0].id, pocketId);
  assert.equal(lenses(sequence)[0].ownerId, 'P2'); assert.deepEqual(lenses(sequence)[0].position, cell('F4'), 'Enemy Summon Lens replaces the Pocket Lens too.');
  for (const [range, target, landing] of [[2, 'F4', 'C4'], [2, 'E4', 'B4'], [3, 'E4', 'A4']] as const) {
    let state = setup(stack); state.players.P1.attackRange = range; state.players.P2.position = cell(target); state.players.P1.movementRemaining = 5;
    assert.ok(summonLens(state, 'P1', cell('H7'))); const oldLens = lenses(state)[0].id;
    state = fight(state); assert.deepEqual(state.players.P1.position, cell('D4')); assert.equal(lenses(state)[0].id, oldLens);
    state = acknowledge(state);
    assert.deepEqual(state.players.P1.position, cell(landing)); assert.equal(state.players.P1.movementRemaining, 5);
    assert.equal(lenses(state).length, 1); assert.deepEqual(lenses(state)[0].position, cell('D4')); assert.notEqual(lenses(state)[0].id, oldLens);
    assert.equal(held(state), false); assert.equal(burning(state), 1);
    assert.equal(state.players.P1.visualMovement?.sourceCardId, 'pocket-lens');
    assert.equal(state.players.P1.actionsRemaining, 1);
  }
  for (const defense of ['counterflame', 'not-a-shinobi'] as const) {
    let state = acknowledge(fight(setup(stack), defense));
    assert.ok(held(state), `${defense}: tie/loss returns the used instance.`); assert.equal(burning(state), 0);
    assert.deepEqual(state.players.P1.position, cell('B4')); assert.deepEqual(lenses(state)[0].position, cell('D4'));
  }
  let state = acknowledge(fight(setup(stack), 'block'));
  assert.deepEqual(state.players.P1.position, cell('D4')); assert.equal(lenses(state).length, 0); assert.equal(held(state), false); assert.equal(burning(state), 0);
  state = setup(stack); state.players.P1.traitBlocked = true; assert.ok(summonLens(state, 'P1', cell('H7')));
  const oldId = lenses(state)[0].id; state = acknowledge(fight(state));
  assert.deepEqual(state.players.P1.position, cell('D4')); assert.notEqual(lenses(state)[0].id, oldId, 'Zero FP uses the common adjacent fallback.'); assert.deepEqual(lenses(state)[0].position, cell('D3')); assert.equal(burning(state), 1);
  state = setup(stack); state.objects.push(object('Column', 'C4', 'wall-pillar')); const hp = state.players.P1.hp;
  state = acknowledge(fight(state)); assert.deepEqual(state.players.P1.position, cell('D4')); assert.equal(state.players.P1.hp, hp); assert.deepEqual(lenses(state)[0].position, cell('D3'));
  state = setup(stack); state.players.P1.attackRange = 3; state.objects.push(object('Box', 'C4'));
  state = acknowledge(fight(state)); assert.deepEqual(state.players.P1.position, cell('D4')); assert.deepEqual(state.objects.find((entry) => entry.id === 'Box')?.position, cell('A4')); assert.deepEqual(lenses(state)[0].position, cell('D3'));
  state = setup(stack); state.players.P1.position = cell('A4'); state.players.P2.position = cell('B4');
  state = acknowledge(fight(state)); assert.deepEqual(state.players.P1.position, cell('A4')); assert.deepEqual(lenses(state)[0].position, cell('A3'), 'Edge blocks retreat; use a vacant common adjacent Square.');
  for (const existing of [false, true]) {
    state = setup(stack); state.objects.push(object('Retreat Column', 'C4', 'wall-pillar'));
    for (const label of ['D3', 'D5', 'E3', 'E5']) state.objects.push(object(`Block ${label}`, label));
    if (existing) assert.ok(summonLens(state, 'P1', cell('H7')));
    const previous = lenses(state)[0]?.id;
    state = acknowledge(fight(state));
    assert.equal(lenses(state).length, existing ? 1 : 0, 'No common vacant Square means no new Lens.');
    assert.equal(lenses(state)[0]?.id, previous, 'Failed fallback preserves the existing singleton.');
  }
  state = setup(stack); state.players.P2.position = cell('F4'); state.objects.push(object('Retreat Column', 'C4', 'wall-pillar'));
  state = acknowledge(fight(state)); assert.deepEqual(lenses(state)[0].position, cell('E4'), 'Prefer the nearest orthogonal common Square.');
  state = setup(stack); state.players.P2.position = cell('F4'); state.objects.push(object('Retreat Column', 'C4', 'wall-pillar'));
  assert.ok(summonLens(state, 'P1', cell('E4'))); const occupyingLens = lenses(state)[0].id;
  state = acknowledge(fight(state)); assert.equal(lenses(state).length, 1); assert.notEqual(lenses(state)[0].id, occupyingLens);
  assert.deepEqual(lenses(state)[0].position, cell('E3'), 'Occupied nearest candidates are skipped before replacing the old Lens.');
  state = setup(stack); state.players.P2.position = cell('E5'); state.objects.push(object('Diagonal Column', 'C3', 'wall-pillar'));
  state = acknowledge(fight(state)); assert.deepEqual(lenses(state)[0].position, cell('D5'), 'Diagonal targets also require adjacency to both bodies.');
  state = setup(stack); state.objects.push(object('Partial Retreat Column', 'B4', 'wall-pillar'));
  state = acknowledge(fight(state)); assert.deepEqual(state.players.P1.position, cell('C4')); assert.deepEqual(lenses(state)[0].position, cell('D4'), 'A partial retreat still uses the vacated origin.');
  state = setup(stack); state.players.P2.position = cell('G4'); state.objects.push(object('Retreat Column', 'C4', 'wall-pillar'));
  assert.ok(summonLens(state, 'P1', cell('E4'))); const remoteTargetLens = lenses(state)[0].id;
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: remoteTargetLens });
  state = step(state, { type: 'lens-target', playerId: 'P1', targetId: 'P2', targetKind: 'player' });
  state = acknowledge(fight(state, 'defend-1', false, true));
  assert.equal(lenses(state)[0].id, remoteTargetLens, 'Use the actual magnified enemy, not the intermediary Lens, for common adjacency.');
  state = setup(stack); Object.assign(state, { arenaId: 'trench' }); state.elevations = { D4: 1 };
  state = acknowledge(fight(state)); assert.deepEqual(state.players.P1.position, cell('A4'), 'High Ground into C4 Slide grants the extra step.'); assert.deepEqual(lenses(state)[0].position, cell('D4'));
  state = setup(stack); state.players.P1.position = cell('E4'); state.players.P2.position = cell('F4'); state.players.P1.attackRange = 3;
  Object.assign(state, { arenaId: 'trench' }); state.elevations = { D4: 1 }; state.objects.push(object('Sliding Box', 'D4'));
  state = acknowledge(fight(state)); assert.deepEqual(state.players.P1.position, cell('E4')); assert.deepEqual(state.objects.find((entry) => entry.id === 'Sliding Box')?.position, cell('A4'), 'Transferred momentum also respects Object Slides.');
  state = setup(stack); state.players.P2.position = cell('F5'); assert.ok(summonLens(state, 'P1', cell('E4')));
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: lenses(state)[0].id });
  state = step(state, { type: 'lens-target', playerId: 'P1', targetId: 'P2', targetKind: 'player' });
  state = acknowledge(fight(state, 'defend-1', false, true));
  assert.deepEqual(state.players.P1.position, cell('A4'), 'Magnified Attack retreats opposite the incoming Lens leg.'); assert.equal(lenses(state).length, 1); assert.deepEqual(lenses(state)[0].position, cell('D4'));
  state = acknowledge(fight(setup(stack), 'fire-shield'));
  assert.equal(burning(state), 1); assert.equal(burning(state, 'P1'), 1, 'Pocket Lens Burning precedes Fire Shield retaliation.');
  state = setup(stack); assert.ok(modifySquare(state, cell('C4'), 'patch-of-flames'));
  state = acknowledge(fight(state)); assert.equal(burning(state, 'P1'), 2); assert.equal(state.players.P1.pyroCharges, 0, 'Retreat crosses terrain fire without gaining Charges.');
  state = setup(stack); state.players.P1.hp = 1; state.players.P2.flameWard = { level: 2, triggered: false };
  state = acknowledge(fight(state)); assert.equal(state.players.P1.hp, 0); assert.deepEqual(state.players.P1.position, cell('C4'));
  assert.equal(lenses(state).length, 0); assert.equal(burning(state), 0, 'A lethal Ward stops the retreat and remaining effects.');
  state = setup(stack); Object.assign(state, { arenaId: 'pipe', pipeTurnIndex: 0, pipeFloodUntil: { 2: 4 } });
  state.players.P1.position = cell('C1'); state.players.P2.position = cell('B1'); state.players.P1.attackRange = 3;
  state.elevations = { D1: 1 }; state.objects.push(object('Flood Sliding Box', 'D1'));
  state = acknowledge(fight(state)); assert.deepEqual(state.objects.find((entry) => entry.id === 'Flood Sliding Box')?.position, cell('H1'), 'Object inertia continues along flooded Pipe Slide water.');
}
let state = setup(); state.players.P2.position = cell('H8'); state.objects.push(object('Target Box', 'E4'));
state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'Target Box' });
assert.deepEqual(state.players.P1.position, cell('B4')); assert.equal(lenses(state).length, 1); assert.deepEqual(lenses(state)[0].position, cell('D4')); assert.equal(held(state), false);
state = acknowledge(fight(setup(), 'defend-1', true));
assert.deepEqual(state.players.P1.position, cell('D4')); assert.equal(lenses(state).length, 0); assert.equal(burning(state), 0, 'Heated Debate cancels all after-combat effects.');
console.log('Pocket Lens checks passed: captured FP, wins/ties/losses, return identity, cancellation, Lens replacement/magnification, blocked origins, momentum transfer, character/Object Slides, Object Attacks and Fire Shield timing.');
