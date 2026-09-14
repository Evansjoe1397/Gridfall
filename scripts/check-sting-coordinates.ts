import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader=new GLTFLoader();
loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
async function load(path:string) { const b=fs.readFileSync(path);return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''); }
const asset=await load('public/models/merylin-pendragon.glb');
const sting=(await load('public/models/sting.glb')).scene.getObjectByName('Sting_Blade') as THREE.Mesh;
const hand=asset.scene.getObjectByName('RightHand')!;hand.add(sting);
new THREE.Matrix4().fromArray(sting.userData.sting_running_matrix).decompose(sting.position,sting.quaternion,sting.scale);
const mixer=new THREE.AnimationMixer(asset.scene);
for(const row of JSON.parse(fs.readFileSync('experiments/sting_coordinate_check.json','utf8'))) {
  new THREE.Matrix4().fromArray(sting.userData[row.name==='Running'||row.name==='Attack_DoubleSwing'?'sting_running_matrix':'sting_idle_matrix']).decompose(sting.position,sting.quaternion,sting.scale);
  mixer.stopAllAction();mixer.clipAction(asset.animations.find(c=>c.name===row.name)!).play();mixer.setTime(row.frame/24);
  asset.scene.updateMatrixWorld(true);
  const expectedHand=new THREE.Matrix4().fromArray(row.hand);
  const delta=expectedHand.clone().invert().multiply(hand.matrixWorld);
  const geometry=sting.geometry.getAttribute('position');
  // Find exported vertices matching each original local-space point, irrespective of reindexing.
  const checks=row.local_vertices.map((v:number[],i:number)=>{
    const p=new THREE.Vector3().fromArray(v);let min=Infinity, nearest=new THREE.Vector3();
    for(let j=0;j<geometry.count;j++) {const q=new THREE.Vector3().fromBufferAttribute(geometry,j);const d=q.distanceTo(p);if(d<min){min=d;nearest.copy(q);}}
    return {localError:min,worldError:nearest.applyMatrix4(sting.matrixWorld).distanceTo(new THREE.Vector3().fromArray(row.vertices[i]))};
  });
  assert.ok(checks.every((c:{localError:number;worldError:number})=>c.localError<1e-5 && c.worldError<1e-5),`${row.name} does not match Blender`);
  console.log(JSON.stringify({clip:row.name,checks}));
}
