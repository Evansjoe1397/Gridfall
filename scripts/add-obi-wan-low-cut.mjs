// Append only the Low cut animation; retain all existing geometry and clips.
// Usage: node scripts/add-obi-wan-low-cut.mjs BASE DONOR OUTPUT
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';

const [basePath, donorPath, outputPath] = process.argv.slice(2);
assert(basePath && donorPath && outputPath);
assert(!fs.existsSync(outputPath), 'Choose a new output path');
function read(path) {
  const bytes = fs.readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const length = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + length)), bin: bytes.subarray(28 + length) };
}
const base = read(basePath), donor = read(donorPath);
const nameMap = { Spine: 'Spine02', Spine1: 'Spine01', Spine2: 'Spine', Neck: 'neck' };
const mappedName = (name) => { const short = name.replace('mixamorig:', ''); return nameMap[short] ?? short; };
const targets = new Map(base.json.nodes.map((node, i) => [node.name, i]));
const parents = (nodes) => new Map(nodes.flatMap((node, i) => (node.children ?? []).map(child => [child, i])));
const donorParents = parents(donor.json.nodes), baseParents = parents(base.json.nodes);
const rootRotation = new Quaternion().fromArray(base.json.nodes[targets.get('target_character')].rotation);
const conversion = rootRotation.clone().invert();
for (const joint of donor.json.skins[0].joints) {
  const source = donor.json.nodes[joint], targetId = targets.get(mappedName(source.name));
  assert.notEqual(targetId, undefined, `Missing ${source.name}`);
  const target = base.json.nodes[targetId];
  assert.equal(mappedName(donor.json.nodes[donorParents.get(joint)].name), base.json.nodes[baseParents.get(targetId)].name);
  const position = new Vector3().fromArray(source.translation);
  const rotation = new Quaternion().fromArray(source.rotation);
  if (target.name === 'Hips') { position.applyQuaternion(conversion); rotation.premultiply(conversion); }
  assert(position.distanceTo(new Vector3().fromArray(target.translation)) < 0.002, `Rest position mismatch: ${target.name}`);
  assert(rotation.angleTo(new Quaternion().fromArray(target.rotation).normalize()) < 0.0001, `Rest rotation mismatch: ${target.name}`);
}
assert(!base.json.animations.some(a => a.name === 'Low_Cut'));
const animation = structuredClone(donor.json.animations[0]);
assert.equal(animation.name, '01a11afa-895e-753f-b985-3f7880afb845');
animation.name = 'Low_Cut';
animation.extras = { sourceClip: donor.json.animations[0].name, blenderReviewFps: 24, hitFrame: 20 };
let binary = Buffer.from(base.bin);
function appendAccessor(index, transform) {
  const a = donor.json.accessors[index], view = donor.json.bufferViews[a.bufferView];
  assert.equal(a.componentType, 5126);
  assert(!a.sparse && !view.byteStride && !view.extensions);
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  assert(width);
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const bytes = Buffer.from(donor.bin.subarray(start, start + a.count * width * 4));
  if (transform) for (let i = 0; i < a.count; i++) {
    const values = Array.from({ length: width }, (_, j) => bytes.readFloatLE((i * width + j) * 4));
    const converted = transform(values);
    converted.forEach((value, j) => bytes.writeFloatLE(value, (i * width + j) * 4));
  }
  binary = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
  const bufferView = base.json.bufferViews.length;
  base.json.bufferViews.push({ buffer: 0, byteOffset: binary.length, byteLength: bytes.length });
  binary = Buffer.concat([binary, bytes]);
  const accessor = { ...a, bufferView, byteOffset: 0 };
  if (transform) { delete accessor.min; delete accessor.max; }
  base.json.accessors.push(accessor);
  return base.json.accessors.length - 1;
}
const inputs = new Map();
animation.samplers = animation.channels.map(channel => {
  const sampler = donor.json.animations[0].samplers[channel.sampler];
  assert.equal(sampler.interpolation ?? 'LINEAR', 'LINEAR');
  if (!inputs.has(sampler.input)) inputs.set(sampler.input, appendAccessor(sampler.input));
  const name = mappedName(donor.json.nodes[channel.target.node].name);
  let transform;
  if (name === 'Hips') {
    if (channel.target.path === 'rotation') transform = values => new Quaternion().fromArray(values).premultiply(conversion).normalize().toArray();
    if (channel.target.path === 'translation') transform = values => new Vector3().fromArray(values).applyQuaternion(conversion).toArray();
  }
  channel.target.node = targets.get(name);
  return { ...sampler, input: inputs.get(sampler.input), output: appendAccessor(sampler.output, transform) };
});
animation.channels.forEach((channel, i) => { channel.sampler = i; });
base.json.animations.push(animation);
binary = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
base.json.buffers[0].byteLength = binary.length;
const rawJson = Buffer.from(JSON.stringify(base.json));
const json = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 32)]);
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8);
header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(outputPath, Buffer.concat([header, json, binHeader, binary]));
console.log(`Mapped 23 bones; retained base assets and ${base.json.animations.length - 1} existing clips; added Low_Cut (${animation.channels.length} channels).`);
