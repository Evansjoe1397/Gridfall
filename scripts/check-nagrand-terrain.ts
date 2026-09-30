import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNagrandMountains, NAGRAND_LANDSCAPE_SCALE } from '../src/nagrand-mountains.ts';

// CPU-only checks: keep scenic geometry below the board and outside camera rays.
const landscape = createNagrandMountains({ value: 0 });
landscape.sync(true, new THREE.Vector3(), 24.96);
landscape.setDaylight(true);
landscape.group.updateMatrixWorld(true);
const obstacles: THREE.Object3D[] = [];
let triangles = 0;
let draws = 0;
landscape.group.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  draws++;
  const positions = object.geometry.getAttribute('position');
  for (const name of ['position', 'normal', 'color']) {
    const attribute = object.geometry.getAttribute(name);
    if (attribute) assert.ok(Array.from(attribute.array).every(Number.isFinite), `${object.name}: finite ${name}`);
  }
  const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
  triangles += (object.geometry.index?.count ?? positions.count) / 3 * instances;
  if (!object.material.transparent) obstacles.push(object);
});
assert.ok(triangles < 100_000, 'Keep landscape within its triangle budget');
assert.ok(draws <= 8, 'Batch rocks and mountain ranges');
const summit = landscape.group.getObjectByName('FlatGrassySummitAndCliffs') as THREE.Mesh;
const positions = summit.geometry.getAttribute('position');
const normals = summit.geometry.getAttribute('normal');
for (let i = 0; i < 114; i++) assert.ok(Math.abs(positions.getY(i) + .19) < 1e-6, 'Flat supporting crown');
assert.ok(normals.getY(positions.count - 1) > .99, 'Cap faces upward');
const ranges = landscape.group.getObjectByName('LayeredDistantMountainRanges') as THREE.Mesh;
assert.equal(new Set(ranges.userData.landforms).size, 8, 'Eight distinct connected landforms');

const ray = new THREE.Raycaster();
const valleyFloor = landscape.group.getObjectByName('ContinuousRockyValleyFloor') as THREE.Mesh;
assert.ok(valleyFloor, 'Ground must close the gaps between mountain ranges');
for (const x of [-500, -200, -60, 0, 60, 200, 500]) {
  for (const z of [-500, -200, -60, 0, 60, 200, 500]) {
    ray.set(new THREE.Vector3(x, 0, z), new THREE.Vector3(0, -1, 0));
    ray.far = 200;
    const groundHits = ray.intersectObject(valleyFloor, false);
    assert.ok(groundHits.length > 0, `No valley ground beneath ${x}/${z}`);
    assert.ok(groundHits[0].point.y < -155 * NAGRAND_LANDSCAPE_SCALE, 'Valley stays below mountain bases');
  }
}
let sightlines = 0;
for (const distance of [7, 30, 58, 100]) {
  for (const polar of [.38, .82, Math.PI / 2.15]) {
    for (let orbit = 0; orbit < 24; orbit++) {
      const camera = new THREE.Vector3().setFromSphericalCoords(distance, polar, orbit * Math.PI / 12);
      for (const x of [-6.72, 0, 6.72]) for (const z of [-6.72, 0, 6.72]) {
        const direction = new THREE.Vector3(x, .12, z).sub(camera);
        ray.set(camera, direction.clone().normalize());
        ray.far = direction.length();
        assert.equal(ray.intersectObjects(obstacles, false).length, 0,
          `Terrain blocks board: distance=${distance}, polar=${polar}, orbit=${orbit}, cell=${x}/${z}`);
        sightlines++;
      }
    }
  }
}

const shader = {
  vertexShader: THREE.ShaderLib.standard.vertexShader,
  fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {},
};
(summit.material as THREE.MeshStandardMaterial).onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
assert.ok(shader.vertexShader.includes('rockPosition = position;'));
assert.ok(shader.fragmentShader.includes('float fissure ='));
landscape.sync(false, new THREE.Vector3(3, 0, 4), 24.96);
landscape.setDaylight(false);
assert.equal(landscape.group.visible, false);
assert.equal(landscape.group.getObjectByName('LowDriftingValleyMist')!.visible, false);
assert.equal(landscape.group.position.x, 3);
assert.equal(landscape.group.position.z, 4);
console.log(`Nagrand terrain: ${triangles} triangles, ${draws} draws, ${sightlines} clear sightlines; finite geometry, flat crown, arena isolation and shader injection passed.`);
