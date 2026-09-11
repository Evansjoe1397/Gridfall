import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const [directory, output] = process.argv.slice(2);
assert(directory && output, 'Usage: node scripts/merge-meshy-animations.mjs INPUT_DIRECTORY OUTPUT.glb');
assert(!fs.existsSync(output), 'Output already exists; choose a new filename');
const files = fs.readdirSync(directory).filter(f => f.endsWith('.glb')).sort();
const alertIndex=files.findIndex(f=>f.endsWith('_Animation_Alert_withSkin.glb'));
if(alertIndex>=0) files.unshift(...files.splice(alertIndex,1));
const read = f => {
  const data = fs.readFileSync(path.join(directory, f));
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString());
  return {json, bin: data.subarray(28 + length), size: data.length};
};
const sources = files.map(read);
const base = sources[0];
const viewBytes = (src, id) => {
  const v = src.json.bufferViews[id];
  assert.equal(v.buffer, 0);
  return src.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
};
const accessorFingerprint = (src, id) => {
  const a = src.json.accessors[id];
  assert(!a.sparse && a.bufferView !== undefined, 'Sparse/accessor without buffer unsupported');
  return {...a, bufferView: crypto.createHash('sha256').update(viewBytes(src, a.bufferView)).digest('hex')};
};
const geometry = src => JSON.stringify({
  nodes: src.json.nodes.map((node, id) => {
    const copy = {...node};
    // Meshy uses two labels for the same non-joint root container.
    if (['Armature', 'target_character'].includes(copy.name) && !src.json.skins.some(s => s.joints.includes(id))) copy.name = 'MeshyRoot';
    for (const animation of src.json.animations) for (const channel of animation.channels) {
      if(channel.target.node === id) delete copy[channel.target.path];
    }
    return copy;
  }),
  skins: src.json.skins.map(s => ({...s, inverseBindMatrices: accessorFingerprint(src, s.inverseBindMatrices)})),
  meshes: src.json.meshes.map(m => ({...m, primitives: m.primitives.map(p => ({...p, indices: accessorFingerprint(src,p.indices), attributes: Object.fromEntries(Object.entries(p.attributes).map(([k,v]) => [k,accessorFingerprint(src,v)]))}))})),
  materials: src.json.materials.map(m => {
    const copy=structuredClone(m);
    // Some Meshy clips omit roughness; retain the Alert base material for all clips.
    delete copy.pbrMetallicRoughness?.roughnessFactor;
    return copy;
  }),
  images: (src.json.images ?? []).map(i => ({...i, bufferView: crypto.createHash('sha256').update(viewBytes(src,i.bufferView)).digest('hex')}))
});
const expected = geometry(base);
for (let i=0;i<sources.length;i++) {
  const actual=JSON.parse(geometry(sources[i])), reference=JSON.parse(expected);
  for(const key of Object.keys(reference)) assert(JSON.stringify(actual[key]) === JSON.stringify(reference[key]), `${key} differs: ${files[i]}`);
}
const merged = structuredClone(base.json);
merged.animations = [];
const chunks = [base.bin];
let offset = base.bin.length;
for (let i=0;i<sources.length;i++) {
  const src=sources[i], views=new Map(), accessors=new Map();
  const copyAccessor = id => {
    if(accessors.has(id)) return accessors.get(id);
    const a=structuredClone(src.json.accessors[id]);
    assert(!a.sparse && a.bufferView !== undefined);
    if(!views.has(a.bufferView)) {
      const pad=(4-offset%4)%4; chunks.push(Buffer.alloc(pad)); offset+=pad;
      const bytes=viewBytes(src,a.bufferView);
      views.set(a.bufferView,merged.bufferViews.length);
      merged.bufferViews.push({...src.json.bufferViews[a.bufferView],buffer:0,byteOffset:offset});
      chunks.push(bytes); offset+=bytes.length;
    }
    a.bufferView=views.get(a.bufferView);
    accessors.set(id,merged.accessors.length); merged.accessors.push(a);
    return accessors.get(id);
  };
  for(const [n, animation] of src.json.animations.entries()) {
    const a=structuredClone(animation);
    a.name=files[i].replace(/^.*_Animation_/, '').replace(/_withSkin\.glb$/, '')+(src.json.animations.length>1?`_${n}`:'');
    a.samplers=a.samplers.map(s=>({...s,input:copyAccessor(s.input),output:copyAccessor(s.output)}));
    merged.animations.push(a);
  }
}
merged.buffers=[{byteLength:offset}];
const jsonRaw=Buffer.from(JSON.stringify(merged));
const json=Buffer.concat([jsonRaw,Buffer.alloc((4-jsonRaw.length%4)%4,32)]);
const bin=Buffer.concat([...chunks,Buffer.alloc((4-offset%4)%4)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(output,Buffer.concat([header,json,binHeader,bin]));
console.log(JSON.stringify({files:files.length,sourceMiB:sources.reduce((n,s)=>n+s.size,0)/1048576,mergedMiB:fs.statSync(output).size/1048576,meshes:merged.meshes.length,skins:merged.skins.length,triangles:merged.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+merged.accessors[p.indices].count/3,0),0),animations:merged.animations.map(a=>a.name)},null,2));
