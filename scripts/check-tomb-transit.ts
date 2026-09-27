import assert from 'node:assert/strict';
import { addForcedStatusCard, applyCommand, createHotseatTestState, dealDamage, type BoardObject, type Cell, type GameState } from '../shared/game.ts';

const cell = (label: string): Cell => ({ x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 });
const step = (state: GameState, command: Parameters<typeof applyCommand>[1]): GameState => {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
};
const tomb = (label: string): BoardObject => ({ id: 'occupied-tomb', name: "Wreckna's Tomb", kind: 'tomb', ownerId: 'P2', hp: 3, maxHp: 3, heavy: true, position: cell(label) });
const box = (label: string): BoardObject => ({ id: 'thrown-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: cell(label) });
const setup = (character: 'magician' | 'orkk' | 'shinobi' | 'john-christ' = 'magician'): GameState => {
  const state = createHotseatTestState(true, character, 2, 'wreckna');
  state.phase = 'active'; state.activePlayerId = 'P1';
  state.players.P1.position = cell('B2');
  state.players.P2.position = cell('D2');
  state.players.P2.wrecknaInsideTombId = 'occupied-tomb';
  state.objects = [tomb('D2')];
  return state;
};

const magic = setup();
magic.phase = 'choosing-magic-hand-direction';
magic.magicHand = { casterId: 'P1', level: 1, distance: 2, consume: false, targetKind: 'object', targetId: 'occupied-tomb', undo: null };
const pushed = step(magic, { type: 'magic-hand-direction', playerId: 'P1', to: cell('F2') });
assert.deepEqual(pushed.objects.find((object) => object.id === 'occupied-tomb')?.position, cell('E2'), 'A Heavy Tomb moves one Square.');
assert.deepEqual(pushed.players.P2.position, cell('E2'), 'Wreckna moves with his Tomb.');
assert.equal(pushed.players.P2.wrecknaInsideTombId, 'occupied-tomb');

const pull = setup();
pull.phase = 'choosing-force-pull-target';
pull.forcePull = { casterId: 'P1', level: 1, distance: 2, targetRange: 4, undo: null };
const pulled = step(pull, { type: 'force-pull-target', playerId: 'P1', targetKind: 'player', targetId: 'P2' });
assert.deepEqual(pulled.objects.find((object) => object.id === 'occupied-tomb')?.position, cell('C2'), 'Pulling entombed Wreckna pulls the Heavy Tomb one Square.');
assert.deepEqual(pulled.players.P2.position, cell('C2'));
assert.equal(pulled.players.P2.wrecknaInsideTombId, 'occupied-tomb');

const force = setup('shinobi');
force.objects.push(box('C2'));
force.phase = 'choosing-force-throw-direction';
force.forceThrow = { casterId: 'P1', level: 3, distance: 2, targetRange: 3, targetKind: 'object', targetId: 'thrown-box', undo: null };
const forceHp = force.players.P2.hp;
const forceHit = step(force, { type: 'force-throw-direction', playerId: 'P1', to: cell('E2') });
assert.equal(forceHit.objects.some((object) => object.id === 'occupied-tomb'), false, 'Force Throw collision destroys the Tomb.');
assert.equal(forceHit.players.P2.hp, forceHp, 'The Tomb absorbs collision Damage before Wreckna.');
assert.equal(forceHit.players.P2.wrecknaInsideTombId, null);
assert.deepEqual(forceHit.players.P2.position, cell('D2'), 'Wreckna is exposed on the destroyed Tomb Square.');

const kyk = setup('orkk');
kyk.objects.push(box('C2'));
kyk.phase = 'choosing-kyk-direction';
kyk.forceThrow = { casterId: 'P1', level: 1, distance: 2, targetRange: 1, targetKind: 'object', targetId: 'thrown-box', undo: null };
const kykHp = kyk.players.P2.hp;
const kykHit = step(kyk, { type: 'kyk-direction', playerId: 'P1', to: cell('D2') });
assert.equal(kykHit.objects.some((object) => object.id === 'occupied-tomb'), false, 'Kyk destroys the Tomb it strikes.');
assert.equal(kykHit.players.P2.hp, kykHp, 'Kyk does not damage Wreckna inside the Tomb.');
assert.deepEqual(kykHit.players.P2.position, cell('D2'));

const protectedStatus = setup();
assert.equal(addForcedStatusCard(protectedStatus, protectedStatus.players.P2, 'headache', 'hand', 'P1'), false);
assert.equal(protectedStatus.players.P2.hand.some((card) => card.cardId === 'headache'), false);
const protectedHp = protectedStatus.players.P2.hp;
assert.equal(dealDamage(protectedStatus, protectedStatus.players.P2, 2, false, 'P1', 'perk'), 0, 'A Tomb prevents direct enemy Damage to Wreckna.');
assert.equal(protectedStatus.players.P2.hp, protectedHp);

for (const kind of ['dance-through', 'double-jump'] as const) {
  const transit = setup('shinobi');
  transit.players.P1.position = cell('C2');
  transit.phase = kind;
  if (kind === 'dance-through') transit.danceThrough = { stepsRemaining: 2, enemyUnderfoot: null, damagePrevented: false };
  else transit.doubleJump = { playerId: 'P1', stepsRemaining: 2, enemyUnderfoot: null, resumePhase: 'active' };
  const entered = step(transit, { type: 'move', playerId: 'P1', to: cell('D2') });
  const exited = step(entered, { type: 'move', playerId: 'P1', to: cell('E2') });
  assert.equal(exited.players.P2.hand.some((card) => card.cardId === 'pinned'), false, `${kind} cannot Pin Wreckna inside a Tomb.`);
}

const spirit = setup('john-christ');
spirit.players.P1.position = cell('C2');
spirit.players.P1.spiritForm = true;
spirit.players.P1.freeMoveUsed = true;
spirit.players.P1.movementRemaining = 2;
let crossed = step(spirit, { type: 'move', playerId: 'P1', to: cell('D2') });
crossed = step(crossed, { type: 'move', playerId: 'P1', to: cell('E2') });
assert.equal(crossed.players.P2.spiritSiphonedMovement, 0, 'Spirit Form cannot siphon MOV from entombed Wreckna.');

const repent = setup('john-christ');
repent.players.P1.position = cell('C2');
repent.objects.push(box('C3'));
repent.players.P1.hand = [{ instanceId: 'repent-tomb-exception', cardId: 'repent' }];
const repentHp = repent.players.P2.hp;
const burned = step(repent, { type: 'attack', playerId: 'P1', cardInstanceId: 'repent-tomb-exception', targetId: 'thrown-box', targetKind: 'object' });
assert.equal(burned.players.P2.hp, repentHp - 2, 'Repent AoE still burns Wreckna inside a Tomb.');
assert.equal(burned.players.P2.wrecknaInsideTombId, 'occupied-tomb');

console.log('Tomb transit and protection checks passed.');
