import * as THREE from 'three';

const effects = new WeakMap<THREE.Object3D, ReturnType<typeof createTransition>>();

/** Local-space effects travel with John, including in the character preview. */
function createTransition(root: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = 'JohnSpiritTransition';
  group.visible = false;
  const uniforms = { blend: { value: 0 }, strength: { value: 0 } };
  const geometry = new THREE.BufferGeometry();
  const seeds = new Float32Array(72 * 3);
  for (let i = 0; i < 72; i++) {
    seeds[i * 3] = i / 72;
    seeds[i * 3 + 1] = (i * 0.61803398875) % 1;
    seeds[i * 3 + 2] = (i * 0.38196601125 + 0.17) % 1;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float blend;
      uniform float strength;
      varying float brightness;
      void main() {
        float t = blend * blend * (3.0 - 2.0 * blend);
        float angle = position.x * 25.13274 + t * 6.28318;
        float radius = mix(0.18, 0.72, t) + sin(position.y * 12.566) * 0.13;
        float height = 0.1 + position.y * 1.7 + t * (0.35 + position.z * 0.65);
        vec3 local = vec3(cos(angle) * radius, height, sin(angle) * radius);
        vec4 view = modelViewMatrix * vec4(local, 1.0);
        gl_Position = projectionMatrix * view;
        float perspective = projectionMatrix[3][3] == 0.0 ? 1.0 / max(0.1, -view.z) : 0.12;
        gl_PointSize = clamp((75.0 + position.z * 65.0) * perspective, 1.0, 22.0);
        brightness = strength * (0.35 + 0.65 * pow(abs(sin(position.z * 17.0 + t * 8.0)), 2.0));
      }
    `,
    fragmentShader: `
      varying float brightness;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float soft = pow(max(0.0, 1.0 - d), 2.0);
        vec3 color = mix(vec3(1.0, 0.57, 0.12), vec3(1.0, 0.96, 0.74), soft);
        gl_FragColor = vec4(color, soft * brightness);
      }
    `,
  });
  const motes = new THREE.Points(geometry, material);
  // Positions are generated in the shader, outside the seed attribute's bounds.
  motes.frustumCulled = false;
  group.add(motes);

  const haloMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 haloUv;
      void main() {
        haloUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float strength;
      varying vec2 haloUv;
      void main() {
        float r = length(haloUv - 0.5) * 2.0;
        float ring = exp(-pow(abs(r - 0.72) * 22.0, 2.0));
        float haze = exp(-pow(abs(r - 0.70) * 7.0, 2.0));
        gl_FragColor = vec4(1.0, 0.79, 0.37, (ring * 0.55 + haze * 0.12) * strength);
      }
    `,
  });
  const haloGeometry = new THREE.PlaneGeometry(2.5, 2.5);
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  group.add(halo);
  const ground = new THREE.Mesh(haloGeometry, haloMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.035;
  group.add(ground);
  root.add(group);
  return { group, uniforms, halo, ground };
}

/** Driven by the shared blend so mid-transition reversals stay continuous. */
export function updateJohnSpiritTransition(root: THREE.Object3D, blend: number): void {
  let effect = effects.get(root);
  if (!effect && (blend <= 0 || blend >= 1)) return;
  if (!effect) {
    effect = createTransition(root);
    effects.set(root, effect);
  }
  effect.group.visible = blend > 0 && blend < 1;
  if (!effect.group.visible) return;
  const t = THREE.MathUtils.smoothstep(blend, 0, 1);
  effect.uniforms.blend.value = blend;
  effect.uniforms.strength.value = Math.pow(Math.sin(Math.PI * t), 1.2);
  effect.halo.position.y = 0.08 + 2.35 * t;
  effect.halo.scale.setScalar(0.65 + 0.25 * Math.sin(Math.PI * t));
  effect.ground.scale.setScalar(0.65 + 0.5 * t);
}
