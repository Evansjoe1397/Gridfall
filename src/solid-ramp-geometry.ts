import * as THREE from 'three';

/** Close a triangulated ramp surface down to the bottom of its supporting tile. */
export function fillRampGeometry(geometry: THREE.BufferGeometry, baseY = -0.08) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const vertices: THREE.Vector3[] = [];
  const vertexIds = new Map<string, number>();
  const ids: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = `${vertex.x},${vertex.y},${vertex.z}`;
    let id = vertexIds.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertices.push(vertex);
      vertexIds.set(key, id);
    }
    ids.push(id);
  }
  const edges = new Map<string, { a: number; b: number; count: number }>();
  const output: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    output.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const bottom = vertices.map((v) => new THREE.Vector3(v.x, baseY, v.z));
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const a = ids[index ? index.getX(i) : i];
    let b = ids[index ? index.getX(i + 1) : i + 1];
    let c = ids[index ? index.getX(i + 2) : i + 2];
    const normal = new THREE.Vector3().subVectors(vertices[b], vertices[a])
      .cross(new THREE.Vector3().subVectors(vertices[c], vertices[a]));
    if (normal.y < 0) [b, c] = [c, b];
    triangle(vertices[a], vertices[b], vertices[c]);
    triangle(bottom[c], bottom[b], bottom[a]);
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const key = `${Math.min(start, end)},${Math.max(start, end)}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a: start, b: end, count: 1 });
    }
  }
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    triangle(vertices[b], vertices[a], bottom[a]);
    triangle(vertices[b], bottom[a], bottom[b]);
  }
  // Separate face vertices keep the solid's vertical edges crisp.
  geometry.setIndex(null);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
