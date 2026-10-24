import * as THREE from 'three';
import { isBurningSquare, type Cell, type GameState } from '../shared/game.ts';

/** Persistent, camera-facing flame tongues; one shared geometry and shader. */
export class PatchOfFlamesVisuals {
  readonly group = new THREE.Group();
  private readonly patches = new Map<string, THREE.Group>();
  private readonly geometry = new THREE.PlaneGeometry(0.65, 1.15).translate(0, 0.575, 0);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float seed;
      void main() {
        vUv = uv;
        seed = modelMatrix[3].x * 3.7 + modelMatrix[3].z * 5.3;
        vec4 center = modelViewMatrix * vec4(0., 0., 0., 1.);
        center.xy += position.xy;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying float seed;
      void main() {
        float y = vUv.y;
        float height = .78 + .12 * sin(time * 4. + seed);
        float sway = .11 * sin(time * 5. - y * 7. + seed) * y;
        float radius = .36 * pow(max(0., 1. - y / height), .7);
        float flame = 1. - smoothstep(radius * .45, radius + .035, abs(vUv.x - .5 - sway));
        float alpha = flame * smoothstep(0., .06, y) * (1. - smoothstep(height - .15, height, y)) * .82;
        if (alpha < .01) discard;
        vec3 color = mix(vec3(1., .12, .008), vec3(1., .76, .16), (1. - y) * flame);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  constructor() { this.group.name = 'PatchOfFlames'; }

  update(state: GameState, time: number, position: (cell: Cell) => THREE.Vector3, visible = true): void {
    this.material.uniforms.time.value = time / 1000;
    const active = new Set<string>();
    if (visible) for (const label of Object.keys(state.squareModifications ?? {})) {
      const cell = { x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 };
      if (!isBurningSquare(state, cell)) continue;
      active.add(label);
      let patch = this.patches.get(label);
      if (!patch) {
        patch = new THREE.Group();
        patch.name = `PatchOfFlames-${label}`;
        for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
          const flame = new THREE.Mesh(this.geometry, this.material);
          flame.position.set(x * .48, .025, z * .48);
          flame.frustumCulled = false;
          flame.raycast = () => {};
          patch.add(flame);
        }
        this.patches.set(label, patch);
        this.group.add(patch);
      }
      patch.position.copy(position(cell));
    }
    for (const [label, patch] of this.patches) if (!active.has(label)) {
      this.group.remove(patch);
      this.patches.delete(label);
    }
  }

  clear(): void { this.group.clear(); this.patches.clear(); }
  dispose(): void { this.clear(); this.group.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}
