import * as THREE from 'three';

type Materials = THREE.Material | THREE.Material[];
const surfaces = new WeakMap<THREE.Mesh, { original: Materials; hologram: Materials; castShadow: boolean }>();

/** Spell effects retain their own shaders and animation-controlled materials. */
export function applyCharacterHologram(model: THREE.Object3D, active: boolean, create: (source: Materials) => Materials) {
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh) || child.userData.characterEffect) return;
    let materials = surfaces.get(child);
    if (!materials) {
      if (!active) return;
      materials = { original: child.material, hologram: create(child.material), castShadow: child.castShadow };
      surfaces.set(child, materials);
    }
    child.material = active ? materials.hologram : materials.original;
    child.castShadow = active ? false : materials.castShadow;
  });
}
