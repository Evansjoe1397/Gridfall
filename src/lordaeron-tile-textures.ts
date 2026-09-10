import * as THREE from 'three';

const samples = new Map<number, Promise<THREE.Texture>>();

/** Apply sampled cemetery stone to existing tiles, retaining gameplay highlights. */
export function textureLordaeronTile(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
  label: string,
  anisotropy: number,
  preserveColor: boolean,
) {
  const column = label.charCodeAt(0) - 65;
  const row = Number(label.slice(1)) - 1;
  const variant = ((column * 3 + row * 5 + Math.floor(column / 2) + Math.floor(row / 3)) % 6) + 1;
  let sample = samples.get(variant);
  if (!sample) {
    sample = new THREE.TextureLoader()
      .loadAsync(`${import.meta.env.BASE_URL}textures/lordaeron/base-${variant}.png`)
      .then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, anisotropy);
        return texture;
      });
    samples.set(variant, sample);
  }

  // Wrap only a thin stone strip around the shallow vertical box faces.
  const uv = mesh.geometry.attributes.uv;
  const normal = mesh.geometry.attributes.normal;
  if (mesh.geometry instanceof THREE.BoxGeometry) {
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(normal.getY(i)) < 0.5) uv.setY(i, 0.04 + uv.getY(i) * 0.08);
    }
    uv.needsUpdate = true;
  }
  const material = mesh.material;
  let disposed = false;
  material.addEventListener('dispose', () => { disposed = true; });
  void sample.then((texture) => {
    if (disposed) return;
    material.map = texture;
    if (preserveColor) {
      const peak = Math.max(material.color.r, material.color.g, material.color.b);
      if (peak > 0) material.color.multiplyScalar(1 / peak);
    } else {
      // Samples capture stone detail but have similar average brightness.
      // Use a clear checkerboard contrast; an 8% linear difference was barely
      // visible after lighting and output color conversion.
      material.color.setScalar((column + row) % 2 === 0 ? 1.12 : 0.68);
    }
    material.roughness = 0.9;
    material.metalness = 0;
    material.needsUpdate = true;
  }).catch((error) => {
    samples.delete(variant);
    console.error(`Failed to load Lordaeron texture ${variant}; keeping its original material.`, error);
  });
}
