import bpy
from mathutils import Vector
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"
WORKING_BLEND = OUTPUT / "gridfall_wizard_mpfb_working.blend"
FPS = 30
RENDER_CLIPS = globals().get(
    "WIZARD_PREVIEW_CLIPS",
    ("Wizard_Idle", "Wizard_Walk", "Wizard_Attack"),
)
FRAME_OVERRIDES = globals().get("WIZARD_PREVIEW_FRAME_OVERRIDES", {})

CLIPS = {
    "Wizard_Idle": ("Wizard_Idle_Orbs", 1, 72, "wizard_idle_frames"),
    "Wizard_Walk": ("Wizard_Walk_Orbs", 1, 32, "wizard_walk_frames"),
    "Wizard_Attack": ("Wizard_Attack_Orbs", 1, 43, "wizard_attack_frames"),
}


def find_rig():
    human = bpy.data.objects["Wizard_Base_Mesh"]
    return next(
        modifier.object
        for modifier in human.modifiers
        if modifier.type == "ARMATURE" and modifier.object
    )


def point_at(obj, target):
    obj.rotation_euler = (
        Vector(target) - obj.location
    ).to_track_quat("-Z", "Y").to_euler()


def ensure_preview_camera(scene):
    name = "Wizard Animation Preview"
    camera = bpy.data.objects.get(name)
    if camera is None:
        data = bpy.data.cameras.new(name)
        camera = bpy.data.objects.new(name, data)
        scene.collection.objects.link(camera)
    camera.location = (4.25, -5.45, 4.85)
    camera.data.lens = 72
    camera.data.sensor_width = 36
    point_at(camera, (0.0, 0.0, 0.95))
    scene.camera = camera
    return camera


def configure_render(scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.fps = FPS
    scene.render.resolution_x = 448
    scene.render.resolution_y = 448
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 35
    scene.render.use_file_extension = True
    scene.render.film_transparent = False


def assign_action(target, name):
    target.animation_data_create()
    target.animation_data.action = bpy.data.actions[name]


def render_clip(scene, rig, orbs, rig_action, spec):
    orb_action, full_start, full_end, folder_name = spec
    start, end = FRAME_OVERRIDES.get(rig_action, (full_start, full_end))
    if start < full_start or end > full_end or end < start:
        raise ValueError(f"Invalid frame override for {rig_action}: {(start, end)}")
    assign_action(rig, rig_action)
    if orbs is not None:
        assign_action(orbs, orb_action)
    scene.frame_start = start
    scene.frame_end = end
    scene.frame_set(start)
    output = OUTPUT / folder_name
    output.mkdir(parents=True, exist_ok=True)
    if start == full_start:
        for stale in output.glob("frame_*.png"):
            stale.unlink()
    scene.render.filepath = str(output / "frame_")
    print(f"Rendering {rig_action}: {start}-{end} -> {output}")
    bpy.ops.render.render(animation=True)
    return output


def leave_idle_ready(scene, rig, orbs):
    assign_action(rig, "Wizard_Idle")
    if orbs is not None:
        assign_action(orbs, "Wizard_Idle_Orbs")
    scene.frame_start = 1
    scene.frame_end = 72
    scene.frame_set(1)


def main():
    scene = bpy.context.scene
    rig = find_rig()
    orbs = bpy.data.objects.get("Wizard_Orbital_Controller")
    ensure_preview_camera(scene)
    configure_render(scene)

    rendered = []
    for action_name in RENDER_CLIPS:
        if action_name not in CLIPS:
            raise ValueError(f"Unknown preview clip: {action_name}")
        rendered.append(render_clip(scene, rig, orbs, action_name, CLIPS[action_name]))

    leave_idle_ready(scene, rig, orbs)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({"rendered": [str(path) for path in rendered], "active": "Wizard_Idle"})


main()
