import * as THREE from 'three';

/** Replace the authored body with an animated red/blue smoke vortex in transit. */
export function updatePyrodashVisuals(root: THREE.Group, active: boolean, time: number): void {
  let smoke = root.getObjectByName('PyrodashSmoke') as THREE.Group | undefined;
  if (!active) { if (smoke) disposePyrodashVisuals(root); return; }
  if (!smoke) {
    smoke = new THREE.Group(); smoke.name = 'PyrodashSmoke';
    const geometry = new THREE.SphereGeometry(1, 14, 10);
    const materials = [0xff2744, 0x287dff].map((color) => new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `uniform float time; varying vec3 p; varying vec3 n; varying vec3 v;
        void main() { p = position; vec3 displaced = position * (1. + .12 * sin(position.y * 11. + time * 9. + position.x * 7.));
        vec4 mv = modelViewMatrix * vec4(displaced, 1.); n = normalize(normalMatrix * normal); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float time; uniform vec3 color; varying vec3 p; varying vec3 n; varying vec3 v;
        void main() { float cloud = .5 + .5 * sin(p.x * 9. + time * 4. + sin(p.y * 12. - time * 7.) + p.z * 8.);
        float edge = pow(abs(dot(normalize(n), normalize(v))), 1.5);
        gl_FragColor = vec4(mix(color * .55, color + vec3(.15), cloud), edge * (.1 + cloud * .26));
        #include <colorspace_fragment>
        }`,
    }));
    for (let index = 0; index < 18; index++) {
      const puff = new THREE.Mesh(geometry, materials[index % 2]); puff.raycast = () => {}; smoke.add(puff);
    }
    smoke.userData.geometry = geometry; smoke.userData.materials = materials;
    smoke.userData.body = root.children[0]; smoke.userData.bodyVisible = root.children[0]?.visible;
    if (root.children[0]) root.children[0].visible = false;
    root.add(smoke);
  }
  for (const material of smoke.userData.materials as THREE.ShaderMaterial[]) material.uniforms.time.value = time / 1000;
  smoke.children.forEach((puff, index) => {
    const phase = index * 2.39996 + time * .007 * (index % 2 ? -1 : 1);
    const height = (index % 6) * .31;
    const radius = .25 + (index % 3) * .13;
    puff.position.set(Math.cos(phase) * radius, .35 + height + Math.sin(phase * 1.7) * .12, Math.sin(phase) * radius);
    puff.scale.set(.44 + .1 * Math.sin(phase), .38 + (index % 4) * .08, .6);
  });
}

export function disposePyrodashVisuals(root: THREE.Group): void {
  const smoke = root.getObjectByName('PyrodashSmoke');
  if (!smoke) return;
  if (smoke.userData.body) smoke.userData.body.visible = smoke.userData.bodyVisible;
  (smoke.userData.geometry as THREE.SphereGeometry).dispose();
  for (const material of smoke.userData.materials as THREE.ShaderMaterial[]) material.dispose();
  smoke.removeFromParent();
}
