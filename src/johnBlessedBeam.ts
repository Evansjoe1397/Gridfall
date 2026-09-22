import * as THREE from 'three';

export const JOHN_BEAM_HOLD_MS = 420;
export const JOHN_BEAM_FADE_MS = 140;

export function johnBeamTravelMs(distance: number): number {
  return Math.min(360, Math.max(120, distance / 22 * 1000));
}

export function johnBeamPhase(elapsedMs: number, travelMs: number) {
  return {
    reach: THREE.MathUtils.clamp(elapsedMs / travelMs, 0, 1),
    opacity: 1 - THREE.MathUtils.clamp((elapsedMs - travelMs - JOHN_BEAM_HOLD_MS) / JOHN_BEAM_FADE_MS, 0, 1),
    arrived: elapsedMs >= travelMs,
    finished: elapsedMs >= travelMs + JOHN_BEAM_HOLD_MS + JOHN_BEAM_FADE_MS,
  };
}

/** A travelling front becomes a sustained beam, anchored to the moving staff socket. */
export class JohnBlessedBeam {
  readonly group = new THREE.Group();
  readonly travelMs: number;
  readonly endsAt: number;
  private hit = false;
  private readonly halo = new THREE.Group();
  private readonly impact = new THREE.Group();
  private readonly beams: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly sparks: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly materials: Array<{ material: THREE.MeshBasicMaterial; opacity: number }> = [];
  private readonly sourceLight = new THREE.PointLight(0xffdc87, 2.8, 2.5, 2);
  private readonly impactLight = new THREE.PointLight(0xffefb8, 0, 3, 2);
  private readonly direction = new THREE.Vector3();
  private readonly front = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(readonly startedAt: number, distance: number, private readonly onImpact: () => void, style: 'light' | 'might' = 'light') {
    this.travelMs = johnBeamTravelMs(distance);
    this.endsAt = startedAt + this.travelMs + JOHN_BEAM_HOLD_MS + JOHN_BEAM_FADE_MS;
    this.group.name = style === 'might' ? 'JohnBlessedMightBeam' : 'JohnBlessedLightBeam';
    this.halo.name = 'StaffHeadLightHalo';
    this.impact.name = 'BlessedBeamImpact';
    const material = (color: number, opacity: number) => {
      const m = new THREE.MeshBasicMaterial({ color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      this.materials.push({ material: m, opacity });
      return m;
    };
    const might = style === 'might';
    const ivory = material(might ? 0xffb5b8 : 0xfff9dd, 0.95);
    const gold = material(might ? 0xff1636 : 0xffc759, 0.65);
    const glow = material(might ? 0xff2949 : 0xffdd83, 0.16);
    this.sourceLight.color.setHex(might ? 0xff1838 : 0xffdc87);
    this.impactLight.color.setHex(might ? 0xff4160 : 0xffefb8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.016, 8, 48), ivory);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.008, 6, 48), gold);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), ivory);
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10), glow);
    this.halo.add(ring, outerRing, orb, aura);
    for (let i = 0; i < 8; i++) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.06, 0.008), gold);
      const angle = i * Math.PI / 4;
      ray.position.set(Math.sin(angle) * 0.205, Math.cos(angle) * 0.205, 0);
      ray.rotation.z = -angle;
      this.halo.add(ray);
    }
    for (const [radius, m] of [[0.023, ivory], [0.06, gold], [0.125, glow]] as const) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 12, 1, true), m);
      this.beams.push(beam);
      this.group.add(beam);
    }
    const sparkGeometry = new THREE.SphereGeometry(0.022, 6, 4);
    for (let i = 0; i < 18; i++) {
      const spark = new THREE.Mesh(sparkGeometry, i % 3 ? gold : ivory);
      this.sparks.push(spark);
      this.group.add(spark);
    }
    this.impact.add(
      new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 40), ivory),
      new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), glow),
      new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.012, 6, 40), gold),
    );
    this.group.add(this.halo, this.impact, this.sourceLight, this.impactLight);
    this.impact.visible = false;
  }

  update(time: number, origin: THREE.Vector3, target: THREE.Vector3): boolean {
    const elapsed = Math.max(0, time - this.startedAt);
    const phase = johnBeamPhase(elapsed, this.travelMs);
    this.direction.subVectors(target, origin).normalize();
    this.front.lerpVectors(origin, target, phase.reach);
    const length = origin.distanceTo(this.front);
    this.rotation.setFromUnitVectors(this.zAxis, this.direction);
    this.halo.position.copy(origin);
    this.halo.quaternion.copy(this.rotation);
    this.halo.rotateZ(elapsed * 0.0012);
    this.halo.scale.setScalar(0.92 + Math.sin(elapsed * 0.016) * 0.08);
    this.sourceLight.position.copy(origin);
    this.sourceLight.intensity = 2.8 * phase.opacity;
    for (let i = 0; i < this.beams.length; i++) {
      const beam = this.beams[i];
      beam.visible = length > 0.001;
      beam.position.addVectors(origin, this.front).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(this.yAxis, this.direction);
      const pulse = 1 + Math.sin(elapsed * 0.033 + i) * 0.14;
      beam.scale.set(pulse, length, pulse);
    }
    for (let i = 0; i < this.sparks.length; i++) {
      const spark = this.sparks[i];
      const progress = (i / this.sparks.length + elapsed * 0.0013) % 1;
      const angle = i * 2.4 + elapsed * 0.007;
      spark.position.set(Math.cos(angle) * 0.075, Math.sin(angle) * 0.075, length * progress).applyQuaternion(this.rotation).add(origin);
      spark.scale.setScalar(0.65 + Math.sin(progress * Math.PI) * 0.75);
      spark.visible = length > 0.01;
    }
    this.impact.visible = phase.arrived;
    this.impact.position.copy(target);
    this.impact.quaternion.copy(this.rotation);
    this.impact.rotateZ(-elapsed * 0.002);
    this.impact.scale.setScalar(phase.arrived ? 1 + Math.exp(-(elapsed - this.travelMs) / 100) * 0.8 : 1);
    this.impactLight.position.copy(target);
    this.impactLight.intensity = phase.arrived ? 4 * phase.opacity : 0;
    for (const entry of this.materials) entry.material.opacity = entry.opacity * phase.opacity;
    if (phase.arrived && !this.hit) {
      this.hit = true;
      this.onImpact();
    }
    return phase.finished;
  }

  dispose() {
    this.group.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach(({ material }) => material.dispose());
  }
}
