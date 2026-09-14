import * as THREE from 'three';
import { merylinHitSeconds, type MerylinWeapon } from './merylinWeapons.ts';

export const MERYLIN_SCALE = 2.5 / 1.7;
export const MERYLIN_CLIPS = ['Idle', 'Idle_Wielding', 'Casual_Walk', 'Running', 'Dead', 'Alert', 'Alert_Wielding', 'Boom_Dance', 'You_Groove', 'Attack_Swing', 'Attack_DoubleSwing', 'Attack'] as const;
// Export retains Blender timeline seconds (first sample is frame 1 / 24).
export const MERYLIN_SWING_IMPACT_SECONDS = 28 / 24;
export const MERYLIN_MOONLIGHT_RELEASE_SECONDS = 26 / 24;
export type MerylinClip = typeof MERYLIN_CLIPS[number];
export type MerylinGait = 'Casual_Walk' | 'Running';
// Ground-contact backward foot speeds measured on this rig in Blender, units/second.
const stanceSpeed: Record<MerylinGait, number> = { Casual_Walk: 0.6364168525, Running: 4.3751138449 };
export function merylinGait(squares: number): MerylinGait {
  return squares <= 1 ? 'Casual_Walk' : 'Running';
}
export function merylinMovementDuration(squares: number): number {
  return Math.max(1, squares) * 1.92 / (stanceSpeed[merylinGait(squares)] * MERYLIN_SCALE) * 1000;
}
export function merylinPlaybackRate(gait: MerylinGait, distance: number, durationMs: number, bodyScale = 1): number {
  return distance / Math.max(.001, durationMs / 1000) / (stanceSpeed[gait] * MERYLIN_SCALE * bodyScale);
}
export interface MerylinMovement {
  squares: number;
  distance: number;
  durationMs: number;
  elapsedMs: number;
  bodyScale: number;
  travelledDistance?: number;
}

/** Matches the board's equal-time-per-segment path interpolation, including diagonals. */
export function merylinRouteMotion(points: Array<{ x: number; z: number }>, progress: number) {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.z - points[i].z));
  if (!lengths.length) return { distance: 0, travelledDistance: 0 };
  const scaled = THREE.MathUtils.clamp(progress, 0, 1) * lengths.length;
  const segment = Math.min(lengths.length - 1, Math.floor(scaled));
  return {
    distance: lengths[segment] * lengths.length,
    travelledDistance: lengths.slice(0, segment).reduce((a, b) => a + b, 0) + lengths[segment] * (scaled - segment),
  };
}

/** Exactly one active action: movement/death always interrupt ambient performances. */
export class MerylinAnimation {
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Record<MerylinClip, THREE.AnimationAction>;
  current: MerylinClip = 'Idle';
  deathEndsAt?: number;
  private idleTime = 0;
  private nextAlert = 10;
  private nextDance = 60;
  private wasBusy = false;
  private summoned = false;
  private swingImpactReached = false;
  attackWeapon: MerylinWeapon='frostmourne';

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], private readonly random = Math.random) {
    this.mixer = new THREE.AnimationMixer(model);
    const source = new Map(clips.map(clip => [clip.name, clip]));
    for (const name of MERYLIN_CLIPS) if (!source.has(name)) throw new Error(`Merylin GLB missing ${name}`);
    const idleHips = source.get('Idle')!.tracks.find(t => t.name.endsWith('Hips.position'));
    this.actions = Object.fromEntries(MERYLIN_CLIPS.map(name => {
      let clip = source.get(name)!.clone();
      if(name==='Attack_DoubleSwing') {
        // Sample endpoints exactly, including frame 20; retain source unmodified.
        clip.tracks=clip.tracks.map(track=>{
          const times=[...Array(20)].map((_,i)=>(i+1)/24);
          const interpolate=(track as THREE.KeyframeTrack & { createInterpolant: () => THREE.Interpolant }).createInterpolant();
          const values=times.flatMap(t=>Array.from(interpolate.evaluate(t)));
          const cut=track.clone();
          cut.times=new Float32Array(times.map(t=>t-1/24));
          cut.values=new Float32Array(values);
          return cut;
        });
        clip.duration=19/24;
      }
      // Board movement owns translation. Keep breathing/bobbing, pin horizontal root motion.
      const hips = clip.tracks.find(t => t.name.endsWith('Hips.position'));
      if (hips && idleHips && name !== 'Dead') {
        for (let i = 0; i < hips.values.length; i += 3) {
          hips.values[i] = idleHips.values[0];
          hips.values[i + 2] = idleHips.values[2];
        }
      }
      const action = this.mixer.clipAction(clip);
      const once = ['Dead', 'Alert', 'Alert_Wielding', 'Boom_Dance', 'You_Groove', 'Attack_Swing', 'Attack_DoubleSwing', 'Attack'].includes(name);
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      return [name, action];
    })) as Record<MerylinClip, THREE.AnimationAction>;
    this.actions.Idle.play();
    this.mixer.update(0);
  }

  private play(name: MerylinClip) {
    this.mixer.stopAllAction();
    this.actions[name].reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    this.current = name;
  }

  reset() {
    this.deathEndsAt = undefined;
    this.idleTime = 0; this.nextAlert = 10; this.nextDance = 60; this.wasBusy = false;
    this.summoned = false;
    this.swingImpactReached = false;
    this.play('Idle');
  }

  die(now: number) {
    if (this.deathEndsAt !== undefined) return this.deathEndsAt;
    this.play('Dead');
    return this.deathEndsAt = now + this.actions.Dead.getClip().duration * 1000;
  }

  attack(weapon: MerylinWeapon='frostmourne') {
    if (this.deathEndsAt !== undefined) return;
    this.swingImpactReached = false;
    this.attackWeapon=weapon;
    this.play(weapon==='sting'?'Attack_DoubleSwing':weapon==='excalibur'||weapon==='lightbringer'?'Attack':'Attack_Swing');
    this.wasBusy = true;
  }

  get isAttacking() { return (this.current === 'Attack_Swing' || this.current === 'Attack_DoubleSwing' || this.current === 'Attack') && this.actions[this.current].isRunning(); }
  get hasSwingImpact() { return this.swingImpactReached; }
  get hasMoonlightRelease() { return this.actions.Attack_Swing.time >= MERYLIN_MOONLIGHT_RELEASE_SECONDS; }

  update(delta: number, movement?: MerylinMovement, busy = false, summoned = false) {
    if (this.deathEndsAt !== undefined) { this.mixer.update(delta); return; }
    if (this.isAttacking && (!movement || !this.hasSwingImpact)) {
      this.mixer.update(delta);
      this.swingImpactReached ||= this.actions[this.current].time >= merylinHitSeconds(this.attackWeapon);
      return;
    }
    if (movement) {
      const gait = merylinGait(movement.squares);
      if (this.current !== gait) this.play(gait);
      const action = this.actions[gait];
      const rate = merylinPlaybackRate(gait, movement.distance, movement.durationMs, movement.bodyScale);
      action.setEffectiveTimeScale(rate);
      // Same travel clock as the board: works for path turns, slow movement, and late loading.
      const phase = movement.travelledDistance === undefined
        ? movement.elapsedMs / 1000 * rate
        : movement.travelledDistance / (stanceSpeed[gait] * MERYLIN_SCALE * movement.bodyScale);
      action.time = Math.max(0, phase) % action.getClip().duration;
      this.mixer.update(0);
      this.wasBusy = true;
      return;
    }
    const idle = summoned ? 'Idle_Wielding' : 'Idle';
    if (summoned !== this.summoned) {
      this.summoned = summoned;
      this.idleTime = 0;
      this.nextAlert = summoned ? 20 : 10;
      this.nextDance = 60;
      if (this.current !== idle) this.play(idle);
    }
    if (busy || this.wasBusy) {
      if (this.current !== idle) this.play(idle);
      this.idleTime = 0; this.nextAlert = summoned ? 20 : 10; this.nextDance = 60;
      this.wasBusy = busy;
    }
    if (!busy) this.idleTime += delta;
    const performing = ['Alert', 'Alert_Wielding', 'Boom_Dance', 'You_Groove'].includes(this.current);
    if (performing && !this.actions[this.current].isRunning()) this.play(idle);
    if (!busy && this.current === idle) {
      if (summoned) {
        if (this.idleTime >= this.nextAlert) {
          this.play('Alert_Wielding');
          this.nextAlert = this.idleTime + 20;
        }
      } else {
        // Dance wins simultaneous deadlines. Missed Alerts are skipped, never stacked.
        if (this.idleTime >= this.nextDance) {
          this.play(this.random() < .5 ? 'Boom_Dance' : 'You_Groove');
          this.nextDance = this.idleTime + 60;
          this.nextAlert = this.idleTime + 10;
        } else if (this.idleTime >= this.nextAlert) {
          this.play('Alert');
          this.nextAlert = this.idleTime + 10;
        }
      }
    }
    this.mixer.update(delta);
  }
}
