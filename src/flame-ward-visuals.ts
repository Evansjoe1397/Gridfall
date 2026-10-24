import * as THREE from 'three';

/** Shared by the persistent Ward and its shield-to-fireball launch. */
export function createFlameWardShield(blueAura = false): THREE.Group {
  const shield = new THREE.Group(); shield.name = 'FlameWardShield';
  const outline = new THREE.Shape();
  outline.moveTo(0, -.48); outline.bezierCurveTo(-.48, -.22, -.43, .12, -.43, .35);
  outline.lineTo(0, .48); outline.lineTo(.43, .35); outline.bezierCurveTo(.43, .12, .48, -.22, 0, -.48);
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: .075, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 2, steps: 1 });
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec3 p; void main() { p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float time; varying vec3 p;
      void main() { float f = .5 + .5 * sin(p.y * 25. - time * 8. + sin(p.x * 22. + time * 3.));
      gl_FragColor = vec4(mix(vec3(1., .11, .005), vec3(1., .88, .25), f * .8), .76);
      #include <colorspace_fragment>
      }`,
  });
  const face = new THREE.Mesh(geometry, material); face.raycast = () => {}; shield.add(face);
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: 0xffd16a, transparent: true, opacity: .9, toneMapped: false }));
  rim.raycast = () => {}; shield.add(rim);
  const flame = new THREE.Shape(); flame.moveTo(0, -.23); flame.bezierCurveTo(-.26, -.1, -.12, .09, -.06, .2);
  flame.quadraticCurveTo(-.06, .02, .02, .04); flame.quadraticCurveTo(.17, .16, .04, .33);
  flame.bezierCurveTo(.35, .05, .22, -.16, 0, -.23);
  const emblem = new THREE.Mesh(new THREE.ShapeGeometry(flame), new THREE.MeshBasicMaterial({ color: 0xfff2a8, side: THREE.DoubleSide, toneMapped: false }));
  emblem.position.z = .12; emblem.raycast = () => {}; shield.add(emblem);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.59, 24, 16), new THREE.MeshBasicMaterial({ color: 0x63bfff, transparent: true, opacity: .14, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.name = 'FlameWardBlueAura'; halo.scale.set(1, 1.1, .48); halo.visible = blueAura; halo.raycast = () => {}; shield.add(halo);
  return shield;
}

export function animateFlameWardShield(shield: THREE.Group, time: number): void {
  shield.rotation.y = time * .0015;
  const face = shield.children[0] as THREE.Mesh<THREE.ExtrudeGeometry, THREE.ShaderMaterial>;
  face.material.uniforms.time.value = time / 1000;
  const halo = shield.getObjectByName('FlameWardBlueAura')!;
  halo.scale.set(1, 1.1, .48).multiplyScalar(1 + Math.sin(time * .004) * .08);
}

export function disposeFlameWardShield(shield: THREE.Group): void {
  shield.traverse((part) => {
    if (part instanceof THREE.Mesh || part instanceof THREE.LineSegments) {
      part.geometry.dispose();
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) material.dispose();
    }
  });
  shield.removeFromParent();
}

export function updateFlameWardVisuals(root: THREE.Group, level: number, time: number): void {
  let shield = root.getObjectByName('FlameWardShield') as THREE.Group | undefined;
  if (level <= 0) { if (shield) disposeFlameWardShield(shield); return; }
  if (!shield) { shield = createFlameWardShield(level >= 3); root.add(shield); }
  shield.position.set(0, 3.25 + Math.sin(time * .003) * .065, 0);
  shield.getObjectByName('FlameWardBlueAura')!.visible = level >= 3;
  animateFlameWardShield(shield, time);
}

export function disposeFlameWardVisuals(root: THREE.Group): void {
  const shield = root.getObjectByName('FlameWardShield') as THREE.Group | undefined;
  if (shield) disposeFlameWardShield(shield);
}
