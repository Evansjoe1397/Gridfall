import * as THREE from 'three';

/** Clip the upper surface of a model to a tile, retaining its actual contours. */
export function surfaceTileHighlight(
  model: THREE.Object3D,
  tile: THREE.Object3D,
  halfSize: number,
  minSurfaceY: number,
): THREE.BufferGeometry {
  model.updateWorldMatrix(true, true);
  tile.updateWorldMatrix(true, false);
  const toTile = tile.matrixWorld.clone().invert();
  const center = tile.getWorldPosition(new THREE.Vector3());
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(center.x - halfSize)),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), center.x + halfSize),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(center.z - halfSize)),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), center.z + halfSize),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -minSurfaceY),
  ];
  const positions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const normal = new THREE.Vector3();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const vertices = object.geometry.getAttribute('position');
    const indices = object.geometry.getIndex();
    for (let i = 0; i < (indices?.count ?? vertices.count); i += 3) {
      a.fromBufferAttribute(vertices, indices ? indices.getX(i) : i).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(vertices, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(vertices, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(object.matrixWorld);
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      // Ignore the vertical sides and underside; include the lid's sloping bevels.
      if (normal.y < 0.25) continue;
      if (planes.some((plane) => [a, b, c].every((v) => plane.distanceToPoint(v) < 0))) continue;
      let polygon = [a.clone(), b.clone(), c.clone()];
      for (const plane of planes) {
        const clipped: THREE.Vector3[] = [];
        for (let j = 0; j < polygon.length; j++) {
          const start = polygon[j];
          const end = polygon[(j + 1) % polygon.length];
          const startDistance = plane.distanceToPoint(start);
          const endDistance = plane.distanceToPoint(end);
          if (startDistance >= 0) clipped.push(start);
          if ((startDistance >= 0) !== (endDistance >= 0)) {
            clipped.push(start.clone().lerp(end, startDistance / (startDistance - endDistance)));
          }
        }
        polygon = clipped;
        if (polygon.length < 3) break;
      }
      for (const vertex of polygon) {
        vertex.addScaledVector(normal, 0.002).applyMatrix4(toTile);
      }
      for (let j = 1; j + 1 < polygon.length; j++) {
        for (const vertex of [polygon[0], polygon[j], polygon[j + 1]]) {
          positions.push(vertex.x, vertex.y, vertex.z);
        }
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
