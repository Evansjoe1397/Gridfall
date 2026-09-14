import fs from 'node:fs';

// Strip unused clips and repack only reachable accessor/image data, without touching geometry.
const input = process.argv[2] ?? 'experiments/Merylin_Game_Export.glb';
const output = process.argv[3] ?? 'public/models/merylin-pendragon.glb';
const data = fs.readFileSync(input);
if (data.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected GLB');
const length = data.readUInt32LE(12);
const gltf = JSON.parse(data.subarray(20, 20 + length).toString());
const binary = data.subarray(28 + length);
const required = ['Idle', 'Idle_Wielding', 'Casual_Walk', 'Running', 'Dead', 'Alert', 'Alert_Wielding', 'Boom_Dance', 'You_Groove', 'Attack_Swing', 'Attack_DoubleSwing', 'Attack'];
gltf.animations = required.map(name => {
  const aliases = { Attack_Swing: '01a09665-6bca-7173-9f59-5bff3d5f7dbd', Attack_DoubleSwing: '01a00a06-8623-7205-82b1-244c660595dc' };
  const clip = gltf.animations.find(a => a.name === name || a.name === aliases[name]);
  if (!clip) throw new Error(`Missing ${name}`);
  clip.name = name;
  return clip;
});
const accessorIds = new Set();
for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
  Object.values(p.attributes).forEach(i => accessorIds.add(i));
  if (p.indices !== undefined) accessorIds.add(p.indices);
  for (const target of p.targets ?? []) Object.values(target).forEach(i => accessorIds.add(i));
}
for (const skin of gltf.skins ?? []) if (skin.inverseBindMatrices !== undefined) accessorIds.add(skin.inverseBindMatrices);
for (const animation of gltf.animations) for (const s of animation.samplers) { accessorIds.add(s.input); accessorIds.add(s.output); }
const accessorMap = new Map([...accessorIds].map((i, n) => [i, n]));
gltf.accessors = [...accessorIds].map(i => gltf.accessors[i]);
for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
  for (const k in p.attributes) p.attributes[k] = accessorMap.get(p.attributes[k]);
  if (p.indices !== undefined) p.indices = accessorMap.get(p.indices);
  for (const target of p.targets ?? []) for (const k in target) target[k] = accessorMap.get(target[k]);
}
for (const skin of gltf.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorMap.get(skin.inverseBindMatrices);
for (const animation of gltf.animations) for (const s of animation.samplers) { s.input = accessorMap.get(s.input); s.output = accessorMap.get(s.output); }
const refs = [];
for (const a of gltf.accessors) {
  if (a.bufferView !== undefined) refs.push(a);
  if (a.sparse) refs.push(a.sparse.indices, a.sparse.values);
}
refs.push(...gltf.images.filter(i => i.bufferView !== undefined));
const views = [...new Set(refs.map(r => r.bufferView))];
const viewMap = new Map(views.map((v, i) => [v, i]));
const chunks = []; let offset = 0;
gltf.bufferViews = views.map(i => {
  const v = gltf.bufferViews[i];
  const chunk = Buffer.alloc(Math.ceil(v.byteLength / 4) * 4);
  binary.copy(chunk, 0, v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  chunks.push(chunk);
  const next = { ...v, buffer: 0, byteOffset: offset };
  offset += chunk.length;
  return next;
});
for (const r of refs) r.bufferView = viewMap.get(r.bufferView);
gltf.buffers = [{ byteLength: offset }];
const json = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(jsonChunk);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonChunk.length + offset, 8);
header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(offset); binHeader.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(output, Buffer.concat([header, jsonChunk, binHeader, ...chunks]));
console.log(JSON.stringify({ output, MiB: fs.statSync(output).size / 1048576, clips: required, meshes: gltf.meshes.length, skins: gltf.skins.length }, null, 2));
