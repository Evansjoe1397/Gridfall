// Grounded-foot backward speeds measured from the repaired Blender rig at 24 fps.
// The exported character is 1.7 units tall; render it at 2.5 units.
export const JOHN_MODEL_SCALE = 2.5 / 1.7;
export const JOHN_CAST_CLIP = 'Cast_Overhead' as const;
export const JOHN_CAST_FPS = 24;
export const JOHN_CAST_END_FRAME = 22;
export const JOHN_CAST_END_SECONDS = JOHN_CAST_END_FRAME / JOHN_CAST_FPS;
export const JOHN_CAST_RELEASE_FRAME = 19;
export const JOHN_CAST_RELEASE_SECONDS = (JOHN_CAST_RELEASE_FRAME - 1) / JOHN_CAST_FPS;
// Center of the ornate cross-shaped head in the standalone scepter GLB.
// Blender local +Z becomes Three.js local +Y during glTF export.
export const JOHN_SCEPTER_HEAD_LOCAL = [0, 0.72, 0] as const;
export const JOHN_CLEANSE_CLIP = 'Raise_Left_Hand' as const;
export const JOHN_CLEANSE_FPS = 24;
export const JOHN_CLEANSE_END_FRAME = 26;
export const JOHN_CLEANSE_RELEASE_FRAME = 18;
export const JOHN_CLEANSE_RELEASE_SECONDS = (JOHN_CLEANSE_RELEASE_FRAME - 1) / JOHN_CLEANSE_FPS;
export const JOHN_MIND_BLAST_CLIP = 'Cast' as const;
export const JOHN_MIND_BLAST_FPS = 24;
export const JOHN_MIND_BLAST_IMPACT_FRAME = 42;
export const JOHN_MIND_BLAST_IMPACT_SECONDS = (JOHN_MIND_BLAST_IMPACT_FRAME - 1) / JOHN_MIND_BLAST_FPS;
export const JOHN_MIND_BLAST_END_FRAME = 57;
export const JOHN_MIND_BLAST_END_SECONDS = JOHN_MIND_BLAST_END_FRAME / JOHN_MIND_BLAST_FPS;
export const JOHN_BLESSING_CLIP = 'Blessing' as const;
export const JOHN_BLESSING_FPS = 24;
// Agree_Gesture frames 16-48 are rebased to 1-33. The original frame-32
// blessing event therefore lands on frame 17 of the trimmed clip.
export const JOHN_BLESSING_RELEASE_FRAME = 17;
export const JOHN_BLESSING_RELEASE_SECONDS = (JOHN_BLESSING_RELEASE_FRAME - 1) / JOHN_BLESSING_FPS;
export const JOHN_BLESSING_END_FRAME = 31;
export const JOHN_BLESSED_BEAM_CLIP = 'Staff_Point_Forward' as const;
export const JOHN_BLESSED_BEAM_FPS = 24;
export const JOHN_BLESSED_BEAM_SPEED = 2;
export const JOHN_BLESSED_BEAM_RELEASE_SECONDS = (25 - 1) / JOHN_BLESSED_BEAM_FPS;
export const JOHN_BLESSED_BEAM_HOLD_SECONDS = (28 - 1) / JOHN_BLESSED_BEAM_FPS;
export const JOHN_BLESSED_BEAM_RECOVERY_SECONDS = (40 - 1) / JOHN_BLESSED_BEAM_FPS;
export const JOHN_SPIRIT_ATTACK_CLIP = 'Skill_01' as const;
export const JOHN_SPIRIT_ATTACK_FPS = 24;
export const JOHN_SPIRIT_ATTACK_DAMAGE_FRAME = 12;
export const JOHN_SPIRIT_ATTACK_DAMAGE_SECONDS = (JOHN_SPIRIT_ATTACK_DAMAGE_FRAME - 1) / JOHN_SPIRIT_ATTACK_FPS;
export const JOHN_CLIPS = { Idle: 'Idle', Walk: 'Casual_Walk', Run: 'Run_03', Attack: JOHN_CAST_CLIP, Cleanse: JOHN_CLEANSE_CLIP, MindBlast: JOHN_MIND_BLAST_CLIP, BlessedBeam: JOHN_BLESSED_BEAM_CLIP, Blessing: JOHN_BLESSING_CLIP } as const;
export type JohnAnimationName = keyof typeof JOHN_CLIPS;
export type JohnAttackAnimationName = Extract<JohnAnimationName, 'Attack' | 'Cleanse' | 'MindBlast' | 'BlessedBeam'>;
const JOHN_SPIRIT_ANIMATIONS = new Set<JohnAnimationName>(['Idle', 'Walk', 'Run', 'Attack']);
export function johnAnimationAvailableInForm(animation: JohnAnimationName, spiritForm: boolean): boolean {
  return !spiritForm || JOHN_SPIRIT_ANIMATIONS.has(animation);
}
export function johnAttackAnimation(cardId?: string): JohnAttackAnimationName {
  if (cardId === 'blessed-might' || cardId === 'blessed-light') return 'BlessedBeam';
  if (cardId === 'mind-blast') return 'MindBlast';
  return cardId === 'cleanse' || cardId === 'repent' ? 'Cleanse' : 'Attack';
}
export function johnAttackReleaseSeconds(animation: JohnAttackAnimationName): number {
  return animation === 'BlessedBeam' ? JOHN_BLESSED_BEAM_RELEASE_SECONDS : animation === 'MindBlast' ? JOHN_MIND_BLAST_IMPACT_SECONDS : animation === 'Cleanse' ? JOHN_CLEANSE_RELEASE_SECONDS : JOHN_CAST_RELEASE_SECONDS;
}
export function johnAttackPlaybackRate(animation: JohnAttackAnimationName): number {
  return animation === 'BlessedBeam' ? JOHN_BLESSED_BEAM_SPEED : 1;
}
export function johnAttackUsesProjectile(cardId?: string): boolean {
  return johnAttackAnimation(cardId) === 'Attack';
}
export const JOHN_SPIRIT_STANCE_SPEED = 0.7524145536944404;
export const JOHN_SPIRIT_SCALE = 1;
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

export function johnUsesCastOverhead(character: string, attackerWasInSpiritForm: boolean | undefined): boolean {
  return character === 'john-christ' && !attackerWasInSpiritForm;
}

export function johnCastProjectileDurationMs(distance: number): number {
  return Math.min(320, Math.max(140, distance / 18 * 1000));
}
