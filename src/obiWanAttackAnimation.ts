export const OBI_WAN_LEG_KICK_CLIP = 'Leg_Kick' as const;
export const OBI_WAN_DOUBLE_SWING_CLIP = 'Double_Swing' as const;
export const OBI_WAN_LOW_CUT_CLIP = 'Low_Cut' as const;
export type ObiWanAttackClip = typeof OBI_WAN_LEG_KICK_CLIP | typeof OBI_WAN_DOUBLE_SWING_CLIP | typeof OBI_WAN_LOW_CUT_CLIP;
// Source timestamps are retained: frame 20 in the 24 fps Blender review.
export const OBI_WAN_LOW_CUT_HIT_SECONDS = 20 / 24;
export const OBI_WAN_LOW_CUT_PREPARE_SECONDS = 0.18;
export const OBI_WAN_LOW_CUT_RETRACT_SECONDS = 0.18;
// Calibrated from the authored saber's +Y blade axis at frame 20 against
// the character's frame-zero forward (+Z), projected onto the board plane.
export const OBI_WAN_LOW_CUT_FACING_OFFSET_RADIANS = -146.25772081752615 * Math.PI / 180;

export function obiWanAttackPreparationSeconds(clip: ObiWanAttackClip) {
  return clip === OBI_WAN_LOW_CUT_CLIP ? OBI_WAN_LOW_CUT_PREPARE_SECONDS : 0;
}
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
  [OBI_WAN_LOW_CUT_CLIP]: OBI_WAN_LOW_CUT_FACING_OFFSET_RADIANS,
};

export const OBI_WAN_ATTACK_HIT_SECONDS: Record<ObiWanAttackClip, number> = {
  [OBI_WAN_LEG_KICK_CLIP]: OBI_WAN_LEG_KICK_HIT_SECONDS,
  [OBI_WAN_DOUBLE_SWING_CLIP]: OBI_WAN_DOUBLE_SWING_HIT_SECONDS,
  [OBI_WAN_LOW_CUT_CLIP]: OBI_WAN_LOW_CUT_HIT_SECONDS,
};

export function obiWanAttackClip(character: string, lightsaberBuff: boolean | undefined, cardId?: string): ObiWanAttackClip | null {
  if (character !== 'shinobi') return null;
  if (cardId === 'cut-them-legs') return OBI_WAN_LOW_CUT_CLIP;
  return lightsaberBuff ? OBI_WAN_DOUBLE_SWING_CLIP : OBI_WAN_LEG_KICK_CLIP;
}

export function shouldPlayObiWanLegKick(character: string, lightsaberBuff: boolean | undefined) {
  return obiWanAttackClip(character, lightsaberBuff) === OBI_WAN_LEG_KICK_CLIP;
}

export function shouldDelayObiWanSaberDraw(clip: ObiWanAttackClip | undefined, attackFinished: boolean) {
  return clip === OBI_WAN_LEG_KICK_CLIP && !attackFinished;
}
