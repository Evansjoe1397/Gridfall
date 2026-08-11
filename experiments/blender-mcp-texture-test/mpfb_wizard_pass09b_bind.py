import bpy
import json
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"


def get_deform_rig(human):
    for modifier in human.modifiers:
        if modifier.type == "ARMATURE" and modifier.object:
            return modifier.object
    raise RuntimeError("Wizard_Base_Mesh has no deform armature")


def activate(obj):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def transfer_weights(obj, human, rig):
    if obj.type != "MESH":
        return False
    for modifier in list(obj.modifiers):
        if modifier.name in {"Wizard Weight Transfer", "Wizard Armature"}:
            obj.modifiers.remove(modifier)
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    for bone in rig.data.bones:
        if bone.use_deform and human.vertex_groups.get(bone.name):
            obj.vertex_groups.new(name=bone.name)

    transfer = obj.modifiers.new("Wizard Weight Transfer", "DATA_TRANSFER")
    transfer.object = human
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = "POLYINTERP_NEAREST"
    transfer.layers_vgroup_select_src = "ALL"
    transfer.layers_vgroup_select_dst = "NAME"
    transfer.mix_mode = "REPLACE"
    activate(obj)
    while obj.modifiers.find(transfer.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=transfer.name)
    bpy.ops.object.modifier_apply(modifier=transfer.name)

    zero_vertices = []
    for vertex in obj.data.vertices:
        weights = [(element.group, element.weight) for element in vertex.groups]
        total = sum(weight for _group, weight in weights)
        if total <= 1e-8:
            zero_vertices.append(vertex.index)
            continue
        for group_index, weight in weights:
            obj.vertex_groups[group_index].add(
                [vertex.index], weight / total, "REPLACE"
            )
    if zero_vertices:
        fallback = obj.vertex_groups.get("pelvis") or obj.vertex_groups.new(name="pelvis")
        fallback.add(zero_vertices, 1.0, "REPLACE")

    armature = obj.modifiers.new("Wizard Armature", "ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True
    while obj.modifiers.find(armature.name) > 0:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_move_up(modifier=armature.name)
    obj["wizard_bind_pending"] = False
    obj["wizard_bound_to_rig"] = rig.name
    return True


def bone_parent_preserve(obj, rig, bone_name):
    if bone_name not in rig.pose.bones:
        raise RuntimeError(f"Missing attachment bone: {bone_name}")
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    bpy.context.view_layer.update()
    obj.matrix_world = world
    obj["wizard_bound_to_rig"] = rig.name
    obj["wizard_bound_to_bone"] = bone_name


def ensure_staff_root(rig):
    collection = bpy.data.collections.get("Wizard_Staff")
    if not collection:
        return None
    root = bpy.data.objects.get("Wizard_Staff_Root")
    if root is None:
        root = bpy.data.objects.new("Wizard_Staff_Root", None)
        collection.objects.link(root)
    hand = rig.pose.bones["hand_r"]
    hand_world = rig.matrix_world @ hand.matrix @ Vector((0.0, 0.0, 0.0))
    root.matrix_world.translation = hand_world
    for obj in list(collection.objects):
        if obj is root or obj.parent is root:
            continue
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    bone_parent_preserve(root, rig, "hand_r")
    return root


def bind_clothing(human, rig):
    collection = bpy.data.collections.get("Wizard_Clothing")
    if not collection:
        raise RuntimeError("Wizard_Clothing is missing")
    deform_count = 0
    rigid_count = 0
    for obj in list(collection.objects):
        mode = obj.get("wizard_attachment_mode", "")
        bones = json.loads(obj.get("wizard_attachment_bones", "[]"))
        if mode == "DEFORM_TRANSFER" and obj.type == "MESH":
            deform_count += int(transfer_weights(obj, human, rig))
        elif mode in {"DEFORM_TRANSFER", "BONE"}:
            bone = bones[0] if bones else "pelvis"
            bone_parent_preserve(obj, rig, bone)
            rigid_count += 1
    collection["wizard_bind_status"] = "bound"
    return deform_count, rigid_count


def bind_named_rigid_assets(rig):
    attached = 0
    for obj in bpy.data.objects:
        if obj.name.startswith(("Face_Eye_", "Face_Iris_", "Face_Brow_")):
            bone_parent_preserve(obj, rig, "head")
            attached += 1
    for collection_name, bone_name, root_name in (
        ("Wizard_Hair", "head", None),
        ("Wizard_Hat", "head", "Wizard_Hat_Root"),
    ):
        collection = bpy.data.collections.get(collection_name)
        if not collection:
            continue
        if root_name:
            root = bpy.data.objects.get(root_name)
            if root:
                bone_parent_preserve(root, rig, bone_name)
                attached += 1
        else:
            for obj in list(collection.objects):
                bone_parent_preserve(obj, rig, bone_name)
                attached += 1

    for obj in bpy.data.objects:
        bone_name = obj.get("wizard_attachment_bone")
        if not bone_name or obj.name.startswith("Staff_") or obj.name.startswith("Wizard_Hat"):
            continue
        if obj.name.startswith(("Wizard_Eye", "Eye_", "Wizard_Brow", "Brow_")):
            bone_parent_preserve(obj, rig, bone_name)
            attached += 1

    detail_map = {
        "Detail_Chest": "spine_03",
        "Detail_Robe": "pelvis",
        "Detail_Pauldron_Gem_L": "clavicle_l",
        "Detail_Pauldron_Gem_R": "clavicle_r",
    }
    details = bpy.data.collections.get("Wizard_Details")
    if details:
        for obj in list(details.objects):
            if obj.name == "Wizard_Orbital_Controller" or obj.parent:
                continue
            bone = next((value for prefix, value in detail_map.items() if obj.name.startswith(prefix)), "pelvis")
            bone_parent_preserve(obj, rig, bone)
            attached += 1
    return attached


def pose_staff_grip(rig):
    finger_angles = {
        "index": (0.62, 1.00, 0.58),
        "middle": (0.68, 1.05, 0.62),
        "ring": (0.70, 1.08, 0.65),
        "pinky": (0.66, 1.02, 0.62),
    }
    for finger, angles in finger_angles.items():
        for joint, angle in enumerate(angles, 1):
            bone = rig.pose.bones[f"{finger}_{joint:02d}_r"]
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (angle, 0.0, 0.0)
    for joint, angles in (
        (1, (0.28, -0.16, 0.28)),
        (2, (0.54, 0.08, 0.06)),
        (3, (0.42, 0.0, 0.0)),
    ):
        bone = rig.pose.bones[f"thumb_{joint:02d}_r"]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = angles
    rig["wizard_staff_grip_pose"] = True


def main():
    human = bpy.data.objects.get("Wizard_Base_Mesh")
    if not human:
        raise RuntimeError("Wizard_Base_Mesh is missing")
    if not human.get("wizard_bind_repaired", False):
        raise RuntimeError("Run mpfb_wizard_rig_rebind.py before binding accessories")
    rig = get_deform_rig(human)
    rig.hide_viewport = False
    rig.hide_set(False)
    for pose_bone in rig.pose.bones:
        pose_bone.matrix_basis.identity()
    bpy.context.view_layer.update()

    deform_count, clothing_rigid = bind_clothing(human, rig)
    staff_root = ensure_staff_root(rig)
    rigid_count = bind_named_rigid_assets(rig) + clothing_rigid + int(staff_root is not None)
    pose_staff_grip(rig)

    rig.hide_viewport = True
    rig.hide_render = True
    rig.hide_set(True)
    bpy.context.scene.camera = bpy.data.objects.get("Tactical Camera")
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({"rig": rig.name, "deform_meshes": deform_count, "rigid_attachments": rigid_count})


main()
