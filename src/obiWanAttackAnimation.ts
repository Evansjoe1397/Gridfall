export const OBI_WAN_LEG_KICK_CLIP = 'Leg_Kick' as const;
export const OBI_WAN_DOUBLE_SWING_CLIP = 'Double_Swing' as const;
export const OBI_WAN_CUT_THEM_LEGS_CLIP = 'Cut_Them_Legs' as const;
export type ObiWanAttackClip = typeof OBI_WAN_LEG_KICK_CLIP | typeof OBI_WAN_DOUBLE_SWING_CLIP | typeof OBI_WAN_CUT_THEM_LEGS_CLIP;
export const OBI_WAN_CUT_THEM_LEGS_FPS = 30;
export const OBI_WAN_CUT_THEM_LEGS_HIT_FRAME = 20;
export const OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS = OBI_WAN_CUT_THEM_LEGS_HIT_FRAME / OBI_WAN_CUT_THEM_LEGS_FPS;
export const OBI_WAN_CUT_THEM_LEGS_DURATION_SECONDS = 41 / OBI_WAN_CUT_THEM_LEGS_FPS;
export const OBI_WAN_SABER_RETRACT_SECONDS = 0.5;
export const OBI_WAN_LEG_KICK_FPS = 24;
export const OBI_WAN_LEG_KICK_HIT_FRAME = 16;
export const OBI_WAN_LEG_KICK_END_FRAME = 65;
export const OBI_WAN_LEG_KICK_HIT_SECONDS = OBI_WAN_LEG_KICK_HIT_FRAME / OBI_WAN_LEG_KICK_FPS;
export const OBI_WAN_LEG_KICK_DURATION_SECONDS = OBI_WAN_LEG_KICK_END_FRAME / OBI_WAN_LEG_KICK_FPS;
export const OBI_WAN_DOUBLE_SWING_HIT_FRAME = 21;
export const OBI_WAN_DOUBLE_SWING_HIT_SECONDS = OBI_WAN_DOUBLE_SWING_HIT_FRAME / OBI_WAN_LEG_KICK_FPS;
// At the authored hit pose, the kicking toe points 71.47 degrees to the
// character's right relative to forward. Counter-rotate the character root so
// the extended leg, rather than the torso, points at the target.
export const OBI_WAN_LEG_KICK_FACING_OFFSET_RADIANS = -71.4667 * Math.PI / 180;

export const OBI_WAN_ATTACK_FACING_OFFSET_RADIANS: Record<ObiWanAttackClip, number> = {
  [OBI_WAN_LEG_KICK_CLIP]: OBI_WAN_LEG_KICK_FACING_OFFSET_RADIANS,
  [OBI_WAN_DOUBLE_SWING_CLIP]: 0,
  [OBI_WAN_CUT_THEM_LEGS_CLIP]: 0,
};

export const OBI_WAN_ATTACK_HIT_SECONDS: Record<ObiWanAttackClip, number> = {
  [OBI_WAN_LEG_KICK_CLIP]: OBI_WAN_LEG_KICK_HIT_SECONDS,
  [OBI_WAN_DOUBLE_SWING_CLIP]: OBI_WAN_DOUBLE_SWING_HIT_SECONDS,
  [OBI_WAN_CUT_THEM_LEGS_CLIP]: OBI_WAN_CUT_THEM_LEGS_HIT_SECONDS,
};

export function obiWanAttackClip(character: string, lightsaberBuff: boolean | undefined, cardId?: string): ObiWanAttackClip | null {
  if (character !== 'shinobi') return null;
  if (cardId === 'cut-them-legs') return OBI_WAN_CUT_THEM_LEGS_CLIP;
  return lightsaberBuff ? OBI_WAN_DOUBLE_SWING_CLIP : OBI_WAN_LEG_KICK_CLIP;
}

export function shouldPlayObiWanLegKick(character: string, lightsaberBuff: boolean | undefined) {
  return obiWanAttackClip(character, lightsaberBuff) === OBI_WAN_LEG_KICK_CLIP;
}

export function shouldDelayObiWanSaberDraw(clip: ObiWanAttackClip | undefined, attackFinished: boolean) {
  return clip === OBI_WAN_LEG_KICK_CLIP && !attackFinished;
}

export function obiWanLightsaberFrame(
  normallyVisible: boolean,
  clip: ObiWanAttackClip | undefined,
  attackFinished: boolean,
  previousProgress: number | undefined,
  deltaSeconds: number,
) {
  const cutThemLegsActive = clip === OBI_WAN_CUT_THEM_LEGS_CLIP && !attackFinished;
  const target = shouldDelayObiWanSaberDraw(clip, attackFinished) ? 0 : Number(cutThemLegsActive || normallyVisible);
  const previous = previousProgress ?? target;
  // Cut Them Legs always swings a fully deployed saber. After the clip ends,
  // use the same reveal animation as ordinary Lightsaber status expiration.
  const step = Math.max(0, deltaSeconds) / OBI_WAN_SABER_RETRACT_SECONDS;
  const progress = cutThemLegsActive ? 1 : Math.max(0, Math.min(1,
    previous + Math.sign(target - previous) * Math.min(Math.abs(target - previous), step),
  ));
  return { target, progress };
}
