import * as THREE from 'three';

/** Orient a resting shield from its held pose so its longest visible axis stands upright. */
export function orientOrkkShieldUpright(root: THREE.Group, heldQuaternion: THREE.Quaternion): THREE.Box3 {
  root.quaternion.copy(heldQuaternion);
  root.updateWorldMatrix(true, true);
  let bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.y < Math.max(size.x, size.z)) {
    root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(
      size.x >= size.z ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), Math.PI / 2,
    ));
    root.updateWorldMatrix(true, true);
    bounds = new THREE.Box3().setFromObject(root);
  }
  return bounds;
}
