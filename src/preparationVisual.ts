import * as THREE from 'three';

/** Temporary arcane cards and mana motes; never changes the character or game state. */
export class PreparationVisual {
  readonly root = new THREE.Group();
  private readonly cards: THREE.Group[] = [];
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly motes: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly glow: THREE.MeshBasicMaterial;
  private readonly paper: THREE.MeshBasicMaterial;
  private disposed = false;

  constructor(scene: THREE.Scene, private readonly origin: THREE.Vector3,
    private readonly startedAt: number, level = 1,
    private readonly follow?: THREE.Object3D, private readonly destination?: THREE.Vector3) {
    this.origin = origin.clone();
    this.destination = destination?.clone();
    this.glow = new THREE.MeshBasicMaterial({ color: 0x91faff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.paper = new THREE.MeshBasicMaterial({ color: 0x29204f, transparent: true,
      depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.65 + i * 0.17, 0.675 + i * 0.17,
        i === 1 ? 6 : 64, 1, 0, Math.PI * (i === 2 ? 1.6 : 2)), this.glow);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05 + i * 0.025;
      this.rings.push(ring);
      this.root.add(ring);
    }
    const cardGeometry = new THREE.PlaneGeometry(0.28, 0.4);
    const frameGeometry = new THREE.PlaneGeometry(0.31, 0.43);
    const runeGeometry = new THREE.RingGeometry(0.05, 0.065, 4);
    for (let i = 0; i < 3 + level; i++) {
      const card = new THREE.Group();
      card.add(new THREE.Mesh(frameGeometry, this.glow));
      const face = new THREE.Mesh(cardGeometry, this.paper);
      face.position.z = 0.004;
      card.add(face);
      const rune = new THREE.Mesh(runeGeometry, this.glow);
      rune.position.z = 0.008;
      card.add(rune);
      this.cards.push(card);
      this.root.add(card);
    }
    this.motes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035), this.glow, 48);
    // Instances move outside their initial bounds during the swap.
    this.motes.frustumCulled = false;
    this.root.add(this.motes);
    scene.add(this.root);
    this.update(startedAt);
  }

  update(time: number): boolean {
    if (this.disposed) return false;
    const p = THREE.MathUtils.clamp((time - this.startedAt) / (this.destination ? 1250 : 1800), 0, 1);
    if (p >= 1) { this.dispose(); return false; }
    this.root.position.copy(this.follow?.position ?? this.origin);
    const envelope = Math.min(1, p / 0.15) * Math.min(1, (1 - p) / 0.3);
    this.glow.opacity = envelope * 0.85;
    this.paper.opacity = envelope;
    this.rings.forEach((ring, i) => {
      ring.rotation.z = p * Math.PI * (i % 2 ? -2 : 2) + i;
      ring.scale.setScalar(0.6 + Math.sin(Math.min(1, p * 2) * Math.PI / 2) * 0.45);
    });
    this.cards.forEach((card, i) => {
      const angle = i / this.cards.length * Math.PI * 2 + p * Math.PI * 2;
      const radius = 0.8 * (1 - Math.max(0, p - 0.65) / 0.35) + 0.12;
      card.position.set(Math.cos(angle) * radius, 0.6 + p * 1.25 + Math.sin(angle * 2) * 0.12, Math.sin(angle) * radius);
      card.rotation.set(0.15, -angle + Math.PI / 2, Math.sin(angle) * 0.2);
      card.scale.setScalar(envelope);
    });
    for (let i = 0; i < this.motes.count; i++) {
      const phase = (p * 1.5 + i / this.motes.count) % 1;
      const angle = i * 2.39996 + p * Math.PI * 4;
      if (this.destination) {
        this.dummy.position.lerpVectors(this.origin, this.destination, phase).sub(this.root.position);
        this.dummy.position.y += 0.35 + Math.sin(phase * Math.PI) * 1.3;
        this.dummy.position.x += Math.cos(angle) * 0.12;
        this.dummy.position.z += Math.sin(angle) * 0.12;
      } else {
        const radius = 0.35 + phase * 0.6;
        this.dummy.position.set(Math.cos(angle) * radius, phase * 2.1, Math.sin(angle) * radius);
      }
      this.dummy.scale.setScalar(envelope * Math.sin(phase * Math.PI));
      this.dummy.rotation.set(angle, phase * Math.PI, 0);
      this.dummy.updateMatrix();
      this.motes.setMatrixAt(i, this.dummy.matrix);
    }
    this.motes.instanceMatrix.needsUpdate = true;
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    this.motes.dispose();
    this.glow.dispose();
    this.paper.dispose();
  }
}
