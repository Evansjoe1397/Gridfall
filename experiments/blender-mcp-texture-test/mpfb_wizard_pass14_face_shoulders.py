import bpy
from mathutils import Vector
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"


def find_rig():
    human = bpy.data.objects["Wizard_Base_Mesh"]
    return next(
        modifier.object
        for modifier in human.modifiers
        if modifier.type == "ARMATURE" and modifier.object
    )


def bone_parent_preserve(obj, rig, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    bpy.context.view_layer.update()
    obj.matrix_world = world
    obj["wizard_bound_to_rig"] = rig.name
    obj["wizard_bound_to_bone"] = bone_name


def move_world(obj, offset):
    world = obj.matrix_world.copy()
    world.translation += Vector(offset)
    obj.matrix_world = world


def main():
    scene = bpy.context.scene
    rig = find_rig()
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions.get("Wizard_Idle")
    scene.frame_set(1)

    face = []
    for obj in bpy.data.objects:
        if obj.name.startswith(("Face_Eye_", "Face_Iris_", "Face_Brow_")):
            bone_parent_preserve(obj, rig, "head")
            face.append(obj.name)

    shoulders = []
    for side, sign in (("L", 1.0), ("R", -1.0)):
        clavicle = f"clavicle_{side.lower()}"
        for layer in ("Lower", "Upper"):
            obj = bpy.data.objects.get(f"Wizard_Pauldron_{side}_{layer}")
            if not obj:
                continue
            bone_parent_preserve(obj, rig, clavicle)
            move_world(obj, (-sign * 0.022, 0.0, 0.030))
            shoulders.append(obj.name)
        gem = bpy.data.objects.get(f"Detail_Pauldron_Gem_{side}")
        if gem:
            bone_parent_preserve(gem, rig, clavicle)
            move_world(gem, (-sign * 0.022, 0.0, 0.030))

    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({"face_bound": face, "shoulders_refit": shoulders})


main()
