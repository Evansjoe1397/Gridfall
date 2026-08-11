import bpy
from mathutils import Matrix
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"
SAVE_WORKING = globals().get("WIZARD_SAVE_PAULDRON_FIT", False)


def find_rig():
    human = bpy.data.objects["Wizard_Base_Mesh"]
    return next(
        modifier.object
        for modifier in human.modifiers
        if modifier.type == "ARMATURE" and modifier.object
    )


def mirror_x(matrix):
    reflection = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
    return reflection @ matrix @ reflection


def main():
    scene = bpy.context.scene
    if bpy.context.screen and bpy.context.screen.is_animation_playing:
        bpy.ops.screen.animation_cancel(restore_frame=False)
    rig = find_rig()
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions.get("Wizard_Idle")
    scene.frame_set(1)
    bpy.context.view_layer.update()

    fitted = []
    for layer in ("Lower", "Upper"):
        left = bpy.data.objects[f"Wizard_Pauldron_L_{layer}"]
        right = bpy.data.objects[f"Wizard_Pauldron_R_{layer}"]
        left.matrix_world = mirror_x(right.matrix_world)
        left["wizard_fit_reference"] = right.name
        left["wizard_fit_method"] = "mirrored seated world transform"
        fitted.append(left.name)

    left_gem = bpy.data.objects.get("Detail_Pauldron_Gem_L")
    right_gem = bpy.data.objects.get("Detail_Pauldron_Gem_R")
    if left_gem and right_gem:
        left_gem.matrix_world = mirror_x(right_gem.matrix_world)
        fitted.append(left_gem.name)

    bpy.context.view_layer.update()
    if SAVE_WORKING:
        bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({"left_pauldron_fitted": fitted, "saved": SAVE_WORKING})


main()
