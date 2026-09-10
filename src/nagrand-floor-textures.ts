import * as THREE from 'three';
import { retryAssetLoad } from './retry-asset-load.ts';

type StoneMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
let ground: Promise<THREE.Texture> | undefined;
let grass: Promise<THREE.Texture> | undefined;

function loadGrass(anisotropy: number) {
  return grass ??= retryAssetLoad(`${import.meta.env.BASE_URL}textures/nagrand/platform-grass.png?v=1`, (url) => new THREE.TextureLoader().loadAsync(url))
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, anisotropy);
      return texture;
    }).catch((error) => {
      grass = undefined;
      throw error;
    });
}

function loadGround(anisotropy: number) {
  return ground ??= retryAssetLoad(`${import.meta.env.BASE_URL}textures/nagrand/ground.png?v=2`, (url) => new THREE.TextureLoader().loadAsync(url))
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, anisotropy);
      return texture;
    }).catch((error) => {
      ground = undefined;
      throw error;
    });
}

export function textureNagrandTile(mesh: StoneMesh, label: string, anisotropy: number, preserveColor: boolean) {
  const column = label.charCodeAt(0) - 65;
  const row = Number(label.slice(1)) - 1;
  const variant = (column * 3 + row * 5 + Math.floor(column / 2)) % 16;
  const uv = mesh.geometry.attributes.uv;
  const normal = mesh.geometry.attributes.normal;
  // One complete square slab per tile from a 4-by-4 atlas.
  for (let i = 0; i < uv.count; i++) {
    const v = Math.abs(normal.getY(i)) < 0.5 ? 0.04 + uv.getY(i) * 0.08 : uv.getY(i);
    uv.setXY(i, ((variant % 4) + uv.getX(i)) / 4, (Math.floor(variant / 4) + v) / 4);
  }
  uv.needsUpdate = true;
  const material = mesh.material;
  let disposed = false;
  material.addEventListener('dispose', () => { disposed = true; });
  void loadGround(anisotropy).then((texture) => {
    if (disposed) return;
    material.map = texture;
    if (preserveColor) {
      const peak = Math.max(material.color.r, material.color.g, material.color.b);
      if (peak > 0) material.color.multiplyScalar(1 / peak);
    } else {
      material.color.setScalar((column + row) % 2 === 0 ? 1 : 0.7);
    }
    material.roughness = 0.95;
    material.metalness = 0;
    material.needsUpdate = true;
  }).catch((error) => console.error('Failed to load Nagrand tile texture.', error));
}

/** Called after platform sizing and lighting changes, including arena switches. */
export function textureNagrandPlatform(mesh: StoneMesh, enabled: boolean, anisotropy: number) {
  const material = mesh.material;
  const revision = (material.userData.groundRevision ?? 0) + 1;
  material.userData.groundRevision = revision;
  if (!enabled) {
    if (material.map) {
      material.map = null;
      material.roughness = 0.7;
      material.metalness = 0.35;
      material.needsUpdate = true;
    }
    return;
  }
  const uv = mesh.geometry.attributes.uv;
  const positions = mesh.geometry.attributes.position;
  // Continuous turf across the platform, independent of the stone tile atlas.
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, positions.getX(i) * mesh.scale.x / 5.76, positions.getZ(i) * mesh.scale.z / 5.76);
  }
  uv.needsUpdate = true;
  void loadGrass(anisotropy).then((texture) => {
    if (material.userData.groundRevision !== revision) return;
    material.map = texture;
    material.color.setScalar(0.85);
    material.roughness = 1;
    material.metalness = 0;
    material.needsUpdate = true;
  }).catch((error) => console.error('Failed to load Nagrand platform texture.', error));
}
