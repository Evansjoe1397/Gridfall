import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader=new GLTFLoader();
loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
async function load(path:string) {
  const bytes=fs.readFileSync(path);
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const character=await load('public/models/merylin-pendragon.glb');
const sword=(await load('public/models/excalibur.glb')).scene.getObjectByName('Excalibur_Blade') as THREE.Mesh;
const hand=character.scene.getObjectByName('RightHand')!;
hand.add(sword);
const mixer=new THREE.AnimationMixer(character.scene);
for(const sample of JSON.parse(fs.readFileSync('experiments/excalibur_coordinate_check.json','utf8'))) {
  new THREE.Matrix4().fromArray(sword.userData[`excalibur_${sample.preset}_matrix`]).decompose(sword.position,sword.quaternion,sword.scale);
  mixer.stopAllAction();
  mixer.clipAction(character.animations.find(clip=>clip.name===sample.name)!).play();
  mixer.setTime(sample.frame/24);
  character.scene.updateMatrixWorld(true);
  const positions=sword.geometry.getAttribute('position');
  const errors=sample.local_vertices.map((vertex:number[],index:number)=>{
    const local=new THREE.Vector3().fromArray(vertex);
    let nearest=new THREE.Vector3(),localError=Infinity;
    for(let i=0;i<positions.count;i++) {
      const candidate=new THREE.Vector3().fromBufferAttribute(positions,i);
      const distance=candidate.distanceTo(local);
      if(distance<localError) {localError=distance;nearest.copy(candidate);}
    }
    return {localError,worldError:nearest.applyMatrix4(sword.matrixWorld).distanceTo(new THREE.Vector3().fromArray(sample.vertices[index]))};
  });
  assert.ok(errors.every((error:{localError:number;worldError:number})=>error.localError<1e-5&&error.worldError<1e-5),`${sample.name} does not match Blender`);
  console.log(JSON.stringify({clip:sample.name,preset:sample.preset,errors}));
}
