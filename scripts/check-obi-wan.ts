import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { OBI_WAN_FLIP_CLIP, OBI_WAN_FLIP_DURATION_MS, OBI_WAN_FLIP_FPS, OBI_WAN_FLIP_TURN_MS, isObiWanFlipMovement, obiWanFlipSegment, obiWanFlipFrame, obiWanFlipTravelProgress, prepareObiWanFlipClip } from '../src/obiWanFlipAnimation.ts';
import { applyCommand, createHotseatTestState } from '../shared/game.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  OBI_WAN_ATTACK_FACING_OFFSET_RADIANS,
  OBI_WAN_DOUBLE_SWING_CLIP,
  OBI_WAN_DOUBLE_SWING_HIT_SECONDS,
  OBI_WAN_CUT_THEM_LEGS_CLIP,
  OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS,
  OBI_WAN_CUT_THEM_LEGS_DURATION_SECONDS,
  OBI_WAN_SABER_RETRACT_SECONDS,
  obiWanLightsaberFrame,
  OBI_WAN_LEG_KICK_CLIP,
  OBI_WAN_LEG_KICK_DURATION_SECONDS,
  OBI_WAN_LEG_KICK_HIT_SECONDS,
  obiWanAttackClip,
  shouldPlayObiWanLegKick,
} from '../src/obiWanAttackAnimation.ts';
import {
  OBI_WAN_DANCE_THROUGH_CLIP,
  OBI_WAN_DANCE_THROUGH_FPS,
  OBI_WAN_DANCE_THROUGH_DURATION_SECONDS,
  OBI_WAN_DANCE_THROUGH_ENTRY_FRAME,
  OBI_WAN_DANCE_THROUGH_STEP_FRAMES,
  OBI_WAN_DANCE_THROUGH_STEP_SECONDS,
  OBI_WAN_DANCE_THROUGH_TURN_MS,
  isObiWanDanceThroughMovement,
  obiWanDanceThroughTimeScale,
  obiWanDanceThroughInputLocked,
  obiWanDanceThroughFrame,
  shouldHoldObiWanDanceThrough,
  shouldShowObiWanLightsaberDuringDance,
} from '../src/obiWanDanceThroughAnimation.ts';

const assetPath = process.argv[2] ?? 'public/models/obi-wan-optimized.glb';
const bytes = fs.readFileSync(assetPath);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
const asset = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

for (const name of ['Idle', 'Casual_Walk', 'Walking', 'Running', 'RunFast', 'Power', 'Dead', OBI_WAN_LEG_KICK_CLIP, OBI_WAN_DOUBLE_SWING_CLIP, OBI_WAN_DANCE_THROUGH_CLIP, OBI_WAN_FLIP_CLIP]) {
  assert.ok(asset.animations.some((clip) => clip.name === name), `Obi-Wan GLB missing ${name}`);
}
const kick = asset.animations.find((clip) => clip.name === OBI_WAN_LEG_KICK_CLIP)!;
const doubleSwing = asset.animations.find((clip) => clip.name === OBI_WAN_DOUBLE_SWING_CLIP)!;
const cutThemLegs = asset.animations.find((clip) => clip.name === OBI_WAN_CUT_THEM_LEGS_CLIP);
assert.ok(cutThemLegs, 'Obi-Wan GLB missing Cut_Them_Legs');
assert.ok(!asset.animations.some(clip => clip.name === 'Low_Cut'), 'Remove the obsolete Low_Cut asset');
assert.ok(Math.abs(cutThemLegs.duration - OBI_WAN_CUT_THEM_LEGS_DURATION_SECONDS) < 1e-6);
assert.equal(asset.scene.children.filter(o => o.name === 'target_character').length, 1);
const bodies: THREE.SkinnedMesh[] = [];
asset.scene.traverse(o => { if (o instanceof THREE.SkinnedMesh) bodies.push(o); });
assert.equal(bodies.length, 1, 'Only the existing character body is shipped');
assert.ok(cutThemLegs.duration > OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS);
assert.equal(OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS, 20 / 30);
assert.equal(OBI_WAN_ATTACK_FACING_OFFSET_RADIANS[OBI_WAN_CUT_THEM_LEGS_CLIP], 0);
assert.equal(obiWanAttackClip('shinobi', false, 'cut-them-legs'), OBI_WAN_CUT_THEM_LEGS_CLIP);
assert.equal(obiWanAttackClip('shinobi', true, 'cut-them-legs'), OBI_WAN_CUT_THEM_LEGS_CLIP);
assert.equal(obiWanAttackClip('shinobi', false, 'hello-there'), OBI_WAN_LEG_KICK_CLIP);
assert.equal(obiWanAttackClip('shinobi', true, 'hello-there'), OBI_WAN_DOUBLE_SWING_CLIP);
assert.equal(obiWanAttackClip('merylin', true, 'cut-them-legs'), null);
// The saber is fully visible for the attack, regardless of buff updates.
for (const visible of [false, true]) {
  let saberFrame = obiWanLightsaberFrame(visible, OBI_WAN_CUT_THEM_LEGS_CLIP, false, 0, 1 / 60);
  assert.equal(saberFrame.progress, 1);
  assert.equal(saberFrame.target, 1);
  for (const delta of [1 / 144, 1 / 30, 0.3]) {
    saberFrame = obiWanLightsaberFrame(visible, OBI_WAN_CUT_THEM_LEGS_CLIP, false, saberFrame.progress, delta);
    assert.equal(saberFrame.progress, 1, 'Keep the full blade through the attack');
  }
  saberFrame = obiWanLightsaberFrame(visible, OBI_WAN_CUT_THEM_LEGS_CLIP, true, saberFrame.progress, 0.1);
  assert.equal(saberFrame.target, Number(visible));
  assert.equal(saberFrame.progress, visible ? 1 : 0.8, 'Retract after the attack only without Lightsaber status');
  saberFrame = obiWanLightsaberFrame(visible, undefined, true, saberFrame.progress, OBI_WAN_SABER_RETRACT_SECONDS - 0.1);
  assert.equal(saberFrame.progress, Number(visible));
}
assert.deepEqual(obiWanLightsaberFrame(true, OBI_WAN_LEG_KICK_CLIP, false, 0, .1), { target: 0, progress: 0 });
assert.deepEqual(obiWanLightsaberFrame(true, OBI_WAN_LEG_KICK_CLIP, true, 0, .1), { target: 1, progress: .2 });
assert.deepEqual(obiWanLightsaberFrame(false, undefined, true, 1, .1), { target: 0, progress: .8 }, 'Use normal status-expiration retraction');
const saber = asset.scene.getObjectByName('Lightsaber')!;
assert.ok(saber);
const saberRestPosition = saber.position.clone();
const saberRestRotation = saber.quaternion.clone();
const attackMixer = new THREE.AnimationMixer(asset.scene);
const cutThemLegsAction = attackMixer.clipAction(cutThemLegs).setLoop(THREE.LoopOnce, 1);
cutThemLegsAction.clampWhenFinished = true;
cutThemLegsAction.play();
// Different rendering intervals reach the same authored hit timestamp.
for (const delta of [1 / 144, 1 / 60, 1 / 30, .2]) {
  cutThemLegsAction.reset().play();
  let elapsed = 0;
  while (elapsed < OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS - 1e-9) {
    const step = Math.min(delta, OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS - elapsed);
    attackMixer.update(step); elapsed += step;
  }
  assert.ok(Math.abs(cutThemLegsAction.time - OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS) < 1e-6);
}
asset.scene.updateMatrixWorld(true);
assert.ok(!cutThemLegs.tracks.some(track => track.name.startsWith('Lightsaber.')), 'Use the existing normal grip without attack-specific saber transforms');
cutThemLegsAction.stop();
attackMixer.update(0);
assert.ok(saber.position.distanceTo(saberRestPosition) < 1e-6, 'Cut Them Legs preserves the normal saber position');
assert.ok(saber.quaternion.clone().normalize().angleTo(saberRestRotation.clone().normalize()) < 1e-6, 'Cut Them Legs preserves the normal saber rotation');
const sourceFlip = asset.animations.find(clip => clip.name === OBI_WAN_FLIP_CLIP)!;
const idle = asset.animations.find(clip => clip.name === 'Idle')!;
const flip = prepareObiWanFlipClip(sourceFlip, idle, asset.scene);
assert.ok(Math.abs(flip.duration * 1000 - OBI_WAN_FLIP_DURATION_MS) < 0.001);
assert.ok(flip.tracks.every(track => track.times[track.times.length - 1] <= 65 / 24 + 1e-6), 'Cut all tracks after frame 65');
const idleHips = idle.tracks.find(track => track.name === 'Hips.position')!;
const flipHips = flip.tracks.find(track => track.name === 'Hips.position')!;
assert.ok(idleHips.values[2] - Math.min(...Array.from(flipHips.values).filter((_, i) => i % 3 === 2)) > 100, 'Flip preserves its airborne arc');
assert.notDeepEqual(sourceFlip.tracks.find(track => track.name === 'Hips.position')!.values, flipHips.values, 'Preparation keeps the asset clip unchanged');
const firstFlip = obiWanFlipSegment(1), secondFlip = obiWanFlipSegment(2);
assert.deepEqual([firstFlip.startFrame, firstFlip.endFrame, secondFlip.startFrame, secondFlip.endFrame], [0, 33, 33, 65]);
assert.equal(firstFlip.durationMs, 33 / 24 * 1000);
assert.equal(secondFlip.durationMs, 32 / 24 * 1000);
assert.equal(firstFlip.holdAfter, true);
assert.equal(secondFlip.holdAfter, false);
assert.equal(OBI_WAN_FLIP_TURN_MS, 80, 'Turn quickly before advancing the held pose');
for (const segment of [firstFlip, secondFlip]) {
  assert.equal(obiWanFlipTravelProgress(0, segment), 0);
  assert.equal(obiWanFlipTravelProgress(1, segment), 1, 'Each segment travels exactly one tile');
}
for (let frame = 0; frame <= 23; frame++) assert.equal(obiWanFlipTravelProgress(frame / 33, firstFlip), 0, 'Preparation cannot move off the origin tile');
for (let frame = 50; frame <= 65; frame++) assert.equal(obiWanFlipTravelProgress((frame - 33) / 32, secondFlip), 1, 'Landing recovery cannot move off the destination tile');
assert.equal(obiWanFlipFrame(2, firstFlip), 33, 'First step cannot overshoot the held frame');
assert.equal(obiWanFlipFrame(0, secondFlip), 33, 'Second step resumes the exact held frame');
assert.equal(obiWanFlipFrame(2, secondFlip), 65, 'Second step cannot advance past the cut');
cutThemLegsAction.reset().play();
attackMixer.update(OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS);
cutThemLegsAction.stop();
const flipAction = attackMixer.clipAction(flip).setLoop(THREE.LoopOnce, 1);
flipAction.clampWhenFinished = true;
const feet = () => {
  asset.scene.updateMatrixWorld(true);
  const center = asset.scene.getObjectByName('LeftToeBase')!.getWorldPosition(new THREE.Vector3())
    .add(asset.scene.getObjectByName('RightToeBase')!.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
  let bottom = Infinity;
  asset.scene.traverse(mesh => {
    if (!(mesh instanceof THREE.SkinnedMesh)) return;
    const positions = mesh.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i); mesh.applyBoneTransform(i, point); mesh.localToWorld(point);
      bottom = Math.min(bottom, point.y);
    }
  });
  return { center, bottom };
};
const idleAction = attackMixer.clipAction(idle).play();
idleAction.paused = true; idleAction.time = 0; attackMixer.update(0);
const idleFeet = feet(); idleAction.stop();
flipAction.play(); flipAction.paused = true;
let landingFeet: ReturnType<typeof feet> | undefined;
for (let frame = 0; frame <= 65; frame++) {
  flipAction.time = frame / 24; attackMixer.update(0);
  const current = feet();
  if (frame === 50) {
    landingFeet = current;
    assert.ok(Math.hypot(current.center.x - idleFeet.center.x, current.center.z - idleFeet.center.z) < .002, 'Landing aligns with idle, avoiding a slide during the return to idle');
  }
  if (frame <= 23 || frame >= 50) {
    assert.ok(Math.abs(current.bottom - idleFeet.bottom) < .002, `Frame ${frame}: boots stay on the floor (${current.bottom - idleFeet.bottom})`);
    const anchor = frame <= 23 ? idleFeet : landingFeet!;
    assert.ok(Math.hypot(current.center.x - anchor.center.x, current.center.z - anchor.center.z) < .002, `Frame ${frame}: grounded feet must not slide horizontally`);
  }
  if (frame === 33) assert.ok(current.bottom - idleFeet.bottom > .5, 'The middle pose remains airborne');
}
flipAction.stop();
flipAction.play();
flipAction.paused = true;
flipAction.time = obiWanFlipFrame(1, firstFlip) / OBI_WAN_FLIP_FPS;
attackMixer.update(0);
const flipHipsBone = asset.scene.getObjectByName('Hips')!;
const heldPosition = flipHipsBone.position.clone(), heldRotation = flipHipsBone.quaternion.clone();
attackMixer.update(5);
assert.equal(flipAction.time, 33 / 24, 'Waiting for input must freeze on exactly frame 33');
assert.deepEqual(flipHipsBone.position.toArray(), heldPosition.toArray());
assert.deepEqual(flipHipsBone.quaternion.toArray(), heldRotation.toArray());
attackMixer.update(OBI_WAN_FLIP_TURN_MS / 1000);
assert.equal(flipAction.time, 33 / 24, 'The quick pre-movement turn must keep frame 33 frozen');
flipAction.time = obiWanFlipFrame(0, secondFlip) / OBI_WAN_FLIP_FPS;
attackMixer.update(0);
assert.equal(flipAction.time, 33 / 24);
flipAction.reset().play();
for (const seconds of [0, 1, 1, flip.duration - 2]) {
  attackMixer.update(seconds);
  assert.ok(saber.position.distanceTo(saberRestPosition) < 1e-6, 'Flip restores the default saber position after Cut Them Legs');
  assert.ok(saber.quaternion.clone().normalize().angleTo(saberRestRotation.clone().normalize()) < 1e-6, 'Flip restores the default saber grip after Cut Them Legs');
}
flipAction.stop();
assert.equal(isObiWanFlipMovement('double-jump'), true);
assert.equal(isObiWanFlipMovement('dance-through'), false);
assert.equal(isObiWanFlipMovement(undefined), false);
let jumpState = createHotseatTestState(false, 'shinobi', 2);
jumpState.phase = 'active'; jumpState.activePlayerId = 'P2';
jumpState.objects = []; jumpState.elevations = {};
jumpState.players.P1.position = { x: 2, y: 2 };
jumpState.players.P2.position = { x: 2, y: 3 };
jumpState.players.P1.hand = [{ instanceId: 'flip-defense', cardId: 'double-jump' }];
jumpState.players.P2.hand = [{ instanceId: 'flip-attack', cardId: 'attack-2' }];
for (const command of [
  { type: 'attack', playerId: 'P2', cardInstanceId: 'flip-attack', targetId: 'P1', targetKind: 'player' },
  { type: 'defend', playerId: 'P1', cardInstanceId: 'flip-defense' },
  { type: 'ack-combat', playerId: 'P1' },
  { type: 'ack-combat', playerId: 'P2' },
] as const) {
  const result = applyCommand(jumpState, command);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  jumpState = result.state;
}
assert.equal(jumpState.phase, 'double-jump', 'Flip movement is granted after defense combat resolves');
for (const x of [3, 4]) {
  const result = applyCommand(jumpState, { type: 'move', playerId: 'P1', to: { x, y: 2 } });
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  jumpState = result.state;
  assert.equal(jumpState.players.P1.visualMovement?.sourceCardId, 'double-jump', 'Both steps retain Flip metadata, including the last step after the phase ends');
  assert.equal(jumpState.players.P1.visualMovement?.doubleJumpStep, x === 3 ? 1 : 2, 'Record the segment before the Double Jump phase ends');
  assert.deepEqual(jumpState.players.P1.visualMovement?.path, [{ x, y: 2 }]);
}
assert.equal(jumpState.doubleJump, null);
assert.equal(jumpState.phase, 'active');
const danceThrough = asset.animations.find((clip) => clip.name === OBI_WAN_DANCE_THROUGH_CLIP)!;
// Rapid input cannot replace a queued/in-progress step, even after the final
// move has changed the rules phase back to active. Unlock only at its end pose.
assert.equal(obiWanDanceThroughInputLocked(false, undefined, { holding: true }), false);
assert.equal(obiWanDanceThroughInputLocked(true, undefined, { holding: true }), true, 'Reserve the step before its online response');
assert.equal(obiWanDanceThroughInputLocked(false, { danceThrough: true }, { holding: true }), true, 'Wait through the pre-step turn and post-combat effects');
assert.equal(obiWanDanceThroughInputLocked(false, { danceThrough: true }, { holding: false }), true);
assert.equal(obiWanDanceThroughInputLocked(false, undefined, { holding: false }), true, 'An unfinished clip cannot be interrupted by a new action');
assert.equal(obiWanDanceThroughInputLocked(false, undefined, { holding: true }), false, 'The next tile becomes selectable at the completed pose');
assert.equal(obiWanDanceThroughInputLocked(false, undefined, undefined), false, 'Release after ending Dance Through or rejecting the online request');
assert.equal(obiWanDanceThroughInputLocked(false, {}, undefined), false, 'Other movement is unaffected');
const danceMixer = new THREE.AnimationMixer(asset.scene);
const danceAction = danceMixer.clipAction(danceThrough).play();
danceAction.paused = true;
for (const [startFrame, endFrame] of [[1,25], [25,50], [0,25]]) {
  const durationMs = 800;
  for (const elapsedMs of [0, 16, 150, 520, 799, 800, 1200]) {
    const frame = obiWanDanceThroughFrame(elapsedMs / durationMs, startFrame, endFrame);
    danceAction.time = Math.min(danceThrough.duration - 1e-6, frame / OBI_WAN_DANCE_THROUGH_FPS);
    danceMixer.update(0);
    assert.ok(Math.abs(danceAction.time * OBI_WAN_DANCE_THROUGH_FPS - frame) < .001, 'Even a long render gap samples the tile clock directly');
    assert.equal(frame === endFrame, elapsedMs >= durationMs, 'Do not finish a single-tile clip early');
  }
}
danceAction.stop();
assert.ok(Math.abs(kick.duration - OBI_WAN_LEG_KICK_DURATION_SECONDS) < 1 / 1_000, 'Leg_Kick must end on frame 70');
assert.ok(doubleSwing.duration > OBI_WAN_DOUBLE_SWING_HIT_SECONDS, 'Double_Swing must continue after its frame-21 hit');
assert.ok(Math.abs(danceThrough.duration - OBI_WAN_DANCE_THROUGH_DURATION_SECONDS) < 1 / 1_000, 'Dance_Through must contain source frames 21 through 71');
assert.equal(OBI_WAN_DANCE_THROUGH_STEP_FRAMES, 25, 'Dance_Through must contain two equal wide steps');
assert.equal(OBI_WAN_DANCE_THROUGH_STEP_SECONDS, 25 / 24);
assert.equal(OBI_WAN_DANCE_THROUGH_ENTRY_FRAME, 1, 'Dance Through must enter its ready pose before movement');
assert.equal(OBI_WAN_DANCE_THROUGH_TURN_MS, 160, 'Dance Through must visibly turn before each tile movement');
assert.ok(Math.abs(obiWanDanceThroughTimeScale(1000) - 25 / 24) < Number.EPSILON);
assert.ok(Math.abs(obiWanDanceThroughTimeScale(1000, 24) - 1) < Number.EPSILON);
assert.equal(OBI_WAN_LEG_KICK_HIT_SECONDS, 16 / 24);
assert.equal(OBI_WAN_DOUBLE_SWING_HIT_SECONDS, 21 / 24);
assert.ok(Math.abs(OBI_WAN_ATTACK_FACING_OFFSET_RADIANS[OBI_WAN_LEG_KICK_CLIP] - -71.4667 * Math.PI / 180) < Number.EPSILON);
assert.equal(OBI_WAN_ATTACK_FACING_OFFSET_RADIANS[OBI_WAN_DOUBLE_SWING_CLIP], 0);
assert.equal(obiWanAttackClip('shinobi', false), OBI_WAN_LEG_KICK_CLIP);
assert.equal(obiWanAttackClip('shinobi', true), OBI_WAN_DOUBLE_SWING_CLIP);
assert.equal(obiWanAttackClip('merylin', true), null);
assert.equal(shouldPlayObiWanLegKick('shinobi', false), true);
assert.equal(shouldPlayObiWanLegKick('shinobi', undefined), true);
assert.equal(shouldPlayObiWanLegKick('shinobi', true), false);
assert.equal(shouldPlayObiWanLegKick('merylin', false), false);
assert.equal(isObiWanDanceThroughMovement('dance-through'), true);
assert.equal(isObiWanDanceThroughMovement('double-jump'), false);
assert.equal(shouldHoldObiWanDanceThrough('dance-through', false), true);
assert.equal(shouldHoldObiWanDanceThrough('dance-through', true), false);
assert.equal(shouldHoldObiWanDanceThrough('active', false), false);
assert.equal(shouldShowObiWanLightsaberDuringDance(false, 'dance-through', false), true);
assert.equal(shouldShowObiWanLightsaberDuringDance(false, undefined, true), true);
assert.equal(shouldShowObiWanLightsaberDuringDance(false, undefined, false), false);
assert.equal(shouldShowObiWanLightsaberDuringDance(true, undefined, false), true);

const toe = asset.scene.getObjectByName('RightToeBase');
assert.ok(toe, 'Obi-Wan GLB missing RightToeBase');
const mixer = new THREE.AnimationMixer(asset.scene);
const action = mixer.clipAction(kick).setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
mixer.update(0);
const footprint: THREE.Vector2[] = [];
for (let frame = 0; frame <= 70; frame += 1) {
  action.time = frame / 24;
  mixer.update(0);
  const world = toe.getWorldPosition(new THREE.Vector3());
  footprint.push(new THREE.Vector2(world.x, world.z));
}
const origin = footprint[0];
const maxDrift = Math.max(...footprint.map((point) => point.distanceTo(origin)));
// Blender's glTF resampling introduces about 1 mm of numerical drift while
// removing the original visible 0.98 m slide.
assert.ok(maxDrift < 0.002, `Leg_Kick planted-foot drift is ${maxDrift}`);

console.log(`${assetPath}: Cut_Them_Legs hit=${OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS.toFixed(4)}s end=${cutThemLegs.duration.toFixed(4)}s, one existing body, full saber during attack, normal retraction without status; Leg_Kick planted-foot-drift=${maxDrift.toExponential(2)}; Double_Swing end=${doubleSwing.duration.toFixed(4)}s; Dance_Through end=${danceThrough.duration.toFixed(4)}s; Flip end=${flip.duration.toFixed(4)}s, one tile per Double Jump step, default saber grip restored`);
