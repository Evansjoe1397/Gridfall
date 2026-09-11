import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createJohnSpiritIdle, setJohnSpiritTransparency, advanceSpiritBlend, applySpiritBlend, resolveSpiritVisualTarget, spiritVisualDesired } from '../src/johnChristSpirit.ts';
import { johnSpiritMovementDuration, johnSpiritPlaybackRate } from '../src/johnChristLocomotion.ts';
import { attachJohnHealthAnchor } from '../src/johnChristVisuals.ts';
const bytes=fs.readFileSync(new URL('../public/models/john-christ-spirit.glb',import.meta.url));
const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
for (let i = 0; i < 3; i++) {
  setJohnSpiritTransparency(material, true);
  assert.equal(material.transparent, false);
  assert.equal(material.alphaHash, false);
  assert.equal(material.alphaToCoverage, true);
  assert.equal(material.depthWrite, true);
  assert.equal(material.opacity, 0.70);
  setJohnSpiritTransparency(material, false);
  assert.equal(material.alphaHash, false);
  assert.equal(material.alphaToCoverage, false);
  assert.equal(material.opacity, 1);
  assert.equal(material.depthWrite, true);
}
const len=bytes.readUInt32LE(12);
assert.equal(advanceSpiritBlend(0, true, 0.2), 0.5);
assert.equal(advanceSpiritBlend(0.5, false, 0.2), 0);
assert.equal(advanceSpiritBlend(0, true, 1), 1);
assert.equal(resolveSpiritVisualTarget(false, true, 499, 500), false);
assert.equal(resolveSpiritVisualTarget(false, true, 500, 500), true);
assert.equal(resolveSpiritVisualTarget(true, false, 499, 500), true);
assert.equal(resolveSpiritVisualTarget(true, false, 500, 500), false);
assert.equal(spiritVisualDesired(false, false, 'attack-1', true), true);
assert.equal(spiritVisualDesired(false, false, 'attack-1', true, 'attack-1'), false);
assert.equal(spiritVisualDesired(true, false, 'attack-1', true, 'attack-1'), true);
assert.equal(spiritVisualDesired(false, true, 'attack-1', true, 'attack-1'), true);
const normal=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
const spirit=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
const body=new THREE.Group(); body.add(normal,spirit);
assert(applySpiritBlend(normal,spirit,body,0.5)>0.99);
assert(normal.visible && spirit.visible);
applySpiritBlend(normal,spirit,body,1);assert(!normal.visible && spirit.visible);assert.equal(spirit.material.opacity,0.7);
applySpiritBlend(normal,spirit,body,0);assert(normal.visible && !spirit.visible);assert.equal(normal.material.opacity,1);
const json=JSON.parse(bytes.subarray(20,20+len).toString());
assert.equal(json.meshes.length,1); assert.equal(json.skins.length,1); assert.equal(json.animations.length,18);
assert(json.images.every((i:any)=>i.bufferView!==undefined));
json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+len).toString('base64');
delete json.images; delete json.textures; delete json.materials;
for(const m of json.meshes) for(const p of m.primitives) delete p.material;
Object.assign(globalThis,{ProgressEvent:class{constructor(public type:string){}}});
const asset=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
const clip=asset.animations.find(a=>a.name==='Unsteady_Walk')!;
assert(clip && asset.animations.some(a=>a.name==='Alert'));
const mixer=new THREE.AnimationMixer(asset.scene); mixer.clipAction(clip).play();
const samples:{y:number,z:number,t:number,foot:string}[]=[];
for(let i=0;i<=240;i++) {
  const t=clip.duration*i/241; mixer.setTime(t); asset.scene.updateMatrixWorld(true);
  for(const foot of ['LeftFoot','RightFoot']) {
    const p=asset.scene.getObjectByName(foot)!.getWorldPosition(new THREE.Vector3());
    assert(p.toArray().every(Number.isFinite));samples.push({y:p.y,z:p.z,t,foot});
  }
}
const speeds:number[]=[];
for(const foot of ['LeftFoot','RightFoot']) {
 const rows=samples.filter(s=>s.foot===foot),low=Math.min(...rows.map(s=>s.y));
 for(let i=1;i<rows.length;i++) {const a=rows[i-1],b=rows[i];const speed=(a.z-b.z)/(b.t-a.t);if(a.y<low+0.035 && b.y<low+0.035 && speed>0.05)speeds.push(speed);}
}
speeds.sort((a,b)=>a-b);assert(speeds.length>10);
console.log({duration:clip.duration,stanceSpeed:speeds[Math.floor(speeds.length/2)],samples:speeds.length});
mixer.stopAllAction();
const idle=createJohnSpiritIdle(asset.scene,asset.animations.find(c=>c.name==='Alert')!);
assert.equal(idle.duration,4);
for(const track of idle.tracks) {
 const size=track.getValueSize();
 for(let i=0;i<size;i++) assert(Math.abs(track.values[i]-track.values[track.values.length-size+i])<1e-6);
}
mixer.clipAction(idle).play();mixer.update(0);
assert(attachJohnHealthAnchor(asset.scene).getWorldPosition(new THREE.Vector3()).y>1.4);
for(const squares of [1,2,4]) assert(Math.abs(johnSpiritPlaybackRate(squares*1.92,johnSpiritMovementDuration(squares))-1)<1e-9);
const death=asset.animations.find(c=>c.name==='Dead')!;assert(death);
mixer.stopAllAction();const action=mixer.clipAction(death).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
mixer.update(death.duration+1);assert(action.paused);assert.equal(action.time,death.duration);
console.log('Spirit idle loop, movement synchronization, HP anchor and clamped death passed.');
