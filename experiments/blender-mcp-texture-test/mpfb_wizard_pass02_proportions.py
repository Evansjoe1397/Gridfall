import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def set_pose(rig):
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)

    rig.pose.bones["head"].scale = (1.09, 1.09, 1.09)
    rig.pose.bones["hand_l"].scale = (1.07, 1.07, 1.07)
    rig.pose.bones["hand_r"].scale = (1.07, 1.07, 1.07)
    rig.pose.bones["spine_03"].scale = (1.025, 1.025, 1.025)

    rig.pose.bones["clavicle_l"].rotation_euler[1] = math.radians(-3.5)
    rig.pose.bones["clavicle_r"].rotation_euler[1] = math.radians(3.5)
    rig.pose.bones["upperarm_l"].rotation_euler[1] = math.radians(-4.0)
    rig.pose.bones["upperarm_r"].rotation_euler[1] = math.radians(4.0)
    rig.pose.bones["lowerarm_l"].rotation_euler[0] = math.radians(-4.0)
    rig.pose.bones["lowerarm_r"].rotation_euler[0] = math.radians(-4.0)
    rig.pose.bones["thigh_l"].rotation_euler[1] = math.radians(-2.0)
    rig.pose.bones["thigh_r"].rotation_euler[1] = math.radians(2.0)


def render_from(name, location, target, lens, filename):
    camera = bpy.data.objects.get(name)
    if camera is None:
        bpy.ops.object.camera_add()
        camera = bpy.context.object
        camera.name = name
    camera.location = location
    camera.data.lens = lens
    look_at(camera, Vector(target))
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(OUTPUT / filename)
    bpy.ops.render.render(write_still=True)
    return camera


def main():
    rig = bpy.data.objects.get("Wizard_Rig") or bpy.data.objects.get("Wizard_Rig.001")
    human = bpy.data.objects.get("Wizard_Base_Mesh")
    if not rig or not human:
        raise RuntimeError("Wizard base mesh or rig is missing")

    rig.hide_viewport = True
    rig.hide_render = True
    set_pose(rig)
    for polygon in human.data.polygons:
        polygon.use_smooth = True

    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (0.0, 0.0, 0.9),
        58,
        "wizard_mpfb_pass02_tactical.png",
    )
    render_from(
        "Character Three Quarter",
        (3.6, -5.5, 3.0),
        (0.0, 0.0, 0.95),
        72,
        "wizard_mpfb_pass02_three_quarter.png",
    )
    render_from(
        "Character Front",
        (0.0, -5.1, 1.75),
        (0.0, 0.0, 0.92),
        75,
        "wizard_mpfb_pass02_front.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({"rig": rig.name, "human_dimensions": tuple(round(v, 4) for v in human.dimensions)})


main()
