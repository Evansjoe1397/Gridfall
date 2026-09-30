import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStormAtmosphere } from '../src/storm-atmosphere.ts';

// Validate ray reconstruction against Three's camera rays without a browser.
const { sky, rain, wind } = createStormAtmosphere({ value: 5.2 });
assert.equal(sky.geometry.getAttribute('position').count, 3, 'No internal sky triangle edges');
assert.equal(sky.material.depthWrite, false);
assert.equal(sky.material.depthTest, false);
assert.equal(sky.frustumCulled, false, 'Screen-space sky must survive camera rotation');
const camera = new THREE.PerspectiveCamera(38, 1.7, .1, 2000);
const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
for (const offset of [0, 85, -120]) {
  camera.setViewOffset(1100, 650, 0, offset, 1100, 650);
  for (const angle of [0, 1.3, 3.5, 5.8]) {
    camera.position.set(Math.cos(angle) * 45, 32, Math.sin(angle) * 45);
    camera.lookAt(-1, 0, 2);
    camera.updateMatrixWorld(true);
    sky.onBeforeRender({} as THREE.WebGLRenderer, scene, camera, sky.geometry, sky.material, null!);
    for (const [x, y] of [[0, 0], [-.95, -.9], [.95, -.9], [-.95, .9], [.95, .9]]) {
      const ray = new THREE.Vector4(x, y, 1, 1).applyMatrix4(sky.material.uniforms.inverseProjection.value);
      const direction = new THREE.Vector3(ray.x, ray.y, ray.z)
        .transformDirection(sky.material.uniforms.cameraWorld.value);
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      assert.ok(direction.distanceTo(raycaster.ray.direction) < 1e-10, 'Sky must align across rotation and off-center projections');
    }
  }
}
for (const object of [sky, rain, ...wind.children]) {
  if (!(object instanceof THREE.Mesh)) continue;
  object.geometry.dispose();
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach(material => material.dispose());
}
console.log('Storm sky checks passed: edge-free screen triangle and 60 camera-ray comparisons, including off-center views.');
