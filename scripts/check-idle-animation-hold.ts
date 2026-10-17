import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IdleAnimationHold, effectIdleHoldActive } from '../src/idleAnimationHold.ts';

function character() {
  const model = new THREE.Group();
  const bone = new THREE.Object3D(); bone.name = 'Bone'; model.add(bone);
  const mixer = new THREE.AnimationMixer(model);
  const action = (name: string, height: number) => mixer.clipAction(new THREE.AnimationClip(name, 2, [new THREE.VectorKeyframeTrack('Bone.position', [0, 2], [0, height, 0, 0, height + 2, 0])]));
  const actions = { Idle: action('Idle', 0), Flip: action('Flip', 10), Dance_Through: action('Dance_Through', 20), Conjure: action('Conjure', 30) };
  actions.Idle.play();
  return { mixer, actions, current: 'Idle', bone };
}

const hold = new IdleAnimationHold();
const actor = character(), enemy = character();
actor.actions.Idle.stop(); actor.current = 'Flip'; actor.actions.Flip.play();
enemy.mixer.update(.5);
hold.sync(actor, true); hold.sync(enemy, true);
for (let frame = 0; frame < 60; frame++) {
  actor.mixer.update(1 / 60); enemy.mixer.update(1 / 60);
  hold.sync(actor, true); hold.sync(enemy, true);
}
assert.ok(actor.actions.Flip.time > .99, 'The active effect keeps advancing');
assert.equal(enemy.actions.Idle.time, 0, 'Enemy holds the neutral idle pose');
assert.equal(enemy.bone.position.y, 0);
assert.equal(actor.actions.Idle.time, 0);
actor.actions.Flip.stop(); actor.current = 'Dance_Through'; actor.actions.Dance_Through.play();
actor.mixer.update(.5); hold.sync(actor, true);
assert.equal(actor.actions.Dance_Through.time, .5, 'Dance Through is not paused by idle holding');
actor.actions.Dance_Through.stop(); actor.current = 'Idle'; actor.actions.Idle.reset().play();
hold.sync(actor, true); actor.mixer.update(5);
assert.equal(actor.actions.Idle.time, 0, 'Idle resets from finishing effects are immediately held');
hold.sync(actor, false); hold.sync(enemy, false);
enemy.mixer.update(.25);
assert.equal(enemy.actions.Idle.time, .25, 'Idle resumes when effects finish');
assert.equal(enemy.bone.position.y, .25);

enemy.actions.Idle.stop(); enemy.current = 'Conjure'; enemy.actions.Conjure.play();
hold.sync(enemy, true);
assert.equal(enemy.current, 'Idle', 'Ambient performances return to neutral idle');
assert.equal(enemy.actions.Conjure.isRunning(), false);
hold.sync(enemy, false);
enemy.actions.Idle.paused = true;
hold.sync(enemy, true); hold.sync(enemy, false);
assert.equal(enemy.actions.Idle.paused, true, 'Preserve a naturally paused idle clip');

assert.equal(effectIdleHoldActive('double-jump', false, false, false), true, 'Hold while choosing the second jump');
assert.equal(effectIdleHoldActive('dance-through', false, false, false), true);
assert.equal(effectIdleHoldActive('active', false, false, true), true, 'Hold through the final step after the rules phase changes');
assert.equal(effectIdleHoldActive('active', true, true, false), true, 'Hold through delayed post-combat visuals');
assert.equal(effectIdleHoldActive('active', true, false, false), false, 'Release when the sequence finishes');
assert.equal(effectIdleHoldActive('active', false, true, false), false, 'Ordinary non-combat effects do not freeze idle');
console.log('Idle hold checks passed: stationary actor/enemy poses, uninterrupted effects, ambient suppression and resume.');
