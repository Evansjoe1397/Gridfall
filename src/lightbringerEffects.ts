import * as THREE from 'three';

/** Fire anchors match the exported Lightbringer: guard at X=-.10, tip at X=.50. */
export class LightbringerEffects {
  private readonly time = { value: 0 };
  private readonly strength = { value: 0 };
  private readonly flare = { value: 1 };
  private readonly effects = new THREE.Group();

  constructor(blade: THREE.Mesh) {
    this.effects.name = 'LightbringerFire';
    blade.add(this.effects);
    for (const material of new Set(Array.isArray(blade.material) ? blade.material : [blade.material])) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.uniforms.fireTime = this.time;
        shader.uniforms.fireStrength = this.strength;
        shader.uniforms.fireFlare = this.flare;
        shader.vertexShader = 'varying float fireAxis;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nfireAxis = position.x;');
        shader.fragmentShader = 'varying float fireAxis;\nuniform float fireTime, fireStrength, fireFlare;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float burningBlade = smoothstep(-0.12, -0.065, fireAxis);
          float flicker = 0.85 + 0.10 * sin(fireAxis * 43.0 - fireTime * 9.0)
            + 0.05 * sin(fireAxis * 79.0 + fireTime * 15.0);
          totalEmissiveRadiance += vec3(2.2, 0.48, 0.035) * burningBlade * flicker * fireStrength * fireFlare;
        `);
      };
      material.customProgramCacheKey = () => previousKey + '|lightbringer-fire-v1';
      material.needsUpdate = true;
    }

    // One instanced draw for overlapping tongues. Camera-facing quads avoid an
    // edge-on disappearance; their tips drift upward in world space as the hand turns.
    const plane = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = plane.index;
    geometry.attributes = plane.attributes;
    const anchors: number[] = [], seeds: number[] = [];
    for (let i = 0; i < 24; i++) {
      anchors.push(-0.075 + (i / 23) * 0.565, 0.12, i % 2 === 0 ? 0.012 : -0.012);
      seeds.push(i * 2.399963);
    }
    geometry.setAttribute('anchor', new THREE.InstancedBufferAttribute(new Float32Array(anchors), 3));
    geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    geometry.instanceCount = 24;
    const uniforms = { fireTime: this.time, fireStrength: this.strength, fireFlare: this.flare };
    const flames = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `attribute vec3 anchor; attribute float seed;
        uniform float fireTime, fireFlare;
        varying vec2 fireUv; varying float fireSeed;
        void main() {
          fireUv = uv; fireSeed = seed;
          float height = (0.13 + 0.065 * (0.5 + 0.5 * sin(seed * 3.7 + fireTime * 7.0))) * fireFlare;
          vec4 root = modelViewMatrix * vec4(anchor, 1.0);
          float scale = length(modelMatrix[0].xyz);
          vec3 rise = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
          root.xyz += rise * uv.y * height * scale * 0.65;
          root.xy += vec2(position.x * 0.085 + sin(fireTime * 5.0 + seed + uv.y * 6.0) * uv.y * 0.017,
            uv.y * height * 0.55 - 0.018) * scale;
          gl_Position = projectionMatrix * root;
        }`,
      fragmentShader: `uniform float fireTime, fireStrength;
        varying vec2 fireUv; varying float fireSeed;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
            mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          float y = fireUv.y;
          vec2 flow = vec2(fireUv.x * 4.0 + fireSeed, y * 6.0 - fireTime * 5.5);
          float turbulence = noise(flow) * 0.65 + noise(flow * 2.1) * 0.35;
          float bend = sin(y * 9.0 - fireTime * 7.0 + fireSeed) * y * 0.12;
          float edge = abs(fireUv.x - 0.5 + bend) * 2.0;
          float width = (1.0 - y) * (0.60 + turbulence * 0.65);
          float body = 1.0 - smoothstep(width * 0.45, width, edge);
          float ends = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.65, 1.0, y));
          float core = pow(body, 3.0) * (1.0 - y);
          vec3 color = mix(vec3(1.3, 0.10, 0.008), vec3(2.0, 0.95, 0.18), core);
          gl_FragColor = vec4(color, body * ends * (0.55 + turbulence * 0.45) * fireStrength * 0.48);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    flames.name = 'LightbringerFlames';
    flames.frustumCulled = false;
    flames.raycast = () => {};
    this.effects.add(flames);

    const sparksGeometry = new THREE.BufferGeometry();
    sparksGeometry.setAttribute('position', new THREE.Float32BufferAttribute(anchors, 3));
    sparksGeometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
    const sparks = new THREE.Points(sparksGeometry, new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `attribute float seed; uniform float fireTime, fireStrength, fireFlare;
        varying float sparkAlpha;
        void main() {
          float age = fract(fireTime * (0.65 + fract(seed) * 0.4) + seed);
          vec4 world = modelMatrix * vec4(position, 1.0);
          float scale = length(modelMatrix[0].xyz);
          world.xyz += vec3(sin(seed * 13.0 + age * 4.0) * age * 0.065,
            age * 0.32 * fireFlare, cos(seed * 7.0 + age * 3.0) * age * 0.055) * scale;
          gl_Position = projectionMatrix * viewMatrix * world;
          gl_PointSize = (1.5 + fract(seed * 5.0) * 1.5) * (1.0 - age * 0.6);
          sparkAlpha = sin(age * 3.14159) * fireStrength;
        }`,
      fragmentShader: `varying float sparkAlpha;
        void main() {
          float spot = 1.0 - smoothstep(0.12, 0.5, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(1.8, 0.65, 0.06, spot * sparkAlpha);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    sparks.name = 'LightbringerEmbers';
    sparks.frustumCulled = false;
    sparks.raycast = () => {};
    this.effects.add(sparks);
  }

  update(time: number, visible: boolean, swinging: boolean, opacity: number) {
    this.time.value = time / 1000;
    this.strength.value = visible ? opacity : 0;
    this.flare.value = swinging ? 1.35 : 1;
    this.effects.visible = visible && opacity > 0;
  }
}
