import * as THREE from 'three';

export const OBI_WAN_FLIP_CLIP = 'Flip' as const;
export const OBI_WAN_FLIP_FPS = 24;
export const OBI_WAN_FLIP_TAKEOFF_FRAME = 23;
export const OBI_WAN_FLIP_SPLIT_FRAME = 33;
export const OBI_WAN_FLIP_LANDING_FRAME = 50;
export const OBI_WAN_FLIP_END_FRAME = 65;
export const OBI_WAN_FLIP_DURATION_MS = OBI_WAN_FLIP_END_FRAME / OBI_WAN_FLIP_FPS * 1000;
export const OBI_WAN_FLIP_TURN_MS = 80;

export function isObiWanFlipMovement(sourceCardId: string | undefined) {
  return sourceCardId === 'double-jump';
}

export function obiWanFlipSegment(step: 1 | 2) {
  const startFrame = step === 1 ? 0 : OBI_WAN_FLIP_SPLIT_FRAME;
  const endFrame = step === 1 ? OBI_WAN_FLIP_SPLIT_FRAME : OBI_WAN_FLIP_END_FRAME;
  return { startFrame, endFrame, durationMs: (endFrame - startFrame) / OBI_WAN_FLIP_FPS * 1000, holdAfter: step === 1 };
}

export type ObiWanFlipSegment = ReturnType<typeof obiWanFlipSegment>;

export function obiWanFlipFrame(progress: number, segment: ObiWanFlipSegment) {
  return THREE.MathUtils.lerp(segment.startFrame, segment.endFrame, THREE.MathUtils.clamp(progress, 0, 1));
}

export function obiWanFlipTravelProgress(progress: number, segment: ObiWanFlipSegment) {
  // Tile travel happens only while airborne, not during preparation or recovery.
  return THREE.MathUtils.smoothstep(obiWanFlipFrame(progress, segment), Math.max(OBI_WAN_FLIP_TAKEOFF_FRAME, segment.startFrame), Math.min(OBI_WAN_FLIP_LANDING_FRAME, segment.endFrame));
}

export function prepareObiWanFlipClip(source: THREE.AnimationClip, idle: THREE.AnimationClip, model: THREE.Object3D) {
  const clip = source.clone();
  clip.duration = OBI_WAN_FLIP_DURATION_MS / 1000;
  clip.tracks.forEach(track => track.trim(0, clip.duration));
  const idleHips = idle.tracks.find(track => track.name.endsWith('Hips.position'));
  const hips = clip.tracks.find(track => track.name.endsWith('Hips.position'));
  if (!idleHips || !hips || hips.getValueSize() !== 3) throw new Error('Flip requires a Hips position track');
  for (let i = 0; i < hips.times.length; i++) {
    // This rig's local X/Y are the ground plane; local -Z is world up.
    hips.values[i * 3] = idleHips.values[0];
    hips.values[i * 3 + 1] = idleHips.values[1];
  }

  const hipBone = model.getObjectByName('Hips');
  const leftToe = model.getObjectByName('LeftToeBase'), rightToe = model.getObjectByName('RightToeBase');
  if (!hipBone?.parent || !leftToe || !rightToe) throw new Error('Flip requires the hip and foot bones');
  // Sample the actual skinned boots, including heel contact while crouching.
  const bootVertices: { mesh: THREE.SkinnedMesh; index: number }[] = [];
  model.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const indices = object.geometry.getAttribute('skinIndex'), weights = object.geometry.getAttribute('skinWeight');
    for (let i = 0; i < indices.count; i++) {
      let footWeight = 0;
      for (let component = 0; component < 4; component++) {
        const bone = object.skeleton.bones[indices.getComponent(i, component)];
        if (bone && /^(Left|Right)(Foot|ToeBase)$/.test(bone.name)) footWeight += weights.getComponent(i, component);
      }
      if (footWeight > .5) bootVertices.push({ mesh: object, index: i });
    }
  });
  if (!bootVertices.length) throw new Error('Flip requires skinned boot vertices');
  const point = new THREE.Vector3();
  const contact = () => {
    model.updateMatrixWorld(true);
    const center = leftToe.getWorldPosition(new THREE.Vector3()).add(rightToe.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
    center.y = Number.POSITIVE_INFINITY;
    for (const { mesh, index } of bootVertices) {
      point.fromBufferAttribute(mesh.geometry.getAttribute('position'), index);
      mesh.applyBoneTransform(index, point);
      mesh.localToWorld(point);
      center.y = Math.min(center.y, point.y);
    }
    return center;
  };
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(idle).play(); mixer.setTime(0);
  const ground = contact();
  mixer.stopAllAction();
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true; action.play();
  const inverseHipParent = new THREE.Matrix4().copy(hipBone.parent.matrixWorld).invert();
  const correctionAt = (frame: number, anchor: THREE.Vector3) => {
    mixer.setTime(frame / OBI_WAN_FLIP_FPS);
    const correction = anchor.clone().sub(contact());
    // Convert world-space displacement to the hip track's local axes and scale.
    return correction.applyMatrix4(inverseHipParent).sub(new THREE.Vector3().applyMatrix4(inverseHipParent));
  };
  // Land in the destination tile's normal stance, so the return to idle cannot slide.
  const landed = ground.clone();
  const takeoffCorrection = correctionAt(OBI_WAN_FLIP_TAKEOFF_FRAME, ground);
  const landingCorrection = correctionAt(OBI_WAN_FLIP_LANDING_FRAME, landed);
  const corrections = Array.from(hips.times, time => {
    const frame = time * OBI_WAN_FLIP_FPS;
    if (frame <= OBI_WAN_FLIP_TAKEOFF_FRAME + 1e-5) return correctionAt(frame, ground);
    if (frame >= OBI_WAN_FLIP_LANDING_FRAME - 1e-5) return correctionAt(frame, landed);
    return takeoffCorrection.clone().lerp(landingCorrection, (frame - OBI_WAN_FLIP_TAKEOFF_FRAME) / (OBI_WAN_FLIP_LANDING_FRAME - OBI_WAN_FLIP_TAKEOFF_FRAME));
  });
  mixer.stopAllAction();
  corrections.forEach((correction, i) => {
    hips.values[i * 3] += correction.x;
    hips.values[i * 3 + 1] += correction.y;
    hips.values[i * 3 + 2] += correction.z;
  });
  return clip;
}
