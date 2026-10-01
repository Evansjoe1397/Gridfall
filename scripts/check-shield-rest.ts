import assert from 'node:assert/strict';
import * as THREE from 'three';
import { orientOrkkShieldUpright } from '../src/orkk-shield-rest.ts';

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
