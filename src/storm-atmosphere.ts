import * as THREE from 'three';
import { createWindParticles } from './wind-particles.ts';

/** Fixed cloud fields and rain seeds; no textures, simulation buffers, or assets. */
export function createStormAtmosphere(time: { value: number }) {
  // One oversized screen triangle has no internal edges. Reconstructing the
  // world ray also avoids interpolating large sphere coordinates and remains
  // correct with the arena camera's off-center projection / viewport offset.
  const skyGeometry = new THREE.BufferGeometry();
  skyGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
  const skyUniforms = {
    time,
    inverseProjection: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() },
    lightningCenter: { value: new THREE.Vector3() },
  };
  const sky = new THREE.Mesh(
    skyGeometry,
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      precision: 'highp',
      depthTest: false,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec2 skyNdc;
        void main() {
          skyNdc = position.xy;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform mat4 inverseProjection;
        uniform mat4 cameraWorld;
        uniform vec3 lightningCenter;
        varying vec2 skyNdc;
        float hash(vec3 p) {
          // Shared lattice corners must hash identically from either cell.
          // A floating-point fract hash amplifies GPU rounding/reassociation
          // differences into visible seams as the cloud field drifts.
          uvec3 cell = uvec3(ivec3(p));
          uint h = (cell.x * 1597334677u) ^ (cell.y * 3812015801u)
            ^ (cell.z * 2798796415u);
          h ^= h >> 16u;
          h *= 2246822519u;
          h ^= h >> 13u;
          h *= 3266489917u;
          h ^= h >> 16u;
          // Keep only 24 bits so conversion to highp float is exact.
          return float(h >> 8u) * (1.0 / 16777216.0);
        }
        float noise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float clouds(vec3 p) {
          return noise(p) * .57 + noise(p * 2.03 + 7.3) * .28 + noise(p * 4.11 + 13.7) * .15;
        }
        float segment(vec2 p, vec2 a, vec2 b) {
          vec2 ab = b - a;
          return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
        }
        void main() {
          vec3 viewRay = (inverseProjection * vec4(skyNdc, 1.0, 1.0)).xyz;
          vec3 d = normalize(mat3(cameraWorld) * viewRay);
          vec3 drift = vec3(time * .015, 0.0, time * .006);
          float mass = clouds(d * vec3(3.1, 5.5, 3.1) + drift);
          float folds = clouds(d * vec3(5.0, 12.0, 5.0) + drift * 1.65 + (mass - .5) * 1.3);
          // Clouds wrap the lower hemisphere too, for the tactical camera.
          vec3 color = mix(vec3(.017, .027, .039), vec3(.065, .084, .105),
            exp(-abs(d.y + .14) * 2.8));
          float shelf = smoothstep(.34, .69, mass);
          color = mix(color, vec3(.01, .016, .024), shelf * .8);
          float billows = smoothstep(.38, .68, folds);
          color = mix(color, vec3(.048, .062, .077), billows * .5);
          // A ragged silver opening on one side, not a uniformly lit dome.
          float opening = pow(max(dot(d, normalize(vec3(-.8, -.18, -.55))), 0.0), 5.0);
          float rim = smoothstep(.32, .48, mass) * (1.0 - smoothstep(.48, .65, mass));
          color += vec3(.10, .125, .15) * opening * (rim * .65 + (1.0 - shelf) * .22);
          float rainVeil = noise(d * vec3(30.0, 2.0, 30.0) + drift * .4);
          color = mix(color, vec3(.065, .08, .095), rainVeil * .16 * exp(-abs(d.y + .4) * 2.0));

          // A double strike every seven seconds, alternating distant and
          // nearby storm fronts. Nearby bolts have a finite world position.
          float age = mod(time + 5.0, 7.0);
          if (age < 1.65) {
            // GLSL pow is undefined for negative bases, even with exponent 2.
            float firstPulse = (age - .32) / .22;
            float secondPulse = (age - .93) / .30;
            float flash = exp(-firstPulse * firstPulse)
              + .8 * exp(-secondPulse * secondPulse);
            float eventIndex = floor((time + 5.0) / 7.0);
            float nearby = mod(eventIndex, 3.0) < 1.0 ? 1.0 : 0.0;
            vec3 toStrike = lightningCenter - cameraWorld[3].xyz;
            vec3 center = normalize(toStrike);
            vec3 tangent = normalize(cross(center, vec3(0,1,0)));
            vec3 up = cross(tangent, center);
            // Project onto a world-space plane, so camera movement creates
            // parallax instead of dragging a nearby bolt with the camera.
            float alignment = dot(d, center);
            vec2 p = vec2(dot(d, tangent), dot(d, up))
              * length(toStrike) / max(alignment, .01)
              / mix(190.0, 48.0, nearby);
            p.x *= mod(eventIndex, 2.0) < 1.0 ? -1.0 : 1.0;
            float facing = smoothstep(.05, .3, alignment);
            float halo = exp(-dot(p * vec2(2.8, 2.0), p * vec2(2.8, 2.0)));
            color += vec3(.28, .39, .58) * halo * facing * flash
              * (.45 + mass * .55) * mix(1.0, 1.6, nearby);
            // Angular joints and a short fork read as lightning through cloud.
            float bolt = segment(p, vec2(-.035,.29), vec2(.012,.14));
            bolt = min(bolt, segment(p, vec2(.012,.14), vec2(-.023,.035)));
            bolt = min(bolt, segment(p, vec2(-.023,.035), vec2(.034,-.10)));
            bolt = min(bolt, segment(p, vec2(.034,-.10), vec2(.009,-.25)));
            float fork = segment(p, vec2(-.023,.035), vec2(-.11,-.015));
            fork = min(fork, segment(p, vec2(-.11,-.015), vec2(-.15,-.14)));
            fork = min(fork, segment(p, vec2(.012,.14), vec2(.11,.075)));
            fork = min(fork, segment(p, vec2(.11,.075), vec2(.16,-.04)));
            float aa = max(length(fwidth(p)), .0006);
            float width = mix(.002, .0035, nearby);
            float core = 1.0 - smoothstep(width, width + aa, bolt);
            core += (1.0 - smoothstep(width * .55, width * .55 + aa, fork)) * .65;
            color += vec3(1.4, 1.8, 2.5) * (core + exp(-bolt * 85.0) * .32)
              * flash * facing * (1.0 - shelf * mix(.35, .12, nearby));
          }
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  sky.name = 'TrenchStormSky';
  sky.renderOrder = -1000;
  sky.visible = false;
  sky.frustumCulled = false;
  let lightningEvent = -1;
  const strikeRay = new THREE.Vector3();
  const strikeRight = new THREE.Vector3();
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    skyUniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    skyUniforms.cameraWorld.value.copy(camera.matrixWorld);
    const event = Math.floor((time.value + 5) / 7);
    if (event !== lightningEvent) {
      lightningEvent = event;
      const nearby = event % 3 === 0;
      const side = event % 2 === 0 ? -1 : 1;
      // Choose a visible storm front once per event, then leave it anchored
      // in the world throughout both pulses, including while orbiting.
      strikeRay.set(side * (nearby ? .55 : .35), .12, 1)
        .applyMatrix4(camera.projectionMatrixInverse)
        .transformDirection(camera.matrixWorld);
      strikeRight.setFromMatrixColumn(camera.matrixWorld, 0);
      skyUniforms.lightningCenter.value.setFromMatrixPosition(camera.matrixWorld)
        .addScaledVector(strikeRay, nearby ? 38 : 210)
        .addScaledVector(strikeRight, side * (nearby ? 7 : 25));
    }
  };

  const count = 1800;
  const drops = new Float32Array(count * 4);
  let seed = 0x51af70;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) drops.set([random() * 100 - 50, random() * 100 - 50, random(), random()], i * 4);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0,1,2,0,2,3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0], 3));
  geometry.setAttribute('drop', new THREE.InstancedBufferAttribute(drops, 4));
  geometry.instanceCount = count;
  const rain = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: { time },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      uniform float time;
      attribute vec4 drop;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        float speed = 13.0 + drop.w * 7.0;
        float age = fract(time * speed / 27.0 + drop.z);
        vec3 p = vec3(drop.x + age * 5.0, .6 + (1.0 - age) * 27.0, drop.y + age * 2.4);
        p.x += sin(time * .45 + drop.y * .05) * 1.4;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        vec2 fall = (viewMatrix * vec4(5.0, -27.0, 2.4, 0.0)).xy;
        fall /= max(length(fall), .001);
        vec2 crossfall = vec2(-fall.y, fall.x);
        view.xy += crossfall * position.x * (.009 + drop.w * .008)
          + fall * position.y * (.22 + drop.w * .28);
        float edge = 1.0 - smoothstep(38.0, 52.0, length(p.xz));
        float board = mix(.22, 1.0, smoothstep(9.0, 18.0, length(p.xz)));
        vAlpha = edge * board * smoothstep(0.0, .06, age) * (1.0 - smoothstep(.92, 1.0, age))
          * smoothstep(4.0, 10.0, length(view.xyz)) * (.12 + drop.w * .16);
        vUv = position.xy;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        float alpha = (1.0 - smoothstep(.05, 1.0, abs(vUv.x)))
          * (1.0 - smoothstep(.35, 1.0, abs(vUv.y))) * vAlpha;
        if (alpha < .003) discard;
        gl_FragColor = vec4(vec3(.29, .37, .43), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  rain.name = 'TrenchStormRain';
  rain.visible = false;
  rain.frustumCulled = false;
  rain.raycast = () => {};
  sky.raycast = () => {};
  const wind = createWindParticles(time, 'storm');
  return { sky, rain, wind };
}
