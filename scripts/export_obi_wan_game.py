import os
import sys

import bpy
from mathutils import Vector


def argument_after(flag: str) -> str:
    args = sys.argv[sys.argv.index("--") + 1 :]
    index = args.index(flag)
    return os.path.abspath(args[index + 1])


output_path = argument_after("--output")
texture_dir = argument_after("--texture-dir")
os.makedirs(os.path.dirname(output_path), exist_ok=True)
os.makedirs(texture_dir, exist_ok=True)

character = bpy.data.objects.get("char1")
saber = bpy.data.objects.get("Lightsaber")
armature = bpy.data.objects.get("target_character")
if character is None or saber is None or armature is None:
    raise RuntimeError("Expected char1, Lightsaber, and target_character in the source scene")

# The working scene hides the rig for cleaner modeling. It must be visible to
# the glTF exporter or Blender silently emits static meshes without skinning.
armature.hide_viewport = False
armature.hide_render = False
armature.hide_set(False)

idle = bpy.data.actions.get("Idle")
if idle is None:
    raise RuntimeError("Expected an Idle action in the source scene")
if armature.animation_data is None:
    armature.animation_data_create()
armature.animation_data.action = idle
bpy.context.scene.frame_set(round(idle.frame_range[0]))
bpy.context.view_layer.update()


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


# The source saber is over one million triangles. Its board-scale silhouette is
# retained at 8k triangles, while its 4K micro-surface map is replaced with
# constant PBR values. The visible color texture remains embedded.
saber_before = triangle_count(saber)
saber_target = 8_000
if saber_before > saber_target:
    modifier = saber.modifiers.new("GameReadyDecimate", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = saber_target / saber_before
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = saber
    saber.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    saber.select_set(False)

for material in saber.data.materials:
    if material is None or material.node_tree is None:
        continue
    for node in list(material.node_tree.nodes):
        if node.type == "TEX_IMAGE" and node.image is not None and node.image.colorspace_settings.name == "Non-Color":
            material.node_tree.nodes.remove(node)
    shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if shader is not None:
        shader.inputs["Metallic"].default_value = 0.72
        shader.inputs["Roughness"].default_value = 0.34

# Center the rig and put the idle pose's boots on the ground. The saber follows
# because it remains bone-parented to the armature.
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated_character = character.evaluated_get(depsgraph)
world_corners = [evaluated_character.matrix_world @ Vector(corner) for corner in evaluated_character.bound_box]
center_x = (min(c.x for c in world_corners) + max(c.x for c in world_corners)) * 0.5
center_y = (min(c.y for c in world_corners) + max(c.y for c in world_corners)) * 0.5
ground_z = min(c.z for c in world_corners)
offset = Vector((-center_x, -center_y, -ground_z))
armature.location += offset
bpy.context.view_layer.update()

# Resize textures for the model's actual screen footprint.
used_images = set()
for obj in (character, saber):
    for material in obj.data.materials:
        if material is None or material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is not None:
                used_images.add(node.image)

for index, image in enumerate(sorted(used_images, key=lambda item: item.name)):
    width, height = image.size
    if max(width, height) > 1024:
        scale = 1024 / max(width, height)
        image.scale(max(1, round(width * scale)), max(1, round(height * scale)))
    is_color = image.colorspace_settings.name != "Non-Color"
    extension = "jpg" if is_color else "png"
    image.file_format = "JPEG" if is_color else "PNG"
    image.filepath_raw = os.path.join(texture_dir, f"texture_{index}_{image.name}.{extension}")
    image.save()
    image.source = "FILE"
    image.filepath = image.filepath_raw
    image.reload()

for obj in bpy.context.selected_objects:
    obj.select_set(False)
for obj in (character, saber, armature):
    obj.select_set(True)
bpy.context.view_layer.objects.active = armature

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_merge_animation="ACTION",
    export_anim_single_armature=True,
    export_bake_animation=True,
    export_optimize_animation_size=True,
    export_optimize_animation_keep_anim_armature=True,
    export_action_filter=False,
    export_extra_animations=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_jpeg_quality=78,
    export_apply=False,
)

print(
    "OBI_WAN_EXPORT "
    f"character_tris={triangle_count(character)} "
    f"saber_tris_before={saber_before} "
    f"saber_tris_after={triangle_count(saber)} "
    f"actions={len(bpy.data.actions)} "
    f"bytes={os.path.getsize(output_path)}"
)
