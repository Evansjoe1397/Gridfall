import assert from 'node:assert/strict';
import * as THREE from 'three';
import { intersectBoardTargets } from '../src/board-picking.ts';
import { updateStoicShellAura } from '../src/stoic-shell-aura.ts';

// Clicks and ability hover must not evaluate the detailed animated GLB at all.
const character = new THREE.Group();
character.position.set(2, 0, 0);
character.userData.playerId = 'P1';
const animatedBody = new THREE.SkinnedMesh();
animatedBody.raycast = () => { throw new Error('CPU skinning during board picking'); };
character.add(animatedBody);
const hitArea = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1));
hitArea.name = 'CharacterHitArea'; hitArea.position.y = 1.5;
character.add(hitArea);
const tile = new THREE.Mesh(new THREE.BoxGeometry(1, .1, 1));
tile.position.set(2, -.1, 0); tile.userData.cell = { x: 1, y: 0 };
const box = new THREE.Group(); box.userData.objectId = 'box';
box.position.set(2, 0, 0);
const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5));
box.add(boxMesh);
const hidden = new THREE.Group(); hidden.visible = false;
const hiddenMesh = new THREE.Mesh();
hiddenMesh.raycast = () => { throw new Error('Hidden object picked'); };
hidden.add(hiddenMesh);
const ray = new THREE.Raycaster(new THREE.Vector3(2, 5, 0), new THREE.Vector3(0, -1, 0));
let hits = intersectBoardTargets(ray, [tile, character, box, hidden]);
assert.equal(hits[0].object, hitArea, 'Nearest character proxy wins');
assert.ok(hits.some(hit => hit.object === tile), 'Board Squares remain selectable behind characters');
assert.ok(hits.some(hit => hit.object === boxMesh), 'Board objects remain selectable');
assert.equal(hitArea.parent?.userData.playerId, 'P1', 'Proxy retains owning player identity');
character.visible = false;
hits = intersectBoardTargets(ray, [tile, character, box, hidden]);
assert.ok(hits.every(hit => hit.object !== hitArea), 'Entombed/hidden characters cannot intercept clicks');
character.visible = true; character.position.x = 4;
hits = intersectBoardTargets(ray, [tile, character]);
assert.ok(hits.every(hit => hit.object !== hitArea), 'Picking uses the latest character transform');

// Stoic Shell must not change the visible point-light count on Blessing release.
const john = new THREE.Group();
const body = new THREE.Group(); body.name = 'JohnBody'; john.add(body);
const visibleLights = () => {
  const lights: THREE.PointLight[] = [];
  john.traverseVisible(part => { if (part instanceof THREE.PointLight) lights.push(part); });
  return lights;
};
updateStoicShellAura(john, false);
const light = visibleLights()[0];
const aura = john.getObjectByName('StoicShellAura')!;
assert.equal(visibleLights().length, 1);
assert.equal(light.intensity, 0);
assert.equal(aura.visible, false);
const initialObjects: THREE.Object3D[] = [];
john.traverse(part => initialObjects.push(part));
for (let i = 0; i < 20; i++) {
  updateStoicShellAura(john, true);
  assert.deepEqual(visibleLights(), [light], 'Activating Blessing preserves shader light count');
  assert.equal(light.intensity, 3);
  assert.equal(aura.visible, true);
  aura.rotation.z = i; aura.scale.setScalar(1.08);
  john.updateMatrixWorld(true);
  assert.deepEqual(light.getWorldPosition(new THREE.Vector3()), aura.getWorldPosition(new THREE.Vector3()));
  updateStoicShellAura(john, false);
  assert.deepEqual(visibleLights(), [light], 'Removing Blessing preserves shader light count');
  assert.equal(light.intensity, 0);
}
const finalObjects: THREE.Object3D[] = [];
john.traverse(part => finalObjects.push(part));
assert.deepEqual(finalObjects, initialObjects, 'Repeated toggles reuse geometry, materials and light');
console.log('Animation stall checks passed: lightweight board picking and stable Stoic Shell lighting.');
