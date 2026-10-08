import * as THREE from 'three';

// Last tile: two column delays + three row delays + its assembly time.
export const SPELLBLOCK_ASSEMBLY_MS = 2 * 35 + 3 * 25 + 220;

/** A tiled spell screen catches the hit, then breaks down into absorbed energy. */
export class SpellblockVisual {
  readonly root = new THREE.Group();
  private readonly screen = new THREE.Group();
  private readonly tiles: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly seams: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly fragments: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly dummy = new THREE.Object3D();
  private releasedAt: number | null = null;
  private disposed = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3, attacker: THREE.Vector3,
    readonly startedAt: number, private readonly blockedDamage: number, height = 2.8) {
    this.root.name = 'Spellblock';
    this.root.position.copy(position);
    const forward = attacker.clone().sub(position).setY(0);
    if (forward.lengthSq() < 0.001) forward.set(0, 0, 1);
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.normalize());
    this.screen.position.set(0, height * 0.52, 0.95);
    const tileGeometry = new THREE.BoxGeometry(0.43, height * 0.23, 0.055);
    const edgeGeometry = new THREE.EdgesGeometry(tileGeometry);
    for (let i = 0; i < 12; i++) {
      const tile = new THREE.Mesh(tileGeometry, new THREE.MeshBasicMaterial({
        color: 0x39dfc6, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      }));
      const seam = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
        color: 0xa2ffe8, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      tile.add(seam);
      this.tiles.push(tile);
      this.seams.push(seam);
      this.screen.add(tile);
    }
    this.fragments = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd779, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 48);
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.frustumCulled = false;
    this.root.add(this.screen, this.fragments);
    this.root.traverse(part => { part.raycast = () => {}; });
    scene.add(this.root);
    this.update(startedAt);
  }

  impact(time: number) { this.releasedAt ??= time; }

  update(time: number, position?: THREE.Vector3): boolean {
    if (this.disposed) return false;
    if (position) this.root.position.copy(position);
    const age = Math.max(0, time - this.startedAt);
    const elapsed = this.releasedAt === null ? -1 : Math.max(0, time - this.releasedAt);
    if (elapsed >= 1350 || age >= 15000) { this.dispose(); return false; }
    const hit = elapsed < 0 ? 0 : Math.exp(-elapsed / 150);
    const dissolve = elapsed < 0 ? 0 : THREE.MathUtils.clamp((elapsed - 180) / 430, 0, 1);
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      const column = i % 3 - 1;
      const row = Math.floor(i / 3) - 1.5;
      const assemble = THREE.MathUtils.clamp((age - (i % 3) * 35 - Math.floor(i / 3) * 25) / 220, 0, 1);
      const ease = 1 - (1 - assemble) ** 3;
      tile.position.set(column * (0.48 + dissolve * 0.15),
        row * this.screen.position.y * 0.47 + (1 - ease) * (row < 0 ? -0.7 : 0.7),
        Math.abs(column) * -0.14 - hit * 0.12);
      tile.rotation.y = column * -0.18 + (1 - ease) * Math.PI / 2;
      tile.scale.setScalar(Math.max(0.001, ease * (1 - dissolve)));
      tile.material.color.setHex(hit > 0.3 ? 0xffdf91 : 0x39dfc6);
      tile.material.opacity = ease * (1 - dissolve) * (0.2 + hit * 0.65);
      this.seams[i].material.opacity = ease * (1 - dissolve) * (0.65 + hit * 0.35);
    }
    // Fragments start across the wall and bend inward to the defender, never toward the attacker.
    const absorb = elapsed < 0 ? 0 : THREE.MathUtils.clamp((elapsed - 240) / 1050, 0, 1);
    this.fragments.visible = elapsed >= 240;
    this.fragments.material.opacity = Math.sin(absorb * Math.PI) * 0.95;
    for (let i = 0; i < this.fragments.count; i++) {
      const progress = THREE.MathUtils.clamp((absorb - (i % 6) * 0.035) / 0.8, 0, 1);
      const remaining = 1 - progress;
      const x = (i % 6 - 2.5) * 0.23;
      const y = (Math.floor(i / 6) - 3.5) * this.screen.position.y * 0.23;
      this.dummy.position.set(x * remaining + Math.sin(progress * Math.PI) * Math.sign(x) * 0.25,
        this.screen.position.y + y * remaining + Math.sin(progress * Math.PI) * 0.3,
        0.95 * remaining);
      this.dummy.rotation.set(progress * 5 + i, progress * 3, i);
      this.dummy.scale.setScalar((0.035 + Math.min(3, Math.max(0, this.blockedDamage)) * 0.012) * remaining);
      this.dummy.updateMatrix();
      this.fragments.setMatrixAt(i, this.dummy.matrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse(part => {
      if (!(part instanceof THREE.Mesh || part instanceof THREE.LineSegments)) return;
      geometries.add(part.geometry);
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
    });
    this.fragments.dispose();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }
}
