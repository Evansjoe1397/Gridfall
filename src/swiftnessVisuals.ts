import * as THREE from 'three';

type SwiftnessEffect = {
  root: THREE.Group;
  ring: THREE.Mesh;
  streaks: THREE.Mesh[];
  sparks: THREE.Mesh[];
  materials: THREE.MeshBasicMaterial[];
  startedAt: number;
  blessing: boolean;
  follow?: THREE.Object3D;
  keepBound?: () => boolean;
};
const effects: SwiftnessEffect[] = [];

/** A golden ankle bind snaps shut; the blessing opens wings in the character's lateral plane. */
export function spawnSwiftness(scene: THREE.Scene, position: THREE.Vector3, spirit: boolean, blessing = false, follow?: THREE.Object3D, keepBound?: () => boolean) {
  const root = new THREE.Group();
  root.name = blessing ? 'SwiftnessWings' : 'SwiftnessSeal';
  root.position.copy(position);
  // Only the blessing can arrive in Spirit Form. The defense is normal-form only.
  spirit = blessing && spirit;
  if (follow) {
    follow.getWorldPosition(root.position);
    follow.getWorldQuaternion(root.quaternion);
  }
  const gold = new THREE.MeshBasicMaterial({ color: spirit ? 0xb78aff : 0xffce69,
    transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide });
  const white = gold.clone();
  white.color.setHex(spirit ? 0xe6d2ff : 0xfff5d6);
  const sealMaterial = blessing ? gold : white.clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(blessing ? 0.77 : 0.82, blessing ? 0.82 : 0.96, 64), sealMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.065;
  root.add(ring);
  const streaks: THREE.Mesh[] = [];
  for (let i = 0; i < (blessing ? 12 : 3); i++) {
    if (!blessing) {
      const geometry = i < 2
        ? new THREE.CylinderGeometry(0.8, 0.8, 0.28, 32, 1, true, i * Math.PI, Math.PI)
        : new THREE.BoxGeometry(0.52, 0.42, 0.10);
      const streak = new THREE.Mesh(geometry, i % 2 ? gold : white);
      if (i === 2) {
        // A readable padlock above the character makes the movement denial explicit.
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 24, Math.PI), white);
        shackle.position.y = 0.19;
        streak.add(shackle);
      }
      root.add(streak);
      streaks.push(streak);
      continue;
    }
    const side = i < 6 ? -1 : 1;
    const feather = i % 6;
    const points = [
      new THREE.Vector3(side * 0.17, 0.75, 0),
      new THREE.Vector3(side * (0.48 + feather * 0.08), 0.87 + feather * 0.09, 0),
      new THREE.Vector3(side * (0.72 + feather * 0.12), 1.42 + feather * 0.12, 0),
    ];
    const streak = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.023, 4, false), i % 3 ? gold : white);
    root.add(streak);
    streaks.push(streak);
  }
  const sparkGeometry = new THREE.OctahedronGeometry(0.04);
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 24; i++) {
    const spark = new THREE.Mesh(sparkGeometry, i % 3 ? gold : white);
    root.add(spark);
    sparks.push(spark);
  }
  root.traverse(part => { part.raycast = () => {}; });
  scene.add(root);
  effects.push({ root, ring, streaks, sparks, materials: blessing ? [gold, white] : [gold, white, sealMaterial], startedAt: performance.now(), blessing, follow, keepBound });
}

function dispose(effect: SwiftnessEffect) {
  effect.root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  effect.root.traverse(part => { if (part instanceof THREE.Mesh) geometries.add(part.geometry); });
  geometries.forEach(geometry => geometry.dispose());
  effect.materials.forEach(material => material.dispose());
}

export function updateSwiftness(time: number, camera?: THREE.Camera) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    // Once movement is restored, spending it again must not bring the bind back.
    if (effect.keepBound && !effect.keepBound()) effect.keepBound = undefined;
    const held = !effect.blessing && Boolean(effect.keepBound);
    const elapsed = Math.max(0, (time - effect.startedAt) / (effect.blessing ? 1250 : 1650));
    if (elapsed >= 1 && !held) { dispose(effect); effects.splice(i, 1); continue; }
    const t = Math.min(1, elapsed);
    if (effect.follow) {
      effect.follow.getWorldPosition(effect.root.position);
      effect.follow.getWorldQuaternion(effect.root.quaternion);
    }
    if (!effect.blessing) {
      const approach = Math.min(1, t / 0.15);
      const iconBurst = Math.max(0, (t - 0.72) / 0.28);
      const burst = held ? 0 : iconBurst;
      const fade = 1 - burst;
      effect.materials[0].opacity = Math.min(1, t / 0.07) * fade;
      effect.materials[1].opacity = effect.materials[0].opacity;
      // Snap shut quickly, then keep the lock and seal readable for almost a second.
      const flash = Math.max(0, 1 - Math.abs(t - 0.18) / 0.08);
      effect.materials[2].opacity = approach === 1 ? (0.5 + flash * 0.5) * fade : 0;
      effect.ring.scale.setScalar(1 + flash * 0.22);
      effect.streaks.forEach((streak, index) => {
        if (index < 2) {
          streak.position.set((index ? -1 : 1) * 0.9 * Math.pow(1 - approach, 2), 0.35 + burst * 0.2, 0);
          streak.scale.y = 1 - burst;
        } else {
          streak.visible = approach === 1 && iconBurst < 1;
          streak.position.set(0, 2.8 + iconBurst * 0.25, 0);
          streak.scale.setScalar((1 + flash * 0.25) * (1 - iconBurst));
          if (camera) {
            camera.getWorldQuaternion(streak.quaternion);
            streak.quaternion.premultiply(effect.root.quaternion.clone().invert());
          }
        }
      });
      effect.sparks.forEach((spark, index) => {
        const angle = index / 24 * Math.PI * 2;
        const radius = 0.8 + burst * 0.22;
        spark.visible = burst > 0;
        spark.position.set(Math.cos(angle) * radius,
          0.35 + burst * (0.3 + index % 4 * 0.14), Math.sin(angle) * radius);
        spark.rotation.set(burst * 4, angle, burst * 3);
        spark.scale.setScalar((1 - burst) * 1.15);
      });
      continue;
    }
    const opacity = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.35);
    effect.materials.forEach(material => { material.opacity = opacity; });
    const sweep = 1 - Math.pow(1 - Math.min(1, t / 0.6), 3);
    effect.ring.scale.setScalar(0.6 + sweep * 0.85);
    effect.streaks.forEach(streak => {
      streak.scale.setScalar(0.45 + sweep * 0.65);
      streak.position.y = t * 0.35;
    });
    effect.sparks.forEach((spark, index) => {
      const angle = index * 2.399963 + t;
      const radius = 0.35 + t * 1.3;
      spark.position.set(Math.cos(angle) * radius, 0.1 + t * (0.7 + index % 5 * 0.22), Math.sin(angle) * radius);
      spark.scale.setScalar((1 - t) * (index % 3 ? 0.7 : 1.2));
    });
  }
}

export function clearSwiftness() {
  effects.forEach(dispose);
  effects.length = 0;
}
