import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const optimizedPath = path.join(repoRoot, 'public', 'models', 'da-orkh-optimized.glb');
const fullPath = path.join(repoRoot, 'public', 'models', 'da-orkh.glb');
const outputPath = path.join(repoRoot, 'public', 'models', 'da-orkh-optimized-skill03.glb');
const animationName = 'DaOrkh_Skill_03';

function readGlb(filepath) {
  const data = fs.readFileSync(filepath);
  if (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2) {
    throw new Error(`${filepath} is not a GLB 2.0 file`);
  }
  let offset = 12;
  let json;
  let binary = Buffer.alloc(0);
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') json = JSON.parse(chunk.toString('utf8').trimEnd());
    if (type === 'BIN\0') binary = Buffer.from(chunk);
    offset += 8 + length;
  }
  if (!json) throw new Error(`${filepath} has no JSON chunk`);
  return { json, binary };
}

function padded(buffer, byte = 0) {
  const padding = (4 - buffer.length % 4) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, byte)]) : buffer;
}

function writeGlb(filepath, json, binary) {
  const jsonChunk = padded(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = padded(binary);
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binChunk.length);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.write('JSON', 16, 'ascii');
  jsonChunk.copy(output, 20);
  const binHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binChunk.length, binHeader);
  output.write('BIN\0', binHeader + 4, 'ascii');
  binChunk.copy(output, binHeader + 8);
  fs.writeFileSync(filepath, output);
}

const optimized = readGlb(optimizedPath);
const full = readGlb(fullPath);
const sourceAnimation = full.json.animations?.find((animation) => animation.name === animationName);
if (!sourceAnimation) throw new Error(`${animationName} is missing from ${fullPath}`);
if (optimized.json.animations?.some((animation) => animation.name === animationName)) {
  throw new Error(`${animationName} already exists in ${optimizedPath}`);
}

const targetNodeByName = new Map(optimized.json.nodes.map((node, index) => [node.name, index]));
const accessorMap = new Map();
let outputBinary = Buffer.from(optimized.binary);
optimized.json.bufferViews ??= [];
optimized.json.accessors ??= [];

function copyAccessor(sourceIndex) {
  if (accessorMap.has(sourceIndex)) return accessorMap.get(sourceIndex);
  const sourceAccessor = full.json.accessors[sourceIndex];
  if (!sourceAccessor || sourceAccessor.sparse || sourceAccessor.bufferView === undefined) {
    throw new Error(`Unsupported accessor ${sourceIndex} in ${animationName}`);
  }
  const sourceView = full.json.bufferViews[sourceAccessor.bufferView];
  if (!sourceView || sourceView.buffer !== 0) throw new Error(`Unsupported buffer view for accessor ${sourceIndex}`);
  outputBinary = padded(outputBinary);
  const byteOffset = outputBinary.length;
  const sourceOffset = sourceView.byteOffset ?? 0;
  outputBinary = Buffer.concat([
    outputBinary,
    full.binary.subarray(sourceOffset, sourceOffset + sourceView.byteLength),
  ]);
  const targetViewIndex = optimized.json.bufferViews.length;
  optimized.json.bufferViews.push({ ...sourceView, buffer: 0, byteOffset });
  const targetAccessorIndex = optimized.json.accessors.length;
  optimized.json.accessors.push({ ...sourceAccessor, bufferView: targetViewIndex });
  accessorMap.set(sourceIndex, targetAccessorIndex);
  return targetAccessorIndex;
}

const mergedAnimation = {
  ...sourceAnimation,
  samplers: sourceAnimation.samplers.map((sampler) => ({
    ...sampler,
    input: copyAccessor(sampler.input),
    output: copyAccessor(sampler.output),
  })),
  channels: sourceAnimation.channels.map((channel) => {
    const sourceNode = full.json.nodes[channel.target.node];
    const targetNode = targetNodeByName.get(sourceNode?.name);
    if (targetNode === undefined) throw new Error(`Optimized GLB is missing animated node ${sourceNode?.name}`);
    return { ...channel, target: { ...channel.target, node: targetNode } };
  }),
};

optimized.json.animations ??= [];
optimized.json.animations.push(mergedAnimation);
optimized.json.buffers[0].byteLength = outputBinary.length;
writeGlb(outputPath, optimized.json, outputBinary);

console.log(JSON.stringify({
  outputPath,
  bytes: fs.statSync(outputPath).size,
  animation: animationName,
  channels: mergedAnimation.channels.length,
  remappedAccessors: accessorMap.size,
}, null, 2));
