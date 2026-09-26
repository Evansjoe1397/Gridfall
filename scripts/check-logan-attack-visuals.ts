import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LoganAttackVisual, type LoganSpell } from '../src/loganAttackVisuals.ts';

for (const spell of ['arcane-bolt', 'mana-blast'] as LoganSpell[]) {
  for (const consume of [false, true]) {
    for (const destination of [new THREE.Vector3(3, 1, -2), new THREE.Vector3(0, 1, 0)]) {
      const scene = new THREE.Scene();
      let hits = 0;
      const visual = new LoganAttackVisual(scene, new THREE.Vector3(0, 1, 0), destination, spell, consume, 1000, () => hits++);
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      const disposals = new Map<object, number>();
      visual.root.traverse(part => {
        if (!(part instanceof THREE.Mesh)) return;
        resources.add(part.geometry);
        for (const material of Array.isArray(part.material) ? part.material : [part.material]) resources.add(material);
      });
      for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
      const impactAt = 1000 + 180 + (spell === 'arcane-bolt' ? 420 : 540);
      visual.update(impactAt - 1);
      assert.equal(hits, 0, 'Damage must wait until the projectile arrives.');
      visual.update(impactAt);
      assert.equal(hits, 1, 'Blocked and damaging attacks share one impact callback.');
      for (let time = impactAt; time < impactAt + 850; time += 16) {
        assert.equal(visual.update(time), true);
        visual.root.updateMatrixWorld(true);
        visual.root.traverse(part => {
          assert.ok(part.matrixWorld.elements.every(Number.isFinite));
          if (part instanceof THREE.InstancedMesh) assert.ok(Array.from(part.instanceMatrix.array).every(Number.isFinite));
        });
      }
      assert.equal(visual.update(impactAt + 850), false);
      visual.dispose();
      assert.equal(visual.update(impactAt + 900), false);
      assert.equal(hits, 1);
      assert.equal(scene.children.length, 0);
      for (const resource of resources) assert.equal(disposals.get(resource), 1, 'Release each GPU resource exactly once.');
    }
  }
}

// A backgrounded tab may skip directly beyond the full visual lifetime.
const scene = new THREE.Scene();
let lateHits = 0;
const late = new LoganAttackVisual(scene, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 'mana-blast', false, 0, () => lateHits++);
assert.equal(late.update(10000), false);
assert.equal(lateHits, 1, 'A skipped frame must not leave combat waiting forever.');
let cancelledHits = 0;
const cancelled = new LoganAttackVisual(scene, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), 'arcane-bolt', false, 0, () => cancelledHits++);
cancelled.dispose();
cancelled.update(10000);
assert.equal(cancelledHits, 0, 'Resetting a match must discard callbacks from its previous combat.');
assert.equal(scene.children.length, 0);
console.log('Logan spell visuals: impact timing, finite transforms, skipped frames, cancellation, and resource cleanup passed.');
