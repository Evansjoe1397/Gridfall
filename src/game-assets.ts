import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetsForScene } from './game-asset-catalog.ts';
import { retryAssetLoad } from './retry-asset-load.ts';

const models = new Map<string, Promise<GLTF>>();
const textures = new Map<string, Promise<THREE.Texture>>();
type AssetActivity = { pending: number; error?: unknown; progress?: AssetProgress; status?: string };
let activity: AssetActivity = { pending: 0 };
let activityListener: ((activity: AssetActivity) => void) | undefined;

export function onGameAssetActivity(listener: (activity: AssetActivity) => void) {
  activityListener = listener;
  listener(activity);
}

export function setAssetPreparationStatus(status?: string) {
  activity = { ...activity, status };
  activityListener?.(activity);
}

export function trackGameAssetPreparation<T>(promise: Promise<T>): Promise<T> {
  activity = { ...activity, pending: activity.pending + 1 };
  activityListener?.(activity);
  return promise.then(value => {
    activity = { ...activity, pending: activity.pending - 1 };
    activityListener?.(activity);
    return value;
  }, error => {
    activity = { pending: activity.pending - 1, error };
    activityListener?.(activity);
    throw error;
  });
}

function assetKey(url: string) {
  const path = url.split('?')[0];
  return path.startsWith(import.meta.env.BASE_URL) ? path.slice(import.meta.env.BASE_URL.length) : path;
}

function assetUrl(key: string) {
  return `${import.meta.env.BASE_URL}${__GRIDFALL_ASSETS__[key]?.url ?? key}`;
}

/** Share parsed templates, not just downloaded bytes, with all scene builders. */
export function loadGameModel(url: string): Promise<GLTF> {
  const key = assetKey(url);
  let promise = models.get(key);
  if (!promise) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    promise = trackGameAssetPreparation(retryAssetLoad(assetUrl(key), value => loader.loadAsync(value))).catch(error => {
      models.delete(key);
      throw error;
    });
    models.set(key, promise);
  }
  return promise;
}

function loadTextureSource(key: string) {
  let promise = textures.get(key);
  if (!promise) {
    promise = trackGameAssetPreparation(retryAssetLoad(assetUrl(key), value => new THREE.TextureLoader().loadAsync(value))).catch(error => {
      textures.delete(key);
      throw error;
    });
    textures.set(key, promise);
  }
  return promise;
}

/** Each owner may change wrapping/filtering without mutating another material. */
export async function loadGameTexture(url: string): Promise<THREE.Texture> {
  return (await loadTextureSource(assetKey(url))).clone();
}

export type AssetProgress = { completed: number; total: number; loadedBytes: number; totalBytes: number; path: string };

const preparedScenes = new Map<string, Promise<void>>();

export function prepareGameResources(arena: string | undefined, characters: readonly string[]) {
  const roster = [...new Set(characters)].sort();
  const key = `${arena ?? 'archive'}:${roster.join(',')}`;
  let promise = preparedScenes.get(key);
  if (!promise) {
    promise = trackGameAssetPreparation(prepareResources(arena, roster)).catch(error => {
      preparedScenes.delete(key);
      throw error;
    });
    preparedScenes.set(key, promise);
  }
  return promise;
}

async function prepareResources(arena: string | undefined, characters: readonly string[]) {
  setAssetPreparationStatus();
  const artwork = import.meta.glob<string>([
    './assets/combat-portraits/*.{avif,png,webp}',
    './assets/character-profiles/*.{avif,png,webp,svg}',
    './assets/icons/*.{png,svg}',
  ], { eager: true, query: '?url', import: 'default' });
  const entries = [
    ...assetsForScene(arena, characters).map(path => ({ path, url: assetUrl(path), bytes: __GRIDFALL_ASSETS__[path].bytes })),
    ...Object.entries(artwork).filter(([path]) => characters.some(character => path.split('/').at(-1)?.startsWith(`${character}.`)))
      .map(([path, url]) => ({ path, url, bytes: __GRIDFALL_ARTWORK_BYTES__[path] })),
  ];
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let next = 0, completed = 0, loadedBytes = 0;
  const report = (path: string) => {
    activity = { ...activity, progress: { completed, total: entries.length, loadedBytes, totalBytes, path } };
    activityListener?.(activity);
  };
  report('');
  // Prepare only the current roster/arena; neither the menu nor statistics needs them.
  const results = await Promise.allSettled(Array.from({ length: 3 }, async () => {
    while (next < entries.length) {
      const { path, url, bytes } = entries[next++];
      if (path.endsWith('.glb')) await loadGameModel(`${import.meta.env.BASE_URL}${path}`);
      else if (path.startsWith('textures/')) await loadTextureSource(path);
      else await retryAssetLoad(url, async value => {
        const response = await fetch(value, { cache: 'force-cache', signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Asset ${path}: HTTP ${response.status}`);
        // Consume the body so preparation waits for the complete download.
        await response.arrayBuffer();
      });
      completed++;
      loadedBytes += bytes;
      report(path);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
