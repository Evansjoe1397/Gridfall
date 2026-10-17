import * as THREE from 'three';

type BloodSpray = {
  root: THREE.Group;
  geometry: THREE.SphereGeometry;
  droplets: { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; velocity: THREE.Vector3; size: number }[];
  startedAt: number;
};

const sprays: BloodSpray[] = [];
const lifetimeMs = 520;
const up = new THREE.Vector3(0, 1, 0);

export function spawnCutThemLegsBlood(scene: THREE.Scene, attacker: THREE.Vector3, target: THREE.Vector3): void {
  const forward = new THREE.Vector3().subVectors(target, attacker).setY(0).normalize();
  if (forward.lengthSq() === 0) forward.set(0, 0, 1);
  const side = new THREE.Vector3().crossVectors(up, forward);
  const root = new THREE.Group();
  root.name = 'CutThemLegsBlood';
  // The near side of the shins, rather than the character's center or chest.
  root.position.copy(target).addScaledVector(forward, -0.22);
  root.position.y += 0.45;
  const geometry = new THREE.SphereGeometry(1, 5, 3);
  const droplets: BloodSpray['droplets'] = [];
  for (let index = 0; index < 20; index++) {
    const spread = index / 19;
    const velocity = side.clone().multiplyScalar((spread - 0.35) * 2.8)
      .addScaledVector(forward, -0.65 - Math.random() * 0.75);
    velocity.y = 0.35 + Math.random() * 1.15;
    const size = 0.018 + Math.random() * 0.024;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: index % 3 === 0 ? 0x790b16 : 0xc51c2e,
      transparent: true,
      depthWrite: false,
    }));
    mesh.scale.set(size, size * 2.8, size);
    mesh.quaternion.setFromUnitVectors(up, velocity.clone().normalize());
    root.add(mesh);
    droplets.push({ mesh, velocity, size });
  }
  scene.add(root);
  sprays.push({ root, geometry, droplets, startedAt: performance.now() });
}

function disposeSpray(spray: BloodSpray): void {
  spray.root.removeFromParent();
  spray.geometry.dispose();
  for (const { mesh } of spray.droplets) mesh.material.dispose();
}

export function updateCutThemLegsBlood(time: number): void {
  for (let index = sprays.length - 1; index >= 0; index--) {
    const spray = sprays[index];
    const age = Math.max(0, time - spray.startedAt);
    if (age >= lifetimeMs) {
      disposeSpray(spray);
      sprays.splice(index, 1);
      continue;
    }
    const seconds = age / 1000;
    const progress = age / lifetimeMs;
    for (const { mesh, velocity, size } of spray.droplets) {
      mesh.position.copy(velocity).multiplyScalar(seconds);
      mesh.position.y -= 2.8 * seconds * seconds;
      mesh.material.opacity = 1 - THREE.MathUtils.smoothstep(progress, 0.2, 1);
      mesh.scale.set(size, size * (2.8 - progress * 1.8), size);
    }
  }
}

export function clearCutThemLegsBlood(): void {
  for (const spray of sprays.splice(0)) disposeSpray(spray);
}
