import * as THREE from 'three';

/** Adds a summon sequence and a quiet, persistent aura to the guardian model. */
export function addSpiritGuardianVisuals(root: THREE.Group): void {
  const body = new THREE.Group(); body.name = 'GuardianBody';
  for (const child of [...root.children]) body.add(child);
  root.add(body);
  const materials = new Map<THREE.MeshStandardMaterial, number>();
  body.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = false;
    if (child.material instanceof THREE.MeshStandardMaterial) {
      materials.set(child.material, child.material.opacity);
      child.material.depthWrite = false;
    }
  });
  root.userData.guardianVisual = { age: 0, materials };
  const aura = new THREE.Group(); aura.name = 'GuardianAura'; root.add(aura);
  const seal = new THREE.Mesh(new THREE.RingGeometry(0.67, 0.71, 64), new THREE.MeshBasicMaterial({ color: 0xffd37c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  seal.name = 'GuardianSeal'; seal.rotation.x = -Math.PI / 2; seal.position.y = 0.07; aura.add(seal);
  const arrival = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.74, 64), (seal.material as THREE.Material).clone());
  arrival.name = 'GuardianArrival'; arrival.rotation.x = -Math.PI / 2; arrival.position.y = 0.09; aura.add(arrival);
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.75, 2.5, 40, 8, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    vertexShader: `
      varying vec2 veilUv;
      uniform float time;
      void main() {
        veilUv = uv;
        vec3 p = position;
        p.xz *= 1.0 + sin(uv.y * 9.0 - time * 1.5 + uv.x * 18.84956) * 0.06;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      varying vec2 veilUv;
      uniform float time, strength;
      void main() {
        float strands = pow(0.5 + 0.5 * sin(veilUv.x * 50.26548 + sin(veilUv.y * 9.0 - time * 1.8)), 6.0);
        float ends = smoothstep(0.0,0.14,veilUv.y) * (1.0 - smoothstep(0.55,1.0,veilUv.y));
        float drift = 0.7 + 0.3 * sin(veilUv.y * 12.0 - time * 2.2);
        gl_FragColor = vec4(mix(vec3(0.7,0.38,0.12),vec3(1.0,0.88,0.57),strands), ends * strands * drift * strength * 0.24);
      }`,
  }));
  mantle.name = 'GuardianMantle'; mantle.position.y = 1.1; aura.add(mantle);
  for (let index = 0; index < 16; index++) {
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(index < 8 ? 0.045 : 0.023), new THREE.MeshBasicMaterial({ color: index % 3 ? 0xffd181 : 0xfff5d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mote.name = 'GuardianMote'; mote.userData.index = index; aura.add(mote);
  }
  aura.traverse((child) => { child.raycast = () => {}; });
  updateSpiritGuardianVisuals(root, 0);
}

export function updateSpiritGuardianVisuals(root: THREE.Group, delta: number): void {
  const state = root.userData.guardianVisual as { age: number; materials: Map<THREE.MeshStandardMaterial, number> } | undefined;
  if (!state) return;
  const time = state.age += delta;
  const emerge = THREE.MathUtils.smoothstep(time, 0.08, 0.85);
  const body = root.getObjectByName('GuardianBody')!;
  body.position.y = (1 - emerge) * -0.28 + Math.sin(time * 1.8) * 0.045;
  body.scale.set(0.94 + emerge * 0.06, 0.75 + emerge * 0.25, 0.94 + emerge * 0.06);
  state.materials.forEach((opacity, material) => { material.opacity = opacity * emerge; });
  body.children.forEach((child) => {
    if (child.name.startsWith('GuardianWing')) {
      const side = Number(child.userData.side);
      child.rotation.z = side * (-0.72 + Math.sin(time * 1.7) * 0.065);
    }
    if (child instanceof THREE.PointLight) child.intensity = emerge * (3.2 + Math.sin(time * 2.1) * 0.35 + Math.exp(-((time - 0.5) ** 2) * 12) * 2);
  });
  root.getObjectByName('GuardianAura')!.children.forEach((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.material instanceof THREE.ShaderMaterial) {
      mesh.material.uniforms.time.value = time;
      mesh.material.uniforms.strength.value = emerge;
    } else if (mesh.material instanceof THREE.MeshBasicMaterial) {
      const material = mesh.material;
      if (child.name === 'GuardianSeal') {
        child.scale.setScalar(0.85 + emerge * 0.15);
        material.opacity = emerge * (0.22 + Math.sin(time * 2) * 0.035);
      } else if (child.name === 'GuardianArrival') {
        const pulse = Math.min(1, time / 1.2);
        child.scale.setScalar(0.3 + pulse * 1.6);
        material.opacity = Math.sin(pulse * Math.PI) * 0.65;
        child.visible = time < 1.2;
      } else if (child.name === 'GuardianMote') {
        const index = Number(child.userData.index);
        const orbit = time * (index < 8 ? 0.18 : -0.28) + index * 2.39996;
        const cycle = (time * 0.24 + index * 0.618) % 1;
        const radius = index < 8 ? 0.69 : 0.43 + cycle * 0.2;
        child.position.set(Math.cos(orbit) * radius, index < 8 ? 0.1 : 0.4 + cycle * 1.85, Math.sin(orbit) * radius);
        child.rotation.y = orbit; child.rotation.z = Math.PI / 4;
        material.opacity = emerge * (index < 8 ? 0.46 : Math.sin(cycle * Math.PI) * 0.65);
      }
    }
  });
}

export function disposeSpiritGuardianVisuals(root: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  materials.forEach((material) => material.dispose());
}
