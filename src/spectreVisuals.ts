import * as THREE from 'three';

function shadowMistMaterial(offset: number, opacity = 0.72): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, strength: { value: 1 }, offset: { value: offset }, opacity: { value: opacity } },
    vertexShader: `
      varying vec2 smokeUv;
      uniform float time;
      uniform float offset;
      void main() {
        smokeUv = uv;
        vec3 p = position;
        p.z += sin(uv.x * 10.0 + time * 1.7 + offset) * 0.035;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying vec2 smokeUv;
      uniform float time;
      uniform float strength;
      uniform float offset;
      uniform float opacity;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 centered = smokeUv - 0.5;
        vec2 flow = smokeUv * vec2(5.5, 8.0) + vec2(time * 0.23, -time * 0.42 + offset);
        float cloud = noise(flow) * 0.55 + noise(flow * 2.15 + 4.7) * 0.30 + noise(flow * 4.8 - 2.3) * 0.15;
        float grain = noise(flow * 9.0 + offset * 0.37);
        float softEdge = 1.0 - smoothstep(0.22, 0.50, length(centered));
        float body = smoothstep(0.38, 0.69, cloud + grain * 0.14) * softEdge;
        body *= smoothstep(0.32, 0.58, grain + cloud * 0.34);
        float violetEdge = smoothstep(0.10, 0.28, body) * (1.0 - smoothstep(0.28, 0.52, body));
        vec3 color = mix(vec3(0.006, 0.003, 0.014), vec3(0.29, 0.07, 0.52), violetEdge * 0.8);
        float alpha = body * opacity * strength;
        if (alpha < 0.018) discard;
        gl_FragColor = vec4(color, alpha);
      }`,
  });
}

/** Low, animated smoke used to mark every tile in Shadow Dagger's persistent trail. */
export function createSpectreShadowTrailTile(index: number): THREE.Group {
  const tile = new THREE.Group();
  tile.userData.shadowTrailIndex = index;

  // Many small, irregular patches hide the tile boundary and leave visible gaps
  // between the motes. Deterministic offsets keep the trail stable between syncs.
  for (let moteIndex = 0; moteIndex < 13; moteIndex++) {
    const angle = moteIndex * 2.39996 + index * 0.83;
    const radius = 0.12 + ((moteIndex * 47 + index * 29) % 83) / 83 * 0.76;
    const size = 0.34 + ((moteIndex * 31 + index * 17) % 61) / 61 * 0.48;
    const mote = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 1.35, size, 3, 3),
      shadowMistMaterial(index * 4.17 + moteIndex * 2.73, 0.34 + (moteIndex % 4) * 0.045),
    );
    mote.name = 'ShadowTrailMote';
    mote.rotation.x = -Math.PI / 2;
    mote.rotation.z = angle * 0.63;
    mote.position.set(Math.cos(angle) * radius, moteIndex % 3 * 0.004, Math.sin(angle) * radius);
    mote.renderOrder = 3;
    mote.raycast = () => {};
    tile.add(mote);
  }

  for (let wispIndex = 0; wispIndex < 4; wispIndex++) {
    const angle = index * 1.37 + wispIndex * 2.23;
    const wisp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44 + wispIndex * 0.07, 0.42 + (wispIndex % 2) * 0.12, 4, 4),
      shadowMistMaterial(index * 5.13 + wispIndex * 7.7, 0.38),
    );
    wisp.name = 'ShadowTrailWisp';
    wisp.position.set(Math.cos(angle) * 0.66, 0.13 + wispIndex * 0.055, Math.sin(angle) * 0.66);
    wisp.rotation.y = index * 0.61 + wispIndex * 1.9;
    wisp.userData.baseRotationY = wisp.rotation.y;
    wisp.renderOrder = 4;
    wisp.raycast = () => {};
    tile.add(wisp);
  }
  return tile;
}

/** Advances ground smoke and the small wisps rising from it. */
export function updateSpectreShadowTrail(root: THREE.Group, timeSeconds: number): void {
  root.children.forEach((tile, tileIndex) => {
    tile.children.forEach((child, childIndex) => {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.ShaderMaterial;
      if (material.uniforms?.time) material.uniforms.time.value = timeSeconds;
      if (child.name === 'ShadowTrailWisp') {
        const wispIndex = childIndex - 13;
        const phase = timeSeconds * (0.65 + wispIndex * 0.11) + tileIndex * 1.73 + wispIndex;
        child.position.y = 0.13 + wispIndex * 0.055 + Math.sin(phase) * 0.045;
        child.rotation.y = Number(child.userData.baseRotationY) + Math.sin(phase * 0.7) * 0.32;
      }
    });
  });
}

/** Curling ankle smoke while Spectre moves along her active dagger trail. */
export function updateSpectreShadowFootMist(root: THREE.Group, active: boolean, delta: number): void {
  let mist = root.getObjectByName('SpectreShadowFootMist') as THREE.Group | undefined;
  if (!mist && !active) return;
  if (!mist) {
    mist = new THREE.Group();
    mist.name = 'SpectreShadowFootMist';
    mist.userData.strength = 0;
    for (let index = 0; index < 4; index++) {
      const wisp = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.62, 4, 4), shadowMistMaterial(index * 8.4, 0.72));
      wisp.position.set(Math.cos(index * Math.PI / 2) * 0.28, 0.23, Math.sin(index * Math.PI / 2) * 0.28);
      wisp.rotation.y = index * Math.PI / 2;
      wisp.raycast = () => {};
      mist.add(wisp);
    }
    root.add(mist);
  }
  mist.userData.strength = THREE.MathUtils.damp(Number(mist.userData.strength), active ? 1 : 0, active ? 9 : 5, delta);
  mist.visible = mist.userData.strength > 0.01;
  mist.rotation.y += delta * 1.1;
  mist.children.forEach((child, index) => {
    const material = (child as THREE.Mesh).material as THREE.ShaderMaterial;
    material.uniforms.time.value += delta;
    material.uniforms.strength.value = mist!.userData.strength;
    child.position.y = 0.19 + Math.sin(material.uniforms.time.value * 2.2 + index) * 0.055;
  });
}

/** A black, violet-edged dagger with its own turbulent smoke wake. */
export function createShadowDaggerProjectile(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0.62, 0, 0,
    0.02, 0, 0.14,
    -0.44, 0, 0.055,
    -0.58, 0, 0,
    -0.44, 0, -0.055,
    0.02, 0, -0.14,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
  geometry.computeVertexNormals();

  const blade = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x08050d,
    emissive: 0x210534,
    emissiveIntensity: 1.4,
    metalness: 0.45,
    roughness: 0.36,
    side: THREE.DoubleSide,
  }));
  blade.name = 'ShadowDaggerProjectile';
  blade.renderOrder = 20;

  const edge = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({
    color: 0xa94dff,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  edge.name = 'ShadowDaggerEdge';
  edge.position.y = -0.018;
  edge.scale.set(1.16, 1, 1.22);
  edge.renderOrder = 19;
  blade.add(edge);

  for (let index = 0; index < 4; index++) {
    const smoke = new THREE.Mesh(new THREE.PlaneGeometry(0.46 + index * 0.1, 0.46 + index * 0.1, 3, 3), shadowMistMaterial(index * 6.9, 0.65));
    smoke.name = 'ShadowDaggerSmoke';
    smoke.rotation.x = -Math.PI / 2;
    smoke.position.set(-0.34 - index * 0.25, -0.035, 0);
    smoke.renderOrder = 18;
    smoke.raycast = () => {};
    blade.add(smoke);
  }
  const light = new THREE.PointLight(0x8c32e8, 2.1, 2.8);
  light.position.y = 0.16;
  blade.add(light);
  return blade;
}

export function updateShadowDaggerProjectile(dagger: THREE.Mesh, timeSeconds: number, progress: number): void {
  dagger.children.forEach((child, index) => {
    if (child.name !== 'ShadowDaggerSmoke') return;
    const smoke = child as THREE.Mesh;
    const material = smoke.material as THREE.ShaderMaterial;
    material.uniforms.time.value = timeSeconds + index * 0.19;
    material.uniforms.strength.value = 0.78 + Math.sin(timeSeconds * 7 + index * 1.8) * 0.18;
    const pulse = 0.82 + Math.sin(timeSeconds * 6.2 - index) * 0.16;
    smoke.scale.setScalar(pulse * (1 - progress * 0.18));
  });
}

type CloakMotion = { previous: THREE.Vector3; lag: THREE.Vector3[]; movementBlend: number };
const cloakMotion = new WeakMap<THREE.Group, CloakMotion>();
const cloakPosition = new THREE.Vector3();
const cloakLagTarget = new THREE.Vector3();
const cloakLocalOrigin = new THREE.Vector3();
const cloakLocalEnd = new THREE.Vector3();

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
      uniforms: { time: { value: 0 }, strength: { value: 0 }, offset: { value: 0 }, drag: { value: new THREE.Vector3() } },
      vertexShader: `
        varying vec2 smokeUv;
        uniform float time;
        uniform float offset;
        uniform vec3 drag;
        void main() {
          smokeUv = uv;
          vec3 p = position;
          float curl = sin(uv.y * 11.0 - time * 2.4 + uv.x * 18.85 + offset);
          p.xz *= 1.0 + curl * 0.12;
          p.x += sin(time * 1.6 + uv.y * 8.0 + offset) * uv.y * 0.10;
          // The middle stays close to the body; loose lower smoke and upper
          // wisps yield to motion, especially on the trailing side.
          float loose = 0.16 + 0.62 * pow(abs(uv.y - 0.48) * 2.0, 1.35);
          vec2 dragDirection = drag.xz / max(length(drag.xz), 0.001);
          float trailing = 0.5 + 0.5 * dot(normalize(position.xz), dragDirection);
          p += drag * loose * (0.38 + trailing * 0.85);
          p.y += sin(time * 4.0 + uv.y * 10.0 + offset) * length(drag) * 0.055;
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
  root.getWorldPosition(cloakPosition);
  let motion = cloakMotion.get(mantle);
  if (!motion) {
    motion = { previous: cloakPosition.clone(), lag: mantle.children.map(() => new THREE.Vector3()), movementBlend: 0 };
    cloakMotion.set(mantle, motion);
  }
  cloakLagTarget.subVectors(motion.previous, cloakPosition);
  // Discontinuous teleports/repositioning should not fling the cloak across the board.
  const reset = delta <= 0 || cloakLagTarget.lengthSq() > 1;
  const moving = !reset && Math.hypot(cloakLagTarget.x, cloakLagTarget.z) / Math.max(delta, 0.001) > 0.05;
  motion.movementBlend = THREE.MathUtils.damp(motion.movementBlend, moving ? 1 : 0, moving ? 18 : 8, delta);
  if (reset) {
    cloakLagTarget.set(0, 0, 0);
    motion.lag.forEach((lag) => lag.set(0, 0, 0));
  } else {
    cloakLagTarget.y = 0;
    cloakLagTarget.multiplyScalar(0.20 / Math.max(delta, 0.001)).clampLength(0, 1.4);
  }
  motion.previous.copy(cloakPosition);
  mantle.children.forEach((child, index) => {
    const material = (child as THREE.Mesh).material as THREE.ShaderMaterial;
    material.uniforms.time.value += delta;
    material.uniforms.strength.value = mantle.userData.strength * (1 - motion!.movementBlend * 0.2);
    child.rotation.y += delta * 0.18;
    const lag = motion!.lag[index];
    // Outer layers respond more slowly, retaining a short wake after stopping.
    lag.lerp(cloakLagTarget, 1 - Math.exp(-delta * (12 - index * 2.5)));
    child.updateWorldMatrix(true, false);
    cloakLocalOrigin.copy(cloakPosition);
    cloakLocalEnd.copy(cloakPosition).addScaledVector(lag, 0.5 + index * 0.3);
    child.worldToLocal(cloakLocalOrigin);
    child.worldToLocal(cloakLocalEnd);
    (material.uniforms.drag.value as THREE.Vector3).subVectors(cloakLocalEnd, cloakLocalOrigin);
  });
}

/** Make replica geometry fully opaque while preserving normal depth behavior. */
export function makeSpectreReplicaMaterialOpaque(material: THREE.Material): void {
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.alphaHash = false;
  material.alphaToCoverage = false;
  material.needsUpdate = true;
}
