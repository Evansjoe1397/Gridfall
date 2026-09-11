import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { JOHN_CLIPS, JOHN_MODEL_SCALE, johnMovementClip, johnMovementDuration, johnPlaybackRate } from '../src/johnChristLocomotion.ts';
import { attachJohnHealthAnchor } from '../src/johnChristVisuals.ts';

const bytes = fs.readFileSync(new URL('../public/models/john-christ.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67);
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
assert.equal(json.skins.length, 1);
assert.equal(json.meshes.length, 1, 'Only the repaired mesh, no backup/helper geometry.');
assert.equal(json.animations.length, 20);
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
