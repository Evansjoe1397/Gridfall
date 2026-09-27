import * as THREE from 'three';

/** A conjured book releases a helix of pages, then seals the target in arcane light. */
export class GrimoireCleanseVisual {
  readonly root = new THREE.Group();
  private readonly book = new THREE.Group();
  private readonly leaves: THREE.Group[] = [];
  private readonly seals: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly pages: THREE.InstancedMesh;
  private readonly sparks: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;
  private readonly strength: number;
  private impacted = false;
  private disposed = false;
  static readonly impactMs = 1000;
  static readonly durationMs = 2100;

  constructor(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, consume: boolean,
    private readonly startedAt: number, private readonly onImpact: () => void) {
    this.from = from.clone();
    this.to = to.clone();
    this.strength = consume ? 1.25 : 1;
    const axis = to.clone().sub(from).normalize();
    if (axis.lengthSq() < 0.001) axis.set(0, 0, 1);
    this.side.crossVectors(axis, new THREE.Vector3(0, 1, 0));
    if (this.side.lengthSq() < 0.001) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up.crossVectors(this.side, axis).normalize();
    const glow = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const gold = glow(0xffdf94);
    // Opaque surfaces keep the book readable; only its runes and particles emit light.
    const leather = new THREE.MeshStandardMaterial({ color: 0x352047, roughness: 0.8,
      emissive: 0x211030, emissiveIntensity: 0.3 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb88a44, metalness: 0.65, roughness: 0.35,
      emissive: 0x67451a, emissiveIntensity: 0.25 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xcdb68a, roughness: 0.95,
      side: THREE.DoubleSide, emissive: 0x80673f, emissiveIntensity: 0.2 });
    const ink = new THREE.MeshBasicMaterial({ color: 0x513a66, side: THREE.DoubleSide });
    const runeLight = glow(0xb68aff);
    runeLight.opacity = 0.6;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.12, 0.64), leather);
    spine.position.y = -0.015;
    this.book.add(spine);
    for (const z of [-0.22, 0, 0.22]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.13, 0.035), brass);
      band.position.set(0, -0.015, z);
      this.book.add(band);
    }
    for (const sign of [-1, 1]) {
      const leaf = new THREE.Group();
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.055, 0.64), leather);
      cover.position.set(sign * 0.24, -0.05, 0);
      leaf.add(cover);
      // Separate page layers and a curved top sheet give the silhouette real depth.
      for (let layer = 0; layer < 4; layer++) {
        const stack = new THREE.Mesh(new THREE.BoxGeometry(0.385 - layer * 0.006, 0.011, 0.57), paper);
        stack.position.set(sign * 0.236, -0.012 + layer * 0.014, 0);
        leaf.add(stack);
      }
      const surfaceY = (x: number) => 0.045 + Math.sin((Math.abs(x) - 0.045) / 0.38 * Math.PI) * 0.035;
      const sheetGeometry = new THREE.PlaneGeometry(0.38, 0.56, 12, 1);
      sheetGeometry.rotateX(-Math.PI / 2);
      sheetGeometry.translate(sign * 0.235, 0, 0);
      const vertices = sheetGeometry.attributes.position;
      for (let v = 0; v < vertices.count; v++) vertices.setY(v, surfaceY(vertices.getX(v)));
      sheetGeometry.computeVertexNormals();
      leaf.add(new THREE.Mesh(sheetGeometry, paper));
      for (const z of [-0.28, 0.28]) {
        const corner = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.065), brass);
        corner.position.set(sign * 0.412, -0.013, z);
        leaf.add(corner);
      }
      for (let line = 0; line < 5; line++) {
        for (let glyph = 0; glyph < 4; glyph++) {
          const x = sign * (0.105 + glyph * 0.075);
          const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.009), ink);
          rune.rotation.set(-Math.PI / 2, 0, (glyph + line) % 2 ? 0.3 : -0.3);
          rune.position.set(x, surfaceY(x) + 0.003, -0.06 + line * 0.055);
          leaf.add(rune);
        }
      }
      const sigil = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.052, 6), runeLight);
      sigil.rotation.x = -Math.PI / 2;
      sigil.position.set(sign * 0.235, 0.086, -0.175);
      leaf.add(sigil);
      this.leaves.push(leaf);
      this.book.add(leaf);
    }
    this.book.position.copy(from);
    this.book.rotation.set(0.5, Math.atan2(axis.x, axis.z), -0.12);
    for (let i = 0; i < 4; i++) {
      const seal = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96, 1, 0, Math.PI * (i % 2 ? 1.7 : 2)), glow(i % 2 ? 0xffd78c : 0xa67aff));
      seal.position.copy(to);
      seal.rotation.x = -Math.PI / 2;
      this.seals.push(seal);
      this.root.add(seal);
    }
    const flyingPage = new THREE.PlaneGeometry(0.1, 0.15, 5, 1);
    const pageVertices = flyingPage.attributes.position;
    for (let v = 0; v < pageVertices.count; v++) {
      pageVertices.setZ(v, Math.sin(pageVertices.getX(v) / 0.1 * Math.PI) * 0.025);
    }
    flyingPage.computeVertexNormals();
    this.pages = new THREE.InstancedMesh(flyingPage, paper, 28);
    this.sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035), gold, 96);
    for (const mesh of [this.pages, this.sparks]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.root.name = 'GrimoireCleanseCast';
    this.root.add(this.book, this.pages, this.sparks);
    this.root.traverse(part => { part.raycast = () => {}; });
    scene.add(this.root);
    this.update(startedAt);
  }

  update(time: number): boolean {
    if (this.disposed) return false;
    const age = Math.max(0, time - this.startedAt);
    const hit = age >= GrimoireCleanseVisual.impactMs;
    const burst = Math.max(0, age - GrimoireCleanseVisual.impactMs) / 1100;
    if (age >= GrimoireCleanseVisual.durationMs) {
      if (!this.impacted) { this.impacted = true; this.onImpact(); }
      this.dispose();
      return false;
    }
    const charge = THREE.MathUtils.smoothstep(age, 0, 300);
    const fade = 1 - THREE.MathUtils.smoothstep(age, 650, 1100);
    this.book.scale.setScalar(charge * fade * this.strength);
    this.book.position.y = this.from.y + Math.sin(age * 0.004) * 0.08;
    const opening = THREE.MathUtils.smoothstep(age, 70, 480);
    this.leaves.forEach((leaf, i) => { leaf.rotation.z = (i === 0 ? -1 : 1) * (1.15 * (1 - opening) + 0.22 + Math.sin(age * 0.009) * 0.035); });
    this.seals.forEach((seal, i) => {
      const reveal = THREE.MathUtils.smoothstep(age, 650 + i * 40, 1000 + i * 40);
      seal.scale.setScalar((0.45 + i * 0.2 + burst * 1.1) * this.strength);
      seal.position.y = this.to.y - 0.8 + i * 0.43 + Math.sin(age * 0.003 + i) * 0.08;
      seal.rotation.z = age * 0.0015 * (i % 2 ? -1 : 1);
      seal.material.opacity = reveal * (1 - burst) ** 2 * 0.85;
    });
    for (let i = 0; i < this.pages.count; i++) {
      const t = THREE.MathUtils.clamp((age - 240 - i * 12) / 600, 0, 1);
      const angle = i * 2.39996 + age * 0.008;
      const radius = Math.sin(t * Math.PI) * 0.48 * this.strength;
      this.dummy.position.lerpVectors(this.from, this.to, t)
        .addScaledVector(this.side, Math.cos(angle) * radius)
        .addScaledVector(this.up, Math.sin(angle) * radius + Math.sin(t * Math.PI) * 0.22);
      if (hit) {
        const r = (0.25 + burst * (1 + (i % 4) * 0.2)) * this.strength;
        this.dummy.position.copy(this.to).addScaledVector(this.side, Math.cos(angle) * r)
          .addScaledVector(this.up, Math.sin(angle) * r);
        this.dummy.position.y += burst * 0.6;
      }
      this.dummy.rotation.set(angle, angle * 0.7, angle * 0.3);
      this.dummy.scale.setScalar((hit ? (1 - burst) ** 2 : Math.sin(t * Math.PI)) * this.strength);
      this.dummy.updateMatrix();
      this.pages.setMatrixAt(i, this.dummy.matrix);
    }
    for (let i = 0; i < this.sparks.count; i++) {
      const f = i / this.sparks.count;
      const angle = f * Math.PI * 12 - age * 0.006;
      const progress = THREE.MathUtils.clamp((age - 280) / 720 - f * 0.4, 0, 1);
      const radius = (hit ? 0.3 + burst * 1.6 : 0.24 * Math.sin(progress * Math.PI)) * this.strength;
      this.dummy.position.lerpVectors(this.from, this.to, hit ? 1 : progress)
        .addScaledVector(this.side, Math.cos(angle) * radius)
        .addScaledVector(this.up, Math.sin(angle) * radius);
      if (hit) this.dummy.position.y += (f - 0.5) * burst * 2.4;
      this.dummy.rotation.set(angle, f * 10, 0);
      this.dummy.scale.setScalar((hit ? (1 - burst) ** 2 : charge) * (0.4 + (i % 3) * 0.3));
      this.dummy.updateMatrix();
      this.sparks.setMatrixAt(i, this.dummy.matrix);
    }
    this.pages.instanceMatrix.needsUpdate = true;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (hit && !this.impacted) { this.impacted = true; this.onImpact(); }
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
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.pages.dispose();
    this.sparks.dispose();
  }
}
