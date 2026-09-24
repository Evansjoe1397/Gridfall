import * as THREE from 'three';

export const PORTAL_TELEPORT_MS = 1250;

/** Owns only temporary effects and the character's root scale; materials stay untouched. */
export class PortalTeleport {
  private readonly root = new THREE.Group();
  private readonly baseScale: THREE.Vector3;
  private readonly gates: THREE.Group[] = [];
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[][] = [];
  private readonly sparks: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[][] = [];
  private readonly sparkGeometry = new THREE.OctahedronGeometry(0.035);
  private readonly sparkMaterial = this.material(0xbaffff);

  constructor(private readonly character: THREE.Group, private readonly from: THREE.Vector3, private readonly to: THREE.Vector3, scene: THREE.Scene) {
    this.baseScale = character.scale.clone();
    for (const position of [from, to]) {
      const gate = new THREE.Group();
      gate.position.copy(position);
      this.root.add(gate);
      this.gates.push(gate);
      const rings = [0, 1, 2].map((index) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.66 + index * 0.13, 0.69 + index * 0.13, 80, 1, 0, index === 1 ? Math.PI * 1.65 : Math.PI * 2), this.material(index === 1 ? 0xa477ff : 0x70f5ff));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.045 + index * 0.025;
        gate.add(ring);
        return ring;
      });
      this.rings.push(rings);
      this.sparks.push(Array.from({ length: 48 }, () => {
        const spark = new THREE.Mesh(this.sparkGeometry, this.sparkMaterial);
        gate.add(spark);
        return spark;
      }));
    }
    scene.add(this.root);
  }

  private material(color: number) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  }

  update(progress: number) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    // Collapse at the origin, cross only while fully collapsed, then materialize.
    const collapse = THREE.MathUtils.smoothstep(p, 0.16, 0.43);
    const emerge = THREE.MathUtils.smoothstep(p, 0.54, 0.83);
    const size = p < 0.5 ? 1 - collapse : emerge;
    this.character.position.copy(p < 0.5 ? this.from : this.to);
    this.character.scale.copy(this.baseScale).multiply(new THREE.Vector3(size, size * (1 + Math.sin(size * Math.PI) * 0.6), size));
    this.gates.forEach((gate, side) => {
      const local = THREE.MathUtils.clamp((p - side * 0.18) / 0.82, 0, 1);
      const envelope = Math.sin(local * Math.PI);
      const flash = Math.exp(-Math.pow((p - (side ? 0.59 : 0.39)) / 0.065, 2));
      gate.scale.setScalar(0.65 + envelope * 0.4);
      this.rings[side].forEach((ring, index) => {
        ring.rotation.z = p * (index % 2 ? -8 : 6) + index;
        ring.scale.setScalar(1 + flash * (0.15 + index * 0.1));
        ring.position.y = index === 2 ? 0.1 + envelope * 2.5 : 0.045 + index * 0.025;
        ring.material.opacity = envelope * (0.55 + flash * 0.45);
      });
      this.sparks[side].forEach((spark, index) => {
        const phase = (index / 48 + local * 1.35) % 1;
        const angle = index * 2.39996 + local * 9 * (side ? -1 : 1);
        const radius = (0.75 - phase * 0.4) * envelope;
        spark.position.set(Math.cos(angle) * radius, 0.08 + phase * 2.8, Math.sin(angle) * radius);
        spark.scale.setScalar(envelope * (0.4 + Math.sin(phase * Math.PI) * 1.3));
      });
    });
    this.sparkMaterial.opacity = Math.sin(p * Math.PI);
  }

  dispose() {
    this.character.scale.copy(this.baseScale);
    this.root.removeFromParent();
    this.rings.flat().forEach((ring) => { ring.geometry.dispose(); ring.material.dispose(); });
    this.sparkGeometry.dispose();
    this.sparkMaterial.dispose();
  }
}
