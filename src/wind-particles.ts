import * as THREE from 'three';

// Reproducible clumps of actual 3D particles, not speckles on a fog sheet.
export function createWindParticles(time: { value: number }, style: 'sand' | 'storm' = 'sand') {
  const storm = style === 'storm';
  let seed = 0x7341c;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(random(), .00001))) * Math.cos(random() * Math.PI * 2);
  const group = new THREE.Group();
  group.name = storm ? 'StormParticleWind' : 'DesertParticleWind';
  group.position.y = .7;
  group.visible = false;

  function swarm(leaves: boolean) {
    const count = leaves ? (storm ? 24 : 36) : (storm ? 4200 : 9600);
    const offsets = new Float32Array(count * 3);
    const events = new Float32Array(count * 4);
    const traits = new Float32Array(count * 4);
    const flows = new Float32Array(count * 4);
    // Unequal lanes, durations, and periods prevent a uniform wall of dust.
    const lanes = [-23, 16, -8, 27, 4, -17, 21, -3, 3];
    const periods = [29, 37, 31, 43, 34, 41, 47, 53, 67];
    for (let i = 0; i < count; i++) {
      // The two elevated board crossings carry half as many grains per bank.
      const peripheralCount = storm ? 3600 : 8400;
      const bank = leaves ? i % lanes.length : i < peripheralCount ? i % 7 : 7 + i % 2;
      const crossing = bank >= 7;
      const lobe = Math.floor(random() * 5);
      const fringe = random() < .2 ? 2.3 : 1;
      offsets.set([
        gaussian() * (leaves ? 4 : 1.3) * fringe + (lobe - 2) * 2.8,
        gaussian() * .85 * fringe + Math.sin(lobe * 1.7 + bank) * 1.3,
        gaussian() * 1.3 * fringe + Math.sin(lobe * 2.4 + bank) * 3.1,
      ], i * 3);
      events.set([
        (crossing ? bank === 7 ? 3 : 25 : bank * 4.7) + (leaves ? 1.1 : 0),
        crossing ? 18 : 13 + bank % 4 * 2, periods[bank], lanes[bank],
      ], i * 4);
      traits.set([random(), random() * Math.PI * 2, random(), random()], i * 4);
      flows.set([lobe * 1.37 + bank, .5 + random() * 1.2, crossing ? 1 : 0, bank === 8 ? -1 : 1], i * 4);
    }
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('event', new THREE.InstancedBufferAttribute(events, 4));
    geometry.setAttribute('traits', new THREE.InstancedBufferAttribute(traits, 4));
    geometry.setAttribute('flow', new THREE.InstancedBufferAttribute(flows, 4));
    geometry.instanceCount = count;
    const material = new THREE.ShaderMaterial({
      uniforms: { time, leaves: { value: leaves }, storm: { value: storm } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      vertexShader: `
        uniform float time;
        uniform bool leaves;
        uniform bool storm;
        attribute vec3 offset;
        attribute vec4 event;
        attribute vec4 traits;
        attribute vec4 flow;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSoftness;
        void main() {
          float windTime = time * (storm ? 1.3 : 1.0);
          float age = mod(windTime + event.x + 4.0, event.z);
          float cycle = floor((windTime + event.x + 4.0) / event.z);
          float life = clamp(age / event.y, 0.0, 1.0);
          float envelope = smoothstep(0.0, .14, life) * (1.0 - smoothstep(.76, 1.0, life));
          // A gust accelerates, spreads, and sheds grains into a trailing wake.
          float travel = mix(-53.0, 53.0, life * .78 + life * life * .22);
          float spread = .6 + life * 1.25;
          // Tighter vortex cores turn faster than their fringes. The wake
          // unravels as it travels, instead of bobbing the whole cloud together.
          float eddy = age * flow.y / (1.0 + length(offset.yz) * .35) + flow.x;
          vec2 curl = mat2(cos(eddy), sin(eddy), -sin(eddy), cos(eddy)) * offset.yz;
          vec3 p = vec3(travel + offset.x * spread, curl.x * .65, event.w + curl.y * spread);
          p.x -= pow(traits.z, 3.0) * life * 12.0;
          p.y += sin(age * .55 + offset.x * .3 + flow.x) * 1.1;
          p.z += sin(age * .42 + offset.x * .19 + cycle * 1.7) * 2.6;
          // Lift low sand above the arena's base; preserve the occasional
          // higher crossings without lifting those all the way above the view.
          float loft = p.y * .65 + .65;
          p.y = -.25 + .5 * (loft + sqrt(loft * loft + .6));
          if (flow.z > .5) {
            p.y = 1.4 + abs(p.y) * .55 + (1.0 - traits.z) * 1.6;
          }
          if (leaves) {
            p.y += 1.5 + sin(age * (1.3 + traits.z) + traits.y) * 1.2;
            p.z += sin(age * 1.4 + traits.y) * 2.2;
          }
          p.x *= flow.w;
          p.xz = mat2(.848, .53, -.53, .848) * p.xz;
          // Sparse elevated gusts can cross the board; dense low banks stay
          // outside it. Depth testing still lets characters occlude particles.
          float boardClearance = smoothstep(11.0, 17.0, length(p.xz));
          float coverage = mix(boardClearance, mix(leaves ? .8 : .48, 1.0, boardClearance), flow.z);
          vAlpha = envelope * coverage * mix(.3, .78, traits.w);
          vColor = mix(vec3(.24, .135, .055), vec3(.66, .43, .19), traits.z);
          if (storm) vColor = mix(vec3(.12, .17, .19), vec3(.43, .51, .53), traits.z);
          vec4 viewCenter = modelViewMatrix * vec4(p, 1.0);
          vec2 corner = position.xy;
          float size = mix(.009, .038, traits.x * traits.x);
          vSoftness = !leaves && traits.x > .94 ? 1.0 : 0.0;
          vec2 screenWind = (viewMatrix * vec4(.848 * flow.w, .08, .53 * flow.w, 0.0)).xy;
          screenWind /= max(length(screenWind), .001);
          if (leaves) {
            size = mix(.12, .23, traits.x);
            float tumble = age * (2.5 + traits.z * 2.0) + traits.y + sin(age * 1.7) * .5;
            float spin = age * (1.3 + traits.x) + traits.y;
            // A folded leaf turns in three dimensions, flashing edge-on and
            // face-on, instead of always facing the camera like a sprite.
            vec3 leaf = vec3(corner.x, corner.y, .3 * abs(corner.x) + .18 * corner.y * corner.y);
            leaf.yz = mat2(cos(tumble), sin(tumble), -sin(tumble), cos(tumble)) * leaf.yz;
            leaf.xz = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * leaf.xz;
            viewCenter = modelViewMatrix * vec4(p + leaf * size, 1.0);
            vColor = mix(vec3(.15, .18, .052), vec3(.43, .20, .045), traits.z)
              * (.7 + .3 * abs(cos(tumble)));
            if (storm) vColor = mix(vec3(.08, .12, .09), vec3(.26, .25, .18), traits.z)
              * (.7 + .3 * abs(cos(tumble)));
            vAlpha *= .9;
          } else {
            if (vSoftness > .5) {
              size = mix(.14, .3, traits.w);
              vAlpha *= .07;
            }
            corner.x *= 1.0 + pow(traits.z, 6.0) * 2.0;
            corner = mat2(screenWind.x, screenWind.y, -screenWind.y, screenWind.x) * corner;
            viewCenter.xy += corner * size;
          }
          gl_Position = projectionMatrix * viewCenter;
          vUv = position.xy;
        }
      `,
      fragmentShader: `
        uniform bool leaves;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vSoftness;
        void main() {
          float alpha;
          vec3 color = vColor;
          if (leaves) {
            // Tapered, slightly bent leaf silhouette with a narrow central vein.
            float center = vUv.x - .16 * sin(vUv.y * 3.0);
            float width = .62 * pow(max(0.0, 1.0 - vUv.y * vUv.y), .75);
            float edge = max(fwidth(center), .015);
            alpha = 1.0 - smoothstep(max(0.0, width - edge), width + edge, abs(center));
            alpha *= 1.0 - smoothstep(.92, 1.0, abs(vUv.y));
            color *= 1.0 - .25 * (1.0 - smoothstep(.015, .045, abs(center)));
          } else {
            float radius = dot(vUv, vUv);
            alpha = (1.0 - smoothstep(.08, 1.0, radius)) * mix(.9, exp(-radius * 3.0), vSoftness);
          }
          if (alpha * vAlpha < .002) discard;
          gl_FragColor = vec4(color, alpha * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = storm ? (leaves ? 'StormWindDebris' : 'StormWindParticles')
      : (leaves ? 'DesertTumblingLeaves' : 'DesertSandClouds');
    // Vertex animation moves banks well outside the base quad's tiny bounds.
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    group.add(mesh);
  }
  swarm(false);
  swarm(true);
  return group;
}
