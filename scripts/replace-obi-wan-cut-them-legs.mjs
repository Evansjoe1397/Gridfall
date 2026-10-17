// Replace the old attack using only the Mixamo bone animation. Keep the game
// model, skin, textures, default saber grip, and every unrelated animation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';

const [basePath, donorPath, outputPath] = process.argv.slice(2);
assert(basePath && donorPath && outputPath, 'Usage: node scripts/replace-obi-wan-cut-them-legs.mjs BASE DONOR OUTPUT');
assert(!fs.existsSync(outputPath), 'Choose a new output path');
function read(path) {
  const bytes=fs.readFileSync(path);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  const length=bytes.readUInt32LE(12);
  return { json:JSON.parse(bytes.subarray(20,20+length)), bin:bytes.subarray(28+length) };
}
const base=read(basePath),donor=read(donorPath);
const targets=new Map(base.json.nodes.map((node,i)=>[node.name,i]));
const parents=nodes=>new Map(nodes.flatMap((node,i)=>(node.children??[]).map(child=>[child,i])));
const bp=parents(base.json.nodes),dp=parents(donor.json.nodes);
const jointNames=new Set(base.json.skins[0].joints.map(i=>base.json.nodes[i].name));
assert.equal(donor.json.skins[0].joints.length,jointNames.size);
const mapped=name=>name==='Obi_Wan_Mixamo_Rig'?'target_character':name;
for (const id of donor.json.skins[0].joints) {
  const source=donor.json.nodes[id],target=base.json.nodes[targets.get(source.name)];
  assert(target,`Missing joint ${source.name}`);
  assert.equal(mapped(donor.json.nodes[dp.get(id)].name),base.json.nodes[bp.get(targets.get(source.name))].name);
  assert(new Vector3().fromArray(source.translation??[0,0,0]).distanceTo(new Vector3().fromArray(target.translation??[0,0,0]))<.002,`Rest translation mismatch ${source.name}`);
  assert(new Quaternion().fromArray(source.rotation??[0,0,0,1]).normalize().angleTo(new Quaternion().fromArray(target.rotation??[0,0,0,1]).normalize())<.0001,`Rest rotation mismatch ${source.name}`);
}
const source=donor.json.animations.find(a=>a.name==='Cut_Them_Legs');
assert(source);
base.json.animations=base.json.animations.filter(a=>!['Low_Cut','Cut_Them_Legs'].includes(a.name));
let binary=Buffer.from(base.bin);
const accessors=new Map();
function append(index) {
  if(accessors.has(index)) return accessors.get(index);
  const accessor=donor.json.accessors[index],view=donor.json.bufferViews[accessor.bufferView];
  assert(!accessor.sparse&&!view.byteStride&&!view.extensions);
  assert.equal(accessor.componentType,5126);
  const width={SCALAR:1,VEC3:3,VEC4:4}[accessor.type];
  assert(width);
  const start=(view.byteOffset??0)+(accessor.byteOffset??0);
  const bytes=donor.bin.subarray(start,start+accessor.count*width*4);
  binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
  const bufferView=base.json.bufferViews.length;
  base.json.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:bytes.length});
  binary=Buffer.concat([binary,bytes]);
  const result=base.json.accessors.length;
  base.json.accessors.push({...accessor,bufferView,byteOffset:0});
  accessors.set(index,result);
  return result;
}
const animation={name:'Cut_Them_Legs',samplers:[],channels:[],extras:{sourceClip:'Sword And Shield Slash',sourceFps:30,sourceFrames:[1,42]}};
for(const channel of source.channels) {
  const name=donor.json.nodes[channel.target.node].name;
  // The rig object's constant FBX channels are deliberately excluded: the
  // existing game root retains its established origin, scale, and facing.
  if(!jointNames.has(name)) continue;
  const sampler=source.samplers[channel.sampler];
  animation.channels.push({...channel,sampler:animation.samplers.length,target:{...channel.target,node:targets.get(name)}});
  animation.samplers.push({...sampler,input:append(sampler.input),output:append(sampler.output)});
}
assert.equal(animation.channels.length,72);
base.json.animations.push(animation);

// Remove all unreferenced animation accessors and their bytes, including the
// former Low_Cut saber-pose tracks. Geometry and image bytes are copied intact.
const used=new Set();
for(const mesh of base.json.meshes) for(const p of mesh.primitives) {
  if(p.indices!==undefined) used.add(p.indices);
  Object.values(p.attributes).forEach(i=>used.add(i));
  for(const target of p.targets??[]) Object.values(target).forEach(i=>used.add(i));
}
base.json.skins.forEach(s=>{if(s.inverseBindMatrices!==undefined)used.add(s.inverseBindMatrices);});
base.json.animations.forEach(a=>a.samplers.forEach(s=>{used.add(s.input);used.add(s.output);}));
const accessorMap=new Map([...used].sort((a,b)=>a-b).map((id,i)=>[id,i]));
for(const mesh of base.json.meshes) for(const p of mesh.primitives) {
  if(p.indices!==undefined)p.indices=accessorMap.get(p.indices);
  for(const key of Object.keys(p.attributes))p.attributes[key]=accessorMap.get(p.attributes[key]);
  for(const target of p.targets??[])for(const key of Object.keys(target))target[key]=accessorMap.get(target[key]);
}
base.json.skins.forEach(s=>{if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=accessorMap.get(s.inverseBindMatrices);});
base.json.animations.forEach(a=>a.samplers.forEach(s=>{s.input=accessorMap.get(s.input);s.output=accessorMap.get(s.output);}));
base.json.accessors=[...accessorMap.keys()].map(id=>base.json.accessors[id]);
const usedViews=new Set(base.json.accessors.map(a=>a.bufferView));
base.json.images.forEach(i=>{if(i.bufferView!==undefined)usedViews.add(i.bufferView);});
const viewMap=new Map();
const chunks=[];
let offset=0;
base.json.bufferViews=[...usedViews].sort((a,b)=>a-b).map(id=>{
  const view=base.json.bufferViews[id];
  assert.equal(view.buffer,0);assert(!view.extensions);
  const pad=(4-offset%4)%4;
  chunks.push(Buffer.alloc(pad));offset+=pad;
  const bytes=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const copied={...view,byteOffset:offset};
  viewMap.set(id,viewMap.size);chunks.push(bytes);offset+=bytes.length;
  return copied;
});
base.json.accessors.forEach(a=>a.bufferView=viewMap.get(a.bufferView));
base.json.images.forEach(i=>{if(i.bufferView!==undefined)i.bufferView=viewMap.get(i.bufferView);});
chunks.push(Buffer.alloc((4-offset%4)%4));binary=Buffer.concat(chunks);
base.json.buffers[0].byteLength=binary.length;
const raw=Buffer.from(JSON.stringify(base.json));
const json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]);
const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);
header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(outputPath,Buffer.concat([header,json,binHeader,binary]));
console.log(JSON.stringify({outputPath,bytes:28+json.length+binary.length,meshes:base.json.meshes.length,skins:base.json.skins.length,animations:base.json.animations.map(a=>a.name)}));
