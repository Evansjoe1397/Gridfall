import assert from 'node:assert/strict';
import * as THREE from 'three';
import { orientOrkkShieldUpright, placeOrkkShieldAtRest } from '../src/orkk-shield-rest.ts';

const root = new THREE.Group();
root.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.2)));
for (const heldPose of [
  new THREE.Quaternion(),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
]) {
  for (let repeat = 0; repeat < 3; repeat++) {
    const size = orientOrkkShieldUpright(root, heldPose).getSize(new THREE.Vector3());
    assert.ok(size.y >= Math.max(size.x, size.z) - 0.0001, 'The resting Shield stands on its longest axis.');
  }
}
console.log('Resting Shield stays upright from both held orientations and repeated settlements.');
const imported = new THREE.Group();
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.2));
mesh.rotation.set(0.6, 0.3, 0.4); mesh.position.set(0.5, 1, -0.3);
imported.add(mesh);
const target = new THREE.Vector3(3, 0.2, 4);
placeOrkkShieldAtRest(imported, target);
const pose = imported.quaternion.clone();
const position = imported.position.clone();
const longAxis = new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
assert.ok(longAxis.dot(new THREE.Vector3(0, 1, 0)) > 0.99999, 'Tilted imported geometry stands exactly vertical.');
const bounds = new THREE.Box3().setFromObject(imported);
assert.ok(Math.abs(bounds.min.y - target.y - 0.025) < 0.00001, 'Shield rests on its bottom edge.');
for (let repeat = 0; repeat < 3; repeat++) {
  imported.rotation.set(0.4, repeat + 1, 0.2); // Simulate an intervening animation pose.
  placeOrkkShieldAtRest(imported, target);
  assert.ok(imported.quaternion.angleTo(pose) < 0.00001, 'Repeated settlement keeps a fixed orientation.');
  assert.ok(imported.position.distanceTo(position) < 0.00001, 'Repeated settlement does not drift.');
}
console.log('Imported Shield is vertical, grounded, and stable across repeated settlements.');
