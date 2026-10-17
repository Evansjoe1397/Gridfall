"""Export the current Obi Wan from a snapshot, then validate an FBX round trip."""
import bpy
import json
import os
from mathutils import Matrix, Vector

folder = os.path.dirname(os.path.abspath(__file__))
destination = os.path.join(folder, 'Obi-Wan-Mixamo.fbx')
if os.path.exists(destination):
    raise RuntimeError('Refusing to overwrite an existing FBX')

scene = bpy.data.scenes['Obi-Wan Game Low Cut']
bpy.context.window.scene = scene
rig = scene.objects['target_character.001']
body = scene.objects['char1.001']

# Work only in the saved copy. Remove the game-facing preview parent while
# retaining the imported rig's own coordinate conversion and scale.
rig_basis = rig.matrix_basis.copy()
rig.parent = None
rig.matrix_world = rig_basis
rig.animation_data_clear()
body.animation_data_clear()
for bone in rig.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
rig.data.pose_position = 'REST'
rig.hide_viewport = rig.hide_render = False
rig.hide_set(False)
body.hide_viewport = body.hide_render = False
body.hide_set(False)
bpy.context.view_layer.update()

corners = [body.matrix_world @ Vector(c) for c in body.bound_box]
rig.location += Vector((
    -(min(c.x for c in corners) + max(c.x for c in corners)) / 2,
    -(min(c.y for c in corners) + max(c.y for c in corners)) / 2,
    -min(c.z for c in corners),
))
bpy.context.view_layer.update()

# FBX embedding needs actual files even when the source GLB images are packed.
texture_folder = os.path.join(folder, 'textures')
os.makedirs(texture_folder, exist_ok=True)
images = set()
for material in body.data.materials:
    if material and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                images.add(node.image)
texture_report = []
for index, image in enumerate(sorted(images, key=lambda i: i.name)):
    path = os.path.join(texture_folder, 'obi_wan_%02d.png' % index)
    image.file_format = 'PNG'
    image.filepath_raw = path
    image.save()
    image.filepath = path
    texture_report.append({'name': image.name, 'size': list(image.size)})

for obj in bpy.context.view_layer.objects:
    obj.select_set(False)
for obj in (rig, body):
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
body.data.calc_loop_triangles()
source = {
    'vertices': len(body.data.vertices),
    'triangles': len(body.data.loop_triangles),
    'bones': len(rig.data.bones),
    'bone_names': sorted(b.name for b in rig.data.bones),
    'weighted_vertices': sum(any(g.weight > 0 for g in v.groups) for v in body.data.vertices),
    'textures': texture_report,
}
bpy.ops.export_scene.fbx(
    filepath=destination,
    use_selection=True,
    object_types={'ARMATURE', 'MESH'},
    axis_forward='-Z', axis_up='Y',
    apply_unit_scale=True, apply_scale_options='FBX_SCALE_UNITS',
    use_mesh_modifiers=True,
    add_leaf_bones=False,
    use_armature_deform_only=True,
    armature_nodetype='NULL',
    bake_anim=False,
    path_mode='COPY', embed_textures=True,
)

# Import into a separate empty scene; the interactive Blender process is untouched.
verification = bpy.data.scenes.new('Mixamo FBX verification')
bpy.context.window.scene = verification
bpy.ops.import_scene.fbx(filepath=destination, use_anim=False)
meshes = [o for o in verification.objects if o.type == 'MESH']
armatures = [o for o in verification.objects if o.type == 'ARMATURE']
assert len(meshes) == 1 and len(armatures) == 1
mesh, arm = meshes[0], armatures[0]
assert len(mesh.data.vertices) == source['vertices']
assert sorted(b.name for b in arm.data.bones) == source['bone_names']
assert any(m.type == 'ARMATURE' and m.object == arm for m in mesh.modifiers)
weighted = sum(any(g.weight > 0 for g in v.groups) for v in mesh.data.vertices)
assert weighted == source['weighted_vertices']
imported_images = set()
for material in mesh.data.materials:
    if material and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                imported_images.add(node.image)
assert imported_images and all(i.has_data for i in imported_images)

report = {'file': destination, 'bytes': os.path.getsize(destination),
          'source': source,
          'round_trip': {'meshes': len(meshes), 'armatures': len(armatures),
                         'vertices': len(mesh.data.vertices), 'bones': len(arm.data.bones),
                         'weighted_vertices': weighted,
                         'textures': [{'size': list(i.size), 'packed': bool(i.packed_file)} for i in imported_images]}}
with open(os.path.join(folder, 'export-report.json'), 'w', encoding='utf-8') as handle:
    json.dump(report, handle, indent=2)
print('MIXAMO_EXPORT ' + json.dumps(report))

# Produce a quick view of the imported FBX for visual inspection.
bpy.context.view_layer.update()
points = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
low = Vector(tuple(min(p[a] for p in points) for a in range(3)))
high = Vector(tuple(max(p[a] for p in points) for a in range(3)))
center = (low + high) / 2
camera_data = bpy.data.cameras.new('Verification camera')
camera = bpy.data.objects.new('Verification camera', camera_data)
verification.collection.objects.link(camera)
camera.location = center + Vector((0, -4, 0))
camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = max(high.z - low.z, high.x - low.x) * 1.2
verification.camera = camera
verification.render.engine = 'BLENDER_WORKBENCH'
verification.display.shading.light = 'STUDIO'
verification.display.shading.color_type = 'TEXTURE'
verification.display.shading.show_shadows = True
verification.display.shading.show_cavity = True
verification.render.resolution_x = 700
verification.render.resolution_y = 850
verification.render.resolution_percentage = 100
verification.render.image_settings.file_format = 'PNG'
verification.render.filepath = os.path.join(folder, 'Obi-Wan-Mixamo-preview.png')
bpy.ops.render.render(write_still=True)
