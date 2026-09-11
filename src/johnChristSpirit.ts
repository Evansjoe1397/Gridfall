import * as THREE from 'three';

export function resolveSpiritVisualTarget(current: boolean, desired: boolean, now: number, notBefore: number): boolean {
  return now < notBefore ? current : desired;
}

export function spiritVisualDesired(
  spiritForm: boolean,
  defeated: boolean,
  pendingAttackId?: string,
  pendingAttackUsedSpirit = false,
  completedAttackId?: string,
): boolean {
  return defeated || spiritForm || Boolean(pendingAttackUsedSpirit && pendingAttackId && pendingAttackId !== completedAttackId);
}

export function advanceSpiritBlend(value: number, active: boolean, delta: number): number {
  return active ? Math.min(1, value + Math.max(0, delta) / 0.4) : Math.max(0, value - Math.max(0, delta) / 0.4);
}

export function applySpiritBlend(normal: THREE.Object3D, spirit: THREE.Object3D, body: THREE.Object3D, value: number): number {
  const t = value * value * (3 - 2 * value);
  normal.visible = value < 1;
  spirit.visible = value > 0;
  body.scale.setScalar(1 + 0.13 * t);
  for (const [model, opacity] of [[normal, 1 - t], [spirit, 0.7 * t]] as const) {
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        setJohnSpiritTransparency(material, model === spirit || value > 0, opacity);
      }
    });
  }
  return Math.sin(Math.PI * t);
}

/** MSAA sample coverage keeps the layered robe depth-tested without hash noise.
 * Both game and preview renderers use antialias:true on their default framebuffer.
 */
export function setJohnSpiritTransparency(material: THREE.Material, active: boolean, opacity = 0.70): void {
  material.userData.johnOpacityOriginal ??= {
    transparent: material.transparent, opacity: material.opacity,
    depthWrite: material.depthWrite, alphaHash: material.alphaHash, alphaToCoverage: material.alphaToCoverage,
  };
  const original = material.userData.johnOpacityOriginal;
  const transparent = active ? false : original.transparent;
  const alphaHash = active ? false : original.alphaHash;
  const alphaToCoverage = active ? true : original.alphaToCoverage;
  const changed = material.transparent !== transparent || material.alphaHash !== alphaHash || material.alphaToCoverage !== alphaToCoverage;
  material.transparent = transparent;
  material.alphaHash = alphaHash;
  material.alphaToCoverage = alphaToCoverage;
  material.opacity = active ? opacity : original.opacity;
  material.depthWrite = active ? true : original.depthWrite;
  if (changed) material.needsUpdate = true;
}

/** Planted feet, uneven torso sway, loose arms and a delayed head response. */
export function createJohnSpiritIdle(model: THREE.Object3D, alert: THREE.AnimationClip): THREE.AnimationClip {
  const pose = new THREE.AnimationMixer(model);
  pose.clipAction(alert).play();
  pose.update(0);
  const tracks: THREE.KeyframeTrack[] = [];
  const motion: Record<string, [number, number, number, number]> = {
    Spine: [0.034, 0.025, 0.058, 0], Spine01: [0.028, 0.018, 0.043, 0.28],
    Spine02: [0.020, 0.014, 0.029, 0.52], Head: [-0.046, 0.036, -0.052, 0.95],
    LeftShoulder: [0.024, 0.018, 0.042, 0.38], RightShoulder: [0.022, -0.017, -0.039, 1.95],
    LeftArm: [0.090, 0.048, 0.076, 0.62], RightArm: [0.082, -0.044, -0.082, 2.28],
    LeftForeArm: [0.104, 0.018, 0.030, 1.08], RightForeArm: [0.092, -0.018, -0.032, 2.72],
    LeftHand: [0.045, 0.018, 0.039, 1.46], RightHand: [0.050, -0.017, -0.041, 3.02],
  };
  model.traverse(node => {
    if (!(node instanceof THREE.Bone)) return;
    const times = Array.from({ length: 33 }, (_, i) => i / 8);
    const base = node.quaternion.clone();
    const [x, y, z, phase] = motion[node.name] ?? [0, 0, 0, 0];
    const values = times.flatMap(t => {
      const angle = t / 4 * Math.PI * 2;
      const wave = Math.sin(angle + phase) + 0.34 * Math.sin(2 * angle + phase + 0.35) + 0.12 * Math.sin(3 * angle - phase);
      const counterSway = Math.sin(angle + phase + 0.4) + 0.18 * Math.sin(3 * angle + phase);
      return base.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x * wave, y * counterSway, z * wave))).toArray();
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
    tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, [0, 4], [...node.position.toArray(), ...node.position.toArray()]));
    tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.scale`, [0, 4], [...node.scale.toArray(), ...node.scale.toArray()]));
  });
  pose.stopAllAction();
  pose.uncacheRoot(model);
  return new THREE.AnimationClip('Spirit_Idle', 4, tracks);
}
