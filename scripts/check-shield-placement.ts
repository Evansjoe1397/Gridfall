import assert from 'node:assert/strict';
import { applyCommand, beginWrecknaPhylacteryChoice, createPipeTestState, createTrenchTestState, createHotseatTestState, shieldLandingAfterSlide, unequipOrkkShield, type GameState } from '../shared/game.ts';

for (const [makeState, approach, slide, landing] of [
  [createTrenchTestState, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }], // C3 -> C4 -> C5
  [createPipeTestState, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }], // D1 -> E1 -> F1
] as const) {
  const state = makeState(true, 'orkk', 'dummy');
  state.objects = [];
  state.players.P1.position = approach;
  state.players.P2.position = { x: 8, y: 7 };
  assert.deepEqual(shieldLandingAfterSlide(state, slide, approach), landing);
  assert.equal(unequipOrkkShield(state, 'P1', slide), true);
  assert.deepEqual(state.objects.find((object) => object.kind === 'orkk-shield')?.position, landing, 'A dropped Shield slides to an adjacent lower Square.');

  const thrown = makeState(true, 'orkk', 'dummy');
  thrown.objects = [];
  thrown.players.P1.position = approach;
  thrown.players.P2.position = { x: 8, y: 7 };
  thrown.players.P1.hand = [{ instanceId: 'arrow', cardId: 'arkane-arow' }];
  const played = applyCommand(thrown, { type: 'play-perk', playerId: 'P1', cardInstanceId: 'arrow', destination: 'direct' });
  assert.equal(played.ok, true, 'ARKANE AROW starts.');
  const landed = applyCommand(played.state, { type: 'arkane-arow-target', playerId: 'P1', to: slide });
  assert.equal(landed.ok, true, 'ARKANE AROW can target a Slide Square.');
  assert.deepEqual(landed.state.objects.find((object) => object.kind === 'orkk-shield')?.position, landing, 'A thrown Shield slides after landing.');
  assert.deepEqual(landed.state.objectPushAnimations.at(-1)?.to, landing, 'The throw animation ends at the authoritative Square.');
  assert.deepEqual(landed.state.objectPushAnimations.at(-1)?.path?.slice(-2), [slide, landing], 'The Shield animation passes through the Slide Square.');
}

const wreckna = createHotseatTestState(true, 'wreckna', 2, 'orkk');
wreckna.phase = 'active'; wreckna.objects = [{ id: 'shield', name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: 'P2', hp: 3, maxHp: 3, position: { x: 3, y: 2 }, heavy: true }];
wreckna.players.P1.position = { x: 2, y: 2 };
const hp = wreckna.players.P1.hp;
assert.equal(beginWrecknaPhylacteryChoice(wreckna, 'P1', 'shield', { hp: 1 }).ok, false, 'Shared infusion refuses a dropped Shield.');
assert.equal(wreckna.players.P1.hp, hp, 'Rejected infusion does not sacrifice HP.');
for (const [phase, command] of [
  ['choosing-test-phylactery-target', { type: 'test-phylactery-target', playerId: 'P1', objectId: 'shield' }],
  ['choosing-lichdom-target', { type: 'lichdom-target', playerId: 'P1', objectId: 'shield' }],
  ['choosing-dakkoth-phylactery-target', { type: 'dakkoth-phylactery-target', playerId: 'P1', objectId: 'shield' }],
] as const) {
  const state = structuredClone(wreckna) as GameState & Record<string, any>;
  state.phase = phase;
  const pendingKey = phase.includes('test-') ? 'testPhylactery' : phase.includes('lichdom') ? 'lichdom' : 'dakkoth';
  state[pendingKey] = { casterId: 'P1', level: 2, stage: 'target', undo: null };
  assert.equal(applyCommand(state, command).ok, false, `${phase} cannot target Da Orkk's Shield.`);
}

console.log('Shield placement and Phylactery exclusion checks passed.');
