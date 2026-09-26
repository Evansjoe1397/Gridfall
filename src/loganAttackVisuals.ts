import * as THREE from 'three';

export type LoganSpell = 'arcane-bolt' | 'mana-blast';
export function isLoganSpell(cardId?: string): cardId is LoganSpell {
  return cardId === 'arcane-bolt' || cardId === 'mana-blast';
}

/** One bounded cast: gathering light, flight, impact, then a dissipating wake. */
export class LoganAttackVisual {
  readonly root = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly impactRoot = new THREE.Group();
  private readonly rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly motes: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly axis: THREE.Vector3;
  private readonly side: THREE.Vector3;
  private readonly up: THREE.Vector3;
  private readonly point = new THREE.Vector3();
  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;
  private readonly energy: THREE.ShaderMaterial;
  private readonly core: THREE.Mesh;
  private readonly seal: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly flight: number;
  private readonly size: number;
  private impacted = false;
  private disposed = false;
  private readonly charge = 180;

  constructor(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3,
    private readonly spell: LoganSpell, consume: boolean,
    private readonly startedAt: number, private readonly onImpact: () => void) {
    this.from = from.clone();
    this.to = to.clone();
    this.flight = spell === 'arcane-bolt' ? 420 : 540;
    this.size = (spell === 'arcane-bolt' ? 0.21 : 0.36) * (consume ? 1.3 : 1);
    this.axis = to.clone().sub(from).normalize();
    if (this.axis.lengthSq() < 0.001) this.axis.set(0, 0, 1);
    this.side = new THREE.Vector3().crossVectors(this.axis, new THREE.Vector3(0, 1, 0));
    if (this.side.lengthSq() < 0.001) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up = new THREE.Vector3().crossVectors(this.side, this.axis).normalize();
    const color = new THREE.Color(spell === 'arcane-bolt' ? 0x9854ff : 0x26bfff);
    const pale = new THREE.Color(spell === 'arcane-bolt' ? 0xf2caff : 0xbaffff);
    this.energy = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, alpha: { value: 1 }, tint: { value: color } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `varying vec3 vNormal, vView, vLocal;
        void main() {
          vLocal = position;
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal); vView = -p.xyz;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `uniform float time, alpha; uniform vec3 tint;
        varying vec3 vNormal, vView, vLocal;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
          float flow = sin(vLocal.y * 15.0 - time * 8.0 + sin(vLocal.x * 12.0 + time * 5.0) + vLocal.z * 9.0);
          float filament = pow(max(0.0, flow), 7.0);
          gl_FragColor = vec4(tint * (0.65 + rim) + vec3(0.55) * filament,
            (0.06 + rim * 0.65 + filament * 0.35) * alpha);
        }`,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.energy);
    shell.scale.setScalar(this.size * 1.9);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(this.size * 0.6, 2),
      new THREE.MeshBasicMaterial({ color: pale, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.head.add(shell, this.core);
    this.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.axis);
    if (spell === 'arcane-bolt') this.head.scale.z = 1.8;
    const ringMaterial = () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.seal = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 64, 1, 0, Math.PI * 1.8), ringMaterial());
    this.seal.position.copy(from);
    this.seal.quaternion.copy(this.head.quaternion);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72), ringMaterial());
      if (i === 0) ring.rotation.x = -Math.PI / 2;
      else { ring.quaternion.copy(this.head.quaternion); ring.rotateY((i - 1) * 0.7); }
      this.rings.push(ring);
      this.impactRoot.add(ring);
    }
    this.impactRoot.position.copy(to);
    this.motes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1),
      new THREE.MeshBasicMaterial({ color: pale, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 72);
    this.motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.motes.frustumCulled = false;
    this.root.name = spell === 'arcane-bolt' ? 'ArcaneBoltCast' : 'ManaBlastCast';
    this.root.add(this.head, this.seal, this.impactRoot, this.motes);
    this.root.traverse(part => { part.raycast = () => {}; });
    scene.add(this.root);
    this.update(startedAt);
  }

  update(time: number): boolean {
    if (this.disposed) return false;
    const age = Math.max(0, time - this.startedAt);
    const progress = THREE.MathUtils.clamp((age - this.charge) / this.flight, 0, 1);
    const burst = Math.max(0, age - this.charge - this.flight) / 1000;
    const hit = age >= this.charge + this.flight;
    if (burst >= 0.85) {
      if (!this.impacted) { this.impacted = true; this.onImpact(); }
      this.dispose(); return false;
    }
    this.energy.uniforms.time.value = age / 1000;
    this.energy.uniforms.alpha.value = hit ? Math.max(0, 1 - burst * 7) : Math.min(1, age / this.charge);
    this.head.position.lerpVectors(this.from, this.to, progress);
    this.head.scale.setScalar(hit ? 1 + burst * 9 : 0.35 + Math.min(1, age / this.charge) * 0.65);
    if (this.spell === 'arcane-bolt') this.head.scale.z *= hit ? 1 : 1.8;
    this.core.visible = !hit;
    this.core.rotation.set(age * 0.006, age * 0.009, 0);
    this.seal.scale.setScalar(this.size * (1.7 + Math.min(1, age / this.charge) * 1.4));
    this.seal.quaternion.copy(this.head.quaternion);
    this.seal.rotateZ(age * 0.004);
    this.seal.material.opacity = Math.max(0, 1 - Math.max(0, age - this.charge) / 240) * Math.min(1, age / 100) * 0.7;
    this.impactRoot.visible = hit;
    this.rings.forEach((ring, i) => {
      const t = Math.max(0, burst - i * 0.065);
      ring.scale.setScalar(this.size + t * (this.spell === 'mana-blast' ? 3.8 : 2.7));
      ring.material.opacity = burst < i * 0.065 ? 0 : Math.max(0, 1 - t / 0.65) ** 2 * 0.8;
    });
    for (let i = 0; i < this.motes.count; i++) {
      const f = i / this.motes.count;
      let scale: number;
      if (hit) {
        const y = 1 - 2 * (i + 0.5) / this.motes.count;
        const r = Math.sqrt(1 - y * y);
        const angle = i * 2.399963;
        const spread = this.size + burst * (1.5 + (i % 7) * 0.28);
        this.point.set(Math.cos(angle) * r, y, Math.sin(angle) * r).multiplyScalar(spread).add(this.to);
        this.point.y -= burst * burst * 0.7;
        scale = (0.025 + (i % 3) * 0.009) * Math.max(0, 1 - burst / 0.85);
      } else {
        const tail = Math.max(0, progress - f * 0.48);
        this.point.lerpVectors(this.from, this.to, tail);
        const angle = f * Math.PI * 8 - age * 0.014 + (i % 2) * Math.PI;
        const radius = this.size * (this.spell === 'mana-blast' ? 1.3 : 0.75) * (1 - f * 0.6);
        this.point.addScaledVector(this.side, Math.cos(angle) * radius).addScaledVector(this.up, Math.sin(angle) * radius);
        scale = (0.02 + 0.028 * (1 - f)) * Math.min(1, age / this.charge);
      }
      this.dummy.position.copy(this.point);
      this.dummy.rotation.set(i + age * 0.003, i * 2, age * 0.005);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.motes.setMatrixAt(i, this.dummy.matrix);
    }
    this.motes.instanceMatrix.needsUpdate = true;
    // Run after placing the flash so damage and destruction share its hit frame.
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
      (Array.isArray(part.material) ? part.material : [part.material]).forEach(material => material.dispose());
    });
    this.motes.dispose();
  }
}
