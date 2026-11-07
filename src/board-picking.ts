import * as THREE from 'three';

/** Pick gameplay surfaces, using the existing character hit areas instead of CPU skinning GLBs. */
export function intersectBoardTargets(raycaster: THREE.Raycaster, roots: Iterable<THREE.Object3D>): THREE.Intersection[] {
  const surfaces: THREE.Object3D[] = [];
  for (const root of roots) {
    if (!root.visible) continue;
    const hitArea = root.getObjectByName('CharacterHitArea');
    if (hitArea) {
      hitArea.updateWorldMatrix(true, false);
      surfaces.push(hitArea);
    } else {
      root.updateWorldMatrix(true, true);
      root.traverseVisible((part) => {
        if (part instanceof THREE.Mesh || part instanceof THREE.Sprite) surfaces.push(part);
      });
    }
  }
  return raycaster.intersectObjects(surfaces, false);
}
