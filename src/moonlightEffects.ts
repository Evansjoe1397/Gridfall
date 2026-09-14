import * as THREE from 'three';

/** Lunar light follows the exported blade, whose tip points along local -X/-Y. */
export class MoonlightEffects {
  private readonly time = { value: 0 };
  private readonly strength = { value: 0 };

  constructor(blade: THREE.Mesh) {
    for (const material of new Set(Array.isArray(blade.material) ? blade.material : [blade.material])) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.uniforms.moonTime = this.time;
        shader.uniforms.moonStrength = this.strength;
        shader.vertexShader = 'varying float moonAxis;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nmoonAxis = dot(position.xy, vec2(0.70710678));');
        shader.fragmentShader = 'varying float moonAxis;\nuniform float moonTime, moonStrength;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float lunarBlade = 1.0 - smoothstep(0.22, 0.32, moonAxis);
          float shimmer = 0.88 + 0.12 * sin(moonAxis * 17.0 + moonTime * 2.4);
          totalEmissiveRadiance += vec3(0.22, 0.85, 0.72) * lunarBlade * shimmer * moonStrength;
        `);
      };
      material.customProgramCacheKey = () => previousKey + '|moonlight-blade-glow-v1';
      material.needsUpdate = true;
    }

    // Two feathered planes keep the aura visible as the sword turns edge-on.
    const geometry = new THREE.PlaneGeometry(1.12, 0.38);
    const material = new THREE.ShaderMaterial({
      uniforms: { moonTime: this.time, moonStrength: this.strength },
      vertexShader: `varying vec2 lunarUv;
        void main() {
          lunarUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec2 lunarUv;
        uniform float moonTime, moonStrength;
        void main() {
          float across = abs(lunarUv.y - 0.5) * 2.0;
          float ends = smoothstep(0.0, 0.16, lunarUv.x) * (1.0 - smoothstep(0.80, 1.0, lunarUv.x));
          float halo = pow(max(0.0, 1.0 - across), 2.8) * ends;
          float shimmer = 0.9 + 0.1 * sin(lunarUv.x * 20.0 + moonTime * 2.4);
          vec3 color = mix(vec3(0.25, 1.15, 1.05), vec3(0.85, 1.5, 1.65), pow(1.0 - across, 3.0));
          gl_FragColor = vec4(color, halo * shimmer * moonStrength * 0.32);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    for (let layer = 0; layer < 2; layer++) {
      const halo = new THREE.Mesh(geometry, material);
      halo.name = `MoonlightBladeHalo${layer}`;
      halo.position.set(-0.1485, -0.1485, 0);
      halo.rotation.set(0, 0, Math.PI / 4);
      halo.rotateX(layer * Math.PI / 2);
      halo.raycast = () => {};
      blade.add(halo);
    }
  }

  update(time: number, visible: boolean, swinging: boolean, opacity: number) {
    this.time.value = time / 1000;
    const pulse = 0.94 + 0.06 * Math.sin(this.time.value * 2.0);
    this.strength.value = visible ? opacity * pulse * (swinging ? 1.45 : 1) : 0;
  }
}
