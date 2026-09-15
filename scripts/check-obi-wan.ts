import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  OBI_WAN_ATTACK_FACING_OFFSET_RADIANS,
  OBI_WAN_DOUBLE_SWING_CLIP,
  OBI_WAN_DOUBLE_SWING_HIT_SECONDS,
  OBI_WAN_LEG_KICK_CLIP,
  OBI_WAN_LEG_KICK_DURATION_SECONDS,
  OBI_WAN_LEG_KICK_HIT_SECONDS,
  obiWanAttackClip,
  shouldPlayObiWanLegKick,
} from '../src/obiWanAttackAnimation.ts';
import {
  OBI_WAN_DANCE_THROUGH_CLIP,
  OBI_WAN_DANCE_THROUGH_DURATION_SECONDS,
  OBI_WAN_DANCE_THROUGH_ENTRY_FRAME,
  OBI_WAN_DANCE_THROUGH_STEP_FRAMES,
  OBI_WAN_DANCE_THROUGH_STEP_SECONDS,
  OBI_WAN_DANCE_THROUGH_TURN_MS,
  isObiWanDanceThroughMovement,
  obiWanDanceThroughTimeScale,
  shouldHoldObiWanDanceThrough,
  shouldShowObiWanLightsaberDuringDance,
} from '../src/obiWanDanceThroughAnimation.ts';

const assetPath = process.argv[2] ?? 'public/models/obi-wan-optimized.glb';
const bytes = fs.readFileSync(assetPath);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
const asset = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

for (const name of ['Idle', 'Casual_Walk', 'Walking', 'Running', 'RunFast', 'Power', 'Dead', OBI_WAN_LEG_KICK_CLIP, OBI_WAN_DOUBLE_SWING_CLIP, OBI_WAN_DANCE_THROUGH_CLIP]) {
  assert.ok(asset.animations.some((clip) => clip.name === name), `Obi-Wan GLB missing ${name}`);
}
const kick = asset.animations.find((clip) => clip.name === OBI_WAN_LEG_KICK_CLIP)!;
const doubleSwing = asset.animations.find((clip) => clip.name === OBI_WAN_DOUBLE_SWING_CLIP)!;
const danceThrough = asset.animations.find((clip) => clip.name === OBI_WAN_DANCE_THROUGH_CLIP)!;
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

console.log(`${assetPath}: Obi-Wan Leg_Kick hit=${OBI_WAN_LEG_KICK_HIT_SECONDS.toFixed(4)}s end=${kick.duration.toFixed(4)}s planted-foot-drift=${maxDrift.toExponential(2)}; Double_Swing hit=${OBI_WAN_DOUBLE_SWING_HIT_SECONDS.toFixed(4)}s end=${doubleSwing.duration.toFixed(4)}s; Dance_Through end=${danceThrough.duration.toFixed(4)}s`);
