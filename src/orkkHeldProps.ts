import * as THREE from 'three';

function stabilizeBoneProp(prop: THREE.Object3D | undefined) {
  if (!(prop instanceof THREE.Mesh) || !prop.parent) return;
  // Meshy exports held props with their visible geometry offset far from the
  // object origin. Clips with animated hands then swing that geometry away
  // from the character. Bake the local transform into a private geometry copy
  // so the prop pivots at its parent hand bone without changing its bind pose.
  prop.updateMatrix();
  const localTransform = prop.matrix.clone();
  prop.geometry = prop.geometry.clone();
  prop.geometry.applyMatrix4(localTransform);
  for (const child of [...prop.children]) child.applyMatrix4(localTransform);
  prop.position.set(0, 0, 0);
  prop.quaternion.identity();
  prop.scale.set(1, 1, 1);
  prop.updateMatrix();
}

export function stabilizeOrkkHeldProps(model: THREE.Group) {
  const shield = model.getObjectByName('Ironbound_Obelisk');
  const shieldSocket = model.getObjectByName('Shield_Release_Socket');
  shield?.updateMatrix();
  const shieldTransform = shield?.matrix.clone();
  stabilizeBoneProp(shield);
  stabilizeBoneProp(model.getObjectByName('Bloodcore_Scepter'));
  // Keep shield throws originating from the visible equipped shield after its
  // mesh pivot is rebased to the hand bone.
  if (shieldSocket && shieldTransform) {
    shieldSocket.matrix.copy(shieldTransform);
    shieldSocket.matrix.decompose(shieldSocket.position, shieldSocket.quaternion, shieldSocket.scale);
  }
}
