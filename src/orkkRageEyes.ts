import * as THREE from 'three';

// Shared soft halo texture; each character only owns its sprite materials.
let haloTexture: THREE.CanvasTexture | undefined;
function getHaloTexture() {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  for (let i = 0; i < 6; i++) {
    const x = 32 + Math.sin(i * 2.4) * 12;
    const y = 32 + Math.cos(i * 2.4) * 10;
    const gradient = context.createRadialGradient(x, y, 0, x, y, 20);
    gradient.addColorStop(0, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.25)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  haloTexture = new THREE.CanvasTexture(canvas);
  return haloTexture;
}

/** Locate an eye on the actual skinned surface instead of guessing head offsets. */
function findEyeAnchor(body: THREE.Mesh, x: number, y: number) {
  const uv = body.geometry.getAttribute('uv');
  if (!uv) return undefined;
  const index = body.geometry.index;
  const target = new THREE.Vector3(x / 1024, y / 1024, 0);
  const triangle = new THREE.Triangle();
  const weights = new THREE.Vector3();
  for (let i = 0; i < (index?.count ?? uv.count); i += 3) {
    const vertices = [0, 1, 2].map((offset) => index ? index.getX(i + offset) : i + offset);
    [triangle.a, triangle.b, triangle.c].forEach((point, corner) => {
      point.set(uv.getX(vertices[corner]), uv.getY(vertices[corner]), 0);
    });
    if (!triangle.getBarycoord(target, weights) || Math.min(weights.x, weights.y, weights.z) < -0.0001) continue;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const normal = new THREE.Vector3(), edge = new THREE.Vector3();
    return (position: THREE.Vector3) => {
      body.localToWorld(body.getVertexPosition(vertices[0], a));
      body.localToWorld(body.getVertexPosition(vertices[1], b));
      body.localToWorld(body.getVertexPosition(vertices[2], c));
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      position.copy(a).multiplyScalar(weights.x).addScaledVector(b, weights.y).addScaledVector(c, weights.z);
      position.addScaledVector(normal, 0.012);
    };
  }
  return undefined;
}

/** Eye regions in the 1024px atlas of da-orkh-optimized-skill03.glb.
 * glTF textures use flipY=false, so these UVs follow the image's top-down Y.
 * Applying emission on the skinned surface keeps it attached in every pose
 * and naturally occluded when the character faces away from the camera.
 */
export function installOrkkRageEyes(model: THREE.Group) {
  const intensity = { value: 0 };
  const body = model.getObjectByName('Da_Orkh');
  const effect = new THREE.Group();
  effect.name = 'OrkkRageEyeGlow';
  effect.visible = false;
  model.add(effect);
  const eyes = body instanceof THREE.Mesh ? [[733, 479], [355, 606]].flatMap(([x, y]) => {
    const anchor = findEyeAnchor(body, x, y);
    if (!anchor) return [];
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHaloTexture(), color: 0xff0802, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, transparent: true,
    }));
    effect.add(halo);
    return [{ anchor, halo, position: new THREE.Vector3() }];
  }) : [];
  let strength = 0;
  const worldScale = new THREE.Vector3();
  if (body instanceof THREE.Mesh) {
    const materials = Array.isArray(body.material) ? body.material : [body.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.map) continue;
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.uniforms.orkkRageEyeIntensity = intensity;
        shader.fragmentShader = `uniform float orkkRageEyeIntensity;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          #ifdef USE_MAP
            vec2 eyePixel = vMapUv * 1024.0;
            vec2 largeEye = eyePixel - vec2(733.0, 479.0);
            largeEye = mat2(0.970, 0.243, -0.243, 0.970) * largeEye;
            float eyeDistance = min(length(largeEye / vec2(12.0, 6.0)),
              length((eyePixel - vec2(355.0, 606.0)) / vec2(5.0, 4.0)));
            float eyeMask = 1.0 - smoothstep(0.65, 1.2, eyeDistance);
            totalEmissiveRadiance += vec3(1.0, 0.006, 0.002) * eyeMask * orkkRageEyeIntensity;
          #endif`,
        );
      };
      material.customProgramCacheKey = () => `${previousKey}|orkk-rage-eyes-v2`;
      material.needsUpdate = true;
    }
  }
  return {
    setRage(rageStacks: number) {
      strength = THREE.MathUtils.clamp(rageStacks, 0, 8) / 8;
      intensity.value = rageStacks > 0 ? 14 + strength * 14 : 0;
      effect.visible = rageStacks > 0;
    },
    update(time: number) {
      if (!effect.visible || !(body instanceof THREE.Mesh)) return;
      model.updateWorldMatrix(true, true);
      effect.getWorldScale(worldScale);
      const pulse = 1 + Math.sin(time * 0.008) * 0.12;
      eyes.forEach((eye) => {
        eye.anchor(eye.position);
        eye.halo.position.copy(eye.position);
        effect.worldToLocal(eye.halo.position);
        const haloSize = (0.14 + strength * 0.06) * pulse;
        eye.halo.scale.set(haloSize / worldScale.x, haloSize / worldScale.y, 1);
        eye.halo.material.opacity = 0.85;

      });
    },
  };
}
