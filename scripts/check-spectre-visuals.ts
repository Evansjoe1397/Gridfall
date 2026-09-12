import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeSpectreReplicaMaterialOpaque } from '../src/spectreVisuals.ts';

const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.58, depthWrite: false });
const originalVersion = material.version;
makeSpectreReplicaMaterialOpaque(material);

assert.equal(material.transparent, false);
assert.equal(material.opacity, 1);
assert.equal(material.depthWrite, true);
assert.equal(material.alphaHash, false);
assert.equal(material.alphaToCoverage, false);
assert(material.version > originalVersion);

console.log('Spectre replica materials are fully opaque.');
