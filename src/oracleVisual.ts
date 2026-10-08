import * as THREE from 'three';

let glowTexture: THREE.CanvasTexture | undefined;
function glow() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.18, '#bcf4ff');
  gradient.addColorStop(0.45, 'rgba(35,150,255,.65)');
  gradient.addColorStop(1, 'rgba(10,60,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** A short foresight flash; block mode holds its ward until the authored hit. */
export class OracleVisual {
  private group = new THREE.Group();
  private eyes: THREE.Sprite[] = [];
  private wisps: THREE.Sprite[] = [];
  private ward = new THREE.Group();
  private ripple: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private hitAt: number | undefined;
  private position = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private disposed = false;

  constructor(private scene: THREE.Scene, private character: THREE.Group,
    private startedAt: number, private attacker?: THREE.Vector3) {
    this.group.name = 'OracleForesight';
    const sprite = () => new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    for (let i = 0; i < 2; i++) {
      const eye = sprite();
      this.eyes.push(eye);
      this.group.add(eye);
    }
    for (let i = 0; i < 12; i++) {
      const wisp = sprite();
      this.wisps.push(wisp);
      this.group.add(wisp);
    }
    const material = () => new THREE.MeshBasicMaterial({
      color: 0x65cfff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    const outline: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = i / 64 * Math.PI * 2;
      outline.push(new THREE.Vector3(Math.cos(angle) * 0.85,
        Math.sin(angle) * Math.abs(Math.sin(angle)) * 0.38, 0));
    }
    const curve = new THREE.CatmullRomCurve3(outline);
    this.ward.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.018, 5, false), material()));
    this.ward.add(new THREE.Mesh(new THREE.RingGeometry(0.22, 0.25, 48), material()));
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), material());
    pupil.scale.y = 1.7;
    this.ward.add(pupil);
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.23, 0.25, 48), material());
    this.ward.add(this.ripple);
    this.group.add(this.ward);
    scene.add(this.group);
    this.update(startedAt);
  }

  impact(time: number) {
    if (this.attacker && this.hitAt === undefined) this.hitAt = time;
  }

  update(time: number) {
    const age = time - this.startedAt;
    const hitAge = this.hitAt === undefined ? undefined : time - this.hitAt;
    if (!this.character.parent || (!this.attacker && age > 700)
      || (hitAge !== undefined && hitAge > 650) || age > 12000) {
      this.dispose();
      return false;
    }
    this.group.visible = this.character.visible;
    this.character.updateWorldMatrix(true, true);
    // The GLB provides a face-front bone, so the flare follows animated poses.
    const face = this.character.getObjectByName('headfront');
    const head = this.character.getObjectByName('Head');
    const flash = Math.sin(Math.PI * Math.min(1, age / 600));
    this.eyes.forEach((eye, i) => {
      if (face && head) {
        eye.position.copy(face.position).add(new THREE.Vector3((i ? 1 : -1) * 0.035, 0.025, 0.012));
        head.localToWorld(eye.position);
      } else {
        eye.position.set((i ? 1 : -1) * 0.08, 2.25, 0.17);
        this.character.localToWorld(eye.position);
      }
      eye.scale.set(0.12 + flash * (this.attacker ? 0.28 : 0.48), 0.09 + flash * 0.1, 1);
      eye.material.opacity = flash * (this.attacker ? 0.8 : 1);
    });
    this.position.copy(this.eyes[0].position).lerp(this.eyes[1].position, 0.5);
    this.ward.visible = Boolean(this.attacker);
    if (this.attacker) {
      this.direction.subVectors(this.attacker, this.character.position).setY(0).normalize();
      this.ward.position.copy(this.character.position).addScaledVector(this.direction, 0.65);
      this.ward.position.y += 1.5;
      this.ward.lookAt(this.ward.position.clone().add(this.direction));
      const fade = hitAge === undefined ? Math.min(1, age / 160) * 0.65 : Math.max(0, 1 - hitAge / 650);
      this.ward.scale.setScalar(0.9 + Math.min(age / 200, 1) * 0.1);
      for (const part of this.ward.children) {
        (part as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = fade;
      }
      this.ripple.visible = hitAge !== undefined;
      this.ripple.scale.setScalar(1 + (hitAge ?? 0) / 100);
      this.ripple.material.opacity = hitAge === undefined ? 0 : Math.max(0, 1 - hitAge / 450);
    }
    this.wisps.forEach((wisp, i) => {
      const burst = hitAge !== undefined;
      const progress = Math.max(0, ((burst ? hitAge : age - 100) - i * 12) / 550);
      const angle = i * 2.399;
      wisp.position.copy(burst ? this.ward.position : this.position);
      wisp.position.x += Math.cos(angle) * progress * (burst ? 0.95 : 0.3);
      wisp.position.z += Math.sin(angle) * progress * 0.3;
      wisp.position.y += burst ? Math.sin(angle) * progress * 0.8 : progress * 0.45;
      wisp.scale.setScalar((burst ? 0.11 : 0.065) * Math.max(0, 1 - progress));
      wisp.material.opacity = progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) * 0.8 : 0;
    });
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    this.group.traverse(part => {
      if (part instanceof THREE.Mesh) part.geometry.dispose();
      if (part instanceof THREE.Mesh || part instanceof THREE.Sprite) {
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        materials.forEach(material => material.dispose());
      }
    });
  }
}
