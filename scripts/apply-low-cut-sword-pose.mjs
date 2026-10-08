// Preserve the exact authored bone-relative saber pose only for Low_Cut.
// Usage: node scripts/apply-low-cut-sword-pose.mjs BASE.glb POSE.json OUTPUT.glb
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
const [input, posePath, output] = process.argv.slice(2);
assert(input && posePath && output && !fs.existsSync(output));
const bytes = fs.readFileSync(input), jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength));
let bin = Buffer.from(bytes.subarray(28 + jsonLength));
const clip = doc.animations.find(a => a.name === 'Low_Cut');
assert(clip && !clip.extras?.authoredSwordBoneLocalMatrix, 'Expected unmodified Low_Cut');
const swordIndex = doc.nodes.findIndex(n => n.name === 'Lightsaber');
const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
new Matrix4().set(...JSON.parse(fs.readFileSync(posePath)).boneLocalMatrix.flat()).decompose(position, rotation, scale);
function append(values, type) {
  bin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const data = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => data.writeFloatLE(value, i * 4));
  const bufferView = doc.bufferViews.length;
  doc.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: data.length });
  bin = Buffer.concat([bin, data]);
  const accessor = { bufferView, componentType: 5126, count: values.length / { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], type };
  if (type === 'SCALAR') { accessor.min = [Math.min(...values)]; accessor.max = [Math.max(...values)]; }
  doc.accessors.push(accessor);
  return doc.accessors.length - 1;
}
const duration = Math.max(...clip.samplers.map(s => doc.accessors[s.input].max[0]));
const time = append([0, duration], 'SCALAR');
for (const [path, value, type] of [['translation', position.toArray(), 'VEC3'], ['rotation', rotation.toArray(), 'VEC4']]) {
  clip.channels.push({ sampler: clip.samplers.length, target: { node: swordIndex, path } });
  clip.samplers.push({ input: time, output: append([...value, ...value], type), interpolation: 'LINEAR' });
}

clip.extras.authoredSwordBoneLocalMatrix = JSON.parse(fs.readFileSync(posePath)).boneLocalMatrix;
doc.buffers[0].byteLength = bin.length;
const raw = Buffer.from(JSON.stringify(doc)), json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 32)]);
const head = Buffer.alloc(20), binHead = Buffer.alloc(8);
head.writeUInt32LE(0x46546c67); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + json.length + bin.length, 8);
head.writeUInt32LE(json.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
binHead.writeUInt32LE(bin.length); binHead.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(output, Buffer.concat([head, json, binHead, bin]));
console.log(JSON.stringify({ swordPosition: position.toArray(), swordRotation: rotation.toArray() }));
