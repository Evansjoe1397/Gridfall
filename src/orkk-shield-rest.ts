import * as THREE from 'three';

/** Align the shield's actual long axis, rather than its tilted world bounding box. */
export function orientOrkkShieldUpright(root: THREE.Group, heldQuaternion: THREE.Quaternion): THREE.Box3 {
  root.quaternion.copy(heldQuaternion);
  root.updateWorldMatrix(true, true);
  let longest = 0;
  const upright = new THREE.Vector3(0, 1, 0);
  const longAxis = upright.clone();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    child.geometry.computeBoundingBox();
    const size = child.geometry.boundingBox?.getSize(new THREE.Vector3());
    if (!size) return;
    for (const axis of ['x', 'y', 'z'] as const) {
      const vector = new THREE.Vector3(); vector[axis] = size[axis];
      vector.applyMatrix3(new THREE.Matrix3().setFromMatrix4(child.matrixWorld));
      if (vector.length() > longest) { longest = vector.length(); longAxis.copy(vector).normalize(); }
    }
  });
  if (longAxis.y < 0) longAxis.negate();
  root.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(longAxis, upright));
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(root);
}

/** Keep the grounded pose fixed, even when its owner turns or animates. */
export function placeOrkkShieldAtRest(root: THREE.Group, target: THREE.Vector3) {
  root.position.copy(target);
  const restQuaternion = root.userData.shieldRestQuaternion as THREE.Quaternion | undefined;
  if (restQuaternion) root.quaternion.copy(restQuaternion);
  else {
    orientOrkkShieldUpright(root, new THREE.Quaternion());
    root.userData.shieldRestQuaternion = root.quaternion.clone();
  }
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.x += target.x - center.x;
  root.position.z += target.z - center.z;
  root.position.y += target.y - bounds.min.y + 0.025;
  root.updateWorldMatrix(true, true);
}
