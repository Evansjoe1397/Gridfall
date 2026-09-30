import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArenaPolishLighting, filmicToneMapping, polishedNagrandTiles, polishedTileGeometry, visualPolish } from '../src/visual-polish.ts';

// No browser/WebGL needed: verify reversible scene state and gameplay dimensions.
assert.equal(visualPolish.enabled, false);
assert.equal(filmicToneMapping.enabled, false);
const renderer = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 } as THREE.WebGLRenderer;
const key = new THREE.DirectionalLight(0xffffff, 2.8);
key.position.set(4, 18, 5);
Object.assign(key.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 0.5, far: 60 });
key.shadow.bias = -0.00025; key.shadow.normalBias = 0.035;
const fill = new THREE.DirectionalLight(0xffb56b, 0);
const ambient = new THREE.HemisphereLight(0xbde8dc, 0x07100e, 1.6);
const controller = new ArenaPolishLighting();
const context = { arena: 'nagrand', width: 8, height: 8, center: new THREE.Vector3(0, 0.12, 0) };
const snapshot = () => ({
  renderer: [renderer.toneMapping, renderer.toneMappingExposure],
  key: [key.color.toArray(), key.position.toArray(), key.intensity],
  fill: [fill.color.toArray(), fill.intensity], ambient: [ambient.color.toArray(), ambient.intensity],
  shadow: [key.shadow.camera.left, key.shadow.camera.right, key.shadow.camera.top, key.shadow.camera.bottom, key.shadow.bias, key.shadow.normalBias],
});
const original = snapshot();
controller.apply(renderer, key, fill, ambient, context);
assert.deepEqual(snapshot(), original, 'Off by default must be a no-op');
visualPolish.enabled = true;
assert.equal(polishedNagrandTiles('nagrand'), true);
for (const arena of ['trench', 'lordaeron', 'pipe']) assert.equal(polishedNagrandTiles(arena), false);
for (let round = 0; round < 5; round++) {
  controller.apply(renderer, key, fill, ambient, context);
  assert.equal(renderer.toneMapping, THREE.NoToneMapping, 'Shift+V must not enable filmic tone mapping');
  const first = snapshot();
  controller.apply(renderer, key, fill, ambient, context);
  assert.deepEqual(snapshot(), first, 'Repeated application must not accumulate light changes');
  controller.restore();
  assert.deepEqual(snapshot(), original, 'Disabling must restore the exact baseline');
}
for (const lighting of [false, true]) for (const color of [false, true]) {
  visualPolish.lighting = lighting; filmicToneMapping.enabled = color;
  controller.apply(renderer, key, fill, ambient, context);
  assert.equal(renderer.toneMapping, color ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping);
  if (!lighting) assert.deepEqual(snapshot().key, original.key);
  controller.restore(); assert.deepEqual(snapshot(), original);
}
visualPolish.lighting = true;
filmicToneMapping.enabled = false;

// Shift+B changes only renderer color processing with Shift+V either on or off.
for (const arena of ['nagrand', 'trench', 'lordaeron', 'pipe']) {
  for (const polish of [false, true]) {
    visualPolish.enabled = polish;
    controller.apply(renderer, key, fill, ambient, { ...context, arena });
    const beforeToneMapping = snapshot();
    filmicToneMapping.enabled = true;
    controller.apply(renderer, key, fill, ambient, { ...context, arena });
    const afterToneMapping = snapshot();
    assert.deepEqual(afterToneMapping.renderer, [THREE.ACESFilmicToneMapping, 1.12]);
    const { renderer: beforeRenderer, ...beforeLighting } = beforeToneMapping;
    const { renderer: afterRenderer, ...afterLighting } = afterToneMapping;
    assert.deepEqual(afterLighting, beforeLighting, 'Shift+B must not alter lights or shadows');
    visualPolish.enabled = !polish;
    controller.apply(renderer, key, fill, ambient, { ...context, arena });
    assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping, 'Shift+V must preserve Shift+B state');
    visualPolish.enabled = polish;
    filmicToneMapping.enabled = false;
    controller.apply(renderer, key, fill, ambient, { ...context, arena });
    assert.deepEqual(snapshot(), beforeToneMapping, 'Shift+B off must restore exactly');
    controller.restore();
    assert.deepEqual(snapshot(), original);
  }
}
visualPolish.enabled = true;
// Simulate switching to dawn while active: restore, update baseline, reapply.
controller.apply(renderer, key, fill, ambient, context); controller.restore();
key.position.set(-7, 11, -4); key.color.setHex(0xfff0d2); key.intensity = 3.35;
fill.intensity = 0.75; ambient.intensity = 1.45;
const dawn = snapshot();
controller.apply(renderer, key, fill, ambient, { ...context, arena: 'lordaeron', height: 11 });
controller.restore(); assert.deepEqual(snapshot(), dawn);
controller.apply(renderer, key, fill, ambient, context);
controller.apply(renderer, key, fill, ambient, { ...context, arena: 'pipe' });
assert.deepEqual(snapshot(), dawn, 'Switching to unfinished Pipe must restore the baseline');

for (const height of [0.16, 0.54]) {
  const geometry = polishedTileGeometry(height, 3, 2);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 1.72) < 0.00001 && Math.abs(size.z - 1.72) < 0.00001);
  assert.ok(Math.abs(size.y - height) < 0.00001, 'Bevel must preserve tile elevations');
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
  const hit = raycaster.intersectObject(mesh)[0];
  assert.ok(hit && Math.abs(hit.point.y - height / 2) < 0.00001, 'Cell center remains pickable at the original surface');
  geometry.dispose(); mesh.material.dispose();
}
visualPolish.enabled = false;
console.log('Visual polish: default off, arena scope, reversible lighting, independent Shift+B tone mapping, mode changes, tile dimensions and raycasting passed.');
