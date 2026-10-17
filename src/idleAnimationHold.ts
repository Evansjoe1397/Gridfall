import * as THREE from 'three';

export type IdleAnimationState = { mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>; current: string };
const idleNames = new Set(['Idle', 'Idle_Wielding', 'IdleWithShield', 'IdleNoShield']);
const ambientIdle: Record<string, string> = { Conjure: 'Idle', Alert: 'Idle', Alert_Wielding: 'Idle_Wielding', Boom_Dance: 'Idle', You_Groove: 'Idle' };

export function effectIdleHoldActive(phase: string, postCombatSequence: boolean, effectsPending: boolean, specialMovementPending: boolean) {
  return phase === 'double-jump' || phase === 'dance-through' || specialMovementPending || (postCombatSequence && effectsPending);
}

/** Pause only idle actions, leaving attacks, movement and effects on their own clocks. */
export class IdleAnimationHold {
  private readonly paused = new Map<THREE.AnimationAction, boolean>();

  sync(state: IdleAnimationState, hold: boolean) {
    if (!hold) {
      for (const action of Object.values(state.actions)) {
        const previous = this.paused.get(action);
        if (previous !== undefined) { action.paused = previous; this.paused.delete(action); }
      }
      return;
    }
    const idle = ambientIdle[state.current];
    if (idle && state.actions[idle]) {
      state.actions[state.current].stop();
      state.current = idle;
      state.actions[idle].reset().setEffectiveWeight(1).play();
    }
    for (const [name, action] of Object.entries(state.actions)) {
      if (!idleNames.has(name)) continue;
      if (!this.paused.has(action)) this.paused.set(action, action.paused);
      action.time = 0;
      action.paused = true;
    }
    state.mixer.update(0);
  }
}
