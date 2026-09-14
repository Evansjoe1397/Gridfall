import * as THREE from 'three';

const FACE_HAIR_MATERIAL = 'Merylin_Face_Hair_Soft';

function bakedPreviewMaterial(source: THREE.Material) {
  const physical = source as THREE.MeshPhysicalMaterial;
  const material = new THREE.MeshBasicMaterial({
    name: `${source.name}_PreviewBaked`,
    color: physical.color?.clone() ?? new THREE.Color(0xffffff),
    map: physical.map ?? null,
    alphaMap: physical.alphaMap ?? null,
    alphaTest: source.alphaTest,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    vertexColors: source.vertexColors,
    toneMapped: source.toneMapped,
  });
  material.userData.merylinPreviewFaceMaterial = true;
  return material;
}

/** Removes unstable triangle lighting from Merylin's baked face in menu previews. */
export function softenMerylinPreviewFace(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child.userData.merylinPreviewFaceSoftened) return;
    const source = Array.isArray(child.material) ? child.material : [child.material];
    if (!source.some((material) => material.name === FACE_HAIR_MATERIAL)) return;
    const softened = source.map((material) => material.name === FACE_HAIR_MATERIAL ? bakedPreviewMaterial(material) : material);
    child.material = Array.isArray(child.material) ? softened : softened[0];
    child.castShadow = false;
    child.receiveShadow = false;
    child.userData.merylinPreviewFaceSoftened = true;
  });
}
