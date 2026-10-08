import * as THREE from 'three';

/** A small spell forming between the animated palms; also works in character previews. */
export class ArchmageConjure {
  readonly root = new THREE.Group();
  private readonly left?: THREE.Object3D;
  private readonly right?: THREE.Object3D;
  private readonly leftTip?: THREE.Object3D;
  private readonly rightTip?: THREE.Object3D;
  private readonly leftPosition = new THREE.Vector3();
  private readonly rightPosition = new THREE.Vector3();
  private readonly tipPosition = new THREE.Vector3();
  private readonly glow: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly sparks: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly ink = new THREE.MeshBasicMaterial({ color: 0xa9eaff, transparent: true,
    opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private elapsed = 0;
  private strength = 0;

  constructor(private readonly model: THREE.Object3D) {
    this.left = model.getObjectByName('mixamorigLeftHand');
    this.right = model.getObjectByName('mixamorigRightHand');
    this.leftTip = model.getObjectByName('mixamorigLeftHandMiddle4');
    this.rightTip = model.getObjectByName('mixamorigRightHandMiddle4');
    this.root.name = 'ArchmageConjureGlow';
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { strength: { value: 0 }, pulse: { value: 0 } },
      vertexShader: `varying vec3 normalView; varying vec3 viewDirection;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          normalView = normalize(normalMatrix * normal);
          viewDirection = -p.xyz;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `varying vec3 normalView; varying vec3 viewDirection;
        uniform float strength; uniform float pulse;
        void main() {
          float center = max(0.0, dot(normalize(normalView), normalize(viewDirection)));
          vec3 color = mix(vec3(0.39, 0.16, 1.0), vec3(0.55, 0.96, 1.0), pow(center, 3.0));
          color = mix(color, vec3(0.9, 1.0, 1.0), pow(center, 18.0) * 0.7);
          gl_FragColor = vec4(color, pow(center, 2.2) * strength * (0.65 + pulse * 0.15));
        }`,
    }));
    this.root.add(this.glow);
    const ringGeometry = new THREE.TorusGeometry(1, .018, 5, 40);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(ringGeometry, this.ink);
      this.rings.push(ring); this.root.add(ring);
    }
    const sparkGeometry = new THREE.OctahedronGeometry(.025);
    for (let i = 0; i < 8; i++) {
      const spark = new THREE.Mesh(sparkGeometry, this.ink);
      this.sparks.push(spark); this.root.add(spark);
    }
    this.root.traverse(part => { part.raycast = () => {}; part.userData.characterEffect = true; });
    this.root.visible = false;
    model.add(this.root);
  }

  reset() { this.strength = 0; this.elapsed = 0; this.root.visible = false; }

  update(delta: number, active: boolean) {
    this.strength = THREE.MathUtils.clamp(this.strength + delta * (active ? 4 : -7), 0, 1);
    this.root.visible = this.strength > 0 && Boolean(this.left && this.right);
    if (!this.root.visible || !this.left || !this.right) return;
    this.elapsed += delta;
    // Evaluate after the mixer, in model-local coordinates so rotation and scale remain correct.
    this.left.getWorldPosition(this.leftPosition);
    this.right.getWorldPosition(this.rightPosition);
    if (this.leftTip) this.leftPosition.lerp(this.leftTip.getWorldPosition(this.tipPosition), .4);
    if (this.rightTip) this.rightPosition.lerp(this.rightTip.getWorldPosition(this.tipPosition), .4);
    this.model.worldToLocal(this.leftPosition);
    this.model.worldToLocal(this.rightPosition);
    this.root.position.copy(this.leftPosition).lerp(this.rightPosition, .5);
    const radius = THREE.MathUtils.clamp(this.leftPosition.distanceTo(this.rightPosition) * .3, .055, .115);
    const pulse = Math.sin(this.elapsed * 4.5);
    this.root.scale.setScalar(radius * (.93 + pulse * .07) * Math.sqrt(this.strength));
    this.glow.scale.setScalar(1.3);
    this.glow.material.uniforms.strength.value = this.strength;
    this.glow.material.uniforms.pulse.value = pulse;
    this.ink.opacity = this.strength * .65;
    this.rings[0].rotation.set(this.elapsed * .8, .6, this.elapsed * 1.2);
    this.rings[1].rotation.set(1.2, -this.elapsed * 1.1, this.elapsed * .7);
    this.sparks.forEach((spark, i) => {
      const angle = this.elapsed * (i % 2 ? 2 : -1.6) + i * Math.PI / 4;
      spark.position.set(Math.cos(angle), Math.sin(angle * 1.4 + i) * .6, Math.sin(angle));
      spark.scale.setScalar(1 + .7 * Math.sin(this.elapsed * 6 + i));
      spark.rotation.set(angle, angle * 2, i);
    });
  }
}
