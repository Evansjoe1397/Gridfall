import * as THREE from 'three';
import { createWindParticles } from './wind-particles.ts';

// Desert dusk. Fixed procedural fields, animated only by slow wind advection.
// Direction-space sampling avoids a longitude seam and also dresses the lower
// hemisphere, which fills most of the view from the tactical camera.
export function createDesertAtmosphere(time: { value: number }) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { time },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 skyDirection;
        void main() {
          skyDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec3 skyDirection;

        float hash(vec3 p) {
          p = fract(p * .1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
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
        float folds(vec3 p) {
          float n = noise(p) * .57;
          p = p * 2.03 + vec3(7.1, 3.4, 1.7);
          n += noise(p) * .28;
          n += noise(p * 2.01 + 4.7) * .15;
          return n;
        }
        void main() {
          vec3 d = normalize(skyDirection);
          vec3 sun = normalize(vec3(-.72, .12, -.66));
          float facing = max(dot(d, sun), 0.0);
          float horizon = exp(-abs(d.y - .015) * 4.8);
          // Bleached ochre near the sun; graphite and umber in the deep sky.
          vec3 color = mix(vec3(.048, .037, .027), vec3(.245, .145, .066),
            smoothstep(-.95, -.02, d.y));
          color = mix(color, vec3(.058, .054, .045), smoothstep(.02, .85, d.y));
          color += vec3(.24, .14, .055) * pow(facing, 5.0);
          // Cool reflected light opposite the sunset gives the sand depth
          // as the camera orbits, instead of making every direction orange.
          float leeward = pow(max(dot(d, normalize(vec3(.72, -.18, .66))), 0.0), 2.0);
          color = mix(color, vec3(.062, .069, .071), leeward * .28);

          vec3 wind = vec3(time * .009, 0.0, time * .003);
          vec3 p = d * vec3(3.2, 7.0, 3.2) + wind;
          float billow = folds(p);
          // Broad asymmetric bends break up the horizontal dust strata.
          float bend = .075 * sin(d.x * 3.5 + d.z * 2.0) + (billow - .5) * .16;
          float strata = folds(d * vec3(2.8, 23.0, 2.8) + wind * 1.4 + vec3(0, bend * 18.0, 0));
          float veil = smoothstep(.33, .76, strata) * (1.0 - smoothstep(.25, .85, d.y));
          vec3 sand = mix(vec3(.115, .079, .063), vec3(.36, .195, .083), pow(facing, 2.0));
          color = mix(color, sand, veil * .55);
          float shadow = smoothstep(.5, .8, billow) * exp(-pow((d.y - bend - .18) * 3.2, 2.0));
          color = mix(color, vec3(.034, .041, .049), shadow * .5);
          float silk = smoothstep(.49, .68, strata) * (1.0 - smoothstep(.68, .84, strata));
          color += vec3(.085, .05, .025) * silk * (.25 + .75 * facing) * exp(-abs(d.y + .15) * 1.7);

          // An immense pale sun seen through airborne sand. Approximately
          // four times the original disc diameter, with a broad dusty aureole.
          float sunDistance = length(d - sun);
          float sunVeil = 1.0 - veil * .58 - shadow * .25;
          float disc = 1.0 - smoothstep(.112, .125, sunDistance);
          float limb = 1.0 - .2 * smoothstep(.045, .122, sunDistance);
          color += vec3(.30, .175, .065) * exp(-sunDistance * sunDistance * 9.0) * sunVeil;
          color += vec3(.22, .125, .045) * exp(-sunDistance * sunDistance * 48.0) * sunVeil;
          vec3 sunlight = vec3(.95, .68, .32) * limb * sunVeil;
          color = mix(color, sunlight, disc * .88);
          color = mix(color, vec3(.27, .167, .098), horizon * .16);
          // A quieter mist basin below the platform, ready for distant land.
          color = mix(color, vec3(.095, .079, .057), smoothstep(.35, 1.0, -d.y) * .42);

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  sky.name = 'DesertSiroccoSky';
  sky.renderOrder = -1000;
  sky.visible = false;

  const dust = createWindParticles(time, 'sand');
  return { sky, dust };
}
