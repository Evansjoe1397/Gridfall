import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ArchmageAnimation, ARCHMAGE_CLIPS, ARCHMAGE_SCALE, archmageMovementDuration, archmageSegment } from '../src/archmageAnimation.ts';
import { SpellblockVisual, SPELLBLOCK_ASSEMBLY_MS } from '../src/spellblockVisual.ts';
import { merylinRouteMotion } from '../src/merylinAnimation.ts';
import { ShizzleVisual, shizzleMovementDuration } from '../src/shizzleVisual.ts';
import { applyCharacterHologram } from '../src/characterHologram.ts';

// Exercise the actual exported rig/clips with Three's loader, without a browser or GPU.
// Image decoding is omitted; geometry, skinning and animation bytes are unchanged.
const bytes = fs.readFileSync('public/models/celestial-archmage.glb');
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
assert.equal(gltf.meshes.length, 1);
assert.equal(gltf.skins.length, 1);
assert.deepEqual(gltf.animations.map((clip: { name: string }) => clip.name), [...ARCHMAGE_CLIPS]);
assert.ok(bytes.length < 8 * 1048576);
assert.equal(gltf.scenes.length, 1);
delete gltf.materials; delete gltf.textures; delete gltf.images;
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
const json = Buffer.from(JSON.stringify(gltf));
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
const header = Buffer.from(bytes.subarray(0, 20));
header.writeUInt32LE(20 + padded.length + bytes.length - 20 - jsonLength, 8);
header.writeUInt32LE(padded.length, 12);
const headless = Buffer.concat([header, padded, bytes.subarray(20 + jsonLength)]);
const asset = await new GLTFLoader().parseAsync(headless.buffer.slice(headless.byteOffset, headless.byteOffset + headless.byteLength), '');
const state = new ArchmageAnimation(asset.scene, asset.animations, SPELLBLOCK_ASSEMBLY_MS / 1000);
const advance = (seconds: number, effectFinished = false) => {
  for (let remaining = seconds; remaining > 1e-9;) {
    const step = Math.min(.02, remaining);
    state.update(step, undefined, false, effectFinished);
    remaining -= step;
  }
};

advance(9.9); assert.equal(state.current, 'Idle');
advance(.2); assert.equal(state.current, 'Conjure');
advance(9.8); assert.equal(state.current, 'Conjure');
advance(.2); assert.equal(state.current, 'Idle');
state.startPower({ phase: 'playing', holdAtEnd: true, targetKind: 'object', targetId: 'test' });
advance(.34); assert.equal(state.powerRaised, false);
advance(.04); assert.equal(state.powerRaised, true);
assert.equal(state.power?.phase, 'holding');
const hand = asset.scene.getObjectByName('mixamorigLeftHand')!;
assert.ok(hand, 'Spell projectile must originate from the new rig’s actual left hand.');
asset.scene.updateMatrixWorld(true);
const raisedHand = hand.getWorldPosition(new THREE.Vector3());
advance(3);
asset.scene.updateMatrixWorld(true);
assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(raisedHand) < 1e-5, 'Hand stays on frame 20 during target selection.');
state.resolvePower(1);
advance(2); assert.equal(state.current, 'Power', 'Object transfer/projectile completion controls the hold.');
advance(.02, true); assert.equal(state.current, 'PowerLower');
advance(.3, true); assert.equal(state.current, 'Idle');
assert.equal(state.power, undefined);

// Source frame 20 is the exact raise endpoint, frame 80 starts the recovery.
const power = asset.animations.find(clip => clip.name === 'Power')!;
for (const [action, frame] of [[state.actions.Power, 20], [state.actions.PowerLower, 80]] as const) {
  const endpoint = archmageSegment(power, 'Endpoint', frame / 24, frame / 24 + 1e-4);
  for (const [index, track] of action.getClip().tracks.entries()) {
    const offset = frame === 20 ? track.values.length - track.getValueSize() : 0;
    const actual = Array.from(track.values.slice(offset, offset + track.getValueSize()));
    const expected = Array.from(endpoint.tracks[index].values.slice(0, track.getValueSize()));
    assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 1e-5));
  }
}

for (const squares of [1, 2, 3, 5]) {
  const durationMs = archmageMovementDuration(squares);
  const gait = squares <= 2 ? 'Walk' : 'Running';
  state.update(.02, { squares, travelledDistance: 1.92 * squares * .4, bodyScale: 1 });
  assert.equal(state.current, gait);
  assert.ok(Math.abs(state.actions[gait].time - ((durationMs * .4 / 1000) % state.actions[gait].getClip().duration)) < 1e-5);
  state.cancelPower();
}
const diagonal = merylinRouteMotion([{ x: 0, z: 0 }, { x: 1.92, z: 1.92 }, { x: 3.84, z: 1.92 }], .5);
state.update(.02, { squares: 2, travelledDistance: diagonal.travelledDistance, bodyScale: 1 });
const diagonalTime = state.actions.Walk.time;
state.update(.02, { squares: 2, travelledDistance: diagonal.travelledDistance, bodyScale: 1 });
assert.equal(state.actions.Walk.time, diagonalTime, 'Animation follows distance even if a render frame repeats.');
state.cancelPower();

const effect = new SpellblockVisual(new THREE.Scene(), new THREE.Vector3(), new THREE.Vector3(0, 0, 2), 1000, 3);
state.update(.02, undefined, true, false, SPELLBLOCK_ASSEMBLY_MS / 1000);
assert.equal(state.current, 'Wall');
assert.equal(state.actions.Wall.time, SPELLBLOCK_ASSEMBLY_MS / 1000);
state.update(4, undefined, true, false, 4);
assert.equal(state.actions.Wall.time, SPELLBLOCK_ASSEMBLY_MS / 1000, 'Hold frame 40 while the wall survives.');
effect.impact(2000);
assert.equal(effect.update(3349), true);
assert.equal(effect.update(3350), false);
state.update(.02); assert.equal(state.current, 'Idle');
state.startPower({ phase: 'playing', holdAtEnd: true });
state.cancelPower(); assert.equal(state.power, undefined);
state.update(.02, { squares: 3, travelledDistance: 1, bodyScale: 1 });
state.startDeath(5000); assert.equal(state.current, 'Dead');
assert.ok(state.deathEndsAt! > 5000);
state.update(10); assert.equal(state.current, 'Dead');
state.reset(); assert.equal(state.current, 'Idle');
assert.equal(state.deathEndsAt, undefined);

// Shizzle overrides walking and holds its pose between Consume steps on the actual rig.
advance(10.3);
assert.equal(state.current, 'Conjure');
const conjureGlow = asset.scene.getObjectByName('ArchmageConjureGlow')!;
const glowMesh = conjureGlow.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
const glowMaterial = glowMesh.material;
const characterMesh = asset.scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
const originalMaterial = characterMesh.material;
const spectralMaterial = new THREE.MeshBasicMaterial();
applyCharacterHologram(asset.scene, true, () => spectralMaterial);
assert.equal(characterMesh.material, spectralMaterial);
assert.equal(glowMesh.material, glowMaterial, 'Hologram must preserve the active conjure shader.');
state.update(.016, undefined, false, false, undefined, true);
assert.ok(glowMaterial.uniforms.strength.value > 0, 'Conjure fade updates its uniforms during Shizzle without crashing.');
applyCharacterHologram(asset.scene, false, () => spectralMaterial);
assert.equal(characterMesh.material, originalMaterial);
assert.equal(glowMesh.material, glowMaterial);
spectralMaterial.dispose();
state.update(.2, { squares: 2, travelledDistance: 1, bodyScale: 1 }, false, false, undefined, true);
assert.equal(state.current, 'Glide');
asset.scene.updateMatrixWorld(true);
const glideHand = hand.getWorldPosition(new THREE.Vector3());
state.update(2, undefined, false, false, undefined, true);
asset.scene.updateMatrixWorld(true);
assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(glideHand) < 1e-5);
state.update(.2, { squares: 1, travelledDistance: .3, bodyScale: 1 });
assert.equal(state.current, 'Walk', 'Ordinary movement resumes after Shizzle.');
state.startDeath(6000);
state.update(.2, undefined, false, false, undefined, true);
assert.equal(state.current, 'Dead', 'Death must override a pending glide.');
state.reset();
assert.ok(shizzleMovementDuration(2) < archmageMovementDuration(2));

const shizzleScene = new THREE.Scene();
const root = new THREE.Group(); const body = new THREE.Group();
root.add(body); body.add(asset.scene); shizzleScene.add(root);
asset.scene.name = 'LongHatLoganImportedModel';
const shizzleEffect = new ShizzleVisual(shizzleScene, root);
const route = {};
shizzleEffect.update(0, .1, true, route, []);
assert.equal(shizzleScene.children.filter(child => child !== root).some(child => child.getObjectByName('ArchmageConjureGlow')), false,
  'Afterimages must omit independent conjure effects.');
assert.ok(body.position.y > .1);
assert.ok(shizzleScene.children.length > 1, 'Launch ring and afterimage are scene effects.');
for (let frame = 1; frame <= 120; frame++) {
  root.position.z += .05;
  shizzleEffect.update(frame * 16, .016, true, route, []);
  assert.ok(shizzleScene.children.length <= 6, 'Afterimage count stays bounded.');
}
let alive = true;
for (let frame = 121; frame <= 240; frame++) alive = shizzleEffect.update(frame * 16, .016, false, undefined, []);
assert.equal(alive, false);
shizzleEffect.dispose();
assert.equal(body.position.y, 0);
assert.equal(body.rotation.x, 0);
assert.equal(shizzleScene.children.length, 1, 'No transient scene objects survive landing/disposal.');
shizzleScene.remove(root); body.remove(asset.scene);

// Validate actual feet across the corrected full clips, not only controller decisions.
const sampleMixer = new THREE.AnimationMixer(asset.scene);
for (const name of ['Wall', 'Summon', 'Power', 'Conjure', 'Idle']) {
  const clip = asset.animations.find(clip => clip.name === name)!;
  sampleMixer.stopAllAction(); state.mixer.stopAllAction();
  const action = sampleMixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
  action.clampWhenFinished = true;
  for (const time of [1 / 24, .8, 1.6, Math.min(2.9, clip.duration)]) {
    sampleMixer.setTime(time);
    asset.scene.updateMatrixWorld(true);
    for (const side of ['Left', 'Right']) {
      const toe = asset.scene.getObjectByName(`mixamorig${side}ToeBase`)!;
      const end = asset.scene.getObjectByName(`mixamorig${side}Toe_End`)!;
      const from = toe.getWorldPosition(new THREE.Vector3());
      const to = end.getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(to.y - from.y) < .001, `${name}: ${side} boot must be level.`);
    }
  }
}
assert.ok(ARCHMAGE_SCALE > 1);
console.log('Archmage: actual GLB loading/rig, idle cycle, held/released spells, distance-synchronized gaits, wall lifetime, death/reset, and level boots passed.');
