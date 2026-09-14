"""Export an optimized, geometry-only Lightbringer with authored hand offsets."""
import bpy
import json
import os
from mathutils import Matrix

SOURCE_MESH = 'Lightbringer_Blade'
OUTPUT = 'C:/Users/artur/git/Gridfall/public/models/lightbringer.glb'
TARGET_TRIANGLES = 50_000
TARGET_TEXTURE_SIZE = 1024
POSE_NAMES = ('Idle_Wielding', 'Alert_Wielding', 'Casual_Walk', 'Running', 'Attack')

mesh = bpy.data.objects[SOURCE_MESH]
rig = bpy.data.objects['Armature']
poses = json.loads(mesh['gridfall_animation_pose_map'])
conversion = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def hand_offset(pose_name):
    mesh.matrix_basis = Matrix(poses[pose_name]['matrix_basis'])
    bpy.context.view_layer.update()
    matrix = ((rig.matrix_world @ rig.pose.bones['RightHand'].matrix).inverted()
              @ mesh.matrix_world @ conversion.inverted())
    return [matrix[row][column] for column in range(4) for row in range(4)]


offsets = {name: hand_offset(name) for name in POSE_NAMES}
scene = bpy.data.scenes.new('Lightbringer_Game_Export')
bpy.context.window.scene = scene
copy = mesh.copy()
copy.data = mesh.data.copy()
copy.parent = None
copy.animation_data_clear()
copy.matrix_world = Matrix.Identity(4)
# Object names are global across scenes; free the authored name in this
# background-only copy so the exported node has the exact stable runtime name.
mesh.name = 'Lightbringer_Source'
copy.name = 'Lightbringer_Blade'
copy.data.name = 'Lightbringer_Blade'
scene.collection.objects.link(copy)
copy.hide_viewport = False
copy.hide_render = False
copy.hide_set(False)

for pose_name, matrix in offsets.items():
    key = pose_name.lower().replace('_wielding', '').replace('_walk', '')
    copy[f'lightbringer_{key}_matrix'] = matrix
copy['lightbringer_attack_action'] = 'Attack'
copy['lightbringer_impact_frame'] = 28
copy['lightbringer_source_triangles'] = sum(max(0, len(poly.vertices) - 2) for poly in copy.data.polygons)
copy['lightbringer_pose_source'] = 'One approved placement verified in Idle, Alert, Casual Walk, Running, and Attack'

images = set()
for slot in copy.material_slots:
    if not slot.material:
        continue
    slot.material = slot.material.copy()
    if not slot.material.use_nodes:
        continue
    for node in slot.material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            image = node.image.copy()
            node.image = image
            if max(image.size) > TARGET_TEXTURE_SIZE:
                image.scale(TARGET_TEXTURE_SIZE, TARGET_TEXTURE_SIZE)
            image.pack()
            images.add(image)

source_triangles = copy['lightbringer_source_triangles']
if source_triangles > TARGET_TRIANGLES:
    modifier = copy.modifiers.new('Lightbringer_Game_Decimate', 'DECIMATE')
    modifier.decimate_type = 'COLLAPSE'
    modifier.ratio = TARGET_TRIANGLES / source_triangles
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = copy
    copy.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)

bpy.ops.object.select_all(action='DESELECT')
copy.select_set(True)
bpy.context.view_layer.objects.active = copy
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    use_selection=True,
    export_animations=False,
    export_extras=True,
    export_meshopt_compression_enable=True,
    export_meshopt_extension='EXT_meshopt_compression',
)

result = {
    'output': OUTPUT,
    'MiB': os.path.getsize(OUTPUT) / 1048576,
    'vertices': len(copy.data.vertices),
    'triangles': sum(max(0, len(poly.vertices) - 2) for poly in copy.data.polygons),
    'source_triangles': source_triangles,
    'texture_sizes': sorted([list(image.size) for image in images]),
    'poses': sorted(offsets),
    'attack_action': copy['lightbringer_attack_action'],
    'impact_frame': copy['lightbringer_impact_frame'],
}
print(json.dumps(result))
