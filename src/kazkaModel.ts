import * as THREE from 'three';

type KazkaPose = 'idle' | 'attack' | 'defend';
type KazkaRig = {
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  eyes: THREE.MeshStandardMaterial;
  glow: THREE.PointLight;
};

/** A code-built placeholder model until Kazka receives authored art. */
export function createKazka(): THREE.Group {
  const root = new THREE.Group();
  root.userData.facingSide = 'negative-z';
  root.userData.characterModelLoadSettled = true;
  root.userData.deathAnimationAvailable = false;
  const body = new THREE.Group();
  body.name = 'KazkaBody';
  root.add(body);
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf1eae4, roughness: 0.74, side: THREE.DoubleSide });
  const silk = new THREE.MeshStandardMaterial({ color: 0xfff9f2, roughness: 0.52, side: THREE.DoubleSide });
  const shadowSilk = new THREE.MeshStandardMaterial({ color: 0xd5d1d1, roughness: 0.75 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9d1727, emissive: 0x310007, emissiveIntensity: 0.18, roughness: 0.48 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x130d19, roughness: 0.86 });
  const eyes = new THREE.MeshStandardMaterial({ color: 0x481920, emissive: 0x000000, emissiveIntensity: 0 });
  const glow = new THREE.PointLight(0xff1737, 0, 1.4);
  glow.position.set(0, 2.11, -0.33);
  body.add(glow);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Group = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // Layered skirt and narrow bodice make the white dress legible on the board.
  add(new THREE.CylinderGeometry(0.22, 0.52, 1.16, 32, 1), silk, 0, 0.63, 0);
  add(new THREE.CylinderGeometry(0.47, 0.53, 0.12, 32), shadowSilk, 0, 0.075, 0);
  const bodice = add(new THREE.CylinderGeometry(0.22, 0.18, 0.67, 24), silk, 0, 1.52, 0);
  bodice.scale.z = 0.74;
  add(new THREE.CylinderGeometry(0.085, 0.105, 0.16, 16), ivory, 0, 1.92, 0);
  add(new THREE.SphereGeometry(0.235, 24, 16), ivory, 0, 2.135, 0);
  // A dark cap and several long locks frame her pale face.
  add(new THREE.SphereGeometry(0.25, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, 0, 2.235, 0);
  for (const side of [-1, 1]) {
    const lock = add(new THREE.CapsuleGeometry(0.068, 0.57, 6, 12), hair, side * 0.205, 1.87, 0.075);
    lock.rotation.z = side * 0.12;
    add(new THREE.SphereGeometry(0.027, 12, 8), eyes, side * 0.085, 2.145, -0.222);
    add(new THREE.SphereGeometry(0.024, 12, 8), hair, side * 0.086, 2.205, -0.217);
  }
  add(new THREE.CapsuleGeometry(0.13, 0.65, 6, 14), hair, 0, 1.74, 0.21);
  // Crimson embroidery follows the front of the skirt and neckline.
  const stitch = (points: [number, number, number][], radius = 0.012) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    add(new THREE.TubeGeometry(curve, 32, radius, 6, false), red, 0, 0, 0);
  };
  for (const side of [-1, 1]) {
    stitch([[0, 1.63, -0.17], [side * 0.15, 1.4, -0.16], [side * 0.1, 1.18, -0.2], [side * 0.28, 0.86, -0.32], [side * 0.18, 0.53, -0.43], [side * 0.36, 0.17, -0.43]]);
    stitch([[side * 0.16, 1.15, -0.19], [side * 0.26, 0.96, -0.28], [side * 0.11, 0.75, -0.35], [side * 0.28, 0.55, -0.39]]);
    stitch([[side * 0.28, 0.34, -0.43], [side * 0.18, 0.29, -0.47], [side * 0.32, 0.22, -0.44]], 0.009);
  }
  stitch([[-0.15, 1.77, -0.08], [0, 1.68, -0.18], [0.15, 1.77, -0.08]], 0.017);
  const arms: THREE.Group[] = [];
  const forearms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 1.77, 0);
    body.add(shoulder);
    const sleeve = add(new THREE.CylinderGeometry(0.12, 0.105, 0.38, 14), silk, side * 0.07, -0.17, 0, shoulder);
    sleeve.rotation.z = side * 0.22;
    const forearm = new THREE.Group();
    forearm.position.set(side * 0.12, -0.34, 0);
    shoulder.add(forearm);
    const lowerSleeve = add(new THREE.CylinderGeometry(0.092, 0.125, 0.37, 14), silk, 0, -0.14, -0.025, forearm);
    lowerSleeve.rotation.x = -0.15;
    add(new THREE.SphereGeometry(0.084, 12, 10), ivory, 0, -0.34, -0.06, forearm);
    stitch([[side * 0.15, 1.68, -0.09], [side * 0.3, 1.53, -0.11], [side * 0.36, 1.38, -0.06]], 0.009);
    arms.push(shoulder);
    forearms.push(forearm);
  }
  root.userData.kazkaRig = { leftArm: arms[0], rightArm: arms[1], leftForearm: forearms[0], rightForearm: forearms[1], eyes, glow } satisfies KazkaRig;
  return root;
}

export function updateKazkaAnimation(root: THREE.Group, timeMs: number, pose: KazkaPose): void {
  const rig = root.userData.kazkaRig as KazkaRig | undefined;
  if (!rig) return;
  const time = timeMs / 1000;
  const pulse = Math.sin(time * (pose === 'idle' ? 2.3 : 7));
  // Both forearms cross and uncross in front of her as she narrates combat.
  rig.leftArm.rotation.z = -0.48 - Math.sin(time * 2.4) * 0.19;
  rig.rightArm.rotation.z = 0.48 + Math.sin(time * 2.4 + 1.1) * 0.19;
  rig.leftArm.rotation.x = -0.34 - (pose === 'attack' ? 0.48 : 0.14) + pulse * 0.12;
  rig.rightArm.rotation.x = -0.34 - (pose === 'defend' ? 0.48 : 0.14) - pulse * 0.12;
  rig.leftForearm.rotation.z = -0.6 + Math.sin(time * 2.4 + 0.7) * 0.17;
  rig.rightForearm.rotation.z = 0.6 - Math.sin(time * 2.4 + 1.8) * 0.17;
  const color = pose === 'attack' ? 0xff1432 : pose === 'defend' ? 0x209bff : 0x481920;
  rig.eyes.color.setHex(color);
  rig.eyes.emissive.setHex(pose === 'idle' ? 0x000000 : color);
  rig.eyes.emissiveIntensity = pose === 'idle' ? 0 : 2.2 + Math.abs(pulse) * 1.5;
  rig.glow.color.setHex(color);
  rig.glow.intensity = pose === 'idle' ? 0 : 0.7 + Math.abs(pulse) * 0.6;
}
