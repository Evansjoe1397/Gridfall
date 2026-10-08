import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const shizzleMovementDuration = (squares: number) => 180 + Math.max(1, squares) * 180;

/** Transient scene effects own their materials, but share the character's geometry. */
export class ShizzleVisual {
  private lift = 0;
  private lean = 0;
  private active = false;
  private lastGhostAt = -Infinity;
  private lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  private route: unknown;
  private crossed = new Set<THREE.Object3D>();
  private ghosts: { object: THREE.Object3D; material: THREE.MeshBasicMaterial; born: number }[] = [];
  private pulses: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; born: number }[] = [];

  constructor(private scene: THREE.Scene, private root: THREE.Group) {}

  private pulse(position: THREE.Vector3, now: number, vertical = false) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(.35, .42, 32), new THREE.MeshBasicMaterial({
      color: vertical ? 0xdbfaff : 0x9d8cff, transparent: true, opacity: .7,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    mesh.position.copy(position);
    mesh.position.y += vertical ? 1.1 : .06;
    if (!vertical) mesh.rotation.x = -Math.PI / 2;
    else mesh.rotation.y = this.root.rotation.y;
    mesh.raycast = () => {};
    this.scene.add(mesh);
    this.pulses.push({ mesh, born: now });
  }

  update(now: number, delta: number, active: boolean, route: unknown, enemies: THREE.Object3D[]) {
    const body = this.root.children[0];
    if (active && !this.active) this.pulse(this.root.position, now);
    if (!active && this.active) this.pulse(this.root.position, now);
    this.active = active;
    if (route !== this.route) { this.route = route; this.crossed.clear(); }
    this.lift = THREE.MathUtils.damp(this.lift, active ? 1 : 0, active ? 16 : 12, delta);
    this.lean = THREE.MathUtils.damp(this.lean, active && route ? .16 : 0, 14, delta);
    body.position.y = this.lift * (.28 + Math.sin(now * .005) * .025);
    body.rotation.x = this.lean;
    if (active && route) {
      for (const enemy of enemies) {
        if (!this.crossed.has(enemy) && enemy.position.distanceTo(this.root.position) < .95) {
          this.crossed.add(enemy);
          this.pulse(enemy.position, now, true);
        }
      }
      const model = this.root.getObjectByName('LongHatLoganImportedModel');
      if (model && now - this.lastGhostAt >= 95 && this.ghosts.length < 3
          && this.lastPosition.distanceToSquared(this.root.position) > .1) {
        this.root.updateWorldMatrix(true, true);
        const object = clone(model);
        // Echo the character silhouette without copying independent spell effects.
        const effects: THREE.Object3D[] = [];
        object.traverse(child => { if (child.userData.characterEffect) effects.push(child); });
        for (const effect of effects) effect.removeFromParent();
        const material = new THREE.MeshBasicMaterial({ color: 0x98baff, transparent: true,
          opacity: .2, depthWrite: false, blending: THREE.AdditiveBlending });
        object.traverse(child => {
          child.raycast = () => {};
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
          }
        });
        model.matrixWorld.decompose(object.position, object.quaternion, object.scale);
        this.scene.add(object);
        this.ghosts.push({ object, material, born: now });
        this.lastGhostAt = now;
        this.lastPosition.copy(this.root.position);
      }
    }
    for (const ghost of [...this.ghosts]) {
      const age = (now - ghost.born) / 280;
      ghost.material.opacity = .2 * Math.max(0, 1 - age) ** 2;
      if (age >= 1) this.removeGhost(ghost);
    }
    for (const pulse of [...this.pulses]) {
      const age = (now - pulse.born) / 360;
      pulse.mesh.scale.setScalar(1 + age * 2.5);
      pulse.mesh.material.opacity = .7 * Math.max(0, 1 - age) ** 2;
      if (age >= 1) {
        pulse.mesh.removeFromParent(); pulse.mesh.geometry.dispose(); pulse.mesh.material.dispose();
        this.pulses.splice(this.pulses.indexOf(pulse), 1);
      }
    }
    return active || this.lift > .001 || this.ghosts.length > 0 || this.pulses.length > 0;
  }

  private removeGhost(ghost: typeof this.ghosts[number]) {
    ghost.object.removeFromParent();
    ghost.object.traverse(child => { if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose(); });
    ghost.material.dispose();
    this.ghosts.splice(this.ghosts.indexOf(ghost), 1);
  }

  dispose() {
    this.root.children[0].position.y = 0;
    this.root.children[0].rotation.x = 0;
    for (const ghost of [...this.ghosts]) this.removeGhost(ghost);
    for (const { mesh } of this.pulses) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.pulses = [];
  }
}
