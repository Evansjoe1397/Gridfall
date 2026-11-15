import * as THREE from 'three';
import type { Cell } from '../shared/game.ts';

/** Pickups are rendered separately from blocking/targetable board Objects. */
export class AppleObjects {
  private readonly groups = new Map<string, THREE.Group>();
  private readonly fruitGeometry = new THREE.SphereGeometry(0.22, 16, 12);
  private readonly stemGeometry = new THREE.CylinderGeometry(0.025, 0.035, 0.15, 6);
  private readonly leafGeometry = new THREE.SphereGeometry(0.1, 8, 6);
  private readonly fruitMaterial = new THREE.MeshStandardMaterial({ color: 0xe93930, roughness: 0.35 });
  private readonly stemMaterial = new THREE.MeshStandardMaterial({ color: 0x604028 });
  private readonly leafMaterial = new THREE.MeshStandardMaterial({ color: 0x61aa35 });

  sync(scene: THREE.Scene, apples: readonly { id: string; position: Cell }[], world: (cell: Cell) => THREE.Vector3): void {
    const ids = new Set(apples.map((apple) => apple.id));
    for (const [id, group] of this.groups) if (!ids.has(id)) { scene.remove(group); this.groups.delete(id); }
    for (const apple of apples) {
      let group = this.groups.get(apple.id);
      if (!group) {
        group = new THREE.Group(); group.name = 'Apple · pick up for +1 MOV until this turn ends';
        const fruit = new THREE.Mesh(this.fruitGeometry, this.fruitMaterial);
        fruit.scale.set(1, 0.9, 1); fruit.position.y = 0.24;
        const stem = new THREE.Mesh(this.stemGeometry, this.stemMaterial); stem.position.y = 0.48; stem.rotation.z = -0.2;
        const leaf = new THREE.Mesh(this.leafGeometry, this.leafMaterial); leaf.scale.set(1.4, 0.2, 0.65); leaf.position.set(0.1, 0.49, 0);
        group.add(fruit, stem, leaf); this.groups.set(apple.id, group); scene.add(group);
      }
      group.position.copy(world(apple.position));
    }
  }
}
