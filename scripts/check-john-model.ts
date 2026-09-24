import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { JOHN_BLESSING_END_FRAME, JOHN_BLESSING_RELEASE_SECONDS, JOHN_CAST_END_FRAME, JOHN_CAST_END_SECONDS, JOHN_CAST_RELEASE_SECONDS, JOHN_CLEANSE_END_FRAME, JOHN_CLEANSE_RELEASE_SECONDS, JOHN_CLIPS, JOHN_MIND_BLAST_END_FRAME, JOHN_MIND_BLAST_END_SECONDS, JOHN_MIND_BLAST_FPS, JOHN_MIND_BLAST_IMPACT_FRAME, JOHN_MIND_BLAST_IMPACT_SECONDS, JOHN_MODEL_SCALE, JOHN_SCEPTER_HEAD_LOCAL, johnAttackAnimation, johnAttackReleaseSeconds, johnAttackUsesProjectile, johnCastProjectileDurationMs, johnMovementClip, johnMovementDuration, johnPlaybackRate, johnUsesCastOverhead } from '../src/johnChristLocomotion.ts';
import { attachJohnHealthAnchor } from '../src/johnChristVisuals.ts';
import { groundJohnBlessingClip } from '../src/johnChristGrounding.ts';

const bytes = fs.readFileSync(new URL('../public/models/john-christ.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67);
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
assert.equal(json.skins.length, 1);
assert.equal(json.meshes.length, 1, 'Only the repaired mesh, no backup/helper geometry.');
assert.equal(json.animations.length, 25);
assert(json.images.length > 0 && json.images.every((image: { bufferView?: number }) => image.bufferView !== undefined), 'Textures are embedded.');
const binaryStart = 20 + jsonLength + 8;
json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(binaryStart).toString('base64')}`;
// Exercise Three's actual skin/animation loader headlessly; skip image decoding only.
delete json.images;
delete json.textures;
delete json.materials;
for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
Object.assign(globalThis, { ProgressEvent: class { constructor(public type: string) {} } });
const asset = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
const model = clone(asset.scene);
const mixer = new THREE.AnimationMixer(model);
for (const name of Object.values(JOHN_CLIPS)) {
  const clip = asset.animations.find((clip) => clip.name === name);
  assert(clip && clip.duration > 0, `${name} must load with a positive duration.`);
  mixer.stopAllAction();
  mixer.clipAction(clip).play();
  mixer.setTime(clip.duration * 0.4);
  model.updateMatrixWorld(true);
  model.traverse((node) => {
    assert(node.matrixWorld.elements.every(Number.isFinite));
    if (node instanceof THREE.SkinnedMesh) {
      assert(node.skeleton.bones.length >= 20);
      node.skeleton.update();
      const point = node.getVertexPosition(100, new THREE.Vector3());
      assert(point.toArray().every(Number.isFinite));
    }
  });
  console.log(`${name}: ${clip.duration.toFixed(3)} seconds, ${clip.tracks.length} tracks`);
}
const idle = asset.animations.find((clip) => clip.name === 'Idle')!;
const blessedBeam = asset.animations.find((clip) => clip.name === 'Staff_Point_Forward')!;
assert(Math.abs(blessedBeam.duration - 60 / 24) < 0.001, 'Staff_Point_Forward retains all 60 Blender frames.');
mixer.stopAllAction();
mixer.clipAction(blessedBeam).reset().play();
mixer.setTime(28 / 24);
model.updateMatrixWorld(true);
const shoulder = model.getObjectByName('RightArm')!.getWorldPosition(new THREE.Vector3());
const elbow = model.getObjectByName('RightForeArm')!.getWorldPosition(new THREE.Vector3());
const wrist = model.getObjectByName('RightHand')!.getWorldPosition(new THREE.Vector3());
const elbowBend = THREE.MathUtils.radToDeg(elbow.clone().sub(shoulder).angleTo(wrist.clone().sub(elbow)));
assert(elbowBend < 20, `Blessed beam arm must stay almost straight, got ${elbowBend} degrees.`);
assert(Math.abs(wrist.y - shoulder.y) < 0.1, 'Blessed beam hand must extend at approximately shoulder height.');
const castOverhead = asset.animations.find((clip) => clip.name === 'Cast_Overhead')!;
assert(Math.abs(castOverhead.duration - JOHN_CAST_END_FRAME / 24) < 0.01, 'Cast_Overhead must include source frames 21 and 22.');
const mindBlastCast = asset.animations.find((clip) => clip.name === 'Cast')!;
assert(mindBlastCast.duration >= JOHN_MIND_BLAST_END_SECONDS, 'The source Cast must contain the requested frame range.');
const playableMindBlastCast = mindBlastCast.clone();
playableMindBlastCast.tracks.forEach((track) => track.trim(0, JOHN_MIND_BLAST_END_SECONDS));
playableMindBlastCast.duration = JOHN_MIND_BLAST_END_SECONDS;
assert(Math.abs(playableMindBlastCast.duration - JOHN_MIND_BLAST_END_SECONDS) < 0.01, 'Mind Blast Cast must stop at frame 57.');
assert(playableMindBlastCast.tracks.every((track) => track.times.at(-1)! <= JOHN_MIND_BLAST_END_SECONDS), 'Mind Blast must contain no keys after frame 57.');
assert(playableMindBlastCast.tracks.some((track) => Math.abs(track.times.at(-1)! - JOHN_MIND_BLAST_END_FRAME / JOHN_MIND_BLAST_FPS) < 0.001), 'Mind Blast must retain frame 57.');
assert.equal(JOHN_MIND_BLAST_IMPACT_FRAME, 42);
assert.equal(JOHN_MIND_BLAST_IMPACT_SECONDS, 41 / 24);
const cleanse = asset.animations.find((clip) => clip.name === 'Raise_Left_Hand')!;
assert(Math.abs(cleanse.duration - JOHN_CLEANSE_END_FRAME / 24) < 0.01, 'Cleanse must use the complete raised-left-hand clip.');
const blessing = asset.animations.find((clip) => clip.name === 'Blessing')!;
assert(Math.abs(blessing.duration - JOHN_BLESSING_END_FRAME / 24) < 0.01, 'Blessing ends at the requested cut frame.');
assert(blessing.tracks.every((track) => track.times.at(-1)! <= blessing.duration + 1e-6), 'Blessing contains keys after its cut frame.');
const blessingModel = clone(asset.scene);
const blessingMixer = new THREE.AnimationMixer(blessingModel);
const lowerToe = () => {
  blessingModel.updateMatrixWorld(true);
  return Math.min(...['LeftToeBase', 'RightToeBase'].map((name) => blessingModel.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).y));
};
blessingMixer.clipAction(idle).play();
blessingMixer.setTime(0);
const idleToeHeight = lowerToe();
blessingMixer.stopAllAction();
const groundedBlessing = groundJohnBlessingClip(blessingModel, idle, blessing);
assert.notEqual(groundedBlessing, blessing, 'Grounding must leave the shared source clip untouched.');
const groundedAction = blessingMixer.clipAction(groundedBlessing).setLoop(THREE.LoopOnce, 1);
groundedAction.clampWhenFinished = true;
groundedAction.play();
for (let frame = 0; frame <= JOHN_BLESSING_END_FRAME * 2; frame++) {
  blessingMixer.setTime(frame / 48);
  assert(Math.abs(lowerToe() - idleToeHeight) < 0.003, `Blessing foot height drifts at half-frame ${frame}.`);
}
assert(Math.abs(idle.duration - 4) < 0.05);
for (const track of idle.tracks) {
  const size = track.getValueSize();
  for (let i = 0; i < size; i++) assert(Math.abs(track.values[i] - track.values[track.values.length - size + i]) < 1e-4, `Idle loop seam: ${track.name}`);
}
assert.equal(johnMovementClip(1), 'Walk');
assert.equal(johnMovementClip(2), 'Run');
assert.equal(johnMovementClip(5), 'Run');
assert(johnMovementDuration(2) < 2 * johnMovementDuration(1));
assert(Math.abs(johnPlaybackRate('Walk', 1.92, johnMovementDuration(1)) - 1.35) < 1e-9);
assert(Math.abs(johnPlaybackRate('Run', 5 * 1.92, johnMovementDuration(5)) - 1) < 1e-9);
assert(Math.abs(johnPlaybackRate('Run', 3.84, johnMovementDuration(2), 1.13) - 1 / 1.13) < 1e-9);
assert.equal(johnPlaybackRate('Run', 0, 1000), 0);
assert(JOHN_MODEL_SCALE > 1);
assert.equal(JOHN_CAST_RELEASE_SECONDS, 18 / 24);
assert.equal(JOHN_CAST_END_FRAME, 22);
assert.equal(JOHN_CAST_END_SECONDS, 22 / 24);
assert.equal(JOHN_CLEANSE_RELEASE_SECONDS, 17 / 24);
assert.equal(JOHN_CLEANSE_END_FRAME, 26);
assert.equal(johnAttackAnimation('cleanse'), 'Cleanse');
assert.equal(johnAttackAnimation('repent'), 'Cleanse');
assert.equal(johnAttackAnimation('mind-blast'), 'MindBlast');
assert.equal(johnAttackAnimation('smite'), 'Attack');
assert.equal(johnAttackUsesProjectile('cleanse'), false);
assert.equal(johnAttackUsesProjectile('repent'), false);
assert.equal(johnAttackUsesProjectile('mind-blast'), false);
assert.equal(johnAttackUsesProjectile('smite'), true);
assert.equal(johnAttackReleaseSeconds('MindBlast'), JOHN_MIND_BLAST_IMPACT_SECONDS);
assert.equal(johnAttackReleaseSeconds('Cleanse'), JOHN_CLEANSE_RELEASE_SECONDS);
assert.equal(johnAttackReleaseSeconds('Attack'), JOHN_CAST_RELEASE_SECONDS);
assert.deepEqual(JOHN_SCEPTER_HEAD_LOCAL, [0, 0.72, 0]);
assert.equal(JOHN_BLESSING_RELEASE_SECONDS, 16 / 24);
assert.equal(JOHN_BLESSING_END_FRAME, 31);
assert(johnCastProjectileDurationMs(1.92) < johnCastProjectileDurationMs(5.76));
assert(johnCastProjectileDurationMs(50) <= 320);
assert.equal(johnUsesCastOverhead('john-christ', false), true);
assert.equal(johnUsesCastOverhead('john-christ', true), false);
// Health-bar measurement must see the final transformed skin, even before render.
const root = new THREE.Group();
root.position.set(3.84, 0.08, -1.92);
root.add(model);
model.scale.setScalar(JOHN_MODEL_SCALE);
model.rotation.y = Math.PI;
mixer.stopAllAction();
mixer.clipAction(idle).reset().play();
mixer.setTime(0);
function posedTop() {
  let top = -Infinity;
  model.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    node.skeleton.update();
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      const p = node.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(node.matrixWorld);
      top = Math.max(top, p.y);
    }
  });
  return top;
}
root.updateWorldMatrix(true, true);
const beforeSkinRefresh = posedTop();
root.updateMatrixWorld(true);
const top = posedTop();
console.log({ beforeSkinRefresh, afterSkinRefresh: top });
assert(top > root.position.y + 2.4 && top < root.position.y + 2.7, 'HP anchor must sit above the 2.5-unit mitre.');
const anchor = attachJohnHealthAnchor(model);
assert(Math.abs(anchor.getWorldPosition(new THREE.Vector3()).y - top) < 1e-6);
root.scale.setScalar(1.13);
root.position.y += 0.54;
assert(Math.abs(anchor.getWorldPosition(new THREE.Vector3()).y - (root.position.y + (top - 0.08) * 1.13)) < 1e-5, 'HP anchor follows scale and elevation.');
console.log('John Christ GLB, skinning, loop and locomotion checks passed.');
