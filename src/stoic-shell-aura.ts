import * as THREE from 'three';

export function updateStoicShellAura(group: THREE.Group, active: boolean): void {
  if (!group.getObjectByName('JohnBody')) return;
  let aura = group.getObjectByName('StoicShellAura') as THREE.Group | undefined;
  if (!aura) {
    aura = new THREE.Group();
    aura.name = 'StoicShellAura';
    aura.position.y = 1.12;
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x9c4dff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    shield.scale.y = 1.35;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc28aff, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending });
    const equator = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.022, 10, 48), ringMaterial);
    equator.rotation.x = Math.PI / 2;
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.022, 10, 48), ringMaterial.clone());
    meridian.rotation.y = Math.PI / 2;
    aura.add(shield, equator, meridian);
    group.add(aura);

    // Keep the light outside the hidden aura. Changing the visible light count
    // changes Three.js shader program keys across the entire lit scene.
    const light = new THREE.PointLight(0x9c4dff, 0, 4);
    light.name = 'StoicShellAuraLight';
    light.position.copy(aura.position);
    group.add(light);
  }
  aura.visible = active;
  const light = group.getObjectByName('StoicShellAuraLight') as THREE.PointLight;
  light.intensity = active ? 3 : 0;
  if (!active) aura.scale.setScalar(1);
}
