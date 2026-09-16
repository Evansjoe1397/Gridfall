export const OBI_WAN_LEG_KICK_CLIP = 'Leg_Kick' as const;
export const OBI_WAN_DOUBLE_SWING_CLIP = 'Double_Swing' as const;
export type ObiWanAttackClip = typeof OBI_WAN_LEG_KICK_CLIP | typeof OBI_WAN_DOUBLE_SWING_CLIP;
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
};

export const OBI_WAN_ATTACK_HIT_SECONDS: Record<ObiWanAttackClip, number> = {
  [OBI_WAN_LEG_KICK_CLIP]: OBI_WAN_LEG_KICK_HIT_SECONDS,
  [OBI_WAN_DOUBLE_SWING_CLIP]: OBI_WAN_DOUBLE_SWING_HIT_SECONDS,
};

export function obiWanAttackClip(character: string, lightsaberBuff: boolean | undefined): ObiWanAttackClip | null {
  if (character !== 'shinobi') return null;
  return lightsaberBuff ? OBI_WAN_DOUBLE_SWING_CLIP : OBI_WAN_LEG_KICK_CLIP;
}

export function shouldPlayObiWanLegKick(character: string, lightsaberBuff: boolean | undefined) {
  return obiWanAttackClip(character, lightsaberBuff) === OBI_WAN_LEG_KICK_CLIP;
}
