import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stabilizeOrkkHeldProps } from '../src/orkkHeldProps.ts';

class NodeProgressEvent {
  type: string;
  loaded: number;
  total: number;
  lengthComputable: boolean;

  constructor(type: string, init: { loaded?: number; total?: number } = {}) {
    this.type = type;
    this.loaded = init.loaded ?? 0;
    this.total = init.total ?? 0;
    this.lengthComputable = this.total > 0;
  }
}

(globalThis as typeof globalThis & { ProgressEvent?: typeof NodeProgressEvent }).ProgressEvent ??= NodeProgressEvent;

function stripGlbMaterials(data: Buffer) {
  let offset = 12;
  let json: any;
  let binary = Buffer.alloc(0);
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') json = JSON.parse(chunk.toString('utf8').trimEnd());
    if (type === 'BIN\0') binary = Buffer.from(chunk);
    offset += 8 + length;
  }
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) delete primitive.material;
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.samplers;
  const jsonBody = Buffer.from(JSON.stringify(json));
  const jsonPadding = (4 - jsonBody.length % 4) % 4;
  const jsonChunk = Buffer.concat([jsonBody, Buffer.alloc(jsonPadding, 0x20)]);
  const binaryPadding = (4 - binary.length % 4) % 4;
  const binaryChunk = Buffer.concat([binary, Buffer.alloc(binaryPadding)]);
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binaryChunk.length);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.write('JSON', 16, 'ascii');
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binaryChunk.length, binaryHeader);
  output.write('BIN\0', binaryHeader + 4, 'ascii');
  binaryChunk.copy(output, binaryHeader + 8);
  return output;
}

const filepath = path.resolve('public/models/da-orkh-optimized-skill03.glb');
const stripped = stripGlbMaterials(fs.readFileSync(filepath));
const arrayBuffer = stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength) as ArrayBuffer;
const asset = await new Promise<Awaited<ReturnType<GLTFLoader['parseAsync']>>>((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
});
const model = asset.scene as THREE.Group;
stabilizeOrkkHeldProps(model);
const clip = asset.animations.find((animation) => animation.name === 'DaOrkh_Skill_03');
assert.ok(clip, 'Runtime GLB contains Skill 03');
const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(clip).play();
mixer.setTime(28 / 24);
model.updateWorldMatrix(true, true);

for (const [propName, handName] of [['Ironbound_Obelisk', 'LeftHand'], ['Bloodcore_Scepter', 'RightHand']] as const) {
  const prop = model.getObjectByName(propName);
  const hand = model.getObjectByName(handName);
  assert.ok(prop && hand, `${propName} and ${handName} exist`);
  const center = new THREE.Box3().setFromObject(prop).getCenter(new THREE.Vector3());
  const handPosition = hand.getWorldPosition(new THREE.Vector3());
  assert.ok(center.distanceTo(handPosition) < 2, `${propName} remains attached at Skill 03 frame 28`);
}

console.log('Da Orkk held-prop checks passed.');
