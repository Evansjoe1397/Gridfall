import * as THREE from 'three';

type Effect = {
  root: THREE.Group;
  potato: THREE.Group;
  rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  sparks: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[];
  startedAt: number;
  choice: 'heal' | 'cleanse';
  follow?: THREE.Object3D;
};
const effects: Effect[] = [];

function dispose(effect: Effect) {
  effect.root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  effect.root.traverse(part => {
    if (part instanceof THREE.Mesh) {
      geometries.add(part.geometry);
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function clearSweetPotatoEffects() {
  effects.forEach(dispose);
  effects.length = 0;
}

/** Both uses share a roasted potato pop; their recovery bursts differ in motion and color. */
export function spawnSweetPotatoEffect(scene: THREE.Scene, position: THREE.Vector3, choice: Effect['choice'], follow?: THREE.Object3D) {
  const root = new THREE.Group();
  root.name = `SweetPotato-${choice}`;
  root.position.copy(position);
  const potato = new THREE.Group();
  const skin = new THREE.MeshBasicMaterial({ color: 0xa34b68, transparent: true });
  const flesh = new THREE.MeshBasicMaterial({ color: 0xffc568, transparent: true, toneMapped: false });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 10), skin);
  body.scale.set(1.65, 0.8, 0.85);
  potato.add(body);
  for (let i = 0; i < 3; i++) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.015, 0.22), flesh);
    slit.position.set((i - 1) * 0.13, 0.175, 0);
    slit.rotation.y = -0.4;
    potato.add(slit);
  }
  root.add(potato);
  const glow = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const rings = Array.from({ length: 3 }, (_, i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.72, 48), glow(choice === 'heal' ? 0xffd480 : 0x8af5ff));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08 + i * 0.15;
    root.add(ring);
    return ring;
  });
  const sparkGeometry = new THREE.OctahedronGeometry(0.045);
  const sparks = Array.from({ length: 24 }, (_, i) => {
    const spark = new THREE.Mesh(sparkGeometry, glow(choice === 'heal' ? (i % 3 ? 0x85ffad : 0xffd480) : (i % 3 ? 0xa1faff : 0xb08aff)));
    root.add(spark);
    return spark;
  });
  root.traverse(part => { part.raycast = () => {}; });
  scene.add(root);
  effects.push({ root, potato, rings, sparks, startedAt: performance.now(), choice, follow });
}

export function updateSweetPotatoEffects(time: number) {
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index];
    const age = Math.max(0, (time - effect.startedAt) / 1000);
    if (age >= 1.65) {
      dispose(effect);
      effects.splice(index, 1);
      continue;
    }
    if (effect.follow) effect.follow.getWorldPosition(effect.root.position);
    const pop = THREE.MathUtils.clamp(age / 0.2, 0, 1);
    const consume = THREE.MathUtils.clamp((age - 0.32) / 0.24, 0, 1);
    effect.potato.scale.setScalar(Math.sin(pop * Math.PI / 2) * (1 - consume));
    effect.potato.position.set(0, 1.8 + Math.sin(pop * Math.PI / 2) * 0.4 - consume * 0.35, 0);
    effect.potato.rotation.set(0.25, age * 2.5, Math.sin(age * 10) * 0.12);
    const burst = THREE.MathUtils.clamp((age - 0.46) / 1.15, 0, 1);
    const envelope = Math.sin(Math.PI * burst);
    const heal = effect.choice === 'heal';
    effect.rings.forEach((ring, i) => {
      const progress = THREE.MathUtils.clamp((burst - i * 0.1) / 0.8, 0, 1);
      ring.material.opacity = Math.sin(progress * Math.PI) * 0.65;
      ring.scale.setScalar(heal ? 0.7 + progress * 0.8 : 0.4 + progress * 2.3);
      ring.position.y = heal ? 0.08 + i * 0.22 + progress * 1.5 : 0.08 + i * 0.38;
    });
    effect.sparks.forEach((spark, i) => {
      const angle = i * Math.PI * 2 / 24 + (heal ? burst * 3 : burst * 0.3);
      const radius = heal ? 0.6 + Math.sin(burst * Math.PI) * 0.2 : 0.35 + burst * (1.3 + (i % 3) * 0.2);
      spark.position.set(Math.cos(angle) * radius, heal ? 0.2 + burst * 2 + (i % 4) * 0.15 : 0.4 + (i % 5) * 0.3 + Math.sin(burst * Math.PI) * 0.4, Math.sin(angle) * radius);
      spark.rotation.set(burst * 5 + i, burst * 3, i);
      spark.scale.setScalar(heal ? 0.6 + envelope : (1 - burst) * 1.8);
      spark.material.opacity = envelope * 0.9;
    });
  }
}
