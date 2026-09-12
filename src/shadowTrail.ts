import * as THREE from 'three';

/** Two batches of soft smoke: a ground wake and billowing, camera-facing curls. */
export function createShadowTrail(points: THREE.Vector3[]): THREE.Group {
  const root = new THREE.Group();
  const samples: THREE.Vector3[] = [];
  points.forEach((point, index) => {
    if (!index) { samples.push(point.clone()); return; }
    const previous = points[index - 1];
    const steps = Math.max(1, Math.ceil(previous.distanceTo(point) / 0.22));
    for (let step = 1; step <= steps; step++) samples.push(previous.clone().lerp(point, step / steps));
  });
  for (const airborne of [false, true]) {
    const positions: number[] = [], uvs: number[] = [], seeds: number[] = [], indices: number[] = [];
    samples.forEach((point, index) => {
      const seed = index * 2.399963;
      const width = airborne ? 0.26 : 0.36;
      const center = point.clone().add(new THREE.Vector3(Math.sin(seed) * width, airborne ? 0.22 : 0.06, Math.cos(seed) * width));
      for (const uv of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        positions.push(center.x, center.y, center.z);
        uvs.push(...uv); seeds.push(seed);
      }
      const base = index * 4;
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setIndex(indices);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, airborne: { value: airborne ? 1 : 0 } },
      vertexShader: `
        attribute float seed;
        uniform float time, airborne;
        varying vec2 smokeUv;
        varying float smokeSeed, life;
        void main() {
          smokeUv = uv; smokeSeed = seed;
          float cycle = fract(time * 0.24 + seed * 0.159);
          life = airborne > 0.5 ? sin(cycle * 3.141593) : 1.0;
          vec3 center = position;
          center.x += sin(time * 0.65 + seed) * 0.12;
          center.z += cos(time * 0.55 + seed) * 0.12;
          vec2 corner = uv - 0.5;
          float size = airborne > 0.5 ? 0.48 + cycle * 0.65 : 1.25 + sin(seed) * 0.18;
          vec4 viewPosition;
          if (airborne > 0.5) {
            center.y += cycle * 0.45;
            viewPosition = modelViewMatrix * vec4(center, 1.0);
            viewPosition.xy += corner * vec2(size, size * 0.85);
          } else {
            center.xz += corner * size;
            viewPosition = modelViewMatrix * vec4(center, 1.0);
          }
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `
        uniform float time, airborne;
        varying vec2 smokeUv;
        varying float smokeSeed, life;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }
        void main() {
          vec2 p = (smokeUv - 0.5) * 2.0;
          float radius = length(p);
          // Alpha reaches zero before any quad edge. Low-frequency noise stays
          // smooth at the game's distant camera instead of aliasing into grit.
          float envelope = 1.0 - smoothstep(0.18, 0.94, radius);
          vec2 flow = p * 1.7 + vec2(smokeSeed, -time * 0.28);
          flow += vec2(noise(flow + time * 0.12), noise(flow.yx - time * 0.1)) * 0.8;
          float density = noise(flow) * 0.7 + noise(flow * 2.0) * 0.3;
          float alpha = envelope * smoothstep(0.12, 0.85, density) * life;
          alpha *= airborne > 0.5 ? 0.32 : 0.29;
          vec3 color = mix(vec3(0.009,0.006,0.022), vec3(0.14,0.055,0.22), density * density * airborne);
          gl_FragColor = vec4(color, alpha);
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // Shader expands the point centers into smoke quads.
    mesh.raycast = () => {};
    root.add(mesh);
  }
  return root;
}

export function updateShadowTrail(root: THREE.Group, timeSeconds: number): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) child.material.uniforms.time.value = timeSeconds;
  });
}
