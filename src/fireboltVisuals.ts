import * as THREE from 'three';
import { createFlameWardShield, animateFlameWardShield, disposeFlameWardShield } from './flame-ward-visuals.ts';

/** A self-contained charge, comet and ember burst, in world coordinates. */
export class FireboltVisual {
  readonly group = new THREE.Group();
  readonly impactAt: number;
  private readonly texture: THREE.DataTexture;
  private readonly core: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly trail: THREE.Sprite[] = [];
  private readonly sparks: THREE.Sprite[] = [];
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly light = new THREE.PointLight(0xff7b20, 0, 4);
  private readonly travelMs: number;
  private readonly side: THREE.Vector3;
  private readonly wardShield?: THREE.Group;

  constructor(private readonly from: THREE.Vector3, private readonly to: THREE.Vector3, private readonly startedAt: number, private readonly power = 1, private readonly route?: THREE.Vector3[], private readonly absorption = false, wardLevel = 0) {
    this.group.name = power > 1 ? 'Fireball' : 'Firebolt';
    const routeLength = route && route.length > 1 ? route.slice(1).reduce((length, point, index) => length + point.distanceTo(route[index]), 0) : from.distanceTo(to);
    this.travelMs = 360 + Math.min(route ? 10 : 4, routeLength) * 65;
    this.impactAt = startedAt + 220 + this.travelMs;
    this.side = new THREE.Vector3().subVectors(to, from).cross(new THREE.Vector3(0, 1, 0)).normalize();
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      const radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - radius), 2));
    }
    this.texture = new THREE.DataTexture(pixels, 32, 32);
    this.texture.needsUpdate = true;
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.core = this.sprite(0xfff5bb);
    this.halo = this.sprite(0xff6010);
    for (let i = 0; i < 28; i++) this.trail.push(this.sprite(i % 3 === 0 ? 0xffcf54 : 0xff5315));
    for (let i = 0; i < 24; i++) this.sparks.push(this.sprite(i % 2 ? 0xffb932 : 0xff6520));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(.72, .79, 64), new THREE.MeshBasicMaterial({
      color: 0xffa634, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(to).add(new THREE.Vector3(0, -1.18, 0));
    this.ring.visible = false;
    this.group.add(this.ring, this.light);
    if (wardLevel > 0) {
      this.wardShield = createFlameWardShield(wardLevel >= 3);
      this.wardShield.position.copy(from);
      this.group.add(this.wardShield);
    }
    this.update(startedAt);
  }

  private sprite(color: number) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.visible = false;
    this.group.add(sprite);
    return sprite;
  }

  private point(progress: number, out: THREE.Vector3) {
    if (this.route && this.route.length > 1) {
      const scaled = progress * (this.route.length - 1);
      const index = Math.min(this.route.length - 2, Math.floor(scaled));
      out.lerpVectors(this.route[index], this.route[index + 1], scaled - index);
    } else out.lerpVectors(this.from, this.to, progress);
    out.y += Math.sin(progress * Math.PI) * .32;
  }

  /** Ward shots follow the moving Character until impact, then freeze the burst. */
  trackTarget(position: THREE.Vector3): void {
    this.to.copy(position);
    this.ring.position.copy(position).add(new THREE.Vector3(0, -1.18, 0));
  }

  update(time: number): boolean {
    this.group.visible = time >= this.startedAt;
    if (!this.group.visible) return false;
    const elapsed = Math.max(0, time - this.startedAt);
    const travel = THREE.MathUtils.clamp((elapsed - 220) / this.travelMs, 0, 1);
    const burst = Math.max(0, time - this.impactAt) / 680;
    const arrived = time >= this.impactAt;
    const charge = Math.min(1, elapsed / 220);
    if (this.wardShield) {
      this.wardShield.visible = elapsed < 220;
      this.wardShield.scale.set(1 - charge * .95, 1 - charge * .95, 1 + charge * 2);
      animateFlameWardShield(this.wardShield, time);
    }
    this.point(travel, this.core.position);
    this.halo.position.copy(this.core.position);
    this.core.visible = this.halo.visible = burst < .4;
    this.core.scale.setScalar((arrived ? .95 * Math.max(0, 1 - burst * 2.5) : .35 + charge * .28) * this.power);
    if (this.wardShield && elapsed < 220) this.core.scale.multiplyScalar(charge);
    this.halo.scale.setScalar((arrived ? 1.2 + burst * 5 : 1 + charge * .6 + Math.sin(elapsed * .035) * .12) * this.power);
    this.halo.material.opacity = arrived ? Math.max(0, 1 - burst * 2.5) : .75;
    this.trail.forEach((ember, i) => {
      const p = (elapsed - 220 - i * 10) / this.travelMs;
      ember.visible = elapsed >= 220 && p >= 0 && p <= 1;
      if (!ember.visible) return;
      this.point(p, ember.position);
      const swirl = elapsed * .021 - i * .65;
      const radius = .035 + i * .005;
      ember.position.addScaledVector(this.side, Math.sin(swirl) * radius);
      ember.position.y += Math.cos(swirl) * radius;
      ember.scale.setScalar(.48 * (1 - i / 32) * this.power);
      ember.material.opacity = .85 * (1 - i / 30);
    });
    this.sparks.forEach((spark, i) => {
      spark.visible = arrived && burst < 1;
      if (!spark.visible) return;
      const angle = i * 2.399963;
      const radius = (this.absorption ? Math.pow(1 - Math.min(1, burst), 3) : 1 - Math.pow(1 - Math.min(1, burst), 3)) * (.45 + (i % 5) * .18);
      spark.position.copy(this.to).add(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(i * 7.1) * radius * .55 + burst * .65, Math.sin(angle) * radius));
      spark.scale.setScalar((.12 + (i % 3) * .055) * (1 - burst) * this.power);
      spark.material.opacity = Math.pow(1 - burst, 1.5);
    });
    this.ring.visible = arrived && !this.absorption;
    this.ring.scale.setScalar((.35 + burst * 2.2) * this.power);
    this.ring.material.opacity = arrived ? Math.max(0, .65 * (1 - burst * 1.7)) : 0;
    this.light.position.copy(this.core.position);
    this.light.intensity = (arrived ? Math.max(0, 3.5 * (1 - burst * 2)) : charge * 1.8) * this.power;
    return burst >= 1;
  }

  dispose() {
    if (this.wardShield) disposeFlameWardShield(this.wardShield);
    this.group.removeFromParent();
    this.group.traverse((part) => { if (part instanceof THREE.Sprite) part.material.dispose(); });
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.texture.dispose();
    this.light.dispose();
  }
}
