import bpy
import math
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


def main():
    rig = find_rig()
    controller = bpy.data.objects["Wizard_Orbital_Controller"]
    controller.animation_data_create()
    controller.animation_data.action = None
    controller.parent = rig
    controller.parent_type = "OBJECT"
    controller.parent_bone = ""
    controller.matrix_parent_inverse.identity()
    controller.location = rig.matrix_world.inverted() @ Vector((0.0, 0.0, 0.0))
    controller.rotation_mode = "XYZ"
    controller.rotation_euler = (0.0, 0.0, 0.0)
    controller.scale = (1.0, 1.0, 1.0)

    radius = 0.57
    placements = {
        1: ((radius, 0.00, 1.30), (math.radians(62), 0.0, math.radians(18))),
        2: ((-radius * 0.5, radius * math.sqrt(3) * 0.5, 1.18), (math.radians(68), math.radians(14), math.radians(-34))),
        3: ((-radius * 0.5, -radius * math.sqrt(3) * 0.5, 1.40), (math.radians(55), math.radians(-12), math.radians(48))),
    }
    for index, (location, ring_rotation) in placements.items():
        orb = bpy.data.objects[f"Wizard_Orb_{index}"]
        ring = bpy.data.objects[f"Wizard_Orb_Ring_{index}"]
        orb.parent = controller
        ring.parent = controller
        orb.location = location
        ring.location = location
        orb.rotation_euler = (0.0, 0.0, 0.0)
        ring.rotation_mode = "XYZ"
        ring.rotation_euler = ring_rotation

    bpy.context.scene.frame_set(1)
    print({
        "controller_parent": rig.name,
        "controller_world": tuple(round(value, 4) for value in controller.matrix_world.translation),
        "placements": {index: location for index, (location, _rotation) in placements.items()},
    })


main()
