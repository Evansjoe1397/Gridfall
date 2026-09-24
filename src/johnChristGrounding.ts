import * as THREE from 'three';

// The authored Blessing pose lifts both feet. Bake the hip height against the
// idle stance so the lower toe stays on the same ground plane during the clip.
export function groundJohnBlessingClip(model: THREE.Object3D, idle: THREE.AnimationClip, blessing: THREE.AnimationClip): THREE.AnimationClip {
  const hips = model.getObjectByName('Hips');
  const leftToe = model.getObjectByName('LeftToeBase');
  const rightToe = model.getObjectByName('RightToeBase');
  const hipTrack = blessing.tracks.find((track) => track.name === 'Hips.position');
  if (!hips?.parent || !leftToe || !rightToe || !hipTrack || hipTrack.getValueSize() !== 3) {
    throw new Error('John Christ Blessing is missing the hip or toe animation data.');
  }

  const mixer = new THREE.AnimationMixer(model);
  const toeHeight = () => {
    model.updateMatrixWorld(true);
    return Math.min(
      leftToe.getWorldPosition(new THREE.Vector3()).y,
      rightToe.getWorldPosition(new THREE.Vector3()).y,
    );
  };
  mixer.clipAction(idle).play();
  mixer.setTime(0);
  const ground = toeHeight();
  mixer.stopAllAction();
  const action = mixer.clipAction(blessing).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const grounded = blessing.clone();
  const correctedHipTrack = grounded.tracks.find((track) => track.name === 'Hips.position')!;
  for (let i = 0; i < hipTrack.times.length; i++) {
    mixer.setTime(hipTrack.times[i]);
    const toeY = toeHeight();
    const hipYScale = hips.parent.getWorldScale(new THREE.Vector3()).y;
    correctedHipTrack.values[i * 3 + 1] += (ground - toeY) / hipYScale;
  }
  mixer.stopAllAction();
  return grounded;
}
