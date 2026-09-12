import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setSpectreReplicaTransparency } from '../src/spectreVisuals.ts';

const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.58, depthWrite: false });
const originalVersion = material.version;
setSpectreReplicaTransparency(material, 0.62);

assert.equal(material.transparent, false);
assert.equal(material.opacity, 0.62);
assert.equal(material.depthWrite, true);
assert.equal(material.alphaHash, false);
assert.equal(material.alphaToCoverage, true);
assert(material.version > originalVersion);

console.log('Spectre replica uses depth-safe MSAA transparency.');
