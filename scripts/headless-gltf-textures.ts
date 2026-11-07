import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Keep rig/geometry tests independent of DOM image decoders, including WebP. */
export function installHeadlessTextures(loader: GLTFLoader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  loader.register(() => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
}
