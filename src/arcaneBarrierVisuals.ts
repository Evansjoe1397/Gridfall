import * as THREE from 'three';

type BarrierEffect = { root: THREE.Group; shield: THREE.Group; wave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; sparks: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[]; startedAt: number; travel: number; blocked: boolean };
const effects: BarrierEffect[] = [];

/** A directional ward that releases its energy along the forced movement. */
export function spawnArcaneBarrier(scene: THREE.Scene, defender: THREE.Vector3, attacker: THREE.Vector3, destination: THREE.Vector3, blocked: boolean): void {
  const root = new THREE.Group();
  root.name = 'ArcaneBarrierPush';
  root.position.copy(defender);
  const direction = attacker.clone().sub(defender);
  root.rotation.y = Math.atan2(direction.x, direction.z);
  const distance = Math.hypot(direction.x, direction.z);
  const material = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const shield = new THREE.Group();
  shield.position.set(0, 1.15, distance * 0.52);
  shield.rotation.x = -0.35;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.83, 6), material(0x8153ff, 0.38));
  shield.add(disc);
  for (let i = 0; i < 2; i++) {
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.76 + i * 0.15, 0.81 + i * 0.15, i ? 48 : 6), material(i ? 0xb194ff : 0x99faff, 1));
    rim.rotation.z = i ? 0 : Math.PI / 6;
    shield.add(rim);
  }
  for (let i = 0; i < 6; i++) {
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.15), material(0xe4faff, 1));
    const angle = i * Math.PI / 3;
    rune.position.set(Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0.015);
    rune.rotation.z = angle - Math.PI / 2;
    shield.add(rune);
  }
  root.add(shield);
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.88, 64), material(0x72eaff, 0.8));
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = 0.09;
  root.add(wave);
  const sparks: BarrierEffect['sparks'] = [];
  for (let i = 0; i < 24; i++) {
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), material(i % 3 ? 0x99faff : 0xb58aff, 0.95));
    root.add(spark);
    sparks.push(spark);
  }
  root.traverse((child) => { if (child instanceof THREE.Mesh) child.renderOrder = 110; });
  scene.add(root);
  effects.push({ root, shield, wave, sparks, startedAt: performance.now(), travel: distance + (blocked ? 0 : destination.distanceTo(attacker)), blocked });
}

export function updateArcaneBarriers(time: number): void {
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index];
    const t = Math.max(0, (time - effect.startedAt) / 1400);
    if (t >= 1) {
      effect.root.removeFromParent();
      effect.root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      effects.splice(index, 1);
      continue;
    }
    const release = 1 - Math.pow(1 - t, 3);
    const fade = Math.pow(1 - t, 0.85);
    effect.shield.scale.setScalar(0.7 + release * 0.6);
    effect.shield.rotation.z = t * 0.35;
    effect.shield.children.forEach((child, i) => {
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = fade * (i === 0 ? 0.38 : 1);
    });
    effect.wave.scale.setScalar(0.4 + release * 2.1);
    effect.wave.material.opacity = fade * 0.65;
    effect.sparks.forEach((spark, i) => {
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const spread = (effect.blocked ? 0.95 : 0.45) * release;
      spark.position.set(Math.cos(angle) * spread, 0.9 + Math.sin(angle) * spread - t * t * 0.3, 0.4 + release * effect.travel * (0.65 + (i % 5) * 0.075));
      spark.scale.set(1 - t * 0.7, 1 - t * 0.7, effect.blocked ? 1.6 : 3.5);
      spark.material.opacity = fade;
    });
  }
}
