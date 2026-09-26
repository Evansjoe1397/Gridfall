import * as THREE from 'three';

/** A sustained ward: only the combat impact releases it, never a fixed lifetime. */
export class ManaShieldVisual {
  readonly root = new THREE.Group();
  private readonly shellMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, opacity: { value: 0 }, burst: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = -view.xyz;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform float time;
      uniform float opacity;
      uniform float burst;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
        float flow = sin(vLocal.y * 17.0 + sin(vLocal.x * 9.0 + time * 1.8)
          + sin(vLocal.z * 8.0 - time * 1.3) - time * 3.0);
        float filaments = pow(max(0.0, flow), 16.0);
        float sweep = pow(max(0.0, sin(vLocal.y * 5.0 - time * 2.5)), 12.0);
        vec3 blue = mix(vec3(0.035, 0.19, 0.85), vec3(0.24, 0.8, 1.0), rim);
        blue += vec3(0.25, 0.55, 0.65) * (filaments * 0.45 + burst);
        float alpha = (0.045 + rim * 0.7 + filaments * 0.12 + sweep * rim * 0.2 + burst * 0.55) * opacity;
        gl_FragColor = vec4(blue, alpha);
      }`,
  });
  private readonly shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.shellMaterial);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x66ccff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  private readonly ring = new THREE.Mesh(new THREE.RingGeometry(0.91, 0.95, 64), this.ringMaterial);
  private readonly sparkMaterial = new THREE.MeshBasicMaterial({
    color: 0xb9f5ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  private readonly sparkGeometry = new THREE.OctahedronGeometry(0.024);
  private readonly sparks = Array.from({ length: 32 }, () => new THREE.Mesh(this.sparkGeometry, this.sparkMaterial));
  private burstAt: number | null = null;
  private disposed = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3, private readonly startedAt: number, private readonly height = 2.8) {
    this.root.name = 'ManaShieldBubble';
    this.root.position.copy(position);
    this.root.scale.set(0.85, 0.75, 0.85);
    this.shell.position.y = height * 0.5;
    this.shell.scale.set(1.02, height * 0.56, 1.02);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.root.add(this.shell, this.ring, ...this.sparks);
    scene.add(this.root);
    this.update(startedAt);
  }

  impact(time: number) {
    this.burstAt ??= time;
  }

  /** Returns false once the burst has faded and GPU resources have been freed. */
  update(time: number, position?: THREE.Vector3): boolean {
    if (this.disposed) return false;
    if (position && this.burstAt === null) this.root.position.copy(position);
    const age = Math.max(0, (time - this.startedAt) / 1000);
    const burstAge = this.burstAt === null ? 0 : Math.max(0, (time - this.burstAt) / 1000);
    if (this.burstAt !== null && burstAge >= 0.65) { this.dispose(); return false; }
    const forming = 1 - Math.pow(1 - Math.min(1, age / 0.26), 3);
    const bursting = this.burstAt !== null;
    const fade = bursting ? Math.max(0, 1 - burstAge / 0.65) : forming;
    const scale = bursting ? 1 + burstAge * 1.5 : 0.5 + forming * 0.5 + Math.sin(age * 3.5) * 0.012;
    this.shell.scale.set(1.02 * scale, this.height * 0.56 * scale, 1.02 * scale);
    this.shellMaterial.uniforms.time.value = age;
    this.shellMaterial.uniforms.opacity.value = bursting ? Math.max(0, 1 - burstAge / 0.22) : forming;
    this.shellMaterial.uniforms.burst.value = bursting ? Math.exp(-burstAge * 18) : 0;
    this.ring.scale.setScalar(bursting ? 1 + burstAge * 3.2 : 0.7 + forming * 0.3);
    this.ringMaterial.opacity = fade * (bursting ? 0.9 : 0.4);
    this.sparkMaterial.opacity = fade * (bursting ? 1 : 0.75);
    this.sparks.forEach((spark, index) => {
      const y = 1 - 2 * (index + 0.5) / this.sparks.length;
      const radius = Math.sqrt(1 - y * y);
      // Freeze the orbit at impact, then scatter outwards from that exact pose.
      const angle = index * 2.399963 + (bursting ? (this.burstAt! - this.startedAt) / 1000 : age) * 0.55;
      const spread = bursting ? 1 + burstAge * (2 + (index % 4) * 0.35) : scale;
      spark.position.set(Math.cos(angle) * radius * spread * 1.04,
        this.height * 0.5 + y * this.height * 0.56 * spread - burstAge * burstAge * 1.5,
        Math.sin(angle) * radius * spread * 1.04);
      spark.rotation.set(age + index, age * 1.8, index);
      spark.scale.setScalar(bursting ? 1.7 * fade : 0.6 + 0.5 * Math.sin(age * 4 + index) ** 2);
    });
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.shell.geometry.dispose();
    this.shellMaterial.dispose();
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    this.sparkGeometry.dispose();
    this.sparkMaterial.dispose();
  }
}
