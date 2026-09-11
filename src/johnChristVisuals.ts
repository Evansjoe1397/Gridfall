import * as THREE from 'three';

/** Create in Idle after attaching/scaling the model; the head carries it thereafter. */
export function attachJohnHealthAnchor(model: THREE.Object3D): THREE.Object3D {
  model.updateWorldMatrix(true, true);
  // SkinnedMesh overrides updateMatrixWorld (not updateWorldMatrix) to refresh
  // its attached-mode inverse bind matrix before CPU vertex measurements.
  model.updateMatrixWorld(true);
  const head = model.getObjectByName('Head');
  if (!head) throw new Error('John Christ model is missing its Head bone.');
  const point = new THREE.Vector3();
  let top = -Infinity;
  model.traverse((part) => {
    if (!(part instanceof THREE.SkinnedMesh)) return;
    part.skeleton.update();
    for (let i = 0; i < part.geometry.attributes.position.count; i++) {
      part.getVertexPosition(i, point).applyMatrix4(part.matrixWorld);
      top = Math.max(top, point.y);
    }
  });
  if (!Number.isFinite(top)) throw new Error('John Christ model has no skinned surface.');
  const anchor = new THREE.Object3D();
  anchor.name = 'JohnHealthAnchor';
  head.getWorldPosition(point);
  point.y = top;
  anchor.position.copy(head.worldToLocal(point));
  head.add(anchor);
  return anchor;
}
