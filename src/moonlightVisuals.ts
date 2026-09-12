import * as THREE from 'three';

/** A bowed lunar blade, facing local +Z, with translucent energy spilling behind it. */
export function createMoonlightWave(): THREE.Mesh {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let index = 0; index <= 64; index++) {
    const t = index / 64;
    const angle = (t - 0.5) * Math.PI * 0.88;
    const taper = Math.sin(t * Math.PI);
    for (const edge of [0, 1]) {
      positions.push(Math.sin(angle) * 1.18, taper * 0.15, Math.cos(angle) * 0.55 - edge * (0.08 + taper * 0.48));
      uvs.push(t, edge);
    }
    if (index < 64) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, strength: { value: 0 }, layer: { value: 0 } },
    vertexShader: `
      varying vec2 waveUv;
      uniform float time;
      void main() {
        waveUv = uv;
        vec3 p = position;
        p.y += sin(uv.x * 18.0 - time * 5.0) * uv.y * 0.04;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying vec2 waveUv;
      uniform float time, strength, layer;
      void main() {
        float tips = pow(max(0.0, sin(waveUv.x * 3.141593)), 0.65);
        float edge = exp(-waveUv.y * 17.0);
        float silk = 0.65 + 0.35 * sin(waveUv.x * 32.0 - waveUv.y * 9.0 - time * 5.0);
        float wake = pow(1.0 - waveUv.y, 2.0) * silk * 0.32;
        vec3 color = mix(vec3(0.14, 0.90, 0.60), vec3(1.05, 1.25, 1.15), edge);
        float alpha = (edge + wake) * tips * strength * (1.0 - layer * 0.22);
        gl_FragColor = vec4(color, alpha * 1.2);
      }`,
  });
  const root = new THREE.Mesh(geometry, material);
  root.name = 'MoonlightCrescent';
  for (let layer = 1; layer <= 2; layer++) {
    const echoMaterial = material.clone();
    echoMaterial.uniforms.layer.value = layer;
    const echo = new THREE.Mesh(geometry.clone(), echoMaterial);
    echo.name = 'MoonlightEcho';
    echo.position.set(0, layer * 0.12, -layer * 0.24);
    echo.scale.setScalar(1 - layer * 0.09);
    root.add(echo);
  }
  for (let index = 0; index < 18; index++) {
    const mote = new THREE.Mesh(new THREE.SphereGeometry(0.022 + (index % 3) * 0.009, 6, 4), new THREE.MeshBasicMaterial({ color: index % 3 ? 0x69f5c2 : 0xe1fff3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mote.name = 'MoonlightMote'; mote.userData.seed = index;
    root.add(mote);
  }
  const light = new THREE.PointLight(0x77ffcf, 0, 4);
  light.position.y = 0.3; root.add(light);
  return root;
}

export function updateMoonlightWave(root: THREE.Mesh, progress: number, time: number): void {
  const strength = THREE.MathUtils.smoothstep(progress, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(progress, 0.62, 1));
  root.scale.setScalar(0.96 + THREE.MathUtils.smoothstep(progress, 0, 1) * 0.50);
  root.traverse((child) => {
    if (child instanceof THREE.PointLight) child.intensity = strength * 3.4;
    if (!(child instanceof THREE.Mesh)) return;
    if (child.material instanceof THREE.ShaderMaterial) {
      child.material.uniforms.time.value = time;
      child.material.uniforms.strength.value = strength;
    }
    if (child.name === 'MoonlightMote') {
      const seed = Number(child.userData.seed);
      const cycle = (time * 0.8 + seed * 0.618) % 1;
      child.position.set(Math.sin(seed * 2.4) * (0.45 + cycle * 0.55), 0.08 + cycle * 0.5, 0.15 - cycle * 1.35);
      child.scale.setScalar(0.5 + Math.sin(cycle * Math.PI));
      (child.material as THREE.MeshBasicMaterial).opacity = strength * Math.sin(cycle * Math.PI) * 0.65;
    }
  });
}

export function disposeMoonlightWave(root: THREE.Mesh): void {
  root.removeFromParent();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
