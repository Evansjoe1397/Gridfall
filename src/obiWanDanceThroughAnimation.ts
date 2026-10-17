export const OBI_WAN_DANCE_THROUGH_CLIP = 'Dance_Through' as const;
export const OBI_WAN_DANCE_THROUGH_FPS = 24;
export const OBI_WAN_DANCE_THROUGH_END_FRAME = 50;
export const OBI_WAN_DANCE_THROUGH_DURATION_SECONDS = OBI_WAN_DANCE_THROUGH_END_FRAME / OBI_WAN_DANCE_THROUGH_FPS;
export const OBI_WAN_DANCE_THROUGH_ENTRY_FRAME = 1;
export const OBI_WAN_DANCE_THROUGH_STEP_FRAMES = OBI_WAN_DANCE_THROUGH_END_FRAME / 2;
export const OBI_WAN_DANCE_THROUGH_STEP_SECONDS = OBI_WAN_DANCE_THROUGH_STEP_FRAMES / OBI_WAN_DANCE_THROUGH_FPS;
export const OBI_WAN_DANCE_THROUGH_TURN_MS = 160;

export function obiWanDanceThroughTimeScale(movementDurationMs: number, animationFrames = OBI_WAN_DANCE_THROUGH_STEP_FRAMES) {
  return animationFrames / OBI_WAN_DANCE_THROUGH_FPS / Math.max(0.001, movementDurationMs / 1000);
}

export function isObiWanDanceThroughMovement(sourceCardId: string | undefined) {
  return sourceCardId === 'dance-through';
}

export function shouldHoldObiWanDanceThrough(gamePhase: string, stepMoving: boolean) {
  return gamePhase === 'dance-through' && !stepMoving;
}

export function obiWanDanceThroughInputLocked(
  awaitingMoveResponse: boolean,
  movement: { danceThrough?: boolean } | undefined,
  dance: { holding: boolean } | undefined,
) {
  // Keep the lock through the turn, combat-effect wait, tile travel, and the
  // completed movement's final pose. The renderer releases it after that pose.
  return awaitingMoveResponse || Boolean(movement?.danceThrough) || Boolean(dance && !dance.holding);
}

export function obiWanDanceThroughFrame(progress: number, startFrame: number, endFrame: number) {
  return startFrame + (endFrame - startFrame) * Math.max(0, Math.min(1, progress));
}

export function shouldShowObiWanLightsaberDuringDance(
  lightsaberBuff: boolean | undefined,
  sourceCardId: string | undefined,
  danceAnimationActive: boolean,
) {
  return Boolean(lightsaberBuff || danceAnimationActive || isObiWanDanceThroughMovement(sourceCardId));
}
