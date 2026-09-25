import * as THREE from 'three';

export const FLURRY_DURATION_MS = 700;
type FlurryEffect = {
  root: THREE.Group;
  startedAt: number;
  materials: { material: THREE.MeshBasicMaterial; opacity: number }[];
};
const effects: FlurryEffect[] = [];

/** Horizontal saber wheel: every grip faces the character, every blade points out. */
export function spawnFlurry(scene: THREE.Scene, position: THREE.Vector3): void {
  const root = new THREE.Group();
  root.name = 'FlurryLightsabers';
  root.position.copy(position);
  root.position.y += 1.05;
  const materials: FlurryEffect['materials'] = [];
  const material = (color: number, opacity = 1, glow = false) => {
    const result = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide, toneMapped: false,
    });
    materials.push({ material: result, opacity });
    return result;
  };
  const grip = material(0x263446);
  const metal = material(0xc8d9e8);
  const core = material(0xe5faff, 1, true);
  const halo = material(0x269dff, 0.25, true);
  const trails = Array.from({ length: 7 }, (_, i) => material(0x299fff, 0.13 * (1 - i / 7), true));
  for (let i = 0; i < 4; i++) {
    const saber = new THREE.Group();
    saber.rotation.y = i * Math.PI / 2;
    const cylinder = (radius: number, length: number, x: number, surface: THREE.MeshBasicMaterial) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), surface);
      mesh.rotation.z = -Math.PI / 2;
      mesh.position.x = x;
      saber.add(mesh);
    };
    cylinder(0.048, 0.3, 0.57, grip);
    cylinder(0.056, 0.065, 0.43, metal);
    cylinder(0.06, 0.085, 0.73, metal);
    for (let band = 0; band < 3; band++) cylinder(0.051, 0.018, 0.5 + band * 0.065, metal);
    cylinder(0.026, 1.0, 1.27, core);
    cylinder(0.048, 1.02, 1.27, halo);
    // Short swept sectors trail behind each blade in the horizontal X/Z plane.
    trails.forEach((surface, index) => {
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.79, 1.77, 8, 1, index * 0.06, 0.06), surface);
      arc.rotation.x = Math.PI / 2;
      saber.add(arc);
    });
    root.add(saber);
  }
  scene.add(root);
  effects.push({ root, materials, startedAt: performance.now() });
}

function dispose(effect: FlurryEffect): void {
  effect.root.removeFromParent();
  effect.root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
  effect.materials.forEach(({ material }) => material.dispose());
}

export function clearFlurries(): void {
  effects.forEach(dispose);
  effects.length = 0;
}

export function updateFlurries(time: number): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    const age = Math.max(0, time - effect.startedAt);
    if (age >= FLURRY_DURATION_MS) {
      dispose(effect);
      effects.splice(i, 1);
      continue;
    }
    const t = age / FLURRY_DURATION_MS;
    effect.root.rotation.y = t * Math.PI * 4.5;
    const fade = Math.min(1, age / 45) * (1 - THREE.MathUtils.smoothstep(age, 530, FLURRY_DURATION_MS));
    effect.materials.forEach(({ material, opacity }) => { material.opacity = opacity * fade; });
    effect.root.scale.setScalar(0.9 + Math.min(1, age / 90) * 0.1);
  }
}
