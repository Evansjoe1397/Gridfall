import * as THREE from 'three';

const fireTime = { value: 0 };

// Bowl centers in the imported outer ring's original coordinates. The other
// perimeter posts have solid, spiked caps and should not emit flames.
const bowls = [
  [-0.43347, 0.159, 0.22583],
  [-0.21436, 0.147, 0.42688],
  [0.24207, 0.147, 0.41858],
  [0.44043, 0.159, 0.22144],
] as const;

export function addNagrandBrazierFire(model: THREE.Group) {
  const geometry = new THREE.PlaneGeometry(0.042, 0.073);
  geometry.translate(0, 0.0365, 0);
  bowls.forEach(([x, y, z], index) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: fireTime, phase: { value: index * 2.37 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // Face the camera while preserving the asset's nonuniform scale.
          vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          center.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
          gl_Position = projectionMatrix * center;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform float phase;
        varying vec2 vUv;

        float tongue(vec2 p, float offset, float height, float width, float seed) {
          float h = p.y / height;
          float sway = (sin(time * 2.8 + h * 5.0 + seed) * 0.07
            + sin(time * 4.1 - h * 8.0 + seed) * 0.025) * h;
          float radius = width * pow(max(0.0, 1.0 - h), 0.8);
          float edge = abs(p.x - offset - sway);
          return (1.0 - smoothstep(radius * 0.45, radius + 0.025, edge))
            * (1.0 - smoothstep(0.80, 1.0, h));
        }

        void main() {
          vec2 p = vec2(vUv.x - 0.5, vUv.y);
          float pulse = sin(time * 3.1 + phase) * 0.045 + sin(time * 5.3 + phase) * 0.025;
          float flame = tongue(p, 0.0, 0.86 + pulse, 0.20, phase);
          flame = max(flame, tongue(p, -0.18, 0.52 - pulse, 0.12, phase + 2.0));
          flame = max(flame, tongue(p, 0.17, 0.61 + pulse, 0.115, phase + 4.0));
          float core = tongue(p, 0.0, 0.40 + pulse * 0.5, 0.105, phase);
          vec3 color = mix(vec3(1.0, 0.19, 0.018), vec3(1.0, 0.65, 0.10), flame);
          color = mix(color, vec3(1.0, 0.91, 0.48), core * 0.9);
          float alpha = flame * smoothstep(0.0, 0.07, p.y) * 0.88;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    const fire = new THREE.Mesh(geometry, material);
    fire.name = `NagrandBrazierFire${index + 1}`;
    fire.position.set(x, y, z);
    // Shader billboarding extends beyond the source plane's bounding box.
    fire.frustumCulled = false;
    fire.raycast = () => {};
    model.add(fire);
  });
}

export function updateNagrandBrazierFire(time: number) {
  fireTime.value = time / 1000;
}
