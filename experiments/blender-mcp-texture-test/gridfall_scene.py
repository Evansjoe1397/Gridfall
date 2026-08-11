from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"
OUTPUT.mkdir(exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_material(
    name: str,
    base: tuple[float, float, float, float],
    roughness: float = 0.75,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
    procedural: bool = True,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        if procedural and not emission:
            nodes = material.node_tree.nodes
            links = material.node_tree.links
            noise = nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = 18
            noise.inputs["Detail"].default_value = 9
            noise.inputs["Roughness"].default_value = 0.58
            ramp = nodes.new("ShaderNodeValToRGB")
            ramp.color_ramp.elements[0].position = 0.18
            ramp.color_ramp.elements[0].color = tuple(max(0.0, channel * 0.62) for channel in base[:3]) + (base[3],)
            ramp.color_ramp.elements[1].position = 1.0
            ramp.color_ramp.elements[1].color = tuple(min(1.0, channel * 1.28 + 0.03) for channel in base[:3]) + (base[3],)
            bump = nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value = 0.075
            bump.inputs["Distance"].default_value = 0.09
            links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
            links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
            links.new(noise.outputs["Fac"], bump.inputs["Height"])
            links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def add_cube(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("soft bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def add_cylinder(
    name: str,
    loc: tuple[float, float, float],
    radius: float,
    depth: float,
    vertices: int,
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def add_uv_sphere(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    segments: int = 24,
    ring_count: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=ring_count, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def cell_to_world(x: int, y: int) -> tuple[float, float, float]:
    spacing = 1.52
    return ((x - 4.5) * spacing, (y - 4.5) * spacing, 0.0)


def create_board(materials: dict[str, bpy.types.Material]) -> None:
    for y in range(1, 9):
        for x in range(1, 9):
            wx, wy, _ = cell_to_world(x, y)
            high = 3 <= x <= 6 and 3 <= y <= 6
            checker = (x + y) % 2 == 0
            mat = materials["high_tile"] if high else materials["tile_a" if checker else "tile_b"]
            tile = add_cube(f"tile_{x}_{y}", (wx, wy, -0.06 if not high else 0.05), (1.42, 1.42, 0.12 if not high else 0.34), mat, 0.035)
            tile["grid_cell"] = f"{chr(64 + x)}{y}"

    add_cube("board_outer_frame", (0, 0, -0.17), (13.25, 13.25, 0.12), materials["frame"], 0.08)


def create_crate(name: str, x: int, y: int, materials: dict[str, bpy.types.Material]) -> None:
    wx, wy, _ = cell_to_world(x, y)
    add_cube(name, (wx, wy, 0.55), (0.92, 0.92, 0.92), materials["wood"], 0.04)
    add_cube(f"{name}_strap_x", (wx, wy, 1.02), (1.05, 0.12, 0.1), materials["dark_wood"], 0.015)
    add_cube(f"{name}_strap_y", (wx, wy, 1.03), (0.12, 1.05, 0.1), materials["dark_wood"], 0.015)
    add_cube(f"{name}_metal_tag", (wx, wy - 0.47, 0.7), (0.42, 0.05, 0.28), materials["warm_metal"], 0.02)


def create_pillar(name: str, x: int, y: int, materials: dict[str, bpy.types.Material]) -> None:
    wx, wy, _ = cell_to_world(x, y)
    add_cylinder(f"{name}_base", (wx, wy, 0.16), 0.58, 0.28, 12, materials["stone_dark"])
    add_cylinder(name, (wx, wy, 1.2), 0.42, 2.0, 12, materials["stone"])
    add_cylinder(f"{name}_cap", (wx, wy, 2.28), 0.55, 0.28, 12, materials["stone_dark"])


def create_magician(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    wx, wy, _ = cell_to_world(2, 2)
    root = bpy.data.objects.new("magician_marker_root", None)
    bpy.context.collection.objects.link(root)
    root.location = (wx, wy, 0.28)

    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.42, radius2=0.24, depth=1.05, location=(wx, wy, 0.84))
    robe = bpy.context.object
    robe.name = "magician_robe"
    robe.data.materials.append(materials["robe"])
    robe.parent = root

    head = add_uv_sphere("magician_head", (wx, wy, 1.52), (0.23, 0.23, 0.23), materials["skin"], 20, 10)
    head.parent = root

    bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=0.38, radius2=0.05, depth=1.05, location=(wx + 0.05, wy, 2.17))
    hat = bpy.context.object
    hat.name = "magician_hat"
    hat.rotation_euler[1] = math.radians(7)
    hat.data.materials.append(materials["robe"])
    hat.parent = root

    orb = add_uv_sphere("magician_orb_idle", (wx + 0.72, wy - 0.1, 1.48), (0.16, 0.16, 0.16), materials["magic"], 24, 12)
    orb.parent = root

    for frame, z in [(1, 0.28), (36, 0.39), (72, 0.28)]:
        root.location.z = z
        root.keyframe_insert(data_path="location", frame=frame)

    return root


def create_spell_animation(materials: dict[str, bpy.types.Material]) -> None:
    start = Vector(cell_to_world(2, 2)) + Vector((0.0, 0.0, 1.25))
    end = Vector(cell_to_world(6, 6)) + Vector((0.0, 0.0, 1.1))

    orb = add_uv_sphere("animated_arcane_projectile", tuple(start), (0.18, 0.18, 0.18), materials["magic"], 24, 12)
    for frame, loc in [(1, start), (38, (start + end) * 0.5 + Vector((0, 0, 1.1))), (76, end)]:
        orb.location = loc
        orb.keyframe_insert(data_path="location", frame=frame)
    for frame, scale in [(1, (0.1, 0.1, 0.1)), (38, (0.24, 0.24, 0.24)), (76, (0.18, 0.18, 0.18))]:
        orb.scale = scale
        orb.keyframe_insert(data_path="scale", frame=frame)

    wx, wy, _ = cell_to_world(6, 6)
    target = add_cube("target_tile_pulse_overlay", (wx, wy, 0.31), (1.24, 1.24, 0.035), materials["target_glow"], 0.02)
    for frame, scale in [(1, (0.7, 0.7, 1)), (38, (1.05, 1.05, 1)), (76, (0.78, 0.78, 1))]:
        target.scale = scale
        target.keyframe_insert(data_path="scale", frame=frame)


def add_lighting_and_camera() -> None:
    bpy.ops.object.light_add(type="AREA", location=(0, -4.5, 8.0))
    key = bpy.context.object
    key.name = "large_softbox_key"
    key.data.energy = 650
    key.data.size = 7

    bpy.ops.object.light_add(type="POINT", location=(-4.5, 4.0, 3.0))
    rim = bpy.context.object
    rim.name = "cyan_magic_rim"
    rim.data.color = (0.25, 0.85, 1.0)
    rim.data.energy = 180

    bpy.ops.object.camera_add(location=(7.7, -9.2, 7.2), rotation=(math.radians(58), 0, math.radians(42)))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.data.lens = 35
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 11
    camera.data.dof.aperture_fstop = 8


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 76
    scene.render.fps = 24
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {item.identifier for item in scene.render.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
    scene.world.color = (0.012, 0.018, 0.016)
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1


def export_files() -> None:
    blend_path = OUTPUT / "gridfall_texture_animation_test.blend"
    glb_path = OUTPUT / "gridfall_texture_animation_test.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", export_animations=True)
    print(f"Saved {blend_path}")
    print(f"Saved {glb_path}")


def main() -> None:
    clear_scene()

    materials = {
        "tile_a": make_material("mossy slate tile A", (0.08, 0.16, 0.14, 1), 0.88),
        "tile_b": make_material("mossy slate tile B", (0.06, 0.12, 0.105, 1), 0.9),
        "high_tile": make_material("raised runic stone tile", (0.12, 0.22, 0.18, 1), 0.82),
        "frame": make_material("dark iron board frame", (0.025, 0.033, 0.031, 1), 0.48, 0.45),
        "wood": make_material("procedural warm crate wood", (0.48, 0.25, 0.11, 1), 0.86),
        "dark_wood": make_material("dark crate brace wood", (0.22, 0.11, 0.05, 1), 0.9),
        "stone": make_material("chipped arena pillar stone", (0.43, 0.39, 0.33, 1), 0.91),
        "stone_dark": make_material("dark pillar caps", (0.22, 0.2, 0.17, 1), 0.92),
        "warm_metal": make_material("aged brass tag", (0.85, 0.55, 0.24, 1), 0.5, 0.35),
        "robe": make_material("deep blue woven robe", (0.055, 0.08, 0.22, 1), 0.76),
        "skin": make_material("warm stylized skin", (0.68, 0.46, 0.34, 1), 0.72),
        "magic": make_material("arcane cyan emission", (0.23, 0.82, 1.0, 1), 0.25, 0.0, (0.15, 0.9, 1.0, 1), 3.2, False),
        "target_glow": make_material("target pulse amber emission", (1.0, 0.58, 0.18, 0.7), 0.35, 0.0, (1.0, 0.43, 0.05, 1), 1.8, False),
    }

    create_board(materials)
    for name, x, y in [("crate_a", 5, 1), ("crate_b", 4, 8), ("crate_c", 6, 4)]:
        create_crate(name, x, y, materials)
    for name, x, y in [("pillar_a", 1, 1), ("pillar_b", 1, 8), ("pillar_c", 8, 1), ("pillar_d", 8, 8)]:
        create_pillar(name, x, y, materials)

    create_magician(materials)
    create_spell_animation(materials)
    add_lighting_and_camera()
    configure_scene()
    export_files()


if __name__ == "__main__":
    main()
