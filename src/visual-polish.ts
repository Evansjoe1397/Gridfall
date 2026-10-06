import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { retryAssetLoad } from './retry-asset-load.ts';

/** Independent session switches; arena entry applies its tone-mapping default. */
export const visualPolish = { enabled: true, tiles: true, lighting: true };
export const filmicToneMapping = { enabled: false };
export const polishedNagrandTiles = (arena: string) => visualPolish.enabled && visualPolish.tiles && arena === 'nagrand';

let stone: Promise<THREE.Texture> | undefined;
export function loadPolishStone(anisotropy: number) {
  return stone ??= retryAssetLoad(`${import.meta.env.BASE_URL}textures/nagrand/polish-stone-v1.png`, (url) => new THREE.TextureLoader().loadAsync(url))
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, anisotropy);
      return texture;
    }).catch((error) => { stone = undefined; throw error; });
}

/** Same outer dimensions and top surface as the original collision/raycast slab. */
export function polishedTileGeometry(height: number, column: number, row: number) {
  const geometry = new RoundedBoxGeometry(1.72, height, 1.72, 2, 0.045);
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const colors = new Float32Array(positions.count * 3);
  const turn = (column * 7 + row * 3) % 4;
  for (let i = 0; i < positions.count; i++) {
    let u = uv.getX(i); let v = uv.getY(i);
    for (let rotation = 0; rotation < turn; rotation++) [u, v] = [1 - v, u];
    uv.setXY(i, u, v);
    // Darker sides and lower edges make the existing gaps read as seams.
    const up = Math.max(0, normals.getY(i));
    const lowerEdge = THREE.MathUtils.smoothstep(positions.getY(i), -height / 2, height / 2);
    const shade = THREE.MathUtils.lerp(0.60 + lowerEdge * 0.15, 1, up);
    colors.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function texturePolishedTile(material: THREE.MeshStandardMaterial, column: number, row: number, preserveColor: boolean, raised: boolean, anisotropy: number, protectedTile = false) {
  const variation = ((column * 13 + row * 7) % 11) / 10;
  if (!preserveColor) {
    material.color.setHex(raised ? 0x839185 : protectedTile ? 0x648276 : 0x748077);
    material.color.multiplyScalar(((column + row) % 2 ? 0.87 : 1) * (0.96 + variation * 0.08));
  }
  material.vertexColors = true;
  material.roughness = 0.88 + variation * 0.07;
  material.metalness = 0;
  let disposed = false;
  material.addEventListener('dispose', () => { disposed = true; });
  void loadPolishStone(anisotropy).then((texture) => {
    if (disposed) return;
    material.map = texture;
    material.needsUpdate = true;
  }).catch((error) => console.error('Could not load preview stone; retaining the shaded slab.', error));
}

/** Restore before changes to the existing dawn controls, then capture their new baseline. */
export class ArenaPolishLighting {
  private undo: (() => void) | undefined;

  restore() { this.undo?.(); this.undo = undefined; }

  apply(renderer: THREE.WebGLRenderer, key: THREE.DirectionalLight, fill: THREE.DirectionalLight, ambient: THREE.HemisphereLight, context: { arena: string; width: number; height: number; center: THREE.Vector3 }) {
    this.restore();
    const polishEnabled = visualPolish.enabled && context.arena !== 'pipe';
    if (!polishEnabled && !filmicToneMapping.enabled) return;
    const shadow = key.shadow.camera;
    const baseline = {
      tone: renderer.toneMapping, exposure: renderer.toneMappingExposure,
      keyColor: key.color.clone(), keyPosition: key.position.clone(), keyIntensity: key.intensity,
      fillColor: fill.color.clone(), fillIntensity: fill.intensity,
      ambientIntensity: ambient.intensity, ambientColor: ambient.color.clone(),
      left: shadow.left, right: shadow.right, top: shadow.top, bottom: shadow.bottom,
      bias: key.shadow.bias, normalBias: key.shadow.normalBias,
    };
    this.undo = () => {
      renderer.toneMapping = baseline.tone; renderer.toneMappingExposure = baseline.exposure;
      key.color.copy(baseline.keyColor); key.position.copy(baseline.keyPosition); key.intensity = baseline.keyIntensity;
      fill.color.copy(baseline.fillColor); fill.intensity = baseline.fillIntensity;
      ambient.color.copy(baseline.ambientColor); ambient.intensity = baseline.ambientIntensity;
      Object.assign(shadow, { left: baseline.left, right: baseline.right, top: baseline.top, bottom: baseline.bottom });
      key.shadow.bias = baseline.bias; key.shadow.normalBias = baseline.normalBias;
      shadow.updateProjectionMatrix(); key.shadow.needsUpdate = true;
    };
    if (filmicToneMapping.enabled) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
    }
    if (polishEnabled && visualPolish.lighting) {
      ambient.intensity *= 0.80;
      ambient.color.lerp(new THREE.Color(0xb7cddc), 0.18);
      key.intensity *= 1.08;
      key.color.lerp(new THREE.Color(0xffeedb), 0.18);
      // Keep the established direction, lower the angle just enough to reveal bevels.
      key.position.y *= 0.88;
      fill.intensity = Math.max(fill.intensity * 0.8, baseline.ambientIntensity * 0.20);
      fill.color.lerp(new THREE.Color(0xb4d7e6), 0.3);
      // Fit all board corners, including tall characters and perimeter shadow casters,
      // in light space. Retain the original 1024 map size and avoid extra shadow lights.
      key.updateMatrixWorld(true); key.target.updateMatrixWorld(true);
      key.shadow.updateMatrices(key);
      const bounds = new THREE.Box3();
      for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [-2, 7]) {
        bounds.expandByPoint(new THREE.Vector3(
          context.center.x + x * (context.width * 0.96 + 4.8), y,
          context.center.z + z * (context.height * 0.96 + 4.8),
        ).applyMatrix4(shadow.matrixWorldInverse));
      }
      shadow.left = bounds.min.x - 1; shadow.right = bounds.max.x + 1;
      shadow.bottom = bounds.min.y - 1; shadow.top = bounds.max.y + 1;
      key.shadow.bias = -0.00015;
      key.shadow.normalBias = 0.022;
      shadow.updateProjectionMatrix(); key.shadow.needsUpdate = true;
    }
  }
}
