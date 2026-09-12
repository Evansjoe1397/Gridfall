import * as THREE from 'three';

type Strand = { start: THREE.Vector3; end: THREE.Vector3; pieces: THREE.Mesh[]; width: number; seed: number };
type LightningData = { strands: Strand[]; flash: THREE.Mesh; sparks: THREE.Mesh[]; light: THREE.PointLight; tick: number };
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const previous = new THREE.Vector3();
const next = new THREE.Vector3();
const side = new THREE.Vector3();
const vertical = new THREE.Vector3();

function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function fitSegment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, width: number): void {
  direction.subVectors(to, from);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.scale.set(width, direction.length(), width);
  if (direction.lengthSq() > 0.000001) mesh.quaternion.setFromUnitVectors(up, direction.normalize());
}

/** World-space lightning built from narrow tubes, so width is reliable on WebGL. */
export function createChainLightning(from: THREE.Vector3, to: THREE.Vector3): THREE.Mesh {
  const root = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
  root.name = 'ChainLightning';
  root.position.copy(from);
  const destination = to.clone().sub(from);
  const strands: Strand[] = [];
  const addStrand = (start: THREE.Vector3, end: THREE.Vector3, width: number, seed: number, branch: boolean) => {
    const count = Math.max(4, Math.min(36, Math.ceil(start.distanceTo(end) / 0.22)));
    const pieces: THREE.Mesh[] = [];
    for (let index = 0; index < count; index++) {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), new THREE.MeshBasicMaterial({
        color: branch ? 0x9eb9ff : 0xebfaff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 1, 5, 1, true), new THREE.MeshBasicMaterial({
        color: branch ? 0x8653ff : 0x528bff, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      core.add(glow); root.add(core); pieces.push(core);
    }
    strands.push({ start, end, pieces, width, seed });
  };
  addStrand(new THREE.Vector3(), destination, 0.025, 1, false);
  // Fine forks peel away from the main discharge at several points.
  for (let index = 0; index < 4; index++) {
    const start = destination.clone().multiplyScalar(0.22 + index * 0.17);
    const end = start.clone().addScaledVector(destination, 0.13).add(new THREE.Vector3(noise(index + 3) * 0.55, noise(index + 11) * 0.5, noise(index + 17) * 0.55));
    addStrand(start, end, 0.009, index + 13, true);
  }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd8eaff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.copy(destination); root.add(flash);
  const sparks: THREE.Mesh[] = [];
  for (let index = 0; index < 12; index++) {
    const spark = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 1, 4), new THREE.MeshBasicMaterial({ color: index % 2 ? 0xb597ff : 0x9fe7ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    spark.userData.direction = new THREE.Vector3(noise(index + 31), noise(index + 47), noise(index + 63)).normalize();
    root.add(spark); sparks.push(spark);
  }
  const light = new THREE.PointLight(0x739aff, 0, 3.4); light.position.copy(destination); root.add(light);
  root.userData.lightning = { strands, flash, sparks, light, tick: -1 } satisfies LightningData;
  return root;
}

export function updateChainLightning(root: THREE.Mesh, elapsed: number): void {
  const data = root.userData.lightning as LightningData;
  const tick = Math.floor(elapsed / 45);
  const fade = 1 - THREE.MathUtils.smoothstep(elapsed, 210, 620);
  const pulse = (0.72 + Math.sin(elapsed * 0.055) * 0.28) * fade;
  data.strands.forEach((strand, strandIndex) => {
    if (tick !== data.tick) {
      direction.subVectors(strand.end, strand.start).normalize();
      side.crossVectors(direction, up);
      if (side.lengthSq() < 0.001) side.set(1, 0, 0);
      side.normalize(); vertical.crossVectors(side, direction).normalize();
      previous.copy(strand.start);
      strand.pieces.forEach((piece, index) => {
        const t = (index + 1) / strand.pieces.length;
        const envelope = Math.sin(t * Math.PI);
        const seed = strand.seed * 19 + index * 7 + tick * 31;
        next.copy(strand.start).lerp(strand.end, t)
          .addScaledVector(side, noise(seed) * envelope * 0.18)
          .addScaledVector(vertical, noise(seed + 1) * envelope * 0.12);
        fitSegment(piece, previous, next, strand.width);
        previous.copy(next);
      });
    }
    strand.pieces.forEach((piece) => {
      (piece.material as THREE.MeshBasicMaterial).opacity = pulse * (strandIndex ? 0.6 : 1);
      ((piece.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse * 0.24;
    });
  });
  data.tick = tick;
  const burst = Math.min(1, elapsed / 420);
  data.flash.scale.setScalar(1 + Math.sin(burst * Math.PI) * 1.5);
  (data.flash.material as THREE.MeshBasicMaterial).opacity = (1 - burst) * 0.8;
  data.light.intensity = pulse * 3.5;
  data.sparks.forEach((spark) => {
    const vector = spark.userData.direction as THREE.Vector3;
    spark.position.copy(data.flash.position).addScaledVector(vector, 0.12 + burst * 0.62);
    spark.quaternion.setFromUnitVectors(up, vector);
    spark.scale.y = 0.06 + (1 - burst) * 0.18;
    (spark.material as THREE.MeshBasicMaterial).opacity = (1 - burst) ** 2;
  });
}
