import bpy
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"


def set_modifier_segments(object_name, modifier_name, segments):
    obj = bpy.data.objects.get(object_name)
    modifier = obj.modifiers.get(modifier_name) if obj else None
    if modifier:
        modifier.segments = segments


def set_subdivision(object_name, modifier_name, levels):
    obj = bpy.data.objects.get(object_name)
    modifier = obj.modifiers.get(modifier_name) if obj else None
    if modifier:
        modifier.levels = levels
        modifier.render_levels = levels


def add_face_decimate(object_name):
    obj = bpy.data.objects.get(object_name)
    if obj is None:
        return
    old = obj.modifiers.get("Tactical face detail budget")
    if old:
        obj.modifiers.remove(old)
    modifier = obj.modifiers.new("Tactical face detail budget", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = 0.42
    modifier.use_collapse_triangulate = True


def main():
    fist = bpy.data.objects.get("Wizard_Custom_Fist_R")
    if fist and fist.modifiers.get("Fist surface smoothing"):
        fist.modifiers.remove(fist.modifiers["Fist surface smoothing"])

    set_subdivision("Wizard_Cloak_Mantle", "Cartoon surface smoothing", 1)
    set_modifier_segments("Wizard_Cloak_Mantle", "Soft tailored edges", 1)

    for side in ("L", "R"):
        for layer in ("Lower", "Upper"):
            set_modifier_segments(
                f"Wizard_Pauldron_{side}_{layer}",
                "Soft tailored edges",
                1,
            )

    set_modifier_segments("Wizard_Hair_Ribbons", "Lock edge softness", 2)

    for name in ("Face_Eye_L", "Face_Eye_R", "Face_Iris_L", "Face_Iris_R"):
        add_face_decimate(name)

    for name in ("Staff_Silver_Vine_1", "Staff_Silver_Vine_2"):
        obj = bpy.data.objects.get(name)
        if obj and obj.type == "CURVE":
            obj.data.resolution_u = 1
            obj.data.bevel_resolution = 2

    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print("Applied tactical geometry budget without applying destructive modifiers")


main()
