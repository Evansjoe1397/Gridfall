import * as THREE from 'three';

type PyroAura = THREE.Group & { userData: { time: { value: number }; geometry: THREE.SphereGeometry; material: THREE.ShaderMaterial; count: number } };

function createAura(): PyroAura {
  const aura = new THREE.Group() as PyroAura;
  aura.name = 'PyroChargeAura';
  const time = { value: 0 };
  const geometry = new THREE.SphereGeometry(.17, 16, 12);
  const material = new THREE.ShaderMaterial({
    uniforms: { time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `uniform float time; varying vec3 p; varying vec3 n;
      void main() { p = position; n = normal; vec3 v = position * (1. + .09 * sin(time * 8. + position.y * 45. + position.x * 23.));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(v, 1.); }`,
    fragmentShader: `uniform float time; varying vec3 p; varying vec3 n;
      void main() { float flicker = .5 + .5 * sin(p.y * 35. - time * 7. + sin(p.x * 31. + time * 3.));
      vec3 color = mix(vec3(1., .12, .005), vec3(1., .94, .45), flicker * .75 + .1);
      gl_FragColor = vec4(color, .78);
      #include <colorspace_fragment>
      }`,
  });
  aura.userData = { time, geometry, material, count: 0 };
  for (let index = 0; index < 3; index++) {
    const orb = new THREE.Group(); orb.name = `PyroCharge${index + 1}`; orb.visible = false;
    const core = new THREE.Mesh(geometry, material); core.raycast = () => {}; orb.add(core);
    const halo = new THREE.Mesh(geometry, material); halo.scale.setScalar(1.65); halo.raycast = () => {}; orb.add(halo);
    aura.add(orb);
  }
  return aura;
}

/** Local-space orbits follow their Character through ordinary and forced movement. */
export function updatePyroChargeVisuals(root: THREE.Group, count: number, time: number, alive = true): void {
  let aura = root.getObjectByName('PyroChargeAura') as PyroAura | undefined;
  const visibleCount = alive ? Math.max(0, Math.min(3, count)) : 0;
  if (!aura && visibleCount === 0) return;
  if (!aura) { aura = createAura(); root.add(aura); }
  aura.userData.time.value = time / 1000;
  aura.visible = visibleCount > 0;
  aura.children.forEach((orb, index) => {
    if (index >= aura!.userData.count && index < visibleCount) orb.userData.spawnedAt = time;
    orb.visible = index < visibleCount;
    const phase = index * 2.39996;
    const angle = time * (.0011 + index * .00023) * (index === 1 ? -1 : 1) + phase;
    const wobble = Math.sin(time * .0027 + phase) * .12;
    orb.position.set(Math.cos(angle) * (.76 + index * .08 + wobble), 1.2 + Math.sin(angle * (1.4 + index * .37) + phase) * .35, Math.sin(angle) * (.71 + index * .1 - wobble));
    orb.scale.setScalar(Math.max(.01, Math.min(1, (time - Number(orb.userData.spawnedAt ?? time)) / 300)) * (1 + .1 * Math.sin(time * .008 + phase)));
  });
  aura.userData.count = visibleCount;
}

export function disposePyroChargeVisuals(root: THREE.Group): void {
  const aura = root.getObjectByName('PyroChargeAura') as PyroAura | undefined;
  if (!aura) return;
  aura.userData.geometry.dispose(); aura.userData.material.dispose(); aura.removeFromParent();
}
