import * as THREE from 'three';

/** Box-sized convex glass Lens in a freestanding, gold-inlaid frame. */
export function createLens(): THREE.Group {
  const root = new THREE.Group(); root.name = 'LensObject';
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a632, metalness: .85, roughness: .24, emissive: 0x5d3708, emissiveIntensity: .15 });
  const darkGold = new THREE.MeshStandardMaterial({ color: 0x755016, metalness: .7, roughness: .35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa9edff, transparent: true, opacity: .5, metalness: .05, roughness: .06, transmission: .55, thickness: .22, ior: 1.5, clearcoat: 1, side: THREE.DoubleSide });
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = material !== glass; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  add('LensGlass', new THREE.SphereGeometry(.48, 32, 20), glass, 0, .8, 0).scale.z = .22;
  add('LensGoldRim', new THREE.TorusGeometry(.52, .065, 12, 48), gold, 0, .8, 0);
  add('LensInlaidRing', new THREE.TorusGeometry(.52, .018, 8, 48), darkGold, 0, .8, -.06);
  for (const side of [-1, 1]) {
    add('LensStand', new THREE.CylinderGeometry(.045, .07, .56, 12), gold, side * .42, .35, 0).rotation.z = side * -.22;
    add('LensFrameStud', new THREE.SphereGeometry(.075, 12, 8), gold, side * .52, .8, 0);
  }
  add('LensFoot', new THREE.BoxGeometry(1.04, .12, .52), darkGold, 0, .06, 0);
  add('LensFootInlay', new THREE.BoxGeometry(.9, .035, .46), gold, 0, .135, 0);
  // A generous invisible hit volume matches ordinary Box selection.
  const hit = add('LensHitArea', new THREE.BoxGeometry(1.12, 1.4, .72), new THREE.MeshBasicMaterial({ visible: false }), 0, .7, 0);
  hit.castShadow = false; hit.receiveShadow = false;
  return root;
}

/** Glass faces local +Z; board x/y map directly to world X/Z. */
export function orientLens(root: THREE.Group, direction?: { x: number; y: number }): void {
  root.rotation.y = direction && (direction.x || direction.y) ? Math.atan2(direction.x, direction.y) : 0;
}

export function disposeLens(root: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse((part) => { if (part instanceof THREE.Mesh) { geometries.add(part.geometry); for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material); } });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
