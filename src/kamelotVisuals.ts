import * as THREE from 'three';

const DURATION_MS = 1900;
type Coronation = {
  root: THREE.Group;
  sigil: THREE.Group;
  fortress: THREE.Group;
  wave: THREE.Mesh;
  sparks: THREE.Mesh[];
  materials: THREE.MeshBasicMaterial[];
  startedAt: number;
};
const effects: Coronation[] = [];

/** A tile-sized spectral keep assembles around the caster, then dissolves. */
export function spawnKamelot(scene: THREE.Scene, position: THREE.Vector3, color: number, defense: number): void {
  const root = new THREE.Group();
  root.name = 'KamelotCoronation';
  root.position.copy(position).add(new THREE.Vector3(0, 0.035, 0));
  const materials: THREE.MeshBasicMaterial[] = [];
  const material = (tint: number) => {
    const surface = new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    materials.push(surface);
    return surface;
  };
  const gold = material(0xffd78a);
  const blue = material(color);
  const mist = material(color);
  const sigil = new THREE.Group();
  const fortress = new THREE.Group();
  root.add(sigil, fortress);
  const ring = (inner: number, outer: number, surface: THREE.MeshBasicMaterial) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), surface);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };
  sigil.add(ring(0.69, 0.715, gold), ring(0.79, 0.805, blue));
  for (let i = 0; i < 12; i++) {
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.045, i % 3 === 0 ? 0.15 : 0.075), gold);
    const angle = i * Math.PI / 6;
    rune.rotation.set(-Math.PI / 2, 0, -angle);
    rune.position.set(Math.sin(angle) * 0.75, 0.008, Math.cos(angle) * 0.75);
    sigil.add(rune);
  }
  const block = (width: number, height: number, depth: number, x: number, y: number, z: number, surface: THREE.MeshBasicMaterial) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), surface);
    mesh.position.set(x, y, z);
    fortress.add(mesh);
  };
  // Low translucent walls leave Merylin readable; gold merlons evoke a crown.
  const height = 0.38 + Math.min(3, defense) * 0.12;
  for (let side = 0; side < 4; side++) {
    const alongX = side % 2 === 0;
    const edge = side < 2 ? 0.84 : -0.84;
    block(alongX ? 1.68 : 0.025, height, alongX ? 0.025 : 1.68,
      alongX ? 0 : edge, height / 2, alongX ? edge : 0, mist);
    block(alongX ? 1.68 : 0.025, 0.025, alongX ? 0.025 : 1.68,
      alongX ? 0 : edge, height, alongX ? edge : 0, gold);
    for (let tooth = 0; tooth < 5; tooth++) {
      const offset = (tooth - 2) * 0.36;
      block(alongX ? 0.15 : 0.045, 0.13, alongX ? 0.045 : 0.15,
        alongX ? offset : edge, height + 0.065, alongX ? edge : offset, blue);
    }
  }
  const wave = ring(0.76, 0.81, blue);
  wave.position.y = 0.015;
  root.add(wave);
  const sparks = Array.from({ length: 24 }, (_, i) => {
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(i % 3 === 0 ? 0.035 : 0.022), i % 2 ? gold : blue);
    root.add(spark);
    return spark;
  });
  scene.add(root);
  effects.push({ root, sigil, fortress, wave, sparks, materials, startedAt: performance.now() });
  updateKamelot(performance.now());
}

function dispose(effect: Coronation): void {
  effect.root.removeFromParent();
  effect.root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
  effect.materials.forEach((surface) => surface.dispose());
}

export function clearKamelot(): void {
  effects.forEach(dispose);
  effects.length = 0;
}

export function updateKamelot(time: number): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    const progress = Math.max(0, (time - effect.startedAt) / DURATION_MS);
    if (progress >= 1) {
      dispose(effect);
      effects.splice(i, 1);
      continue;
    }
    const reveal = THREE.MathUtils.smoothstep(progress, 0, 0.16);
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.58, 1);
    effect.materials.forEach((surface, index) => { surface.opacity = reveal * fade * (index === 2 ? 0.12 : 0.85); });
    effect.sigil.scale.setScalar(0.45 + 0.55 * reveal);
    effect.sigil.rotation.y = progress * Math.PI / 6;
    const rise = THREE.MathUtils.smoothstep(progress, 0.1, 0.38);
    effect.fortress.scale.y = Math.max(0.001, rise);
    effect.fortress.position.y = Math.max(0, progress - 0.58) * 0.5;
    effect.wave.scale.setScalar(0.4 + Math.min(1, progress * 2.5) * 1.2);
    effect.wave.visible = progress < 0.5;
    effect.sparks.forEach((spark, index) => {
      const phase = index / effect.sparks.length;
      const angle = phase * Math.PI * 2 + progress * 1.5;
      const radius = 0.65 + 0.17 * Math.sin(index * 2.4);
      spark.position.set(Math.cos(angle) * radius, 0.08 + progress * (0.8 + phase * 1.2), Math.sin(angle) * radius);
      spark.rotation.y = progress * 4 + index;
      spark.scale.setScalar(Math.sin(Math.PI * Math.min(1, progress * 1.4)));
    });
  }
}
