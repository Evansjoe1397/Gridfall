import * as THREE from 'three';

/** Gathering snow, a growing arcing projectile, then a crystalline powder burst. */
export class SnowballEffectVisual {
  readonly root = new THREE.Group();
  static readonly impactMs = 900;
  static readonly durationMs = 2050;
  private readonly ball = new THREE.Group();
  private readonly snow: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  private readonly halo: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly flakes: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;
  private readonly strength: number;
  private impacted = false;
  private disposed = false;

  constructor(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, consume: boolean,
    private readonly startedAt: number, private readonly onImpact: () => void) {
    this.from = from.clone();
    this.to = to.clone();
    this.strength = consume ? 1.3 : 1;
    const axis = to.clone().sub(from).normalize();
    if (axis.lengthSq() < 0.001) axis.set(0, 0, 1);
    this.side.crossVectors(axis, new THREE.Vector3(0, 1, 0));
    if (this.side.lengthSq() < 0.001) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up.crossVectors(this.side, axis).normalize();
    this.snow = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({
      color: 0xe9faff, roughness: 0.85, metalness: 0, emissive: 0x6aaed4, emissiveIntensity: 0.3,
    }));
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(1.18, 24, 16), new THREE.MeshBasicMaterial({
      color: 0x78ddff, transparent: true, opacity: 0.12, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.ball.add(this.snow, this.halo);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 80), new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xf1fcff : 0x78d9ff, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      ring.position.copy(to);
      if (i === 0) ring.rotation.x = -Math.PI / 2;
      else {
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
        ring.rotateY((i - 1.5) * 0.7);
      }
      this.rings.push(ring);
      this.root.add(ring);
    }
    this.flakes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({
      color: 0xe6faff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
    }), 112);
    this.flakes.frustumCulled = false;
    this.flakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.flakes.count; i++) {
      this.flakes.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0x8edcff : 0xffffff));
    }
    this.root.name = 'SnowballEffectCast';
    this.root.add(this.ball, this.flakes);
    this.root.traverse(part => { part.raycast = () => {}; });
    scene.add(this.root);
    this.update(startedAt);
  }

  private path(t: number, point: THREE.Vector3) {
    point.lerpVectors(this.from, this.to, t);
    point.y += Math.sin(t * Math.PI) * 0.45;
  }

  update(time: number): boolean {
    if (this.disposed) return false;
    const age = Math.max(0, time - this.startedAt);
    const hit = age >= SnowballEffectVisual.impactMs;
    if (age >= SnowballEffectVisual.durationMs) {
      if (!this.impacted) { this.impacted = true; this.onImpact(); }
      this.dispose();
      return false;
    }
    const charge = THREE.MathUtils.smoothstep(age, 0, 240);
    const flight = THREE.MathUtils.clamp((age - 240) / 660, 0, 1);
    const progress = flight * flight * (2 - flight);
    const burst = Math.max(0, age - SnowballEffectVisual.impactMs) / 1150;
    this.ball.visible = !hit;
    this.path(progress, this.ball.position);
    this.ball.scale.setScalar(charge * (0.14 + progress * 0.25) * this.strength);
    this.snow.rotation.set(age * 0.007, age * 0.004, age * 0.002);
    this.halo.material.opacity = (0.11 + Math.sin(age * 0.018) * 0.035) * this.strength;
    this.rings.forEach((ring, i) => {
      const t = Math.max(0, burst - i * 0.06);
      ring.scale.setScalar((0.25 + t * (i === 0 ? 2.3 : 1.7)) * this.strength);
      ring.material.opacity = hit && burst >= i * 0.06 ? (1 - t) ** 3 * 0.65 : 0;
    });
    for (let i = 0; i < this.flakes.count; i++) {
      const f = (i + 0.5) / this.flakes.count;
      const angle = i * 2.399963 + age * 0.004;
      let scale: number;
      if (hit) {
        const y = 1 - 2 * f;
        const radius = Math.sqrt(1 - y * y);
        const spread = (0.2 + (1 - (1 - burst) ** 3) * (0.7 + (i % 7) * 0.16)) * this.strength;
        this.dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
          .multiplyScalar(spread).add(this.to);
        this.dummy.position.y -= burst * burst * 0.65;
        scale = (0.025 + (i % 5) * 0.012) * (1 - burst) ** 1.5;
      } else {
        const trail = Math.max(0, progress - f * 0.45);
        this.path(trail, this.dummy.position);
        const radius = (age < 240 ? 0.6 * (1 - charge) + 0.15 : 0.08 + progress * 0.22 + f * 0.18) * this.strength;
        this.dummy.position.addScaledVector(this.side, Math.cos(angle - f * 16) * radius)
          .addScaledVector(this.up, Math.sin(angle - f * 16) * radius);
        scale = (0.016 + (i % 4) * 0.009) * charge * (1 - f * 0.65);
      }
      this.dummy.rotation.set(angle, i * 0.8 + age * 0.002, angle * 0.7);
      this.dummy.scale.set(scale, scale * (hit && i % 4 === 0 ? 2.8 : 0.7), scale);
      this.dummy.scale.multiplyScalar(this.strength);
      this.dummy.updateMatrix();
      this.flakes.setMatrixAt(i, this.dummy.matrix);
    }
    this.flakes.instanceMatrix.needsUpdate = true;
    if (hit && !this.impacted) { this.impacted = true; this.onImpact(); }
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.traverse(part => {
      if (!(part instanceof THREE.Mesh)) return;
      part.geometry.dispose();
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) material.dispose();
    });
    this.flakes.dispose();
  }
}
