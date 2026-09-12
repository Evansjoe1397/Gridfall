import * as THREE from 'three';

const impacts: { mesh: THREE.Mesh; age: number }[] = [];
const direction = new THREE.Vector3();
const axis = new THREE.Vector3(1, 0, 0);

export function createArcaneMissile(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.11, 12, 8);
  geometry.scale(2.0, 0.75, 0.75);
  const root = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xeee0ff }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), new THREE.MeshBasicMaterial({ color: 0x8c39ff, transparent: true, opacity: 0.23, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(1.8, 1, 1);
  root.add(halo);
  for (let index = 0; index < 2; index++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19 + index * 0.055, 0.012, 4, 28, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: index ? 0x689fff : 0xce85ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.name = 'ArcaneOrbit';
    ring.rotation.y = Math.PI / 2;
    root.add(ring);
  }
  for (let index = 0; index < 22; index++) {
    const mote = new THREE.Mesh(new THREE.SphereGeometry(0.09 * (1 - index / 25), 6, 4), new THREE.MeshBasicMaterial({ color: index % 3 ? 0x9860ff : 0xb8dcff, transparent: true, opacity: 0.6 * (1 - index / 23), blending: THREE.AdditiveBlending, depthWrite: false }));
    mote.name = 'ArcaneWake';
    root.add(mote);
  }
  root.add(new THREE.PointLight(0xa86bff, 2.5, 3));
  return root;
}

export function updateArcaneMissile(root: THREE.Mesh, points: THREE.Vector3[], progress: number, time: number): void {
  const segment = Math.min(points.length - 2, Math.floor(progress * (points.length - 1)));
  direction.subVectors(points[segment + 1], points[segment]).normalize();
  root.quaternion.setFromUnitVectors(axis, direction);
  root.updateMatrixWorld(true);
  let tailIndex = 0;
  root.children.forEach((child, index) => {
    if (child.name === 'ArcaneOrbit') child.rotation.x = time * 5 + index * 2.1;
    if (child.name !== 'ArcaneWake') return;
    const tailProgress = Math.max(0, progress - (++tailIndex * 0.045) / (points.length - 1));
    const route = tailProgress * (points.length - 1);
    const tailSegment = Math.min(points.length - 2, Math.floor(route));
    child.position.lerpVectors(points[tailSegment], points[tailSegment + 1], route - tailSegment);
    const spiral = time * 9 - tailIndex * 0.6;
    child.position.y += Math.sin(spiral) * 0.075;
    child.position.x += Math.cos(spiral) * 0.045;
    root.worldToLocal(child.position);
    child.visible = tailProgress > 0;
  });
}

export function spawnArcaneImpact(scene: THREE.Scene, position: THREE.Vector3): void {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), new THREE.MeshBasicMaterial({ color: 0xe4caff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }));
  mesh.position.copy(position);
  scene.add(mesh);
  impacts.push({ mesh, age: 0 });
}

export function updateArcaneImpacts(delta: number): void {
  for (let index = impacts.length - 1; index >= 0; index--) {
    const impact = impacts[index];
    impact.age += delta;
    const progress = Math.min(1, impact.age / 0.35);
    impact.mesh.scale.setScalar(1 + progress * 5);
    impact.mesh.rotation.y = progress * 1.8;
    (impact.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) ** 2 * 0.8;
    if (progress === 1) {
      impact.mesh.removeFromParent(); impact.mesh.geometry.dispose();
      (impact.mesh.material as THREE.Material).dispose(); impacts.splice(index, 1);
    }
  }
}
