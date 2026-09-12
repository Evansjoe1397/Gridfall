import * as THREE from 'three';

/** A procedural smoke mantle: dark, curling plumes with faint violet edges. */
export function updateSpectreShadowCloak(root: THREE.Group, active: boolean, delta: number): void {
  let mantle = root.getObjectByName('SpectreShadowMantle') as THREE.Group | undefined;
  if (!mantle && !active) return;
  if (!mantle) {
    mantle = new THREE.Group();
    mantle.name = 'SpectreShadowMantle';
    mantle.userData.strength = 0;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, strength: { value: 0 }, offset: { value: 0 } },
      vertexShader: `
        varying vec2 smokeUv;
        uniform float time;
        uniform float offset;
        void main() {
          smokeUv = uv;
          vec3 p = position;
          float curl = sin(uv.y * 11.0 - time * 2.4 + uv.x * 18.85 + offset);
          p.xz *= 1.0 + curl * 0.12;
          p.x += sin(time * 1.6 + uv.y * 8.0 + offset) * uv.y * 0.10;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec2 smokeUv;
        uniform float time;
        uniform float strength;
        uniform float offset;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        float smoke(vec2 p) {
          return noise(p) * 0.55 + noise(p * 2.1) * 0.30 + noise(p * 4.3) * 0.15;
        }
        void main() {
          vec2 uv = smokeUv;
          vec2 flow = vec2(uv.x * 9.0 + offset, uv.y * 4.0 - time * 0.8);
          flow.x += sin(uv.y * 8.0 - time * 1.7) * 0.75;
          float density = smoke(flow + smoke(flow * 0.7 + time * 0.13));
          float plume = smoothstep(0.30, 0.72, density);
          float ends = smoothstep(0.0, 0.12, uv.y) * (1.0 - smoothstep(0.62, 1.0, uv.y));
          float seam = smoothstep(0.0, 0.08, uv.x) * (1.0 - smoothstep(0.92, 1.0, uv.x));
          float edge = pow(1.0 - abs(density - 0.52) * 2.0, 8.0);
          vec3 color = mix(vec3(0.008, 0.004, 0.018), vec3(0.17, 0.055, 0.30), edge * 0.48);
          gl_FragColor = vec4(color, plume * ends * seam * strength * 0.80);
        }`,
    });
    for (let layer = 0; layer < 3; layer++) {
      const smokeMaterial = layer === 0 ? material : material.clone();
      smokeMaterial.uniforms.offset.value = layer * 7.3;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.55 + layer * 0.08, 0.78 + layer * 0.09, 2.65, 40, 14, true), smokeMaterial);
      shell.position.y = 1.22 + layer * 0.06;
      shell.rotation.y = layer * 2.1;
      shell.raycast = () => {};
      mantle.add(shell);
    }
    root.add(mantle);
  }
  const target = active ? 1 : 0;
  mantle.userData.strength = THREE.MathUtils.damp(Number(mantle.userData.strength), target, active ? 7 : 4, delta);
  mantle.visible = mantle.userData.strength > 0.005;
  for (const child of mantle.children) {
    const material = (child as THREE.Mesh).material as THREE.ShaderMaterial;
    material.uniforms.time.value += delta;
    material.uniforms.strength.value = mantle.userData.strength;
    child.rotation.y += delta * 0.18;
  }
}

/**
 * Keep replicas ghostlike without alpha-blending the highlighted tile over them.
 * Both board and preview renderers use MSAA, so sample coverage provides the
 * translucency while the surviving samples still write depth normally.
 */
export function setSpectreReplicaTransparency(material: THREE.Material, opacity: number): void {
  material.transparent = false;
  material.opacity = opacity;
  material.depthWrite = true;
  material.alphaHash = false;
  material.alphaToCoverage = true;
  material.needsUpdate = true;
}
