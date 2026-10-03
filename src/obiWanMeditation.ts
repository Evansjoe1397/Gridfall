import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { retryAssetLoad } from './retry-asset-load.ts';
import { updateJohnSpiritTransition } from './johnChristTransition.ts';

export const MEDITATION_IDLE_MS = 20_000;
export const MEDITATION_SWITCH_SECONDS = 0.65;
export type MeditationTiming = { lastActivity: number; blend: number };

export function advanceMeditation(state: MeditationTiming, now: number, delta: number, busy: boolean, ready: boolean) {
  if (busy) state.lastActivity = now;
  const active = !busy && ready && now - state.lastActivity >= MEDITATION_IDLE_MS;
  const target = active ? 1 : 0;
  state.blend += Math.sign(target - state.blend) * Math.min(Math.abs(target - state.blend), Math.max(0, delta) / MEDITATION_SWITCH_SECONDS);
  return active;
}

type MeditationState = MeditationTiming & { model?: THREE.Group; loading?: boolean; retryAt: number };
const states = new WeakMap<THREE.Group, MeditationState>();
let assetPromise: ReturnType<GLTFLoader['loadAsync']> | undefined;

function stateFor(root: THREE.Group, now: number) {
  let state = states.get(root);
  if (!state) { state = { lastActivity: now, blend: 0, retryAt: 0 }; states.set(root, state); }
  return state;
}

export function interruptObiWanMeditation(root: THREE.Group, now = performance.now()) {
  const state = stateFor(root, now);
  state.lastActivity = now;
  // Reveal the animated rig immediately: gameplay never waits for the exit effect.
  if (state.model) state.model.visible = false;
  const normal = root.getObjectByName('ObiWanImportedModel');
  if (normal) normal.visible = true;
}

/** A newly selected archive tab starts with a fresh idle and no leftover effect. */
export function resetObiWanMeditation(root: THREE.Group, now = performance.now()) {
  interruptObiWanMeditation(root, now);
  stateFor(root, now).blend = 0;
  updateJohnSpiritTransition(root, 0);
}

async function loadMeditation(root: THREE.Group, state: MeditationState, normal: THREE.Object3D) {
  state.loading = true;
  try {
    const asset = await (assetPromise ??= retryAssetLoad(`${import.meta.env.BASE_URL}models/obi-wan-meditation.glb?v=2`, url => new GLTFLoader().loadAsync(url)).catch(error => {
      assetPromise = undefined;
      throw error;
    }));
    if (!normal.parent) return;
    const model = asset.scene.clone(true);
    model.name = 'ObiWanMeditation';
    // Normalize the supplied centered static pose to board scale and ground its feet.
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.7 / size.y;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    model.userData.groundY = model.position.y;
    model.visible = false;
    model.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = false; } });
    normal.parent.add(model);
    state.model = model;
  } catch (error) {
    state.retryAt = performance.now() + 30_000;
    console.error('Failed to load meditation; keeping Obi Wan idle.', error);
  } finally {
    state.loading = false;
  }
}

export function updateObiWanMeditation(root: THREE.Group, delta: number, busy: boolean, now = performance.now()) {
  const normal = root.getObjectByName('ObiWanImportedModel');
  if (!normal) return;
  const state = stateFor(root, now);
  if (!busy && !state.model && !state.loading && now >= state.retryAt && now - state.lastActivity >= 15_000) void loadMeditation(root, state, normal);
  const active = advanceMeditation(state, now, delta, busy, Boolean(state.model));
  // Swap under the particle burst; exit immediately so attacks/moves are never hidden.
  const showMeditation = active && state.blend >= 0.5;
  normal.visible = !showMeditation;
  if (state.model) {
    state.model.visible = showMeditation;
    state.model.position.y = Number(state.model.userData.groundY) + (0.18 + Math.sin(now * 0.0015) * 0.045) * state.blend;
  }
  updateJohnSpiritTransition(root, state.blend);
}
