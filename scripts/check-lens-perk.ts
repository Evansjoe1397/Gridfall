import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { activeWrecknaPhylactery, applyCommand, canUndoLastAction, cardDefinition, createHotseatTestState, lensPushSquareEligible, lensSummonSquareEligible, pinnedCount, spiritGuardianEnemyPenalty, summonLens, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';

const cell = (label: string) => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
function setup(stack = true): GameState {
  const state = createHotseatTestState(true, 'fyrebanks', 2, 'shinobi');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const player of Object.values(state.players)) { player.hand = []; player.deck = []; player.discard = []; player.spellEcho = [null, null, null]; }
  state.players.P1.position = cell('B2'); state.players.P2.position = cell('E2');
  state.players.P1.hand = [{ instanceId: 'perk', cardId: 'lens' }, { instanceId: 'attack', cardId: 'attack-2' }];
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
  state.players.P1.hand = state.players.P1.hand.filter((card) => card.instanceId !== 'perk');
  state.players.P1.spellEcho[level - 1] = { instanceId: 'perk', cardId: 'lens' };
  return step(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
}
function place(state: GameState, at = 'C2'): GameState { return step(state, { type: 'lens-square', playerId: 'P1', to: cell(at) }); }
function keep(state: GameState): GameState { return step(state, { type: 'lens-push', playerId: 'P1', to: null }); }
function fight(state: GameState, defense: CardTypeId = 'defend-1', through = true): GameState {
  state.players.P2.hand = [{ instanceId: 'defense', cardId: defense }];
  if (through) {
    state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects.find((object) => object.kind === 'lens')!.id });
    state = step(state, { type: 'lens-target', playerId: 'P1', targetId: 'P2', targetKind: 'player' });
  } else state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const choices = (state as any).combatStackSelections ?? {};
    state = step(state, { type: 'combat-stack-choice', playerId: choices.P1 === undefined ? 'P1' : 'P2', cardInstanceId: null });
  }
  return state;
}
const acknowledge = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const burning = (state: GameState, id: 'P1' | 'P2') => state.players[id].hand.filter((card) => card.cardId === 'burning').length;

for (const player of Object.values(createHotseatTestState(true, 'fyrebanks', 2, 'fyrebanks').players)) assert.equal([...player.hand, ...player.deck].some((card) => card.cardId === 'lens'), false, 'lens is outside the base starting pool.');
assert.equal(cardDefinition({ instanceId: '', cardId: 'lens' }).name, 'Summon Lens');
for (const level of [1, 2, 3] as const) {
  let state = setup(); assert.ok(summonLens(state, 'P1', cell('G7')));
  const oldId = state.objects[0].id;
  state = use(state, level);
  assert.equal(state.phase, 'choosing-lens-square'); assert.ok(canUndoLastAction(state, 'P1'));
  assert.equal(state.objects[0].id, oldId, 'Existing Lens remains until a valid placement is selected.');
  assert.equal(applyCommand(state, { type: 'lens-square', playerId: 'P2', to: cell('D2') }).ok, false);
  assert.equal(applyCommand(state, { type: 'lens-square', playerId: 'P1', to: cell('F6') }).ok, false);
  assert.equal(lensSummonSquareEligible(state, 'P1', cell('B2')), false);
  state = place(state); assert.equal(state.objects.filter((object) => object.kind === 'lens').length, 1);
  assert.notEqual(state.objects[0].id, oldId); assert.deepEqual(state.objects[0].position, cell('C2'));
  if (level >= 2) {
    assert.equal(state.phase, 'choosing-lens-push');
    assert.equal(state.players.P1.lensBurningReady ?? false, false, 'Level 3 follows placement and optional push.');
    assert.equal(lensPushSquareEligible(state, 'P1', cell('B2')), false);
    assert.equal(applyCommand(state, { type: 'lens-push', playerId: 'P1', to: cell('B2') }).ok, false);
    assert.ok(lensPushSquareEligible(state, 'P1', cell('C3')), 'Perpendicular directions follow Force Throw rules.');
    state = keep(state);
  }
  assert.equal(state.phase, 'active'); assert.equal(state.players.P1.actionsRemaining, 1);
  assert.equal(Boolean(state.players.P1.lensBurningReady), level === 3);
  assert.ok(canUndoLastAction(state, 'P1'));
  state = step(state, { type: 'undo-last-action', playerId: 'P1' });
  assert.equal(state.objects[0].id, oldId); assert.deepEqual(state.objects[0].position, cell('G7'));
  assert.equal(state.players.P1.lensBurningReady ?? false, false);
}
let state = setup(); assert.ok(summonLens(state, 'P1', cell('G7')));
const oldId = state.objects[0].id;
state = use(state, 3);
state = step(place(state), { type: 'cancel-targeting', playerId: 'P1' });
assert.equal(state.objects[0].id, oldId, 'Cancellation restores the state from before the Perk, including Objects.');
assert.equal(state.players.P1.actionsRemaining, 2);
state = place(use(setup(), 2)); state = step(state, { type: 'lens-push', playerId: 'P1', to: cell('D2') });
assert.deepEqual(state.objects[0].position, cell('D2'));
state = setup(); state.players.P2.position = cell('D2'); state = place(use(state, 2));
const hp = state.players.P2.hp;
state = step(state, { type: 'lens-push', playerId: 'P1', to: cell('D2') });
assert.equal(state.players.P2.hp, hp - 1, 'Collision deals exactly 1 Perk Damage.');
const survivingLens = state.objects.find((object) => object.kind === 'lens');
assert.ok(survivingLens, 'Lens Perk collision does not destroy the Lens.');
assert.deepEqual(state.players.P2.position, cell('E2'), 'Lens collision pushes the enemy one Square.');
assert.deepEqual(survivingLens.position, cell('D2'), 'Lens takes the vacated enemy Square.');
assert.equal(survivingLens.hp, 1);
assert.equal(state.objectPushAnimations.some((event) => event.objectId === survivingLens.id && event.removeOnComplete), false, 'Collision animation keeps the Lens model.');

for (const blocked of [false, true]) {
  state = setup(); state.players.P2.position = cell('H8');
  state.objects.push({ id: 'box', name: 'Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: cell('D2') });
  if (blocked) state.objects.push({ id: 'column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell('E2') });
  state = place(use(state, 2)); state = step(state, { type: 'lens-push', playerId: 'P1', to: cell('D2') });
  assert.deepEqual(state.objects.find((object) => object.id === 'box')?.position, cell(blocked ? 'D2' : 'E2'));
  assert.deepEqual(state.objects.find((object) => object.kind === 'lens')?.position, cell(blocked ? 'C2' : 'D2'));
}
for (const barrier of ['column', 'edge', 'object'] as const) {
  state = setup(); state.players.P2.position = cell(barrier === 'edge' ? 'H2' : 'D2');
  if (barrier === 'edge') state.players.P1.position = cell('F2');
  else state.objects.push({ id: 'barrier', name: barrier, kind: barrier === 'column' ? 'wall-pillar' : 'wooden-box', hp: 999, maxHp: 999, position: cell('E2') });
  const beforeHp = state.players.P2.hp;
  state = place(use(state, 3), barrier === 'edge' ? 'G2' : 'C2');
  state = step(state, { type: 'lens-push', playerId: 'P1', to: cell(barrier === 'edge' ? 'H2' : 'D2') });
  assert.deepEqual(state.players.P2.position, cell(barrier === 'edge' ? 'H2' : 'D2'));
  assert.deepEqual(state.objects.find((object) => object.kind === 'lens')?.position, cell(barrier === 'edge' ? 'G2' : 'C2'));
  assert.equal(state.players.P2.hp, beforeHp - 2, 'Lens impact plus ordinary blocked-push collision each deal 1 Damage.');
  assert.equal(state.players.P1.lensBurningReady, true);
  state = step(state, { type: 'undo-last-action', playerId: 'P1' });
  assert.equal(state.players.P2.hp, beforeHp); assert.equal(state.objects.some((object) => object.kind === 'lens'), false);
}
state = setup(); state.objects.push({ id: 'column', name: 'Column', kind: 'wall-pillar', hp: 999, maxHp: 999, position: cell('D2') });
state = place(use(state, 2)); state = step(state, { type: 'lens-push', playerId: 'P1', to: cell('D2') });
assert.deepEqual(state.objects.find((object) => object.id === 'column')?.position, cell('D2'));
assert.deepEqual(state.objects.find((object) => object.kind === 'lens')?.position, cell('C2'));

// HG -> Slide grants one free continuation; low-ground entry grants none.
for (const high of [false, true]) {
  state = setup(); state.players.P1.position = cell('A2'); state.players.P2.position = cell('H8');
  Object.assign(state, { arenaId: 'trench' });
  state.elevations = high ? { B2: 1 } : {};
  state = place(use(state, 2), 'B2');
  state = step(state, { type: 'lens-push', playerId: 'P1', to: cell('C2') });
  assert.deepEqual(state.objects[0].position, cell(high ? 'D2' : 'C2'));
}
for (const flooded of [false, true]) {
  state = setup(); Object.assign(state, { arenaId: 'pipe', pipeTurnIndex: 0, pipeFloodUntil: flooded ? { 2: 4 } : {} });
  state.players.P1.position = cell('C1'); state.players.P2.position = cell('H8'); state.elevations = { D1: 1 };
  state = place(use(state, 2), 'D1');
  state = step(state, { type: 'lens-push', playerId: 'P1', to: cell('E1') });
  assert.deepEqual(state.objects[0].position, cell(flooded ? 'H1' : 'F1'), 'Pipe Slide continues across flooded water and stops at the edge.');
}

for (const stack of [false, true]) {
  for (const defense of ['defend-1', 'block', 'fire-shield'] as const) {
    state = keep(place(use(setup(stack), 3)));
    state.players.P2.character = defense === 'fire-shield' ? 'fyrebanks' : 'shinobi';
    state = fight(state, defense);
    assert.equal(burning(state, 'P2'), 0, 'Bonus waits for combat acknowledgement.');
    assert.equal(state.players.P1.lensBurningReady, undefined);
    state = acknowledge(state);
    assert.equal(burning(state, 'P2'), 1, 'Lens applies once even when the Attack Card effect is cancelled.');
    assert.equal(burning(state, 'P1'), 0, 'Late Burning cannot trigger Fire Shield retaliation in this combat.');
    assert.equal(state.pendingLensBurning, undefined);
    state = step(state, { type: 'ack-combat', playerId: 'P1' }); assert.equal(burning(state, 'P2'), 1);
  }
  state = keep(place(use(setup(stack), 3))); state.players.P2.position = cell('B3');
  state = acknowledge(fight(state, 'defend-1', false));
  assert.equal(state.players.P1.lensBurningReady, true, 'An ordinary Attack does not consume the Lens bonus.');
  assert.equal(burning(state, 'P2'), 0);
  state = keep(place(use(setup(stack), 3)));
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: state.objects[0].id });
  state = step(state, { type: 'cancel-targeting', playerId: 'P1' }); assert.equal(state.players.P1.lensBurningReady, true);
  state = keep(place(use(setup(stack), 3))); state.players.P1.hand[0].cardId = 'arch-beam';
  state = acknowledge(fight(state)); assert.equal(burning(state, 'P2'), 2, 'Arch Beam and Lens apply independently.');
  state = keep(place(use(setup(stack), 3))); state.players.P1.hand[0].cardId = 'pyrodash';
  state.players.P2.position = cell('D2'); state = acknowledge(fight(state));
  assert.equal(burning(state, 'P2'), 2, 'Pyrodash passes first; late Lens Burning follows the complete movement.');
  state = keep(place(use(setup(stack), 3))); state.players.P2.character = 'spectre';
  state = acknowledge(fight(state, 'split'));
  assert.equal(state.phase, 'choosing-spirit-guardian-square'); assert.equal(burning(state, 'P2'), 0);
  state = step(state, { type: 'spectre-replica-square', playerId: 'P2', to: cell('F3') });
  assert.equal(burning(state, 'P2'), 1, 'Wait until the defender completes Split placement.');
  state = keep(place(use(setup(stack), 3))); state.players.P2.character = 'spectre';
  for (const at of ['D1', 'D2', 'D3', 'E1', 'E3', 'F1', 'F2', 'F3']) state.objects.push({ id: at, name: 'Box', kind: 'wooden-box', hp: 1, maxHp: 1, position: cell(at) });
  state = acknowledge(fight(state, 'split'));
  assert.equal(state.phase, 'active'); assert.equal(burning(state, 'P2'), 1, 'An impossible Split finishes before Lens Burning without waiting for another action.');
}
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const status = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'playerStatusIcons')!;
const render = runInNewContext(ts.transpileModule(status.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nplayerStatusIcons;', {
  gameState: state, pinnedCount, activeWrecknaPhylactery, spiritGuardianEnemyPenalty,
  displayedStoicShell: (_id: string, value: boolean) => value, gameIcon: (name: string) => `<img data-icon="${name}">`,
}) as (player: GameState['players']['P1']) => string;
state.players.P1.lensBurningReady = true;
assert.match(render(state.players.P1), /data-icon="lens-burning"/);
assert.match(render(state.players.P1), /after both Cards’ post-combat effects finish/);
delete state.players.P1.lensBurningReady; assert.doesNotMatch(render(state.players.P1), /data-icon="lens-burning"/);
const handler = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'onBoardClick')!;
const commands: GameCommand[] = [];
const input = { gameState: place(use(setup(), 2)), suppressTouchBoardSelection: false, suppressNextBoardClick: false, pendingObjectAttackConfirmation: null,
  boardHitsAt: () => [{ object: { userData: { cell: cell('D2') } } }], selection: { getSnapshot: () => ({ context: { selection: { kind: 'none' } } }) },
  canLocalAct: () => true, dispatch: (command: GameCommand) => commands.push(command) };
const click = runInNewContext(ts.transpileModule(handler.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nonBoardClick;', input);
click({ button: 0 }); assert.equal(commands[0].type, 'lens-push');
input.gameState.phase = 'choosing-lens-square'; click({ button: 0 }); assert.equal(commands[1].type, 'lens-square');
assert.ok(source.includes('Keep Lens here'));
assert.ok(readFileSync(new URL('../src/assets/icons/lens-burning.svg', import.meta.url), 'utf8').includes('<svg'));
console.log('Lens Perk checks passed: all levels, chosen singleton replacement, optional push, Force Throw direction/collision, HG Slide, cancellation/undo, independent late Burning and status UI.');
