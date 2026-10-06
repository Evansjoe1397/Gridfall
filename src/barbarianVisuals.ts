import * as THREE from 'three';

const DURATION_MS = 1700;
type RageBurst = {
  root: THREE.Group;
  shockwave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  slashes: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  spikes: THREE.Group;
  embers: THREE.InstancedMesh;
  materials: THREE.MeshBasicMaterial[];
  startedAt: number;
  strength: number;
};
const bursts: RageBurst[] = [];
const emberTransform = new THREE.Object3D();

/** A short, explosive battle aura; it never delays the next gameplay action. */
export function spawnBarbarian(scene: THREE.Scene, position: THREE.Vector3, level: number): void {
  const root = new THREE.Group();
  root.name = 'BarbarianRageBurst';
  root.position.copy(position).add(new THREE.Vector3(0, 0.04, 0));
  const strength = 1 + (THREE.MathUtils.clamp(level, 1, 3) - 1) * 0.18;
  const materials: THREE.MeshBasicMaterial[] = [];
  const material = (color: number) => {
    const result = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    materials.push(result);
    return result;
  };
  const shockwave = new THREE.Mesh(new THREE.RingGeometry(0.79, 0.9, 64), material(0xff8235));
  shockwave.rotation.x = -Math.PI / 2;
  root.add(shockwave);

  // Broken, tilted arcs read as savage claw strokes instead of a solid shell.
  const slashes = Array.from({ length: 3 }, (_, index) => {
    const slash = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 0.84, 32, 1, 0, Math.PI * 1.1),
      material(index === 1 ? 0xffba64 : 0xff3b16),
    );
    slash.position.y = 0.35 + index * 0.35;
    slash.rotation.set(-Math.PI / 2 + (index - 1) * 0.32, 0.18, index * Math.PI * 2 / 3);
    root.add(slash);
    return slash;
  });
  const spikes = new THREE.Group();
  const spikeMaterial = material(0xff521f);
  const spikeGeometry = new THREE.ConeGeometry(0.07, 0.5, 3);
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
    spike.position.set(Math.cos(angle) * 0.65, 0.22, Math.sin(angle) * 0.65);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(angle) * 0.65, 1, Math.sin(angle) * 0.65).normalize());
    spike.scale.y = 0.65 + (index % 3) * 0.25;
    spikes.add(spike);
  }
  root.add(spikes);
  const embers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.025), material(0xffcb78), 36);
  embers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Instances move each frame within this tiny burst; avoid a stale bounds test.
  embers.frustumCulled = false;
  root.add(embers);
  scene.add(root);
  bursts.push({ root, shockwave, slashes, spikes, embers, materials, strength, startedAt: performance.now() });
  updateBarbarian(performance.now());
}

function dispose(burst: RageBurst): void {
  burst.root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  burst.root.traverse((part) => {
    if (part instanceof THREE.Mesh) geometries.add(part.geometry);
  });
  geometries.forEach((geometry) => geometry.dispose());
  burst.embers.dispose();
  burst.materials.forEach((material) => material.dispose());
}

export function clearBarbarian(): void {
  bursts.forEach(dispose);
  bursts.length = 0;
}

export function updateBarbarian(time: number): void {
  for (let index = bursts.length - 1; index >= 0; index--) {
    const burst = bursts[index];
    const progress = Math.max(0, (time - burst.startedAt) / DURATION_MS);
    if (progress >= 1) {
      dispose(burst);
      bursts.splice(index, 1);
      continue;
    }
    const ignition = THREE.MathUtils.smoothstep(progress, 0, 0.07);
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.4, 1);
    burst.materials.forEach((material) => { material.opacity = ignition * fade * 0.85; });
    const waveProgress = Math.min(1, progress / 0.42);
    burst.shockwave.scale.setScalar((0.25 + 1.3 * (1 - (1 - waveProgress) ** 3)) * burst.strength);
    burst.shockwave.material.opacity = ignition * (1 - waveProgress) ** 2;
    burst.spikes.scale.set(1 + progress * 0.7, Math.max(0.001, ignition * fade * burst.strength), 1 + progress * 0.7);
    burst.slashes.forEach((slash, slashIndex) => {
      const age = Math.max(0, progress - slashIndex * 0.065);
      slash.material.opacity = THREE.MathUtils.smoothstep(age, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(age, 0.28, 0.75)) * 0.8;
      slash.rotation.z = slashIndex * Math.PI * 2 / 3 + age * (slashIndex % 2 ? -5 : 5);
      slash.scale.setScalar((0.65 + age * 0.7) * burst.strength);
      slash.position.y = 0.35 + slashIndex * 0.35 + age * 0.45;
    });
    for (let ember = 0; ember < burst.embers.count; ember++) {
      const seed = ember / burst.embers.count;
      const angle = ember * 2.39996 + progress * 0.7;
      const radius = 0.35 + progress * (0.35 + seed * 0.65);
      emberTransform.position.set(
        Math.cos(angle) * radius,
        0.08 + Math.sin(progress * Math.PI * 0.72) * (0.6 + (ember % 7) * 0.21) * burst.strength,
        Math.sin(angle) * radius,
      );
      emberTransform.rotation.set(progress * 5, angle, progress * 3);
      emberTransform.scale.setScalar(ignition * fade * (0.7 + seed));
      emberTransform.updateMatrix();
      burst.embers.setMatrixAt(ember, emberTransform.matrix);
    }
    burst.embers.instanceMatrix.needsUpdate = true;
  }
}
