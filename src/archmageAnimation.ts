import * as THREE from 'three';
import { ArchmageConjure } from './archmageConjure.ts';

export const ARCHMAGE_SCALE = 2.5 / 1.7;
export const ARCHMAGE_CLIPS = ['Idle', 'Walk', 'Running', 'Summon', 'Conjure', 'Power', 'Wall', 'Dead'] as const;
export const ARCHMAGE_RAISE_SECONDS = .35;
export const ARCHMAGE_LOWER_SECONDS = .25;
// Walk's authored root displacement and Running's grounded backward foot speed (24 fps).
const stanceSpeed = { Walk: 1.1705102496227253, Running: 5.13802033290267 };
export const archmageGait = (squares: number) => squares <= 2 ? 'Walk' : 'Running';
export function archmageMovementDuration(squares: number) {
  return Math.max(1, squares) * 1.92 / (stanceSpeed[archmageGait(squares)] * ARCHMAGE_SCALE) * 1000;
}

export type ArchmagePower = {
  phase: 'playing' | 'holding' | 'resolving' | 'lowering';
  holdAtEnd: boolean;
  liftStarted?: boolean;
  targetKind?: 'player' | 'object';
  targetId?: string;
  resolvedAt?: number;
};
export interface ArchmageMotion {
  squares: number;
  travelledDistance: number;
  bodyScale: number;
}
type ActionName = 'Idle' | 'Walk' | 'Running' | 'Conjure' | 'Power' | 'PowerLower' | 'Wall' | 'Dead' | 'Glide';

/** Resample precise source frame boundaries, then rebase and retime the segment. */
export function archmageSegment(source: THREE.AnimationClip, name: string, start: number, end: number, duration = end - start) {
  const tracks = source.tracks.map(track => {
    const times = [start, ...Array.from(track.times).filter(time => time > start + 1e-6 && time < end - 1e-6), end];
    const interpolate = (track as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }).createInterpolant();
    const values = times.flatMap(time => Array.from(interpolate.evaluate(time)));
    const copy = track.clone();
    copy.times = new Float32Array(times.map(time => (time - start) / (end - start) * duration));
    copy.values = new Float32Array(values);
    return copy;
  });
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Ambient performances never delay movement, casts, defence, or death. */
export class ArchmageAnimation {
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Record<ActionName, THREE.AnimationAction>;
  current: ActionName = 'Idle';
  power?: ArchmagePower;
  deathEndsAt?: number;
  wall = false;
  private idleSeconds = 0;
  private wallSeconds = 0;
  private readonly conjure: ArchmageConjure;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], private readonly wallRaiseSeconds: number) {
    const source = new Map(clips.map(clip => [clip.name, clip]));
    for (const name of ARCHMAGE_CLIPS) if (!source.has(name)) throw new Error(`Archmage GLB is missing ${name}.`);
    this.mixer = new THREE.AnimationMixer(model);
    const normalized = (name: typeof ARCHMAGE_CLIPS[number]) => {
      const clip = source.get(name)!;
      return archmageSegment(clip, name, Math.min(...clip.tracks.map(track => track.times[0])), clip.duration);
    };
    const power = source.get('Power')!;
    const wall = source.get('Wall')!;
    this.actions = {
      Idle: this.mixer.clipAction(normalized('Idle')),
      Walk: this.mixer.clipAction(normalized('Walk')),
      Running: this.mixer.clipAction(normalized('Running')),
      Conjure: this.mixer.clipAction(normalized('Conjure')),
      Power: this.mixer.clipAction(archmageSegment(power, 'PowerRaise', 1 / 24, 20 / 24, ARCHMAGE_RAISE_SECONDS)),
      PowerLower: this.mixer.clipAction(archmageSegment(power, 'PowerLower', 80 / 24, power.duration, ARCHMAGE_LOWER_SECONDS)),
      Wall: this.mixer.clipAction(archmageSegment(wall, 'WallRaise', 1 / 24, 40 / 24, wallRaiseSeconds)),
      Dead: this.mixer.clipAction(normalized('Dead')),
      Glide: this.mixer.clipAction(archmageSegment(power, 'ShizzleGlide', 20 / 24, 20 / 24 + .001)),
    };
    for (const name of ['Power', 'PowerLower', 'Wall', 'Dead'] as const) {
      this.actions[name].setLoop(THREE.LoopOnce, 1);
      this.actions[name].clampWhenFinished = true;
    }
    this.actions.Idle.play();
    this.mixer.update(0);
    this.conjure = new ArchmageConjure(model);
  }

  private play(name: ActionName) {
    if (this.current === name) return;
    // Stop older faded actions: interrupted Conjure must never leak into a held spell pose.
    for (const [key, action] of Object.entries(this.actions)) if (key !== this.current && key !== name) action.stop();
    this.actions[this.current].fadeOut(.12);
    this.actions[name].reset().setEffectiveWeight(1).fadeIn(.12).play();
    this.current = name;
  }

  startPower(power: ArchmagePower) {
    this.idleSeconds = 0;
    this.wall = false;
    if (this.current === 'Power') this.actions.Power.reset();
    this.play('Power');
    this.power = power;
  }
  resolvePower(now: number) {
    if (!this.power) return;
    this.power.phase = 'resolving';
    this.power.resolvedAt = now;
  }
  cancelPower() {
    this.power = undefined;
    this.idleSeconds = 0;
    this.play('Idle');
  }
  get powerRaised() {
    return Boolean(this.power && this.power.phase !== 'lowering' && this.actions.Power.time >= ARCHMAGE_RAISE_SECONDS - 1e-6);
  }
  startDeath(now: number) {
    if (this.deathEndsAt !== undefined) return this.deathEndsAt;
    this.power = undefined;
    this.wall = false;
    this.play('Dead');
    this.deathEndsAt = now + this.actions.Dead.getClip().duration * 1000;
    return this.deathEndsAt;
  }
  reset() {
    this.conjure.reset();
    this.mixer.stopAllAction();
    this.power = undefined;
    this.wall = false;
    this.deathEndsAt = undefined;
    this.idleSeconds = 0;
    this.current = 'Idle';
    this.actions.Idle.reset().setEffectiveWeight(1).play();
    this.mixer.update(0);
  }

  private advance(delta: number) {
    this.mixer.update(delta);
    this.conjure.update(delta, this.current === 'Conjure');
  }

  update(delta: number, motion?: ArchmageMotion, wallActive = false, effectFinished = false, wallAgeSeconds?: number, glide = false) {
    if (this.deathEndsAt !== undefined) { this.advance(delta); return; }
    if (wallActive) {
      if (!this.wall) {
        this.power = undefined;
        this.wall = true;
        this.wallSeconds = 0;
        this.idleSeconds = 0;
        this.play('Wall');
      }
      this.wallSeconds = wallAgeSeconds ?? this.wallSeconds + delta;
      this.actions.Wall.paused = true;
      this.actions.Wall.time = Math.min(this.wallRaiseSeconds, this.wallSeconds);
      this.advance(delta);
      return;
    }
    if (this.wall) { this.wall = false; this.play('Idle'); }
    if (this.power) {
      this.advance(delta);
      if (this.power.phase === 'lowering') {
        if (this.actions.PowerLower.time >= ARCHMAGE_LOWER_SECONDS - 1e-6) this.cancelPower();
      } else if (this.powerRaised) {
        this.actions.Power.paused = true;
        if (this.power.phase === 'playing') this.power.phase = 'holding';
        if (this.power.phase === 'resolving' && effectFinished) {
          this.power.phase = 'lowering';
          this.play('PowerLower');
        }
      }
      return;
    }
    if (glide) {
      this.idleSeconds = 0;
      this.play('Glide');
      this.actions.Glide.paused = true;
      this.actions.Glide.time = 0;
    } else if (motion) {
      this.idleSeconds = 0;
      const gait = archmageGait(motion.squares);
      this.play(gait);
      const action = this.actions[gait];
      action.paused = true;
      // Distance, rather than render delta, also keeps diagonal steps and delayed frames synchronized.
      action.time = motion.travelledDistance / (stanceSpeed[gait] * ARCHMAGE_SCALE * motion.bodyScale) % action.getClip().duration;
    } else {
      this.idleSeconds += delta;
      this.play(Math.floor(this.idleSeconds / 10) % 2 ? 'Conjure' : 'Idle');
    }
    this.advance(delta);
  }
}
