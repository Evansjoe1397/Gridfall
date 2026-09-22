import assert from 'node:assert/strict';
import fs from 'node:fs';

const [basePath, donorPath, animationName, outputPath, mode] = process.argv.slice(2);
const replaceExisting = mode === '--replace';
assert(basePath && donorPath && animationName && outputPath, 'Usage: node scripts/add-glb-animation.mjs BASE.glb DONOR.glb ANIMATION_NAME OUTPUT.glb [--replace]');

function readGlb(path) {
  const bytes = fs.readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path} is not a GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  return { json, binary: bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength) };
}

function pad(buffer, alignment = 4, byte = 0) {
  const remainder = buffer.length % alignment;
  return remainder ? Buffer.concat([buffer, Buffer.alloc(alignment - remainder, byte)]) : buffer;
}

const base = readGlb(basePath);
const donor = readGlb(donorPath);
assert.deepEqual(donor.json.nodes.map((node) => node.name), base.json.nodes.map((node) => node.name), 'Donor and base node order differ');
const existingAnimationIndex = base.json.animations.findIndex((animation) => animation.name === animationName);
assert(replaceExisting || existingAnimationIndex < 0, `${animationName} already exists in base GLB`);
assert(!replaceExisting || existingAnimationIndex >= 0, `${animationName} does not exist in base GLB`);
const sourceAnimation = donor.json.animations.find((animation) => animation.name === animationName)
  ?? (donor.json.animations.length === 1 ? donor.json.animations[0] : undefined);
assert(sourceAnimation, `${animationName} is missing from donor GLB`);

const accessorMap = new Map();
const bufferViewMap = new Map();
let binary = Buffer.from(base.binary);
const animation = structuredClone(sourceAnimation);
animation.name = animationName;

for (const sampler of animation.samplers) {
  for (const key of ['input', 'output']) {
    const donorAccessorIndex = sampler[key];
    if (!accessorMap.has(donorAccessorIndex)) {
      const donorAccessor = donor.json.accessors[donorAccessorIndex];
      const donorBufferViewIndex = donorAccessor.bufferView;
      if (!bufferViewMap.has(donorBufferViewIndex)) {
        const donorView = donor.json.bufferViews[donorBufferViewIndex];
        assert.equal(donorView.buffer, 0, 'Only single-buffer GLBs are supported');
        binary = pad(binary);
        const start = donorView.byteOffset ?? 0;
        const bytes = donor.binary.subarray(start, start + donorView.byteLength);
        const copiedView = { ...donorView, buffer: 0, byteOffset: binary.length };
        base.json.bufferViews.push(copiedView);
        bufferViewMap.set(donorBufferViewIndex, base.json.bufferViews.length - 1);
        binary = Buffer.concat([binary, bytes]);
      }
      base.json.accessors.push({ ...donorAccessor, bufferView: bufferViewMap.get(donorBufferViewIndex) });
      accessorMap.set(donorAccessorIndex, base.json.accessors.length - 1);
    }
    sampler[key] = accessorMap.get(donorAccessorIndex);
  }
}

if (replaceExisting) base.json.animations[existingAnimationIndex] = animation;
else base.json.animations.push(animation);
binary = pad(binary);
base.json.buffers[0].byteLength = binary.length;
const json = pad(Buffer.from(JSON.stringify(base.json)), 4, 0x20);
const output = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
output.writeUInt32LE(0x46546c67, 0);
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(json.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
json.copy(output, 20);
const binaryHeader = 20 + json.length;
output.writeUInt32LE(binary.length, binaryHeader);
output.writeUInt32LE(0x004e4942, binaryHeader + 4);
binary.copy(output, binaryHeader + 8);
fs.writeFileSync(outputPath, output);
console.log(JSON.stringify({ outputPath, bytes: output.length, animation: animationName, animations: base.json.animations.map((item) => item.name) }, null, 2));
