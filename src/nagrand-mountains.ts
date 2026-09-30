import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSummitGeometry, createCliffShard, createRangeGeometry, createValleyFloorGeometry, cliffRadius, terrainRandom, type MountainRange } from './nagrand-terrain-geometry.ts';
import { retryAssetLoad } from './retry-asset-load.ts';

// Pair landscape and camera scaling: the arena appears 30% larger while all
// terrain keeps its proportions. Gameplay coordinates and picking stay intact.
export const NAGRAND_LANDSCAPE_SCALE = 1 / 1.3;

function createRockMaterial(textureUrl?: string, bareStone = false) {
  const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  fallback.needsUpdate = true;
  const cliffMap = { value: fallback as THREE.Texture };
  const cliffMapWeight = { value: 0 };
  if (textureUrl) {
    void retryAssetLoad(textureUrl, (url) => new THREE.TextureLoader().loadAsync(url)).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      cliffMap.value = texture;
      cliffMapWeight.value = 1;
      fallback.dispose();
    }).catch((error) => console.error('Failed to load mountain rock texture; retaining procedural stone.', error));
  }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .98, metalness: 0,
  });
  // Object-space stone grain needs no texture downloads and has no UV seams.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cliffMap = cliffMap;
    shader.uniforms.cliffMapWeight = cliffMapWeight;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 rockPosition;
      varying float rockUp;
      varying vec3 rockNormal;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      rockPosition = position;
      rockUp = max(normal.y, 0.0);
      rockNormal = normal;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 rockPosition;
      varying float rockUp;
      varying vec3 rockNormal;
      uniform sampler2D cliffMap;
      uniform float cliffMapWeight;
      float rockHash(vec3 p) {
        p = fract(p * .1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float rockNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(rockHash(i), rockHash(i + vec3(1,0,0)), f.x),
          mix(rockHash(i + vec3(0,1,0)), rockHash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(rockHash(i + vec3(0,0,1)), rockHash(i + vec3(1,0,1)), f.x),
          mix(rockHash(i + vec3(0,1,1)), rockHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      // Fine strata dissolve with distance rather than sparkling on far peaks.
      float detail = 1.0 - smoothstep(35.0, 140.0, length(vViewPosition));
      float grain = mix(.5, rockNoise(rockPosition * 2.4), detail);
      float weathering = rockNoise(rockPosition * .24);
      float joints = rockNoise(rockPosition * vec3(.8, .025, .8));
      float fissure = (smoothstep(.43, .47, joints) - smoothstep(.49, .54, joints))
        * (1.0 - rockUp) * detail;
      float beds = sin(rockPosition.y * .85 + rockPosition.x * .25 + weathering * 6.0);
      float seam = smoothstep(.9, .99, beds) * (1.0 - rockUp) * detail;
      diffuseColor.rgb *= .84 + grain * .18 + weathering * .18 - fissure * .3 - seam * .08;
      // Three projections cover arbitrary cliff faces without stretched UVs.
      vec3 blend = pow(abs(normalize(rockNormal)), vec3(4.0));
      blend /= max(dot(blend, vec3(1.0)), .0001);
      vec3 p = rockPosition * .14;
      vec3 stoneAlbedo = texture2D(cliffMap, p.zy).rgb * blend.x
        + texture2D(cliffMap, p.xz).rgb * blend.y
        + texture2D(cliffMap, p.xy).rgb * blend.z;
      float textureFade = 1.0 - smoothstep(110.0, 270.0, length(vViewPosition));
      float wall = ${bareStone ? '1.0' : '1.0 - smoothstep(.55, .85, rockUp)'};
      diffuseColor.rgb = mix(diffuseColor.rgb, stoneAlbedo * (.72 + weathering * .35),
        cliffMapWeight * textureFade * wall * .92);
      // Keep the crown grassy, but break up the otherwise smooth top surface.
      diffuseColor.rgb *= mix(1.0, .75 + dot(stoneAlbedo, vec3(.333)) * 1.5,
        cliffMapWeight * (1.0 - wall) * .55);
    `);
  };
  material.customProgramCacheKey = () => `nagrand-textured-rock-v4-${bareStone}`;
  return material;
}

export function createNagrandMountains(time: { value: number }, textureUrl?: string) {
  const group = new THREE.Group();
  group.name = 'NagrandMountainLandscape';
  group.scale.setScalar(NAGRAND_LANDSCAPE_SCALE);
  group.visible = false;
  const rockMaterial = createRockMaterial(textureUrl);
  const summit = new THREE.Mesh(createSummitGeometry(), createRockMaterial(textureUrl, true));
  summit.name = 'FlatGrassySummitAndCliffs';
  summit.receiveShadow = true;
  group.add(summit);

  const crownDetails = new THREE.Group();
  crownDetails.name = 'SummitEdgeOutcrops';
  group.add(crownDetails);
  const slabs: THREE.BufferGeometry[] = [];
  for (let tier = 0; tier < 3; tier++) {
    const count = 32 - tier * 5;
    for (let i = 0; i < count; i++) {
      const seed = i * 13.1 + tier * 237;
      const angle = (i + terrainRandom(seed) * .8) / count * Math.PI * 2;
      const radius = cliffRadius(angle, tier);
      const height = 7 + terrainRandom(seed + 4) * (tier === 0 ? 11 : 19);
      const top = [-2.4, -22, -51][tier] - terrainRandom(seed + 1) * 8;
      const slab = createCliffShard(seed);
      slab.scale(2.2 + terrainRandom(seed + 2) * 3.1, height,
        1.6 + terrainRandom(seed + 3) * 2.8);
      slab.rotateZ((terrainRandom(seed + 8) - .5) * .32);
      slab.rotateY(-angle + .3);
      slab.translate(Math.cos(angle) * radius, top - height, Math.sin(angle) * radius);
      slabs.push(slab);
    }
  }
  const cliffGeometry = mergeGeometries(slabs)!;
  slabs.forEach((geometry) => geometry.dispose());
  const cliffs = new THREE.Mesh(cliffGeometry, rockMaterial);
  cliffs.name = 'FracturedCliffButtresses';
  cliffs.receiveShadow = true;
  crownDetails.add(cliffs);

  const transform = new THREE.Object3D();

  // Larger fallen fragments interrupt the foot of the cliffs in irregular pockets.
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x514b48, roughness: 1 }), 54);
  rubble.name = 'BrokenCliffFootRubble';
  for (let i = 0; i < rubble.count; i++) {
    const angle = terrainRandom(i * 3.7 + 80) * Math.PI * 2;
    const radius = cliffRadius(angle, 2) + 1 + terrainRandom(i + 31) * 4;
    const size = 1.2 + terrainRandom(i + 19) * 2.4;
    transform.position.set(Math.cos(angle) * radius, -73 - terrainRandom(i + 26) * 26, Math.sin(angle) * radius);
    transform.rotation.set(i * .7, i * 1.3, i * .37);
    transform.scale.set(size * 1.3, size * .7, size);
    transform.updateMatrix();
    rubble.setMatrixAt(i, transform.matrix);
  }
  rubble.instanceMatrix.needsUpdate = true;
  crownDetails.add(rubble);

  // Individually composed landforms leave open chasms between broad shoulders.
  // Nearby crests stay below the battlefield; the tall massif is far behind it.
  const ranges: MountainRange[] = [
    { name: 'WesternBrokenShoulder', x: -85, z: -20, length: 130, width: 85, rotation: 1.15,
      crest: [-85, -30, -12, -12, -31, -23, -25, -58, -92], seed: 3.7 },
    { name: 'NorthernSaddles', x: -28, z: -118, length: 152, width: 94, rotation: .18,
      crest: [-80, -38, -19, -23, -43, -36, -8, -12, -52, -87], seed: 8.1 },
    { name: 'DistantSplitMassif', x: 106, z: -96, length: 88, width: 84, rotation: -.45,
      crest: [-80, -36, 5, 5, -12, 38, 38, 10, 17, -35, -80], seed: 13.5 },
    { name: 'EasternEscarpment', x: 116, z: 42, length: 138, width: 106, rotation: 1.7,
      crest: [-95, -43, -40, -18, -24, -46, -32, -33, -75], seed: 25.2 },
    { name: 'SouthernLowShoulder', x: 30, z: 105, length: 112, width: 76, rotation: .22,
      crest: [-90, -48, -45, -32, -34, -59, -43, -88], seed: 32.8 },
    { name: 'SouthwestTerraces', x: -88, z: 87, length: 92, width: 83, rotation: -.6,
      crest: [-88, -46, -24, -25, -44, -31, -68, -94], seed: 41.9 },
    { name: 'FarNorthernRange', x: 10, z: -223, length: 285, width: 128, rotation: -.1,
      crest: [-80, -38, -6, -22, 12, -17, -28, 7, -12, -35, -4, -44, -87], seed: 56.3 },
    { name: 'FarSouthernRange', x: -15, z: 232, length: 290, width: 130, rotation: .3,
      crest: [-88, -35, -9, -26, 17, -4, -31, -13, -25, 8, -42, -80], seed: 67.1 },
  ];
  const rangeGeometries = ranges.map(createRangeGeometry);
  const distantGeometry = mergeGeometries(rangeGeometries)!;
  rangeGeometries.forEach((geometry) => geometry.dispose());
  const mountains = new THREE.Mesh(distantGeometry, rockMaterial);
  mountains.name = 'LayeredDistantMountainRanges';
  mountains.userData.landforms = ranges.map(({ name }) => name);
  group.add(mountains);

  const valleyFloor = new THREE.Mesh(createValleyFloorGeometry(), rockMaterial);
  valleyFloor.name = 'ContinuousRockyValleyFloor';
  group.add(valleyFloor);

  const mistMaterial = new THREE.ShaderMaterial({
    uniforms: { time, tint: { value: new THREE.Color(0x795557) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 valleyPosition;
      void main() {
        valleyPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 tint;
      varying vec2 valleyPosition;
      void main() {
        vec2 p = valleyPosition * .025;
        float drift = time * .008;
        float folds = sin(p.x + sin(p.y * 1.3 + drift))
          * sin(p.y * .8 - drift) + .4 * sin(p.x * 2.3 + p.y * 1.7);
        float density = smoothstep(-.9, 1.2, folds);
        float edge = 1.0 - smoothstep(190.0, 350.0, length(valleyPosition));
        // The center remains open, exposing the summit's steep supporting face.
        float opening = smoothstep(38.0, 78.0, length(valleyPosition));
        gl_FragColor = vec4(tint, density * edge * opening * .22);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mistGeometry = new THREE.PlaneGeometry(720, 720);
  const mist = new THREE.Group();
  mist.name = 'LowDriftingValleyMist';
  for (let layer = 0; layer < 3; layer++) {
    const sheet = new THREE.Mesh(mistGeometry, mistMaterial);
    sheet.rotation.set(-Math.PI / 2, 0, layer * 1.3);
    sheet.position.y = -44 - layer * 25;
    mist.add(sheet);
  }
  group.add(mist);

  return {
    group,
    setDaylight(enabled: boolean) {
      mist.visible = enabled;
    },
    sync(visible: boolean, center: THREE.Vector3, outerSpan: number) {
      group.visible = visible;
      group.position.set(center.x, 0, center.z);
      summit.scale.set(outerSpan / 24.96, 1, outerSpan / 24.96);
      crownDetails.scale.copy(summit.scale);
    },
  };
}
