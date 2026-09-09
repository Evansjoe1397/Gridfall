import * as THREE from 'three';

const samples = new Map<string, Promise<THREE.Texture>>();

/** Decorate the existing box; retain its geometry, material and emissive highlights. */
export function textureTrenchTile(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
  label: string,
  anisotropy: number,
  preserveColor = false,
) {
  const trench = /^[C-F][45]$/.test(label);
  const column = label.charCodeAt(0) - 65;
  const row = Number(label.slice(1)) - 1;
  // Stable variation across rebuilds, without a short repeating row pattern.
  const variant = ((column * 3 + row * 5 + Math.floor(column / 2) + Math.floor(row / 3)) % 4) + 1;
  const sampleName = trench ? label : `base-${variant}`;
  let sample = samples.get(sampleName);
  if (!sample) {
    sample = new THREE.TextureLoader()
      .loadAsync(`${import.meta.env.BASE_URL}textures/trench/${sampleName}.png`)
      .then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, anisotropy);
        return texture;
      });
    samples.set(sampleName, sample);
  }

  // Show the complete sample on top. Thin edge strips wrap the vertical faces
  // without squeezing an entire square texture into the tile's 0.16 thickness.
  const uv = mesh.geometry.attributes.uv;
  const normal = mesh.geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    if (mesh.geometry instanceof THREE.BoxGeometry && Math.abs(normal.getY(i)) < 0.5) uv.setY(i, 0.04 + uv.getY(i) * 0.08);
  }
  uv.needsUpdate = true;
  const material = mesh.material;
  let disposed = false;
  material.addEventListener('dispose', () => { disposed = true; });
  void sample.then((texture) => {
    if (disposed) return;
    material.map = texture;
    if (preserveColor) {
      // Keep team/draw hues legible without multiplying the dark
      // sampled stone by the original dark flat color a second time.
      const peak = Math.max(material.color.r, material.color.g, material.color.b);
      if (peak > 0) material.color.multiplyScalar(1 / peak);
    } else {
      material.color.setScalar(trench || (column + row) % 2 === 0 ? 1 : 0.92);
    }
    material.roughness = 0.9;
    material.metalness = 0;
    material.needsUpdate = true;
  }).catch((error) => {
    samples.delete(sampleName);
    console.error(`Failed to load The Trench texture ${sampleName}; keeping its original material.`, error);
  });
}
