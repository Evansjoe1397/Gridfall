// Grounded-foot backward speeds measured from the repaired Blender rig at 24 fps.
// The exported character is 1.7 units tall; render it at 2.5 units.
export const JOHN_MODEL_SCALE = 2.5 / 1.7;
export const JOHN_CLIPS = { Idle: 'Idle', Walk: 'Casual_Walk', Run: 'Run_03' } as const;
export type JohnAnimationName = keyof typeof JOHN_CLIPS;
export const JOHN_SPIRIT_STANCE_SPEED = 0.7524145536944404;
export const JOHN_SPIRIT_SCALE = 1.13;
export function johnSpiritMovementDuration(squares: number): number {
  return Math.max(1, squares) * 1.92 / (JOHN_SPIRIT_STANCE_SPEED * JOHN_MODEL_SCALE * JOHN_SPIRIT_SCALE) * 1000;
}
export function johnSpiritPlaybackRate(distance: number, durationMs: number, bodyScale = JOHN_SPIRIT_SCALE): number {
  return distance / Math.max(durationMs / 1000, 0.001) / (JOHN_SPIRIT_STANCE_SPEED * JOHN_MODEL_SCALE * bodyScale);
}
const STANCE_SPEED = { Walk: 0.7395400766, Run: 3.2335298256 };
const DEFAULT_RATE = { Walk: 1.35, Run: 1 };

export function johnMovementClip(squares: number): 'Walk' | 'Run' {
  return squares >= 2 ? 'Run' : 'Walk';
}

export function johnMovementDuration(squares: number): number {
  const clip = johnMovementClip(squares);
  return Math.max(1, squares) * 1.92 / (STANCE_SPEED[clip] * JOHN_MODEL_SCALE * DEFAULT_RATE[clip]) * 1000;
}

export function johnPlaybackRate(clip: 'Walk' | 'Run', distance: number, durationMs: number, bodyScale = 1): number {
  return distance / Math.max(durationMs / 1000, 0.001) / (STANCE_SPEED[clip] * JOHN_MODEL_SCALE * bodyScale);
}
