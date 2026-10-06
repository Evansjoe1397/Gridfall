import * as THREE from 'three';

const DURATION_MS = 1800;
type WindGust = {
  root: THREE.Group;
  ribbons: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  motes: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  startedAt: number;
  strength: number;
};
const gusts: WindGust[] = [];
const moteTransform = new THREE.Object3D();

function windMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** An open, tapered spiral leaves the character visible through the wind. */
function ribbonGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 48;
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments;
    const angle = t * Math.PI * 1.7;
    const radius = 0.75 - t * 0.15;
    const height = t * 1.05;
    const width = Math.sin(t * Math.PI) * 0.055;
    positions.push(Math.cos(angle) * radius, height - width, Math.sin(angle) * radius);
    positions.push(Math.cos(angle) * radius, height + width, Math.sin(angle) * radius);
    if (segment < segments) {
      const i = segment * 2;
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function spawnWindwalker(scene: THREE.Scene, position: THREE.Vector3, level: number): void {
  const root = new THREE.Group();
  root.name = 'WindwalkerGust';
  root.position.copy(position).add(new THREE.Vector3(0, 0.04, 0));
  const strength = 1 + (THREE.MathUtils.clamp(level, 1, 3) - 1) * 0.15;
  const geometry = ribbonGeometry();
  const ribbons = Array.from({ length: 4 }, (_, index) => {
    const ribbon = new THREE.Mesh(geometry, windMaterial(index % 2 ? 0xd9fff0 : 0x68e5d0));
    root.add(ribbon);
    return ribbon;
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.79, 64), windMaterial(0x9ef7df));
  ring.rotation.x = -Math.PI / 2;
  root.add(ring);
  // Thin, tumbling flecks suggest air currents rather than fire sparks.
  const motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.018), windMaterial(0xe1ffec), 32);
  motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  motes.frustumCulled = false;
  root.add(motes);
  scene.add(root);
  gusts.push({ root, ribbons, ring, motes, strength, startedAt: performance.now() });
  updateWindwalker(performance.now());
}

function dispose(gust: WindGust): void {
  gust.root.removeFromParent();
  gust.ribbons[0].geometry.dispose();
  gust.ribbons.forEach((ribbon) => ribbon.material.dispose());
  gust.ring.geometry.dispose();
  gust.ring.material.dispose();
  gust.motes.geometry.dispose();
  gust.motes.material.dispose();
  gust.motes.dispose();
}

export function clearWindwalker(): void {
  gusts.forEach(dispose);
  gusts.length = 0;
}

export function updateWindwalker(time: number): void {
  for (let index = gusts.length - 1; index >= 0; index--) {
    const gust = gusts[index];
    const progress = Math.max(0, (time - gust.startedAt) / DURATION_MS);
    if (progress >= 1) {
      dispose(gust);
      gusts.splice(index, 1);
      continue;
    }
    const reveal = THREE.MathUtils.smoothstep(progress, 0, 0.12);
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.5, 1);
    const spread = (0.55 + reveal * 0.45 + progress * 0.25) * gust.strength;
    gust.ribbons.forEach((ribbon, ribbonIndex) => {
      const age = Math.max(0, progress - ribbonIndex * 0.035);
      ribbon.rotation.y = ribbonIndex * Math.PI / 2 - age * Math.PI * 3;
      ribbon.position.y = 0.05 + ribbonIndex * 0.12 + progress * 0.65;
      ribbon.scale.set(spread, 0.7 + reveal * 0.3, spread);
      ribbon.material.opacity = THREE.MathUtils.smoothstep(age, 0, 0.12) * fade * (ribbonIndex % 2 ? 0.55 : 0.35);
    });
    const wave = Math.min(1, progress / 0.6);
    gust.ring.scale.setScalar((0.4 + 1.25 * (1 - (1 - wave) ** 2)) * gust.strength);
    gust.ring.material.opacity = reveal * (1 - wave) * 0.55;
    gust.motes.material.opacity = reveal * fade * 0.8;
    for (let mote = 0; mote < gust.motes.count; mote++) {
      const seed = mote / gust.motes.count;
      const angle = mote * 2.39996 - progress * (5 + seed * 2);
      const radius = (0.55 + seed * 0.35 + progress * 0.25) * gust.strength;
      moteTransform.position.set(Math.cos(angle) * radius, 0.08 + seed * 0.55 + progress * (0.7 + seed), Math.sin(angle) * radius);
      moteTransform.rotation.set(seed * Math.PI + progress * 3, -angle, progress * 2);
      moteTransform.scale.setScalar(reveal * fade * (0.6 + seed));
      moteTransform.updateMatrix();
      gust.motes.setMatrixAt(mote, moteTransform.matrix);
    }
    gust.motes.instanceMatrix.needsUpdate = true;
  }
}
