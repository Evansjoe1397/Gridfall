"""Export an optimized, geometry-only Moonlight sword with authored hand offsets."""
import bpy
import json
import os
from mathutils import Matrix

SOURCE_MESH = 'Moonlight_Blade'
OUTPUT = 'C:/Users/artur/git/Gridfall/public/models/moonlight.glb'
TARGET_TRIANGLES = 50_000
TARGET_TEXTURE_SIZE = 1024

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


offsets = {name: hand_offset(name) for name in (
    'Idle_Wielding', 'Alert_Wielding', 'Casual_Walk', 'Running', 'Attack_Swing'
)}

scene = bpy.data.scenes.new('Moonlight_Game_Export')
bpy.context.window.scene = scene
copy = mesh.copy()
copy.data = mesh.data.copy()
copy.parent = None
copy.animation_data_clear()
copy.matrix_world = Matrix.Identity(4)
copy.name = 'Moonlight_Blade'
scene.collection.objects.link(copy)
copy.hide_viewport = False
copy.hide_render = False
copy.hide_set(False)

for pose_name, matrix in offsets.items():
    key = pose_name.lower().replace('_wielding', '').replace('_walk', '').replace('_swing', '')
    copy[f'moonlight_{key}_matrix'] = matrix
copy['moonlight_attack_action'] = 'Attack_Swing'
copy['moonlight_impact_frame'] = 27
copy['moonlight_source_triangles'] = sum(max(0, len(poly.vertices) - 2) for poly in copy.data.polygons)
copy['moonlight_pose_source'] = 'Idle, Alert, Casual Walk, Running, and Attack Swing authored on the Merylin rig'

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

source_triangles = copy['moonlight_source_triangles']
if source_triangles > TARGET_TRIANGLES:
    modifier = copy.modifiers.new('Moonlight_Game_Decimate', 'DECIMATE')
    modifier.decimate_type = 'COLLAPSE'
    modifier.ratio = TARGET_TRIANGLES / source_triangles
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = copy
    copy.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)

bpy.context.view_layer.objects.active = copy
copy.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    use_selection=True,
    export_animations=False,
    export_extras=True,
)

result = {
    'output': OUTPUT,
    'MiB': os.path.getsize(OUTPUT) / 1048576,
    'vertices': len(copy.data.vertices),
    'triangles': sum(max(0, len(poly.vertices) - 2) for poly in copy.data.polygons),
    'texture_sizes': [list(image.size) for image in images],
    'poses': sorted(offsets),
    'attack_action': copy['moonlight_attack_action'],
    'impact_frame': copy['moonlight_impact_frame'],
}
print(json.dumps(result))
