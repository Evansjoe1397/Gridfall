import * as THREE from 'three';

const DURATION_MS = 2200;
type GuardCast = {
  root: THREE.Group;
  swords: THREE.Group[];
  rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  stars: THREE.InstancedMesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  bladeMaterial: THREE.MeshBasicMaterial;
  hiltMaterial: THREE.MeshBasicMaterial;
  startedAt: number;
};
type GuardSigil = { root: THREE.Group; material: THREE.MeshBasicMaterial; active: boolean; opacity: number };
const casts: GuardCast[] = [];
const sigils = new Map<THREE.Group, GuardSigil>();
const starTransform = new THREE.Object3D();
let previousTime: number | undefined;

function surface(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
}

function sword(blade: THREE.MeshBasicMaterial, hilt: THREE.MeshBasicMaterial): THREE.Group {
  const root = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, 0.19);
  shape.lineTo(-0.055, 0.77);
  shape.lineTo(0, 0.98);
  shape.lineTo(0.055, 0.77);
  shape.lineTo(0.045, 0.19);
  shape.closePath();
  root.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), blade));
  const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.035, 0.035), hilt);
  crossguard.position.y = 0.19;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.035), hilt);
  grip.position.y = 0.09;
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), hilt);
  root.add(crossguard, grip, pommel);
  return root;
}

function ring(radius: number, material: THREE.MeshBasicMaterial) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.018, 64), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function dispose(root: THREE.Group): void {
  root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    geometries.add(part.geometry);
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
    if (part instanceof THREE.InstancedMesh) part.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function spawnCarian(scene: THREE.Scene, position: THREE.Vector3, level: number): void {
  const root = new THREE.Group();
  root.name = 'CarianSpectralGuard';
  root.position.copy(position).add(new THREE.Vector3(0, 0.035, 0));
  const tier = THREE.MathUtils.clamp(Math.floor(level), 1, 3);
  const bladeMaterial = surface(0x88baff);
  const hiltMaterial = surface(0xe0dcff);
  const swords = Array.from({ length: tier + 2 }, () => sword(bladeMaterial, hiltMaterial));
  root.add(...swords);
  const rings = [ring(0.76, surface(0x8f83ff))];
  if (tier > 1) rings.push(ring(0.9, surface(0xbedaff)));
  root.add(...rings);
  const pulse = ring(0.59, surface(0xd3e8ff));
  root.add(pulse);
  const stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.023), surface(0xcadfff), 30);
  stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stars.frustumCulled = false;
  root.add(stars);
  scene.add(root);
  casts.push({ root, swords, rings, pulse, stars, bladeMaterial, hiltMaterial, startedAt: performance.now() });
  updateCarian(performance.now());
}

/** Read actual Summon/DEF state so reloads, undo, and consumed buffs stay correct. */
export function syncCarianGuard(scene: THREE.Scene, character: THREE.Group, active: boolean): void {
  let sigil = sigils.get(character);
  if (!sigil && active) {
    const material = surface(0x9cbfff);
    const root = sword(material, material);
    root.name = 'CarianSummonedDefenseSigil';
    root.scale.setScalar(0.28);
    scene.add(root);
    sigil = { root, material, active, opacity: 0 };
    sigils.set(character, sigil);
  }
  if (sigil) sigil.active = active;
}

export function clearCarian(): void {
  casts.forEach((cast) => dispose(cast.root));
  casts.length = 0;
  sigils.forEach((sigil) => dispose(sigil.root));
  sigils.clear();
  previousTime = undefined;
}

export function updateCarian(time: number): void {
  const delta = previousTime === undefined ? 0 : Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
  previousTime = time;
  for (const [character, sigil] of sigils) {
    if (!character.parent) {
      dispose(sigil.root);
      sigils.delete(character);
      continue;
    }
    sigil.opacity = THREE.MathUtils.damp(sigil.opacity, sigil.active ? 0.4 : 0, 9, delta);
    if (!sigil.active && sigil.opacity < 0.005) {
      dispose(sigil.root);
      sigils.delete(character);
      continue;
    }
    character.getWorldPosition(sigil.root.position);
    sigil.root.position.add(new THREE.Vector3(0.48, 1.4 + Math.sin(time * 0.002) * 0.045, 0));
    sigil.root.rotation.y = time * 0.00065;
    sigil.material.opacity = sigil.opacity * (0.9 + Math.sin(time * 0.003) * 0.1);
  }
  for (let index = casts.length - 1; index >= 0; index--) {
    const cast = casts[index];
    const progress = Math.max(0, (time - cast.startedAt) / DURATION_MS);
    if (progress >= 1) {
      dispose(cast.root);
      casts.splice(index, 1);
      continue;
    }
    const reveal = THREE.MathUtils.smoothstep(progress, 0.04, 0.22);
    const dissolve = THREE.MathUtils.smoothstep(progress, 0.67, 0.98);
    cast.bladeMaterial.opacity = reveal * (1 - dissolve) * 0.55;
    cast.hiltMaterial.opacity = reveal * (1 - dissolve) * 0.8;
    cast.swords.forEach((blade, bladeIndex) => {
      const angle = bladeIndex * Math.PI * 2 / cast.swords.length + progress * 1.8;
      const tilt = THREE.MathUtils.smoothstep(progress, 0.4, 0.58) * 0.32;
      blade.position.set(Math.cos(angle) * 0.79, 0.12 + reveal * 0.32 + dissolve * 0.25, Math.sin(angle) * 0.79);
      blade.rotation.set(0, Math.PI / 2 - angle, -tilt);
      blade.scale.setScalar(0.75 + reveal * 0.25);
    });
    cast.rings.forEach((sigil, ringIndex) => {
      sigil.scale.setScalar(0.4 + THREE.MathUtils.smoothstep(progress, 0, 0.2) * 0.6);
      sigil.material.opacity = THREE.MathUtils.smoothstep(progress, 0, 0.12) * (1 - dissolve) * (ringIndex ? 0.3 : 0.55);
    });
    const pulse = THREE.MathUtils.clamp((progress - 0.43) / 0.4, 0, 1);
    cast.pulse.position.y = pulse * 1.8;
    cast.pulse.material.opacity = Math.sin(pulse * Math.PI) * 0.4;
    cast.stars.material.opacity = Math.sin(dissolve * Math.PI) * 0.85;
    for (let star = 0; star < cast.stars.count; star++) {
      const angle = star * 2.39996 + progress * 1.8;
      const radius = 0.7 + dissolve * 0.35;
      starTransform.position.set(Math.cos(angle) * radius, 0.4 + star % 6 * 0.15 + dissolve * 0.55, Math.sin(angle) * radius);
      starTransform.rotation.set(angle, progress * 3, 0);
      starTransform.scale.setScalar(1 - dissolve * 0.6);
      starTransform.updateMatrix();
      cast.stars.setMatrixAt(star, starTransform.matrix);
    }
    cast.stars.instanceMatrix.needsUpdate = true;
  }
}
