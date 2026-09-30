import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { createNagrandMountains } from '../../src/nagrand-mountains.ts';
const terrain = createNagrandMountains({value:0});
terrain.sync(true,new THREE.Vector3(),24.96);
terrain.group.updateMatrixWorld(true);
const camera = new THREE.PerspectiveCamera(52, 1.7, .1, 2000);
camera.position.set(32,34,48); camera.lookAt(0,-8,0); camera.updateMatrixWorld(true);
const faces: number[][] = [];
const light = new THREE.Vector3(-.7,1,-.4).normalize();
terrain.group.traverse(o => {
 if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || o.material.transparent) return;
 const p=o.geometry.getAttribute('position'), c=o.geometry.getAttribute('color'), idx=o.geometry.index;
 for(let i=0; i<(idx?.count ?? p.count); i+=3) {
 const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);
 const v=ids.map(j=>new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld));
 const n=new THREE.Vector3().subVectors(v[1],v[0]).cross(new THREE.Vector3().subVectors(v[2],v[0])).normalize();
 const center=v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
 if(n.dot(camera.position.clone().sub(center))<=0) continue;
 const shade=.45+Math.max(0,n.dot(light))*.85;
 const col=new THREE.Color(c.getX(ids[0]),c.getY(ids[0]),c.getZ(ids[0])).multiplyScalar(shade).convertLinearToSRGB();
 const projected=v.map(x=>x.clone().project(camera));
 if(projected.some(x=>x.z>1||x.z< -1)) continue;
 faces.push([center.distanceToSquared(camera.position),...projected.flatMap(v=>[(v.x+1)*510,(1-v.y)*300]),col.r*255,col.g*255,col.b*255]);
 }
});
writeFileSync('output/nagrand-terrain-review/geometry-preview.json',JSON.stringify(faces));
