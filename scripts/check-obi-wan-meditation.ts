import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { advanceMeditation, interruptObiWanMeditation, updateObiWanMeditation } from '../src/obiWanMeditation.ts';

const state = { lastActivity: 0, blend: 0 };
assert.equal(advanceMeditation(state, 19_999, 0.1, false, true), false);
assert.equal(advanceMeditation(state, 20_000, 0.325, false, true), true);
assert.equal(state.blend, 0.5);
advanceMeditation(state, 20_325, 0.325, false, true);
assert.equal(state.blend, 1);
assert.equal(advanceMeditation(state, 3_600_000, 0.1, false, true), true, 'Meditation remains active indefinitely');
assert.equal(advanceMeditation(state, 3_600_001, 0.325, true, true), false);
assert.equal(state.blend, 0.5, 'Exit reverses the transition');
assert.equal(advanceMeditation(state, 3_620_000, 0.325, false, true), false, 'Activity restarts the full timeout');
assert.equal(state.blend, 0);
assert.equal(advanceMeditation(state, 3_620_001, 0.1, false, false), false, 'Missing asset keeps the regular idle');

const root = new THREE.Group();
const normal = new THREE.Group();
normal.name = 'ObiWanImportedModel';
root.add(normal);
normal.visible = false;
interruptObiWanMeditation(root, 100);
assert.equal(normal.visible, true, 'Input reveals the normal rig immediately');
updateObiWanMeditation(root, 0.1, true, 101);
assert.equal(normal.visible, true);

const bytes = fs.readFileSync('public/models/obi-wan-meditation.glb');
// Allow the extra seam vertices needed to avoid atlas stretching on the robe.
assert.ok(bytes.length < 1.5 * 1024 * 1024, 'Meditation stays below 1.5 MiB');
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
assert.equal(gltf.meshes.length, 1);
assert.equal(gltf.animations?.length ?? 0, 0);
assert.ok(gltf.accessors[gltf.meshes[0].primitives[0].indices].count <= 105_000);
console.log('Meditation timing, interruption, fallback, and asset budget checks passed.');
