import * as THREE from 'three';

export const THORNS_STRIKE_MS = 650;
const HIT_MS = 390;
const LIFETIME_MS = 1050;
type Effect = {
  root: THREE.Group; crown: THREE.Group; lashes: THREE.Mesh[]; motes: THREE.Mesh[];
  materials: THREE.MeshBasicMaterial[]; startedAt: number; hit: (() => void) | null;
};
const effects: Effect[] = [];
const up = new THREE.Vector3(0, 1, 0);

/** A barbed reliquary crown opens, lashes outward, and dissolves into embers. */
export function spawnThorns(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, spirit: boolean, hit: () => void): void {
  const root = new THREE.Group();
  root.name = spirit ? 'SpiritThorns' : 'HolyThorns';
  root.position.copy(from).add(new THREE.Vector3(0, 1.05, 0));
  const destination = to.clone().sub(from);
  destination.y += 0.15;
  const materials: THREE.MeshBasicMaterial[] = [];
  const material = (color: number, glow = false) => {
    const surface = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    materials.push(surface);
    return surface;
  };
  const body = material(spirit ? 0x170e25 : 0xffe7b0);
  const edge = material(spirit ? 0xb17aff : 0xffca57, true);
  const spark = material(spirit ? 0xd6adff : 0xfff8df, true);
  const crown = new THREE.Group();
  root.add(crown);
  for (let strand = 0; strand < 2; strand++) {
    const points = Array.from({ length: 65 }, (_, i) => {
      const a = i / 64 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 0.72, Math.sin(a * 6 + strand * Math.PI) * 0.075, Math.sin(a) * 0.72);
    });
    crown.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, strand ? 0.014 : 0.036, 5, true), strand ? edge : body));
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.48, 5), body);
    thorn.position.set(Math.cos(a) * 0.79, i % 2 ? 0.10 : -0.04, Math.sin(a) * 0.79);
    thorn.quaternion.setFromUnitVectors(up, new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)).normalize());
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.20, 5), edge);
    tip.position.y = 0.17;
    thorn.add(tip);
    crown.add(thorn);
  }
  const lashes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const side = (i - 1) * 0.32;
    const start = new THREE.Vector3(side, 0.08, 0);
    const curve = new THREE.CatmullRomCurve3([start,
      destination.clone().multiplyScalar(0.28).add(new THREE.Vector3(side * 2, 0.5 + i * 0.14, -side)),
      destination.clone().multiplyScalar(0.72).add(new THREE.Vector3(-side, 0.35, side)), destination.clone()]);
    const lash = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.028, 5, false), body);
    const rim = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.010, 4, false), edge);
    rim.position.y = 0.027;
    lash.add(rim);
    for (let j = 1; j <= 7; j++) {
      const barb = new THREE.Mesh(new THREE.ConeGeometry(0.047, 0.24, 4), j % 2 ? edge : body);
      barb.position.copy(curve.getPoint(j / 8));
      barb.rotation.z = (j % 2 ? 1 : -1) * 0.8;
      lash.add(barb);
    }
    root.add(lash);
    lashes.push(lash);
  }
  const motes: THREE.Mesh[] = [];
  const moteGeometry = new THREE.OctahedronGeometry(0.035);
  for (let i = 0; i < 24; i++) {
    const mote = new THREE.Mesh(moteGeometry, i % 4 ? edge : spark);
    const angle = i * 2.399963;
    mote.userData.velocity = new THREE.Vector3(Math.cos(angle) * 0.75, 0.25 + (i % 7) * 0.14, Math.sin(angle) * 0.75);
    mote.userData.origin = i % 2 ? destination.clone() : new THREE.Vector3();
    root.add(mote);
    motes.push(mote);
  }
  root.traverse(part => { part.raycast = () => {}; });
  scene.add(root);
  effects.push({ root, crown, lashes, motes, materials, startedAt: performance.now(), hit });
}

function dispose(effect: Effect): void {
  effect.root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  effect.root.traverse(part => { if (part instanceof THREE.Mesh) geometries.add(part.geometry); });
  geometries.forEach(geometry => geometry.dispose());
  effect.materials.forEach(material => material.dispose());
}

export function clearThorns(): void {
  effects.forEach(dispose);
  effects.length = 0;
}

export function updateThorns(time: number): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    const age = Math.max(0, time - effect.startedAt);
    if (age >= HIT_MS && effect.hit) {
      const hit = effect.hit;
      effect.hit = null;
      hit();
    }
    if (age >= LIFETIME_MS) { dispose(effect); effects.splice(i, 1); continue; }
    const fade = 1 - THREE.MathUtils.smoothstep(age, 560, LIFETIME_MS);
    effect.materials.forEach(material => { material.opacity = Math.min(1, age / 100) * fade; });
    effect.crown.rotation.y = age * 0.0022;
    effect.crown.scale.setScalar(0.3 + 0.7 * THREE.MathUtils.smoothstep(age, 0, 180));
    effect.crown.rotation.z = Math.sin(age * 0.004) * 0.12;
    effect.lashes.forEach((lash, index) => {
      const growth = THREE.MathUtils.smoothstep(age, 150 + index * 25, HIT_MS);
      lash.visible = growth > 0;
      lash.scale.setScalar(growth);
    });
    effect.motes.forEach((mote, index) => {
      const drift = Math.max(0, (age - HIT_MS) / 650);
      mote.visible = age >= HIT_MS;
      mote.position.copy(mote.userData.origin).addScaledVector(mote.userData.velocity, drift);
      mote.scale.setScalar((1 - drift * 0.7) * (index % 3 ? 1 : 1.6));
      mote.rotation.set(drift * 3, index + drift * 2, drift);
    });
  }
}
