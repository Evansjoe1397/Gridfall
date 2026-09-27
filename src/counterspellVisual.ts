import * as THREE from 'three';

/** A held rune ward snaps into a returning pulse and a fractured mental halo. */
export class CounterspellVisual {
  readonly root = new THREE.Group();
  private readonly ward = new THREE.Group();
  private readonly halo = new THREE.Group();
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly shards: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly point = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private releasedAt: number | null = null;
  private disposed = false;

  constructor(scene: THREE.Scene, private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3, private readonly empowered: boolean,
    private readonly startedAt: number) {
    this.from = from.clone();
    this.to = to.clone();
    // Keep the ward outside the caster's body, at chest height toward the attacker.
    const forward = to.clone().sub(from).setY(0);
    if (forward.lengthSq() < 0.001) forward.set(0, 0, 1);
    this.from.addScaledVector(forward.normalize(), 0.9);
    const axis = this.to.clone().sub(this.from).normalize();
    if (axis.lengthSq() < 0.001) axis.set(0, 0, 1);
    this.side.crossVectors(axis, new THREE.Vector3(0, 1, 0));
    if (this.side.lengthSq() < 0.001) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up.crossVectors(this.side, axis).normalize();
    const glow = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true,
      opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false });
    this.ward.position.copy(this.from);
    this.ward.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 0.94, i === 1 ? 6 : 64,
        1, 0, Math.PI * (i === 2 ? 1.65 : 2)), glow(i === 1 ? 0xeacaff : 0x9857ff));
      ring.scale.setScalar(1 - i * 0.22);
      this.rings.push(ring);
      this.ward.add(ring);
    }
    const glyphGeometry = new THREE.PlaneGeometry(0.055, 0.16);
    const glyphMaterial = glow(0xcfa6ff);
    for (let i = 0; i < 12; i++) {
      const glyph = new THREE.Mesh(glyphGeometry, glyphMaterial);
      const angle = i * Math.PI / 6;
      glyph.position.set(Math.cos(angle) * 0.78, Math.sin(angle) * 0.78, 0.01);
      glyph.rotation.z = angle + (i % 2 ? 0.5 : -0.5);
      this.ward.add(glyph);
    }
    this.halo.position.copy(to).add(new THREE.Vector3(0, 0.75, 0));
    for (let i = 0; i < 6; i++) {
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.53, 12, 1, 0, Math.PI / 4), glow(0xe79aff));
      arc.rotation.set(-Math.PI / 2, 0, i * Math.PI / 3);
      arc.position.y = (i % 2) * 0.09;
      this.halo.add(arc);
    }
    this.shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1),
      glow(empowered ? 0x99f4ff : 0xc08aff), 64);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.frustumCulled = false;
    this.root.name = 'Counterspell';
    this.root.add(this.ward, this.halo, this.shards);
    this.root.traverse(part => { part.raycast = () => {}; });
    scene.add(this.root);
    this.update(startedAt);
  }

  impact(time: number) { this.releasedAt ??= time; }

  update(time: number): boolean {
    if (this.disposed) return false;
    const age = Math.max(0, time - this.startedAt);
    const released = this.releasedAt !== null;
    const elapsed = released ? Math.max(0, time - this.releasedAt!) : 0;
    if (elapsed >= 1450 || age >= 15000) { this.dispose(); return false; }
    const charge = Math.min(1, age / 180);
    const flight = Math.min(1, elapsed / 430);
    const burst = Math.max(0, elapsed - 430) / 1000;
    this.ward.scale.setScalar(released ? 1 + Math.min(elapsed / 300, 1) * 0.45 : 0.75 + charge * 0.25);
    this.ward.children.forEach(child => {
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity =
        charge * (released ? Math.max(0, 1 - elapsed / 350) : 0.65);
    });
    this.rings.forEach((ring, i) => { ring.rotation.z = age * (i % 2 ? -0.0015 : 0.001) + i; });
    this.halo.visible = released && elapsed >= 430;
    this.halo.rotation.y = burst * 2;
    this.halo.scale.setScalar(1 + burst * 0.55);
    this.halo.children.forEach(child => {
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity =
        Math.max(0, 1 - burst) * (0.65 + Math.sin(burst * 24) * 0.2);
    });
    (this.shards.material as THREE.MeshBasicMaterial).opacity = released ? Math.max(0, 1 - burst) : 0;
    for (let i = 0; i < this.shards.count; i++) {
      const f = i / this.shards.count;
      const angle = i * 2.399963 + elapsed * 0.014;
      if (elapsed < 430) {
        const trail = Math.max(0, flight - f * 0.35);
        const radius = Math.sin(f * Math.PI) * (this.empowered ? 0.24 : 0.13);
        this.point.lerpVectors(this.from, this.to, trail)
          .addScaledVector(this.side, Math.cos(angle) * radius)
          .addScaledVector(this.up, Math.sin(angle) * radius);
      } else {
        const radius = 0.2 + burst * (0.6 + f);
        this.point.copy(this.to).addScaledVector(this.side, Math.cos(angle) * radius)
          .addScaledVector(this.up, Math.sin(angle) * radius);
        this.point.y += burst * (0.5 + f);
      }
      this.dummy.position.copy(this.point);
      this.dummy.rotation.set(angle, angle * 0.7, 0);
      this.dummy.scale.setScalar((this.empowered ? 0.055 : 0.035) * (1 - f * 0.55) * Math.max(0, 1 - burst));
      this.dummy.updateMatrix();
      this.shards.setMatrixAt(i, this.dummy.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse(part => {
      if (!(part instanceof THREE.Mesh)) return;
      geometries.add(part.geometry);
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
    });
    this.shards.dispose();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }
}
