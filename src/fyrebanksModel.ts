import * as THREE from 'three';

type Pose = 'idle' | 'attack' | 'defend';
type FyreRig = { leftArm: THREE.Group; rightArm: THREE.Group; lens: THREE.MeshStandardMaterial };

/** Procedural red-robed Fire Mage, facing negative Z like the other custom rigs. */
export function createFyrebanks(): THREE.Group {
  const root = new THREE.Group();
  root.userData.facingSide = 'negative-z';
  root.userData.characterModelLoadSettled = true;
  root.userData.deathAnimationAvailable = false;
  const body = new THREE.Group(); body.name = 'FyrebanksBody'; root.add(body);
  const robe = new THREE.MeshStandardMaterial({ color: 0xa51f29, roughness: .8 });
  const darkRed = new THREE.MeshStandardMaterial({ color: 0x540e1a, roughness: .85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf3be61, metalness: .75, roughness: .27 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe2b28c, roughness: .8 });
  const beard = new THREE.MeshStandardMaterial({ color: 0xdfd3bc, roughness: .9 });
  const eyes = new THREE.MeshStandardMaterial({ color: 0x231c1d });
  const lens = new THREE.MeshStandardMaterial({ color: 0x92e6ec, transparent: true, opacity: .45, metalness: .3, roughness: .1, emissive: 0xff721e, emissiveIntensity: .1 });
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent = body) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  add('RedRobe', new THREE.CylinderGeometry(.25, .54, 1.25, 24), robe, 0, .68, 0);
  add('RobeHem', new THREE.CylinderGeometry(.53, .55, .1, 24), gold, 0, .09, 0);
  add('RedBodice', new THREE.CylinderGeometry(.3, .24, .66, 20), robe, 0, 1.52, 0);
  add('GoldenBelt', new THREE.CylinderGeometry(.265, .265, .1, 24), gold, 0, 1.25, 0);
  add('FrontTrim', new THREE.BoxGeometry(.075, 1.04, .035), gold, 0, .7, -.37).rotation.x = -.24;
  add('Head', new THREE.SphereGeometry(.25, 24, 16), skin, 0, 2.02, 0);
  add('Nose', new THREE.SphereGeometry(.055, 12, 8), skin, 0, 2, -.245);
  for (const side of [-1, 1]) {
    add('Eye', new THREE.SphereGeometry(.026, 12, 8), eyes, side * .09, 2.07, -.23);
    add('Eyebrow', new THREE.BoxGeometry(.085, .022, .028), beard, side * .09, 2.13, -.235);
  }
  const whiskers = add('Beard', new THREE.ConeGeometry(.18, .48, 16), beard, 0, 1.78, -.18);
  whiskers.rotation.z = Math.PI;
  add('HatBrim', new THREE.CylinderGeometry(.45, .45, .08, 24), darkRed, 0, 2.24, 0);
  const hat = add('RedWizardHat', new THREE.ConeGeometry(.31, .7, 24), robe, .04, 2.61, 0);
  hat.rotation.z = -.13;
  add('HatBand', new THREE.CylinderGeometry(.305, .32, .09, 24), gold, 0, 2.31, 0);
  add('MonocleRim', new THREE.TorusGeometry(.092, .014, 8, 24), gold, -.09, 2.07, -.263);
  add('FocusLens', new THREE.CircleGeometry(.08, 24), lens, -.09, 2.07, -.267).rotation.y = Math.PI;
  const chain = new THREE.CatmullRomCurve3([new THREE.Vector3(-.18, 2.06, -.25), new THREE.Vector3(-.28, 1.84, -.22), new THREE.Vector3(-.21, 1.67, -.18)]);
  add('MonocleChain', new THREE.TubeGeometry(chain, 18, .008, 5, false), gold, 0, 0, 0);
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .3, 1.75, 0); body.add(arm);
    const sleeve = add('RedSleeve', new THREE.CylinderGeometry(.12, .19, .65, 16), robe, side * .08, -.28, 0, arm);
    sleeve.rotation.z = side * .2;
    add('GoldenCuff', new THREE.CylinderGeometry(.185, .185, .07, 16), gold, side * .14, -.57, 0, arm);
    add('Hand', new THREE.SphereGeometry(.095, 12, 8), skin, side * .14, -.67, 0, arm);
    arms.push(arm);
  }
  root.userData.fyreRig = { leftArm: arms[0], rightArm: arms[1], lens } satisfies FyreRig;
  return root;
}

export function updateFyrebanksAnimation(root: THREE.Group, timeMs: number, pose: Pose): void {
  const rig = root.userData.fyreRig as FyreRig | undefined;
  if (!rig) return;
  const sway = Math.sin(timeMs * .0024) * .055;
  rig.leftArm.rotation.set(pose === 'defend' ? 1.2 : -.12 + sway, 0, -.12);
  rig.rightArm.rotation.set(pose === 'attack' ? 1.45 : -.12 - sway, 0, .12);
  rig.lens.emissiveIntensity = pose === 'attack' ? 1.3 : .12 + Math.abs(sway);
}
