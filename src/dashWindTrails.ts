import * as THREE from 'three';

const LIFETIME_MS = 320;
const MAX_STREAKS = 96;

/** Short, tapered wisps in world space so the wake stays behind on turns. */
export class DashWindTrails {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly streaks: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; born: number }[] = [];
  private readonly lastEmission = new Map<string, number>();
  private readonly direction = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const curve = Math.sin(t * Math.PI);
      const width = 0.025 * curve;
      vertices.push(-t, curve * 0.1 - width, curve * 0.09, -t, curve * 0.1 + width, curve * 0.09);
      if (i < 12) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this.geometry.setIndex(indices);
    this.geometry.computeBoundingSphere();
  }

  emit(id: string, position: THREE.Vector3, direction: THREE.Vector3, time: number) {
    if (time - (this.lastEmission.get(id) ?? -Infinity) < 45) return;
    this.direction.set(direction.x, 0, direction.z);
    if (this.direction.lengthSq() < 0.00001) return;
    this.direction.normalize();
    this.lastEmission.set(id, time);
    for (let lane = 0; lane < 3; lane++) {
      let streak = this.streaks.find((entry) => !entry.mesh.visible);
      if (!streak) {
        if (this.streaks.length >= MAX_STREAKS) return;
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({
          color: 0xddf5ff, transparent: true, opacity: 0,
          depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        }));
        this.scene.add(mesh);
        streak = { mesh, born: time };
        this.streaks.push(streak);
      }
      streak.born = time;
      const mesh = streak.mesh;
      const side = (lane - 1) * 0.34;
      mesh.position.copy(position);
      mesh.position.x -= this.direction.x * 0.2 + this.direction.z * side;
      mesh.position.z -= this.direction.z * 0.2 - this.direction.x * side;
      mesh.position.y += 0.55 + lane * 0.4;
      mesh.rotation.set(0, -Math.atan2(this.direction.z, this.direction.x), (lane - 1) * 0.08);
      mesh.scale.set(0.85 + lane * 0.2, 1, 1);
      mesh.material.opacity = 0.5;
      mesh.visible = true;
    }
  }

  update(time: number) {
    for (const streak of this.streaks) {
      if (!streak.mesh.visible) continue;
      const age = (time - streak.born) / LIFETIME_MS;
      streak.mesh.visible = age < 1;
      streak.mesh.material.opacity = 0.5 * Math.pow(Math.max(0, 1 - age), 2);
    }
    for (const [id, last] of this.lastEmission) {
      if (time - last > LIFETIME_MS) this.lastEmission.delete(id);
    }
  }

  clear() {
    for (const { mesh } of this.streaks) {
      this.scene.remove(mesh);
      mesh.material.dispose();
    }
    this.streaks.length = 0;
    this.lastEmission.clear();
  }
}
