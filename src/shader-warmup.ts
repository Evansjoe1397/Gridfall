import * as THREE from 'three';

type Compiler = Pick<THREE.WebGLRenderer, 'compileAsync'>;
const active = new WeakMap<Compiler, WeakMap<THREE.Scene, Promise<void>>>();
const warmingScenes = new WeakMap<THREE.Scene, number>();

export function isScenePrewarming(scene: THREE.Scene) { return (warmingScenes.get(scene) ?? 0) > 0; }

export function visiblePointLightCount(scene: THREE.Scene, camera: THREE.Camera) {
  let count = 0;
  scene.traverseVisible(object => {
    if (object instanceof THREE.PointLight && object.layers.test(camera.layers)) count++;
  });
  return count;
}

/** Move common spell-light variants into loading, without permanent extra lights. */
export function prewarmPointLightVariants(renderer: Compiler, scene: THREE.Scene, camera: THREE.Camera, extraLights = 3): Promise<void> {
  let scenes = active.get(renderer);
  if (!scenes) { scenes = new WeakMap(); active.set(renderer, scenes); }
  const running = scenes.get(scene);
  if (running) return running;
  warmingScenes.set(scene, (warmingScenes.get(scene) ?? 0) + 1);
  const task = (async () => {
    const temporary: THREE.PointLight[] = [];
    try {
      await renderer.compileAsync(scene, camera);
      for (let index = 0; index < extraLights; index++) {
        const light = new THREE.PointLight(0xffffff, 0, 1);
        light.name = 'ShaderWarmupLight';
        light.layers.mask = camera.layers.mask;
        temporary.push(light);
        scene.add(light);
        await renderer.compileAsync(scene, camera);
      }
    } finally {
      for (const light of temporary) { scene.remove(light); light.dispose(); }
      warmingScenes.set(scene, (warmingScenes.get(scene) ?? 1) - 1);
    }
  })().finally(() => scenes!.delete(scene));
  scenes.set(scene, task);
  return task;
}
