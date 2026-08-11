import bpy
import importlib
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"
OUTPUT.mkdir(parents=True, exist_ok=True)
CELL_SIZE = 2.2
GRID_CELLS = 5


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name, color, roughness=0.75, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def cube(name, location, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    obj.data.materials.append(mat)
    return obj


def look_at(obj, target):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_test_grid():
    white = material("Arena White", (0.82, 0.84, 0.87), 0.9)
    line = material("Grid Line", (0.12, 0.15, 0.19), 0.75)
    accent = material("Center Cell", (0.08, 0.42, 0.58), 0.55)
    extent = GRID_CELLS * CELL_SIZE
    cube("Arena", (0.0, 0.0, -0.09), (extent / 2, extent / 2, 0.09), white, 0.035)
    half = extent / 2
    for i in range(GRID_CELLS + 1):
        p = -half + i * CELL_SIZE
        cube(f"GridX_{i}", (p, 0.0, 0.012), (0.012, half, 0.012), line)
        cube(f"GridY_{i}", (0.0, p, 0.012), (half, 0.012, 0.012), line)
    c = CELL_SIZE / 2
    for axis, loc, scale in (
        ("L", (-c, 0.0, 0.026), (0.025, c, 0.018)),
        ("R", (c, 0.0, 0.026), (0.025, c, 0.018)),
        ("B", (0.0, -c, 0.026), (c, 0.025, 0.018)),
        ("T", (0.0, c, 0.026), (c, 0.025, 0.018)),
    ):
        cube(f"Center_{axis}", loc, scale, accent)


def create_human():
    services = importlib.import_module("bl_ext.user_default.mpfb.services")
    macro = services.TargetService.get_default_macro_info_dict()
    macro.update(
        {
            "gender": 0.88,
            "age": 0.54,
            "muscle": 0.68,
            "weight": 0.50,
            "proportions": 0.64,
            "height": 0.56,
            "cupsize": 0.5,
            "firmness": 0.5,
        }
    )
    macro["race"] = {"asian": 0.18, "caucasian": 0.67, "african": 0.15}
    human = services.HumanService.create_human(
        mask_helpers=True,
        detailed_helpers=False,
        extra_vertex_groups=True,
        feet_on_ground=False,
        scale=0.1,
        macro_detail_dict=macro,
    )
    ground_offset = abs(services.ObjectService.get_lowest_point(human))
    human.name = "Wizard_Base_Mesh"
    human.data.name = "Wizard_Base_Mesh"
    skin = material("Wizard Skin Preview", (0.55, 0.31, 0.21), 0.62)
    human.data.materials.clear()
    human.data.materials.append(skin)
    bpy.context.view_layer.objects.active = human
    human.select_set(True)
    rig = services.HumanService.add_builtin_rig(human, "game_engine", import_weights=True)
    if rig:
        rig.name = "Wizard_Rig"
        rig.data.name = "Wizard_Rig"
        rig.location.z = ground_offset
        rig.show_in_front = True
        rig.hide_viewport = True
        rig.hide_render = True
    return human, rig


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.045, 0.055, 0.075)
    scene.view_settings.look = "AgX - Medium High Contrast"

    bpy.ops.object.light_add(type="AREA", location=(3.8, -4.2, 7.5))
    key = bpy.context.object
    key.name = "Key Light"
    key.data.energy = 1050
    key.data.shape = "DISK"
    key.data.size = 5.0
    key.data.color = (1.0, 0.84, 0.68)
    look_at(key, Vector((0.0, 0.0, 0.8)))

    bpy.ops.object.light_add(type="AREA", location=(-4.5, 1.0, 5.0))
    fill = bpy.context.object
    fill.name = "Fill Light"
    fill.data.energy = 700
    fill.data.size = 4.0
    fill.data.color = (0.52, 0.70, 1.0)
    look_at(fill, Vector((0.0, 0.0, 1.0)))

    bpy.ops.object.camera_add(location=(7.3, -8.8, 8.1))
    camera = bpy.context.object
    camera.name = "Tactical Camera"
    camera.data.lens = 58
    look_at(camera, Vector((0.0, 0.0, 0.9)))
    scene.camera = camera


def main():
    clear_scene()
    build_test_grid()
    human, rig = create_human()
    setup_render()
    bpy.context.scene.render.filepath = str(OUTPUT / "wizard_mpfb_pass01_silhouette.png")
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    bpy.ops.render.render(write_still=True)
    print(
        {
            "human": human.name,
            "dimensions": tuple(round(v, 4) for v in human.dimensions),
            "vertices": len(human.data.vertices),
            "polygons": len(human.data.polygons),
            "rig": rig.name if rig else None,
            "bones": len(rig.data.bones) if rig else 0,
        }
    )


main()
