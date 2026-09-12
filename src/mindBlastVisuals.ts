import * as THREE from 'three';

/** A contracting psychic halo snaps outward into ripples and splinters. */
export function createMindBlast(): THREE.Mesh {
  const root = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0 }, time: { value: 0 } },
    vertexShader: `
      varying vec3 normalView, directionView;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        normalView = normalize(normalMatrix * normal);
        directionView = normalize(-p.xyz);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      varying vec3 normalView, directionView;
      uniform float strength, time;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(normalView), normalize(directionView))), 2.5);
        float ripple = 0.75 + 0.25 * sin(normalView.y * 24.0 - time * 17.0);
        gl_FragColor = vec4(mix(vec3(0.42,0.09,0.8),vec3(0.95,0.62,1.0),rim), rim * ripple * strength);
      }`,
  }));
  root.name = 'MindBlast';
  for (let index = 0; index < 3; index++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.014, 5, 48, Math.PI * 1.85), new THREE.MeshBasicMaterial({ color: index ? 0xb16aff : 0xf0b4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.name = 'PsychicRipple'; ring.userData.index = index;
    ring.rotation.set(index * 1.05, index * 0.72, index * 2.1);
    root.add(ring);
  }
  for (let index = 0; index < 16; index++) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: index % 3 ? 0xab60ed : 0xf4d2ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const y = 1 - 2 * (index + 0.5) / 16;
    const radius = Math.sqrt(1 - y * y), angle = index * 2.399963;
    const direction = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    shard.name = 'PsychicShard'; shard.userData.direction = direction;
    shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    root.add(shard);
  }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfce3ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.name = 'PsychicFlash'; root.add(flash);
  root.add(new THREE.PointLight(0xc27bff, 0, 3.4));
  updateMindBlast(root, 0);
  return root;
}

export function updateMindBlast(root: THREE.Mesh, elapsed: number): void {
  const charge = Math.min(1, elapsed / 200);
  const release = THREE.MathUtils.clamp((elapsed - 200) / 620, 0, 1);
  const envelope = elapsed < 200 ? charge * 0.55 : (1 - release) ** 2;
  const material = root.material as THREE.ShaderMaterial;
  material.uniforms.time.value = elapsed / 1000;
  material.uniforms.strength.value = envelope;
  // Scale only the shell geometry through its shader-independent parent scale;
  // compensate children so ripple/shard trajectories stay in world units.
  const size = elapsed < 200 ? 1.4 - charge * 0.6 : 0.8 + release * 1.4;
  root.scale.setScalar(size);
  root.children.forEach((child) => {
    if (child instanceof THREE.PointLight) { child.intensity = envelope * 3; return; }
    if (!(child instanceof THREE.Mesh)) return;
    const childMaterial = child.material as THREE.MeshBasicMaterial;
    childMaterial.opacity = envelope;
    if (child.name === 'PsychicRipple') {
      const index = Number(child.userData.index);
      child.scale.setScalar((elapsed < 200 ? 1.65 - charge * 0.9 : 0.75 + release * (2.2 + index * 0.4)) / size);
      child.rotation.z = index * 2.1 + elapsed * 0.0015;
    } else if (child.name === 'PsychicShard') {
      child.position.copy(child.userData.direction).multiplyScalar((elapsed < 200 ? 0.8 - charge * 0.5 : 0.3 + release * 1.1) / size);
      child.scale.set(0.7 / size, (2.2 + release * 2) / size, 0.7 / size);
    } else if (child.name === 'PsychicFlash') {
      const flash = elapsed < 200 ? 0 : Math.max(0, 1 - (elapsed - 200) / 160);
      childMaterial.opacity = flash * 0.85;
      child.scale.setScalar((0.5 + flash * 1.8) / size);
    }
  });
}
