import * as THREE from 'three';

/** A subdivided, notched silk standard. The texture and geometry flutter together. */
export function createQuestFlag(color: number) {
  const root = new THREE.Group();
  root.name = 'QuestFlag';
  const gold = new THREE.MeshStandardMaterial({ color: 0xe6ba62, metalness: .78, roughness: .3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x38251c, roughness: .65 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, 1.85, 12), wood);
  pole.position.y = .925;
  root.add(pole);
  for (const y of [.12, 1.14, 1.78]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.043, .043, .06, 12), gold);
    collar.position.y = y;
    root.add(collar);
  }
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(.095), gold);
  tip.position.y = 1.93;
  tip.scale.y = 1.8;
  root.add(tip);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  const gradient = ctx.createLinearGradient(0, 0, 512, 384);
  gradient.addColorStop(0, base.clone().multiplyScalar(.45).getStyle());
  gradient.addColorStop(.5, base.getStyle());
  gradient.addColorStop(1, base.clone().multiplyScalar(.65).getStyle());
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 384);
  ctx.strokeStyle = '#ebc979'; ctx.lineWidth = 13;
  ctx.strokeRect(17, 17, 478, 350);
  ctx.lineWidth = 3; ctx.strokeRect(32, 32, 448, 320);
  // Heraldic diamond, crown and spear remain legible at board scale.
  ctx.fillStyle = '#ffe5a0';
  ctx.beginPath(); ctx.moveTo(250, 81); ctx.lineTo(316, 198);
  ctx.lineTo(250, 305); ctx.lineTo(184, 198); ctx.closePath(); ctx.fill();
  ctx.fillStyle = base.clone().multiplyScalar(.3).getStyle();
  ctx.beginPath(); ctx.moveTo(211, 166); ctx.lineTo(229, 184); ctx.lineTo(250, 153);
  ctx.lineTo(271, 184); ctx.lineTo(289, 166); ctx.lineTo(278, 220);
  ctx.lineTo(222, 220); ctx.closePath(); ctx.fill();
  ctx.fillRect(246, 221, 8, 42);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(.86, .62, 24, 16);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const u = geometry.attributes.uv.getX(i), v = geometry.attributes.uv.getY(i);
    positions.setXYZ(i, .025 + u * (.86 - .16 * (1 - Math.abs(v * 2 - 1))), 1.12 + v * .62, 0);
  }
  geometry.userData.rest = new Float32Array(positions.array);
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: .84, metalness: .06 }));
  cloth.name = 'FlagCloth'; root.add(cloth);
  root.traverse(part => { if (part instanceof THREE.Mesh) part.castShadow = true; });
  return root;
}

export function flutterQuestFlag(root: THREE.Group, seconds: number, moving: boolean) {
  const cloth = root.getObjectByName('FlagCloth') as THREE.Mesh<THREE.PlaneGeometry>;
  const positions = cloth.geometry.attributes.position;
  const rest = cloth.geometry.userData.rest as Float32Array;
  for (let i = 0; i < positions.count; i++) {
    const u = cloth.geometry.attributes.uv.getX(i);
    const wave = Math.sin(seconds * (moving ? 12 : 3.5) - u * 8 + rest[i * 3 + 1] * 3);
    positions.setZ(i, u * ((moving ? .115 : .045) * wave + .025 * Math.sin(seconds * 6 - u * 15)));
    positions.setY(i, rest[i * 3 + 1] - .045 * u * u + wave * u * (moving ? .024 : .008));
  }
  positions.needsUpdate = true;
  cloth.geometry.computeVertexNormals();
}

export function disposeQuestFlag(root: THREE.Group) {
  root.removeFromParent();
  const materials = new Set<THREE.Material>();
  root.traverse(part => {
    if (!(part instanceof THREE.Mesh)) return;
    part.geometry.dispose();
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
  });
  for (const material of materials) {
    (material as THREE.MeshStandardMaterial).map?.dispose();
    material.dispose();
  }
}
