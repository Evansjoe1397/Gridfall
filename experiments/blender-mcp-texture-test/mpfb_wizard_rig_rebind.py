import bpy
import importlib
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"
BIND_OFFSET = 0.81


def get_deform_rig(human):
    for modifier in human.modifiers:
        if modifier.type == "ARMATURE" and modifier.object:
            return modifier.object
    raise RuntimeError("Wizard_Base_Mesh has no deform armature")


def main():
    human = bpy.data.objects.get("Wizard_Base_Mesh")
    if human is None:
        raise RuntimeError("Wizard_Base_Mesh is missing")
    rig = get_deform_rig(human)

    if not human.get("wizard_bind_repaired", False):
        rig.hide_viewport = False
        rig.hide_set(False)
        for pose_bone in rig.pose.bones:
            pose_bone.matrix_basis.identity()

        if human.data.shape_keys:
            for key_block in human.data.shape_keys.key_blocks:
                for point in key_block.data:
                    point.co.z -= BIND_OFFSET
        else:
            for vertex in human.data.vertices:
                vertex.co.z -= BIND_OFFSET
        human.data.update()

        services = importlib.import_module("bl_ext.user_default.mpfb.services")
        services.RigService.refit_existing_armature(rig, human)
        rig.location.z += BIND_OFFSET
        human["wizard_bind_repaired"] = True
        human["wizard_bind_offset"] = BIND_OFFSET

    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            obj.hide_viewport = True
            obj.hide_render = True
            obj.hide_set(True)

    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({"rig": rig.name, "bind_repaired": bool(human["wizard_bind_repaired"])})


main()
