import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MerylinWeapon } from './merylinWeapons.ts';

/** Measure the blade tip's azimuth at the authored hit, without posing the live rig. */
export function merylinHitDirections(model:THREE.Object3D,clips:THREE.AnimationClip[]):Record<MerylinWeapon,number> {
  const sample=clone(model);
  sample.position.set(0,0,0);sample.quaternion.identity();sample.scale.setScalar(1);
  const mixer=new THREE.AnimationMixer(sample);
  const angles={} as Record<MerylinWeapon,number>;
  for(const weapon of ['frostmourne','sting','excalibur','moonlight','lightbringer'] as const) {
    mixer.stopAllAction();
    const clip=clips.find(c=>c.name===(weapon==='sting'?'Attack_DoubleSwing':weapon==='excalibur'||weapon==='lightbringer'?'Attack':'Attack_Swing'))!.clone();
    const hips=clip.tracks.find(t=>t.name.endsWith('Hips.position'));
    const idleHips=clips.find(c=>c.name==='Idle')!.tracks.find(t=>t.name.endsWith('Hips.position'));
    if(hips && idleHips) for(let i=0;i<hips.values.length;i+=3) { hips.values[i]=idleHips.values[0];hips.values[i+2]=idleHips.values[2]; }
    const sword=sample.getObjectByName(weapon==='sting'?'Weapon_Sting':weapon==='excalibur'?'Weapon_Excalibur':weapon==='moonlight'?'Weapon_Moonlight':weapon==='lightbringer'?'Weapon_Lightbringer':'Frostmourne_Mesh_Optimized') as THREE.Mesh;
    if(weapon==='sting') new THREE.Matrix4().fromArray(sword.userData.sting_running_matrix).decompose(sword.position,sword.quaternion,sword.scale);
    if(weapon==='excalibur') new THREE.Matrix4().fromArray(sword.userData.excalibur_attack_matrix).decompose(sword.position,sword.quaternion,sword.scale);
    if(weapon==='moonlight') new THREE.Matrix4().fromArray(sword.userData.moonlight_attack_matrix).decompose(sword.position,sword.quaternion,sword.scale);
    if(weapon==='lightbringer') new THREE.Matrix4().fromArray(sword.userData.lightbringer_attack_matrix).decompose(sword.position,sword.quaternion,sword.scale);
    const action=mixer.clipAction(clip);action.play();action.time=(weapon==='sting'?7:weapon==='moonlight'?27:28)/24;mixer.update(0);
    sample.updateMatrixWorld(true);
    const hand=sample.getObjectByName('RightHand')!.getWorldPosition(new THREE.Vector3());
    const positions=sword.geometry.getAttribute('position');
    let furthest=-1;const tip=new THREE.Vector3();const point=new THREE.Vector3();
    for(let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(sword.matrixWorld);
      const distance=point.distanceToSquared(hand);
      if(distance>furthest) {furthest=distance;tip.copy(point);}
    }
    sample.worldToLocal(tip);
    angles[weapon]=Math.atan2(tip.x,tip.z);
  }
  mixer.stopAllAction();mixer.uncacheRoot(sample);
  return angles;
}

export function merylinAttackYaw(dx:number,dz:number,hitDirection:number) {
  return Math.atan2(dx,dz)-hitDirection;
}
