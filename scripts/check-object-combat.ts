import assert from 'node:assert/strict';
import { CARDS, applyCommand, createHotseatTestState, type CardTypeId, type GameCommand, type GameState, type HotseatCharacterId } from '../shared/game.ts';

function setup(cardId: CardTypeId, character: HotseatCharacterId = 'shinobi'): GameState {
  const state = createHotseatTestState(true, character, 2, 'dummy');
  state.phase = 'active';
  state.elevations = {};
  state.players.P1.position = { x: 2, y: 2 };
  state.players.P2.position = { x: 7, y: 6 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId }];
  state.players.P1.deck = [{ instanceId: 'draw', cardId: 'attack-2' }];
  state.players.P1.discard = [];
  state.players.P1.merylinSummonActive = character === 'merylin';
  state.objects = [{ id: 'target', kind: 'wooden-box', name: 'Box', position: { x: 3, y: 2 }, hp: 3, maxHp: 3 }];
  return state;
}
function command(state: GameState, cmd: GameCommand): GameState {
  const result = applyCommand(state, cmd);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
function attack(state: GameState): GameState {
  return command(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetKind: 'object', targetId: 'target' });
}

// Every Attack Card must resolve against a destructible Object without requiring
// a nonexistent defender's Hand or transferring effects to the Object's owner.
for (const card of CARDS.filter((entry) => entry.kind === 'attack')) {
  let state = attack(setup(card.id));
  if (card.id === 'lightbringer') state = command(state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap: false });
  assert.equal(state.objects.some((object) => object.id === 'target'), false, card.name);
  assert.equal(state.pendingAttack, null, card.name);
  assert.equal(state.players.P2.hp, state.players.P2.maxHp, `${card.name} must not damage a remote character`);
}

for (const kind of ['wooden-box', 'tomb', 'orkk-shield', 'spirit-guardian'] as const) {
  const initial = setup('light-the-saber');
  initial.objects[0].kind = kind;
  initial.objects[0].ownerId = 'P2';
  const enemyHand = structuredClone(initial.players.P2.hand);
  const result = attack(initial);
  assert.equal(result.players.P1.lightsaberBuff, true, kind);
  assert.equal(result.players.P1.lightsaberMovementProtection, true, kind);
  assert.equal(result.players.P2.pinnedStacks, 0, 'Object ownership does not transfer the -MOV effect');
  assert.deepEqual(result.players.P2.hand, enemyHand);
}
const cursed = setup('light-the-saber');
cursed.players.P1.traitBlocked = true;
assert.equal(attack(cursed).players.P1.lightsaberAppliedWhileTraitBlocked, true);

for (const [cardId, blessing] of [['blessed-light', 'blessing-light'], ['blessed-might', 'blessing-might']] as const) {
  assert.equal(attack(setup(cardId, 'john-christ')).players.P1.hand.some((card) => card.cardId === blessing), true);
}
const judgement = setup('judgement', 'john-christ');
judgement.players.P1.spiritForm = true;
const judged = attack(judgement);
assert.equal(judged.players.P1.stoicShell, true);
assert.equal(judged.players.P1.spiritForm, false);
assert.equal(judged.players.P1.discard.some((card) => card.cardId === 'judgement'), false);

const repent = setup('repent', 'john-christ');
repent.players.P2.position = { x: 2, y: 3 };
const repented = attack(repent);
assert.equal(repented.players.P1.hp, repent.players.P1.hp - 1);
assert.equal(repented.players.P2.hp, repent.players.P2.hp - 2);
assert.equal(repented.players.P1.matchStats.attackDamage, 2);
assert.equal(repented.spellProjectiles.some((event) => event.style === 'holy-fire'), true);

let barter = attack(setup('shadow-barter', 'wreckna'));
assert.equal(barter.players.P1.hand.some((card) => card.instanceId === 'draw'), true);
assert.equal(barter.phase, 'shadow-barter-tomb-offer');
barter = command(barter, { type: 'shadow-barter-tomb-choice', playerId: 'P1', use: true });
barter = command(barter, { type: 'shadow-barter-tomb-square', playerId: 'P1', to: { x: 3, y: 2 } });
assert.equal(barter.objects.some((object) => object.kind === 'tomb' && object.ownerId === 'P1'), true);
assert.equal(barter.phase, 'active');

const isolated = attack(setup('solitude', 'spectre'));
assert.equal(isolated.log.some((line) => line.includes('resolved Value 5')), true);
const crowded = setup('solitude', 'spectre');
crowded.players.P2.position = { x: 4, y: 2 };
assert.equal(attack(crowded).log.some((line) => line.includes('resolved Value 3')), true);
assert.equal(attack(setup('drain-strength', 'wreckna')).log.some((line) => line.includes('resolved Value 1')), true);

for (const swap of [true, false]) {
  const initial = setup('lightbringer', 'merylin');
  let state = attack(initial);
  assert.equal(state.phase, 'choosing-lightbringer-swap');
  assert.equal(state.players.P1.actionsRemaining, initial.players.P1.actionsRemaining);
  assert.equal(state.objects.some((object) => object.id === 'target'), true);
  assert.equal(applyCommand(state, { type: 'lightbringer-swap-decision', playerId: 'P2', swap }).ok, false);
  state = command(state, { type: 'lightbringer-swap-decision', playerId: 'P1', swap });
  assert.deepEqual(state.players.P1.position, swap ? { x: 3, y: 2 } : { x: 2, y: 2 });
  assert.equal(state.objects.some((object) => object.id === 'target'), false);
  assert.equal(state.players.P1.actionsRemaining, initial.players.P1.actionsRemaining - 1);
}

assert.equal(attack(setup('fistbolt', 'orkk')).players.P1.rageStacks, 2, 'Fistbolt grants Rage before and after combat');
assert.equal(attack(setup('shield-bash', 'orkk')).players.P1.rageStacks, 1);
const chain = setup('chain-punchin', 'orkk');
chain.players.P1.shieldEquipped = false;
assert.equal(attack(chain).players.P1.actionsRemaining, chain.players.P1.actionsRemaining);
assert.equal(attack(setup('dance-through')).phase, 'dance-through');
for (const cardId of ['cut-them-legs', 'snowball-effect', 'deja-vu', 'sting'] as const) {
  const state = attack(setup(cardId));
  assert.equal(state.players.P1.hand.some((card) => card.instanceId === 'attack'), true, cardId);
}
const snowball = setup('snowball-effect', 'magician');
snowball.players.P1.manaMode = 'consume';
assert.equal(attack(snowball).phase, 'choosing-snowball-discard');
for (const mode of ['generate', 'consume'] as const) {
  const bolt = setup('arcane-bolt', 'magician');
  bolt.players.P1.manaMode = mode;
  assert.equal(attack(bolt).players.P1.arcaneBoltAttackBonus, mode === 'consume' ? 2 : 1);
}
let frost = attack(setup('frostmourne', 'merylin'));
assert.equal(frost.phase, 'choosing-frostmourne');
const frostHp = frost.players.P1.hp;
frost = command(frost, { type: 'frostmourne-decision', playerId: 'P1', use: true });
assert.equal(frost.players.P1.hp, frostHp - 1);
assert.equal(frost.players.P1.merylinSummonActive, true);
assert.equal(frost.players.P1.deck.at(-1)?.instanceId, 'attack');
assert.equal(frost.phase, 'active');

const echo = setup('echo-strike', 'spectre');
echo.players.P2.position = { x: 6, y: 5 };
echo.objects.push({ id: 'replica', name: 'Replica', kind: 'spectre-replica', ownerId: 'P1', position: { x: 6, y: 4 }, hp: 999, maxHp: 999 });
assert.equal(attack(echo).players.P2.hp, echo.players.P2.hp - 1);
const moonlight = setup('moonlight', 'merylin');
moonlight.players.P2.position = { x: 5, y: 2 };
moonlight.objects.push({ id: 'wave-box', name: 'Wave Box', kind: 'wooden-box', position: { x: 4, y: 2 }, hp: 3, maxHp: 3 });
const wave = attack(moonlight);
assert.equal(wave.players.P2.hp, moonlight.players.P2.hp - 2);
assert.equal(wave.objects.some((object) => object.id === 'wave-box'), false);
const sting = setup('sting', 'merylin');
sting.players.P2.position = { x: 2, y: 4 };
const stung = attack(sting);
assert.equal(stung.players.P1.merylinSummonActive, true);
assert.equal(stung.players.P1.hand.some((card) => card.instanceId === 'draw'), true);
const invincible = setup('light-the-saber');
Object.assign(invincible.objects[0], { kind: 'spirit-guardian', guardianLevel: 2, ownerId: 'P2' });
const ignored = attack(invincible);
assert.equal(ignored.objects.some((object) => object.id === 'target'), true);
assert.equal(ignored.players.P1.lightsaberBuff, true, 'An invincible target does not cancel self effects');
console.log('Object combat checks passed.');
