import * as THREE from 'three';

export function terrainRandom(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function terrainNoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const sample = (a: number, b: number) => terrainRandom(a * 17.13 + b * 91.7 + seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(ix, iz), sample(ix + 1, iz), u),
    THREE.MathUtils.lerp(sample(ix, iz + 1), sample(ix + 1, iz + 1), u), v);
}

const SUMMIT_INNER_RADIUS = 13.1;

export function summitSurfaceHeight(angle: number, radius: number) {
  const t = THREE.MathUtils.clamp((radius - SUMMIT_INNER_RADIUS) / (summitEdge(angle) - SUMMIT_INNER_RADIUS), 0, 1);
  const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  return THREE.MathUtils.lerp(-.19, -.32 + Math.sin(angle * 3 + .27) * .38, t)
    + (terrainNoise(x * .65, z * .65, 8) - .5) * .32 * Math.sin(t * Math.PI);
}

function edgeVariation(angle: number) {
  const sector = ((angle / (Math.PI * 2) % 1 + 1) % 1) * 19;
  const i = Math.floor(sector);
  const a = terrainRandom(i + 41);
  const b = terrainRandom((i + 1) % 19 + 41);
  return THREE.MathUtils.lerp(a, b, sector - i);
}

export function summitEdge(angle: number) {
  return 16.8 + edgeVariation(angle) * 3.8
    + Math.sin(angle * 2 + .8) * 1.8 + Math.cos(angle * 3 - .5) * .7;
}

export function cliffRadius(angle: number, tier: number) {
  const firstShelf = Math.max(0, Math.sin(angle * 3 + .9)) ** 4 * .21;
  const secondShelf = Math.max(0, Math.sin(angle * 2 - 1.8)) ** 6 * .3;
  const edge = summitEdge(angle);
  return edge * (tier === 0 ? 1.015 : tier === 1 ? 1.08 + firstShelf :
    1.17 + firstShelf + secondShelf);
}

function finishGeometry(positions: number[], indices: number[], moss: boolean) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const colors: number[] = [];
  const charcoal = new THREE.Color('#48444a');
  const stone = new THREE.Color('#79736a');
  const grass = new THREE.Color('#526b35');
  const color = new THREE.Color();
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const patches = terrainNoise(x * .24, z * .24 + y * .035, 4);
    color.copy(charcoal).lerp(stone, .22 + patches * .5);
    // Vegetation belongs on shelves; the cliff walls retain charcoal rock.
    const ledge = THREE.MathUtils.smoothstep(normals.getY(i), .65, .94);
    const elevation = THREE.MathUtils.smoothstep(y, -65, -3);
    if (moss) color.lerp(grass, ledge * elevation * (.45 + patches * .5));
    color.multiplyScalar(THREE.MathUtils.lerp(.68, 1, THREE.MathUtils.smoothstep(y, -140, -8)));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSummitGeometry() {
  const positions: number[] = [], indices: number[] = [];
  const segments = 114;
  // Alternating vertical faces and short horizontal benches, not a widening cone.
  const anchors = [
    [0, -.19], [1, -.32], [1.01, -2.1], [1.025, -16],
    [1.03, -18], [1.09, -21], [1.1, -43],
    [1.12, -46], [1.17, -50], [1.24, -84],
    [1.27, -89], [1.34, -98], [1.65, -155],
  ];
  const levels: number[][] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    // Extra rings resolve erosion across cliff faces; the old long triangles
    // stretched a single planar surface through tens of metres of cliff.
    const steps = i === 0 ? 6 : Math.max(1, Math.ceil(Math.abs(anchors[i + 1][1] - anchors[i][1]) / 4));
    for (let j = 0; j < steps; j++) levels.push([
      THREE.MathUtils.lerp(anchors[i][0], anchors[i + 1][0], j / steps),
      THREE.MathUtils.lerp(anchors[i][1], anchors[i + 1][1], j / steps),
      i + j / steps,
    ]);
  }
  levels.push([...anchors[anchors.length - 1], anchors.length - 1]);
  for (let row = 0; row < levels.length; row++) {
    for (let col = 0; col < segments; col++) {
      const angle = col / segments * Math.PI * 2;
      const depth = levels[row][2];
      const edge = summitEdge(angle);
      const firstShelf = THREE.MathUtils.smoothstep(depth, 3, 4) * Math.max(0, Math.sin(angle * 3 + .9)) ** 4 * .21;
      const secondShelf = THREE.MathUtils.smoothstep(depth, 6, 7) * Math.max(0, Math.sin(angle * 2 - 1.8)) ** 6 * .3;
      const erosion = (terrainNoise(Math.cos(angle) * 9, Math.sin(angle) * 9 + levels[row][1] * .055, 19) - .5)
        * 2.8 * THREE.MathUtils.smoothstep(depth, 1, 3);
      const radius = depth <= 1 ? THREE.MathUtils.lerp(SUMMIT_INNER_RADIUS, edge, depth) :
        edge * (levels[row][0] + firstShelf + secondShelf) + erosion;
      const height = depth <= 1 ? summitSurfaceHeight(angle, radius) : levels[row][1]
        + Math.sin(angle * 3 + .27) * (depth < 2 ? depth * .38 :
          THREE.MathUtils.lerp(.76, 6, THREE.MathUtils.smoothstep(depth, 2, 3)))
        + Math.cos(angle * 7) * 2 * THREE.MathUtils.smoothstep(depth, 2, 3);
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      if (row < levels.length - 1) {
        const a = row * segments + col, b = row * segments + (col + 1) % segments;
        indices.push(a, b, a + segments, b, b + segments, a + segments);
      }
    }
  }
  const center = positions.length / 3;
  positions.push(0, -.19, 0);
  for (let col = 0; col < segments; col++) indices.push(center, (col + 1) % segments, col);
  return finishGeometry(positions, indices, false);
}

/** Angular, leaning slabs with broad broken tops and a bevel at the shoulder. */
export function createCliffShard(seed: number) {
  const positions: number[] = [], indices: number[] = [];
  const sides = 7;
  const outline = Array.from({ length: sides }, (_, i) => .8 + terrainRandom(seed + i) * .35);
  const levels = [[.94, 1], [1, .84], [.87, .43], [1.1, 0]];
  for (let row = 0; row < levels.length; row++) {
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2;
      const lean = levels[row][1] * .24;
      positions.push(Math.cos(a) * outline[i] * levels[row][0] + lean,
        levels[row][1] + (row === 0 ? (terrainRandom(seed + i * 3) - .5) * .045 : 0),
        Math.sin(a) * outline[i] * levels[row][0]);
      if (row < levels.length - 1) {
        const p = row * sides + i, q = row * sides + (i + 1) % sides;
        indices.push(p, q, p + sides, q, q + sides, p + sides);
      }
    }
  }
  const cap = positions.length / 3;
  positions.push(.24, 1, 0);
  for (let i = 0; i < sides; i++) indices.push(cap, (i + 1) % sides, i);
  // Independent face normals give slabs crisp fracture edges.
  const indexed = finishGeometry(positions, indices, false);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

export type MountainRange = {
  name: string; x: number; z: number; length: number; width: number;
  rotation: number; crest: number[]; seed: number;
};

/** One connected ridge with multiple peaks and saddles, shaped as a height field. */
export function createRangeGeometry(range: MountainRange) {
  const positions: number[] = [], indices: number[] = [];
  const along = 100, across = 36;
  for (let i = 0; i <= along; i++) {
    const u = i / along;
    const sample = u * (range.crest.length - 1);
    const k = Math.min(range.crest.length - 2, Math.floor(sample));
    const crest = THREE.MathUtils.lerp(range.crest[k], range.crest[k + 1], sample - k)
      + (terrainNoise(u * 37, 0, range.seed) - .5) * 6;
    const bend = Math.sin(u * 8 + range.seed) * .1 + Math.sin(u * 17) * .035;
    const endFade = Math.min(1, u * 9, (1 - u) * 9);
    for (let j = 0; j <= across; j++) {
      const v = j / across * 2 - 1;
      const distance = Math.min(1, Math.abs(v) / (.78 + Math.sin(u * 19 + range.seed) * .18));
      // Mix broad scree slopes with localized bluff faces. Width changes along
      // the ridge, so it cannot read as an extruded wall or accordion curtain.
      const bluff = (.5 + .5 * Math.sin(u * 17 + range.seed)) * .55;
      const escarpment = THREE.MathUtils.smoothstep(distance, .13, .7);
      const foot = THREE.MathUtils.smoothstep(distance, .55, 1);
      const slope = Math.pow(distance, .7 + .25 * Math.sin(u * 11 + v));
      const drop = THREE.MathUtils.lerp(slope, escarpment * .8 + foot * .2, bluff);
      const fault = Math.sin(u * 71 + range.seed) * Math.sin(u * 29 - v * 5);
      const warp = terrainNoise(u * 8, v * 3, range.seed) * 2;
      const broad = terrainNoise(u * 18 + warp, v * 7, range.seed + 9) - .5;
      const chips = terrainNoise(u * 46, v * 18 + warp, range.seed + 21) - .5;
      const erosion = (broad * 25 + chips * 7 + fault * 1.5) * Math.sin(distance * Math.PI);
      const rawHeight = -155 + (crest + 155) * (1 - drop) * endFade + erosion;
      // Small discontinuous ledges interrupt the face without horizontal bands
      // circling each mountain at a common elevation.
      const shelf = Math.sin(u * 23 + range.seed) * 2.5;
      const height = rawHeight + Math.sin(rawHeight * .22 + shelf) * escarpment * (1 - foot) * 1.5;
      positions.push((u - .5 + Math.sin(v * 4 + range.seed) * Math.sin(u * Math.PI) * .045) * range.length, height,
        (v * .5 + bend) * range.width);
      if (i < along && j < across) {
        const a = i * (across + 1) + j, b = a + across + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = finishGeometry(positions, indices, true);
  geometry.rotateY(range.rotation);
  geometry.translate(range.x, 0, range.z);
  return geometry;
}

/** Continuous ground beneath every mountain base, including the gaps between ranges. */
export function createValleyFloorGeometry() {
  const positions: number[] = [], indices: number[] = [];
  const segments = 80, span = 1400;
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const x = (col / segments - .5) * span;
      const z = (row / segments - .5) * span;
      // Peaks terminate at -155. Keep the whole valley below that elevation,
      // with shallow erosion rather than a conspicuously flat backdrop plane.
      const y = -156 - terrainNoise(x * .012, z * .012, 72) * 9
        - terrainNoise(x * .035, z * .035, 103) * 3;
      positions.push(x, y, z);
      if (row < segments && col < segments) {
        const a = row * (segments + 1) + col, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  return finishGeometry(positions, indices, false);
}
