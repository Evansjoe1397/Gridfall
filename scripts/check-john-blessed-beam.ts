import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JohnBlessedBeam, JOHN_BEAM_HOLD_MS, johnBeamTravelMs } from '../src/johnBlessedBeam.ts';
import { JOHN_BLESSED_BEAM_RELEASE_SECONDS, johnAnimationAvailableInForm, johnAttackAnimation, johnAttackPlaybackRate, johnAttackReleaseSeconds, johnAttackUsesProjectile } from '../src/johnChristLocomotion.ts';

for (const card of ['blessed-might', 'blessed-light']) {
  const animation = johnAttackAnimation(card);
  assert.equal(animation, 'BlessedBeam');
  assert.equal(johnAttackUsesProjectile(card), false, 'Blessed attacks use the sustained beam instead of the old projectile.');
  assert.equal(johnAttackReleaseSeconds(animation), 24 / 24, 'Release is source frame 25 after rebasing source frame 1 to zero.');
  assert.equal(johnAttackPlaybackRate(animation), 2);
  assert.equal(JOHN_BLESSED_BEAM_RELEASE_SECONDS / johnAttackPlaybackRate(animation), 0.5);
  assert.equal(johnAnimationAvailableInForm(animation, true), false);
}

for (const style of ['light', 'might'] as const) {
  for (const distance of [1.92, 5.76]) {
    const origin = new THREE.Vector3(0, 2.4, 0);
    const target = new THREE.Vector3(distance, 1.25, 0);
    let hits = 0;
    const effect = new JohnBlessedBeam(1000, distance, () => hits++, style);
    const scene = new THREE.Scene();
    scene.add(effect.group);
    assert.equal(effect.update(1000, origin, target), false);
    effect.update(1000 + effect.travelMs - 0.01, origin, target);
    assert.equal(hits, 0, 'Damage cannot appear before the beam front reaches its target.');
    origin.add(new THREE.Vector3(0.2, 0.1, -0.1));
    target.z += 0.25;
    effect.update(1000 + effect.travelMs, origin, target);
    assert.equal(hits, 1);
    assert(effect.group.getObjectByName('StaffHeadLightHalo')!.position.equals(origin), 'Halo follows the staff socket.');
    assert(effect.group.getObjectByName('BlessedBeamImpact')!.position.equals(target), 'Impact follows the enemy model.');
    effect.update(1000 + effect.travelMs + JOHN_BEAM_HOLD_MS / 2, origin, target);
    assert.equal(hits, 1, 'Sustained beam must not deal repeated damage.');
    assert.equal(effect.update(effect.endsAt + 500, origin, target), true, 'A delayed frame still finishes the effect.');
    assert.equal(hits, 1);
    const lights: number[] = [];
    effect.group.traverse((part) => { if (part instanceof THREE.PointLight) lights.push(part.color.getHex()); });
    assert.deepEqual(lights, style === 'might' ? [0xff1838, 0xff4160] : [0xffdc87, 0xffefb8]);
    const geometries = new Set<THREE.BufferGeometry>();
    effect.group.traverse((part) => { if (part instanceof THREE.Mesh) geometries.add(part.geometry); });
    let disposed = 0;
    geometries.forEach((geometry) => geometry.addEventListener('dispose', () => disposed++));
    effect.dispose();
    assert.equal(effect.group.parent, null);
    assert.equal(disposed, geometries.size, 'Shared spark geometry is disposed exactly once.');
  }
}
assert(johnBeamTravelMs(5.76) > johnBeamTravelMs(1.92));
let lateHits = 0;
const late = new JohnBlessedBeam(0, 2, () => lateHits++);
assert.equal(late.update(late.endsAt + 100, new THREE.Vector3(), new THREE.Vector3(2, 1, 0)), true);
assert.equal(lateHits, 1, 'Skipping the entire effect still releases the pending impact once.');
late.dispose();
console.log('Blessed beam routing, frame-25 timing, arrival, hold, color variants, and cleanup checks passed.');
