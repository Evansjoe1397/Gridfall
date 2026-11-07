import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SmoothCamera, cameraWheelScale } from '../src/smooth-camera.ts';

function fixture(theta = 0) {
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
  const target = new THREE.Vector3();
  camera.position.setFromSpherical(new THREE.Spherical(20, 1, theta));
  camera.lookAt(target);
  const motion = new SmoothCamera(camera, target);
  return { camera, target, motion };
}
function orbit(state: ReturnType<typeof fixture>, radians: number) {
  state.motion.input(() => state.camera.position.sub(state.target)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), radians).add(state.target));
}
function zoom(state: ReturnType<typeof fixture>, scale: number) {
  state.motion.input(() => state.camera.position.sub(state.target).multiplyScalar(scale).add(state.target));
}
function close(actual: THREE.Vector3, expected: THREE.Vector3, label: string) {
  assert.ok(actual.distanceTo(expected) < 1e-8, label);
}

const wheel = fixture();
const before = wheel.camera.position.clone();
zoom(wheel, cameraWheelScale(-100, 0));
close(wheel.camera.position, before, 'Wheel events must not jump the displayed camera');
let previousDistance = 20;
for (let frame = 0; frame < 12; frame++) {
  wheel.motion.update(1 / 60);
  const distance = wheel.camera.position.distanceTo(wheel.target);
  assert.ok(distance < previousDistance, 'Zoom must advance between wheel events on every frame');
  assert.ok(distance > 19, 'Zoom must approach the requested radius without overshooting');
  previousDistance = distance;
}

const results = [30, 60, 144].map(fps => {
  const state = fixture();
  orbit(state, 1.2);
  zoom(state, 0.6);
  state.motion.input(() => {
    state.target.add(new THREE.Vector3(4, 0, -3));
    state.camera.position.add(new THREE.Vector3(4, 0, -3));
  });
  for (let frame = 0; frame < fps; frame++) state.motion.update(1 / fps);
  return state;
});
for (const state of results.slice(1)) {
  close(state.camera.position, results[0].camera.position, 'Smoothing must be independent of frame rate');
  close(state.target, results[0].target, 'Pan must be independent of frame rate');
}

const burst = fixture(), split = fixture();
orbit(burst, 0.8); zoom(burst, 0.7);
for (let i = 0; i < 8; i++) { orbit(split, 0.1); zoom(split, Math.pow(0.7, 1 / 8)); }
for (let i = 0; i < 20; i++) { burst.motion.update(1 / 60); split.motion.update(1 / 60); }
close(burst.camera.position, split.camera.position, 'Input packets must accumulate instead of being lost or applied twice');

const wrap = fixture(Math.PI - 0.02);
orbit(wrap, 0.04);
wrap.motion.update(1 / 60);
assert.ok(wrap.camera.position.z < -10, 'Crossing ±π must not spin the long way around');
assert.ok(Math.abs(wrap.camera.position.x) < 0.4);

orbit(wrap, 1);
wrap.target.set(2, 0, 3);
wrap.camera.position.set(12, 18, 15);
wrap.motion.reset();
const reset = wrap.camera.position.clone();
wrap.motion.update(1);
close(wrap.camera.position, reset, 'Home/fit must cancel old orbit/zoom/pan destinations');

assert.equal(cameraWheelScale(0, 0), 1);
assert.equal(cameraWheelScale(3, 1), cameraWheelScale(48, 0));
assert.equal(cameraWheelScale(1, 2), cameraWheelScale(100, 0));
assert.ok(Math.abs(cameraWheelScale(100, 0) * cameraWheelScale(-100, 0) - 1) < 1e-12);
assert.equal(cameraWheelScale(10, 0, true), cameraWheelScale(100, 0));
console.log('Smooth camera checks passed: no input-time jumps, per-frame zoom, 30/60/144 Hz, packet accumulation, angle wrapping and reset.');
