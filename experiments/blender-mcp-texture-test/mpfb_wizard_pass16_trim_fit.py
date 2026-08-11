import bpy
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"
MODIFIER_NAME = "Conform to robe surface"


def fit_detail(name, target_name, offset):
    obj = bpy.data.objects.get(name)
    target = bpy.data.objects.get(target_name)
    if obj is None or target is None:
        raise RuntimeError(f"Missing trim fit object: {name} -> {target_name}")
    old = obj.modifiers.get(MODIFIER_NAME)
    if old:
        obj.modifiers.remove(old)
    modifier = obj.modifiers.new(MODIFIER_NAME, "SHRINKWRAP")
    modifier.target = target
    modifier.wrap_method = "NEAREST_SURFACEPOINT"
    modifier.wrap_mode = "ON_SURFACE"
    modifier.offset = offset
    obj["wizard_conform_target"] = target_name
    return name


def main():
    fitted = []
    for side in ("L", "R"):
        fitted.append(fit_detail(f"Detail_Robe_Trim_{side}", "Wizard_Robe_Skirt", 0.004))
        lapel = bpy.data.objects.get(f"Wizard_Robe_Lapel_{side}")
        if lapel and lapel.modifiers.get(MODIFIER_NAME):
            lapel.modifiers.remove(lapel.modifiers[MODIFIER_NAME])
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({"fitted": fitted})


main()
