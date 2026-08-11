from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"
OUTPUT.mkdir(exist_ok=True)

BOARD_WIDTH = 8
BOARD_HEIGHT = 8
CELL_SIZE = 2.0


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def rgba(hex_color: int, alpha: float = 1.0) -> tuple[float, float, float, float]:
    return (
        ((hex_color >> 16) & 255) / 255,
        ((hex_color >> 8) & 255) / 255,
        (hex_color & 255) / 255,
        alpha,
    )


def mat_principled(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float = 0.68,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    strength: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = alpha
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
    return mat


def mat_stone(
    name: str,
    dark_color: tuple[float, float, float, float],
    light_color: tuple[float, float, float, float],
    *,
    scale: float = 5.0,
    bump_strength: float = 0.18,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 2.2
    noise.inputs["Roughness"].default_value = 0.58
    noise.inputs["Distortion"].default_value = 0.035
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = dark_color
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = light_color
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength * 0.55
    bump.inputs["Distance"].default_value = 0.035
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.82
    return mat


def add_modifier(obj: bpy.types.Object, kind: str, name: str, **kwargs) -> bpy.types.Object:
    mod = obj.modifiers.new(name, kind)
    for key, value in kwargs.items():
        setattr(mod, key, value)
    return obj


def shade(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    obj.select_set(False)
    return obj


def cube_obj(name: str, loc, scale, mat) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def cyl_obj(name: str, loc, radius, depth, mat, vertices=64, rotation=(0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    shade(obj)
    return obj


def sphere_obj(name: str, loc, scale, mat, segments=64, rings=32) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    shade(obj)
    return obj


def cone_obj(name: str, loc, r1, r2, depth, mat, vertices=96, rotation=(0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    shade(obj)
    return obj


def bezier_curve_obj(name: str, points, mat, bevel=0.04, resolution=5) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel
    curve.bevel_resolution = 5
    spl = curve.splines.new("BEZIER")
    spl.bezier_points.add(len(points) - 1)
    for point, co in zip(spl.bezier_points, points):
        point.co = Vector(co)
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def torus_obj(name: str, loc, mat, major=0.4, minor=0.035, rotation=(0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_segments=128,
        minor_segments=16,
        major_radius=major,
        minor_radius=minor,
        location=loc,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    shade(obj)
    return obj


def capsule_between(name: str, start, end, radius, mat, vertices=64) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    obj = cyl_obj(name, midpoint, radius, direction.length, mat, vertices=vertices)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    add_modifier(obj, "BEVEL", "capsule soft edge", width=radius * 0.22, segments=4)
    return obj


def ring_mesh_obj(
    name: str,
    rings: list[list[tuple[float, float, float]]],
    mat: bpy.types.Material,
    *,
    close_top: bool = True,
    close_bottom: bool = True,
) -> bpy.types.Object:
    vertices = [co for ring in rings for co in ring]
    ring_size = len(rings[0])
    faces: list[tuple[int, ...]] = []
    for ring_index in range(len(rings) - 1):
        base = ring_index * ring_size
        next_base = (ring_index + 1) * ring_size
        for i in range(ring_size - 1):
            faces.append((base + i, base + i + 1, next_base + i + 1, next_base + i))
    if close_bottom:
        faces.append(tuple(reversed(range(ring_size))))
    if close_top:
        top_base = (len(rings) - 1) * ring_size
        faces.append(tuple(top_base + i for i in range(ring_size)))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    shade(obj)
    return obj


def cloth_panel_obj(name: str, rows, mat) -> bpy.types.Object:
    vertices = []
    for left, right in rows:
        vertices.extend((left, right))
    faces = []
    for i in range(len(rows) - 1):
        base = i * 2
        faces.append((base, base + 1, base + 3, base + 2))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    add_modifier(obj, "SOLIDIFY", "cloth thickness", thickness=0.018)
    add_modifier(obj, "BEVEL", "soft cloth edge", width=0.018, segments=3)
    shade(obj)
    return obj


def make_arena(mats: dict[str, bpy.types.Material]) -> None:
    board_world_width = BOARD_WIDTH * CELL_SIZE
    board_world_height = BOARD_HEIGHT * CELL_SIZE
    base = cube_obj(
        "arena_full_8x8_foundation",
        (0, 0, -0.20),
        (board_world_width + 0.85, board_world_height + 0.85, 0.30),
        mats["foundation"],
    )
    add_modifier(base, "BEVEL", "small bevel", width=0.08, segments=4)
    add_modifier(base, "WEIGHTED_NORMAL", "weighted normals")

    tile_mats = [mats["tile_a"], mats["tile_b"], mats["tile_c"], mats["tile_d"]]
    for x in range(BOARD_WIDTH):
        for y in range(BOARD_HEIGHT):
            world_x = (x - (BOARD_WIDTH - 1) / 2) * CELL_SIZE
            world_y = (y - (BOARD_HEIGHT - 1) / 2) * CELL_SIZE
            mat = tile_mats[(x * 5 + y * 3) % len(tile_mats)]
            tile = cube_obj(
                f"arena_tile_{x}_{y}",
                (world_x, world_y, 0),
                (CELL_SIZE - 0.10, CELL_SIZE - 0.10, 0.145),
                mat,
            )
            tile.location.z += 0.009 * math.sin(x * 2.1 + y * 1.3)
            tile.rotation_euler.z = math.radians(0.18 * math.sin(x * 3.0 + y))
            add_modifier(tile, "BEVEL", "worn tile edge", width=0.055, segments=4)
            add_modifier(tile, "WEIGHTED_NORMAL", "weighted normals")

    # Layered perimeter reads as a deliberate game board instead of a bare slab.
    border_x = board_world_width / 2 + 0.22
    border_y = board_world_height / 2 + 0.22
    for name, loc, scale in [
        ("north", (0, border_y, -0.01), (board_world_width + 0.55, 0.38, 0.24)),
        ("south", (0, -border_y, -0.01), (board_world_width + 0.55, 0.38, 0.24)),
        ("east", (border_x, 0, -0.01), (0.38, board_world_height + 0.55, 0.24)),
        ("west", (-border_x, 0, -0.01), (0.38, board_world_height + 0.55, 0.24)),
    ]:
        rail = cube_obj(f"arena_border_{name}", loc, scale, mats["border_stone"])
        add_modifier(rail, "BEVEL", "worn border edge", width=0.055, segments=4)
        add_modifier(rail, "WEIGHTED_NORMAL", "border normals")

    # Low-contrast arcane inlay gives the center depth without competing with units.
    torus_obj("arena_center_arcane_inlay_outer", (0, 0, 0.086), mats["inlay"], major=1.58, minor=0.025)
    torus_obj("arena_center_arcane_inlay_inner", (0, 0, 0.088), mats["inlay"], major=0.96, minor=0.016)

    pillar_offset_x = board_world_width / 2 - 0.62
    pillar_offset_y = board_world_height / 2 - 0.62
    for loc in [
        (-pillar_offset_x, -pillar_offset_y, 0.44),
        (pillar_offset_x, -pillar_offset_y, 0.44),
        (-pillar_offset_x, pillar_offset_y, 0.44),
        (pillar_offset_x, pillar_offset_y, 0.44),
    ]:
        cube = cube_obj("arena_pillar_square_plinth", (loc[0], loc[1], 0.18), (1.15, 1.15, 0.22), mats["border_stone"])
        add_modifier(cube, "BEVEL", "plinth bevel", width=0.08, segments=4)
        cyl_obj("arena_low_pillar_base", (loc[0], loc[1], 0.42), 0.48, 0.24, mats["pillar_dark"], vertices=80)
        shaft = cyl_obj("arena_low_pillar", (loc[0], loc[1], 1.05), 0.30, 1.10, mats["pillar_stone"], vertices=80)
        shaft.scale = (0.92, 0.92, 1.0)
        torus_obj("arena_pillar_lower_lip", (loc[0], loc[1], 0.55), mats["pillar_dark"], major=0.34, minor=0.060)
        torus_obj("arena_pillar_upper_lip", (loc[0], loc[1], 1.55), mats["pillar_dark"], major=0.35, minor=0.065)
        cap = cyl_obj("arena_pillar_cap", (loc[0], loc[1], 1.63), 0.46, 0.15, mats["border_stone"], vertices=80)
        add_modifier(cap, "BEVEL", "pillar cap bevel", width=0.035, segments=3)


def make_wizard(mats: dict[str, bpy.types.Material]) -> None:
    created_before = set(bpy.data.objects)

    # Anatomical core. It stays visible through the split robe and gives the
    # silhouette real shoulders, hips, knees and feet.
    for side in (-1, 1):
        capsule_between(
            f"wizard_leg_{side}",
            (side * 0.19, 0.02, 0.38),
            (side * 0.17, 0.03, 1.08),
            0.14,
            mats["trouser"],
        )
        boot = sphere_obj(
            f"wizard_boot_{side}",
            (side * 0.19, -0.12, 0.25),
            (0.18, 0.32, 0.13),
            mats["leather"],
            segments=64,
            rings=24,
        )
        boot.rotation_euler.x = math.radians(-8)

    pelvis = sphere_obj("wizard_anatomical_pelvis", (0, 0.02, 1.12), (0.33, 0.22, 0.27), mats["robe_blue"])
    torso = sphere_obj("wizard_anatomical_torso", (0, 0.03, 1.66), (0.36, 0.24, 0.53), mats["robe_blue"], segments=96, rings=48)
    capsule_between("wizard_neck", (0, 0.02, 2.08), (0, 0.02, 2.25), 0.105, mats["skin"], vertices=48)

    # Open-backed cape: a real mesh shell, wider at the hem and open at the front.
    cape_rings = []
    cape_steps = 28
    for z, rx, ry in [(0.25, 0.84, 0.48), (0.75, 0.70, 0.43), (1.35, 0.57, 0.35), (1.92, 0.49, 0.28), (2.05, 0.43, 0.24)]:
        ring = []
        for i in range(cape_steps):
            theta = math.radians(-118 + i * 236 / (cape_steps - 1))
            fold = 0.025 * math.sin(theta * 7)
            ring.append((math.sin(theta) * (rx + fold), math.cos(theta) * (ry + fold) + 0.12, z))
        cape_rings.append(ring)
    cape = ring_mesh_obj("wizard_open_high_poly_cape", cape_rings, mats["cloak"], close_top=False, close_bottom=False)
    add_modifier(cape, "SOLIDIFY", "cape thickness", thickness=0.035)
    add_modifier(cape, "SUBSURF", "cape smooth folds", levels=2, render_levels=2)

    # Split front coat panels leave the boots visible and avoid the pawn silhouette.
    for side in (-1, 1):
        x_inner = side * 0.035
        x_outer = side * 0.31
        cloth_panel_obj(
            f"wizard_split_front_coat_panel_{side}",
            [
                ((x_inner, -0.275, 1.72), (x_outer, -0.22, 1.67)),
                ((x_inner + side * 0.015, -0.30, 1.25), (x_outer + side * 0.055, -0.22, 1.20)),
                ((x_inner + side * 0.055, -0.265, 0.72), (x_outer + side * 0.10, -0.10, 0.58)),
                ((x_inner + side * 0.10, -0.17, 0.22), (x_outer + side * 0.14, 0.02, 0.22)),
            ],
            mats["robe_light"],
        )
        bezier_curve_obj(
            f"wizard_coat_gold_inner_edge_{side}",
            [
                (x_inner, -0.33, 1.72),
                (x_inner + side * 0.02, -0.36, 1.18),
                (x_inner + side * 0.08, -0.31, 0.68),
                (x_inner + side * 0.14, -0.22, 0.23),
            ],
            mats["gold_trim"],
            bevel=0.016,
            resolution=8,
        )

    # Chest armor and raised collar.
    breastplate = sphere_obj(
        "wizard_sculpted_arcane_breastplate",
        (0, -0.20, 1.72),
        (0.30, 0.075, 0.36),
        mats["robe_light"],
        segments=96,
        rings=48,
    )
    breastplate.rotation_euler.x = math.radians(-4)
    for side in (-1, 1):
        cloth_panel_obj(
            f"wizard_raised_collar_{side}",
            [
                ((side * 0.04, -0.12, 2.03), (side * 0.34, -0.02, 1.96)),
                ((side * 0.09, -0.02, 2.32), (side * 0.27, 0.05, 2.10)),
            ],
            mats["cloak"],
        )
        shoulder = sphere_obj(
            f"wizard_layered_pauldron_{side}",
            (side * 0.40, -0.01, 1.91),
            (0.19, 0.15, 0.105),
            mats["gold_trim"],
            segments=80,
            rings=32,
        )
        shoulder.rotation_euler.y = math.radians(12 * side)
        torus_obj(
            f"wizard_pauldron_inlay_{side}",
            (side * 0.405, -0.135, 1.92),
            mats["silver"],
            major=0.073,
            minor=0.009,
            rotation=(math.radians(90), 0, 0),
        )

    # Arms in an animation-friendly relaxed idle pose.
    arm_points = {
        -1: ((-0.39, 0.0, 1.82), (-0.57, -0.07, 1.50), (-0.64, -0.18, 1.15)),
        1: ((0.39, 0.0, 1.82), (0.58, -0.10, 1.55), (0.82, -0.20, 1.28)),
    }
    for side, (shoulder_p, elbow_p, wrist_p) in arm_points.items():
        capsule_between(f"wizard_upper_arm_{side}", shoulder_p, elbow_p, 0.085, mats["robe_blue"])
        capsule_between(f"wizard_forearm_{side}", elbow_p, wrist_p, 0.070, mats["robe_light"])
        torus_obj(
            f"wizard_bracer_{side}",
            wrist_p,
            mats["gold_trim"],
            major=0.079,
            minor=0.014,
            rotation=(math.radians(72), 0, math.radians(12 * side)),
        )
        hand = sphere_obj(
            f"wizard_hand_{side}",
            (wrist_p[0], wrist_p[1] - 0.015, wrist_p[2] - 0.07),
            (0.075, 0.055, 0.10),
            mats["skin"],
            segments=48,
            rings=24,
        )
        hand.rotation_euler.y = math.radians(-12 * side)

    # Face built from multiple forms instead of a single glowing blob.
    head = sphere_obj("wizard_head_cranium", (0, -0.01, 2.43), (0.245, 0.215, 0.30), mats["skin"], segments=128, rings=64)
    jaw = sphere_obj("wizard_face_jaw", (0, -0.105, 2.31), (0.19, 0.14, 0.19), mats["skin_shadow"], segments=80, rings=40)
    for side in (-1, 1):
        sphere_obj(
            f"wizard_cheekbone_{side}",
            (side * 0.115, -0.205, 2.38),
            (0.085, 0.035, 0.060),
            mats["skin"],
            segments=48,
            rings=24,
        )
        sphere_obj(
            f"wizard_eye_socket_{side}",
            (side * 0.082, -0.226, 2.47),
            (0.058, 0.018, 0.038),
            mats["eye_socket"],
            segments=48,
            rings=24,
        )
        sphere_obj(
            f"wizard_glowing_iris_{side}",
            (side * 0.082, -0.245, 2.47),
            (0.026, 0.010, 0.022),
            mats["eye_glow"],
            segments=40,
            rings=20,
        )
        bezier_curve_obj(
            f"wizard_eyebrow_{side}",
            [
                (side * 0.025, -0.249, 2.525),
                (side * 0.085, -0.255, 2.535),
                (side * 0.15, -0.235, 2.515),
            ],
            mats["hair_shadow"],
            bevel=0.009,
            resolution=5,
        )
        sphere_obj(
            f"wizard_ear_{side}",
            (side * 0.225, -0.01, 2.43),
            (0.035, 0.025, 0.065),
            mats["skin_shadow"],
            segments=40,
            rings=20,
        )
    nose = sphere_obj("wizard_sculpted_nose", (0, -0.253, 2.405), (0.045, 0.055, 0.080), mats["skin"], segments=48, rings=24)
    nose.rotation_euler.x = math.radians(-12)
    bezier_curve_obj(
        "wizard_mouth",
        [(-0.062, -0.238, 2.29), (0, -0.252, 2.278), (0.062, -0.238, 2.29)],
        mats["mouth"],
        bevel=0.006,
        resolution=5,
    )

    # Hair cap plus layered locks. The face remains open and readable.
    hair_cap = sphere_obj(
        "wizard_hair_crown",
        (0, 0.045, 2.56),
        (0.27, 0.23, 0.20),
        mats["hair"],
        segments=96,
        rings=48,
    )
    for side in (-1, 1):
        for i in range(16):
            lateral = 0.07 + i * 0.014
            z_end = 1.23 + 0.06 * math.sin(i * 1.7)
            bezier_curve_obj(
                f"wizard_long_hair_lock_{side}_{i:02d}",
                [
                    (side * lateral, 0.11 + 0.007 * i, 2.64 - 0.004 * i),
                    (side * (0.22 + 0.012 * i), 0.14, 2.14),
                    (side * (0.25 + 0.013 * i), 0.08 + 0.008 * math.sin(i), z_end),
                ],
                mats["hair"] if i % 3 else mats["hair_shadow"],
                bevel=0.014 + 0.003 * (i % 3),
                resolution=8,
            )
        for i in range(5):
            bezier_curve_obj(
                f"wizard_face_framing_lock_{side}_{i}",
                [
                    (side * (0.04 + i * 0.035), -0.10, 2.64),
                    (side * (0.13 + i * 0.025), -0.22, 2.48 - i * 0.04),
                    (side * (0.20 + i * 0.018), -0.14, 2.10 - i * 0.08),
                ],
                mats["hair"],
                bevel=0.013,
                resolution=8,
            )

    # Arcane jewelry and garment details.
    bezier_curve_obj(
        "wizard_gold_brow_circlet",
        [(-0.19, -0.226, 2.57), (0, -0.255, 2.61), (0.19, -0.226, 2.57)],
        mats["gold_trim"],
        bevel=0.014,
        resolution=8,
    )
    sphere_obj("wizard_circlet_center_gem", (0, -0.265, 2.61), (0.045, 0.018, 0.065), mats["orb_glow"], segments=48, rings=24)
    sphere_obj("wizard_chest_blue_gem", (0, -0.318, 1.82), (0.075, 0.025, 0.105), mats["orb_glow"], segments=64, rings=32)
    torus_obj("wizard_waist_belt", (0, -0.01, 1.25), mats["gold_trim"], major=0.37, minor=0.022, rotation=(math.radians(90), 0, 0))
    for i, z in enumerate((0.48, 0.72, 0.98, 1.22, 1.47)):
        width = 0.18 + i * 0.032
        bezier_curve_obj(
            f"wizard_coat_embroidery_{i}",
            [(-width, -0.345, z), (0, -0.375, z + 0.055), (width, -0.345, z)],
            mats["gold_trim"],
            bevel=0.008,
            resolution=6,
        )

    # Staff held by the right hand.
    staff_x = 0.90
    staff_bottom = (staff_x, -0.17, 0.18)
    staff_top = (staff_x, -0.17, 2.67)
    capsule_between("wizard_staff_carved_wood", staff_bottom, staff_top, 0.038, mats["staff"], vertices=48)
    for z in (0.28, 1.20, 2.23):
        torus_obj("wizard_staff_gold_binding", (staff_x, -0.17, z), mats["gold_trim"], major=0.055, minor=0.013)
    sphere_obj("wizard_staff_head_socket", (staff_x, -0.17, 2.48), (0.13, 0.13, 0.12), mats["gold_trim"], segments=64, rings=32)
    sphere_obj("wizard_staff_arcane_core", (staff_x, -0.17, 2.72), (0.14, 0.14, 0.14), mats["orb_glow"], segments=96, rings=48)
    for rotation in ((0, 0, 0), (math.radians(90), 0, 0), (0, math.radians(90), 0)):
        torus_obj("wizard_staff_orb_arc", (staff_x, -0.17, 2.72), mats["silver"], major=0.19, minor=0.010, rotation=rotation)

    # Three detailed idle spheres. Emission supplies the glow without viewport
    # point-light gizmos, and cyclic interpolation keeps playback continuous.
    for i in range(3):
        angle = i * math.tau / 3
        orb = sphere_obj(
            f"wizard_idle_orb_{i + 1}_core",
            (0, 0, 0),
            (0.078, 0.078, 0.078),
            mats["orb_glow"],
            segments=80,
            rings=40,
        )
        shell = sphere_obj(
            f"wizard_idle_orb_{i + 1}_shell",
            (0, 0, 0),
            (0.105, 0.105, 0.105),
            mats["orb_shell"],
            segments=64,
            rings=32,
        )
        shell.parent = orb
        for ring_index, rotation in enumerate(((0, 0, 0), (math.radians(90), 0, 0))):
            ring = torus_obj(
                f"wizard_idle_orb_{i + 1}_ring_{ring_index}",
                (0, 0, 0),
                mats["silver"],
                major=0.108,
                minor=0.005,
                rotation=rotation,
            )
            ring.parent = orb
        for frame in (1, 31, 61, 91, 121):
            t = angle + (frame - 1) / 120 * math.tau
            orb.location = (
                math.cos(t) * 0.91,
                math.sin(t) * 0.61 + 0.02,
                2.04 + 0.13 * math.sin(t * 2),
            )
            orb.rotation_euler = (t * 0.7, t * 1.3, t * 1.8)
            orb.keyframe_insert(data_path="location", frame=frame)
            orb.keyframe_insert(data_path="rotation_euler", frame=frame)
    root = bpy.data.objects.new("wizard_character_root_for_future_rig", None)
    bpy.context.collection.objects.link(root)
    for obj in set(bpy.data.objects) - created_before:
        if obj is not root and obj.parent is None:
            obj.parent = root
    root.location = (-CELL_SIZE * 0.5, -CELL_SIZE * 0.5, 0)


def setup_scene() -> None:
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 120
    bpy.context.scene.frame_set(1)
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.render.dither_intensity = 0.0
    bpy.context.scene.eevee.taa_samples = 48
    bpy.context.scene.eevee.taa_render_samples = 96
    bpy.context.scene.view_settings.view_transform = "AgX"
    bpy.context.scene.view_settings.look = "AgX - Base Contrast"
    bpy.context.scene.view_settings.exposure = 0.08
    bpy.context.scene.render.resolution_x = 900
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.world.use_nodes = True
    world_bg = bpy.context.scene.world.node_tree.nodes.get("Background")
    world_bg.inputs["Color"].default_value = (0.018, 0.028, 0.045, 1.0)
    world_bg.inputs["Strength"].default_value = 0.22

    mats = {
        "tile_a": mat_stone("blue charcoal slate", rgba(0x14272B), rgba(0x2A4248), scale=6.5),
        "tile_b": mat_stone("desaturated moss slate", rgba(0x182B27), rgba(0x31473E), scale=7.2),
        "tile_c": mat_stone("cold weathered slate", rgba(0x1B2530), rgba(0x34404B), scale=5.8),
        "tile_d": mat_stone("deep green gray slate", rgba(0x152724), rgba(0x2A3E38), scale=8.0),
        "foundation": mat_stone("arena dark foundation", rgba(0x11191D), rgba(0x202C31), scale=4.0, bump_strength=0.24),
        "border_stone": mat_stone("arena carved border", rgba(0x263136), rgba(0x46565B), scale=5.0, bump_strength=0.20),
        "pillar_dark": mat_stone("pillar dark carved bands", rgba(0x20282D), rgba(0x3D494E), scale=7.0, bump_strength=0.18),
        "pillar_stone": mat_stone("pillar weathered green stone", rgba(0x43514F), rgba(0x687874), scale=5.5, bump_strength=0.22),
        "inlay": mat_principled(
            "subtle cyan arena inlay",
            rgba(0x3F8792),
            roughness=0.42,
            metallic=0.35,
            emission=rgba(0x2B6972),
            strength=0.22,
        ),
        "groove": mat_principled("dark grout lines", rgba(0x1F2627)),
        "robe_blue": mat_principled("deep arcane blue robe", rgba(0x123B68)),
        "robe_light": mat_principled("desaturated sky robe panels", rgba(0x3D82A5)),
        "cloak": mat_principled("midnight violet cloak", rgba(0x161728)),
        "cloak_shadow": mat_principled("cloak raised fold shadow", rgba(0x090A13)),
        "trouser": mat_principled("dark fitted trousers", rgba(0x111827), roughness=0.78),
        "gold_trim": mat_principled("warm engraved gold trim", rgba(0xD6B15A), roughness=0.38, metallic=0.65),
        "silver": mat_principled("cool silver", rgba(0xB6CAD2), roughness=0.35, metallic=0.75),
        "skin": mat_principled("pale mage skin", rgba(0xD5B98D)),
        "skin_shadow": mat_principled("warm face shadow", rgba(0xA98262), roughness=0.72),
        "hair": mat_principled("long pale gold hair", rgba(0xE8D9A4), roughness=0.5),
        "hair_shadow": mat_principled("hair depth strands", rgba(0x8C7346), roughness=0.58),
        "eye_socket": mat_principled("deep eye sockets", rgba(0x18212B), roughness=0.8),
        "mouth": mat_principled("subtle mouth", rgba(0x6B353B), roughness=0.76),
        "leather": mat_principled("dark leather boots", rgba(0x2B1B15)),
        "staff": mat_principled("dark carved staff wood", rgba(0x362015)),
        "eye_glow": mat_principled("cyan glowing irises", rgba(0x57C7EA), emission=rgba(0x3AAED4), strength=0.75),
        "orb_glow": mat_principled("blue arcane emission", rgba(0x2499C9), emission=rgba(0x168FC2), strength=0.90),
        "orb_shell": mat_principled("translucent arcane shell", rgba(0x6DD8FF, 0.24), roughness=0.18, metallic=0.12, alpha=0.24),
    }

    make_arena(mats)
    make_wizard(mats)

    def add_area(name, location, energy, size, color, target=(0, 0, 1.1)):
        bpy.ops.object.light_add(type="AREA", location=location)
        area_light = bpy.context.object
        area_light.name = name
        area_light.data.energy = energy
        area_light.data.size = size
        area_light.data.color = color
        direction = Vector(target) - area_light.location
        area_light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        return area_light

    add_area("warm_soft_key", (-8.0, -10.5, 12.0), 560, 8.0, (1.0, 0.68, 0.46))
    add_area("cool_broad_fill", (10.0, -5.0, 8.0), 220, 9.0, (0.28, 0.48, 1.0))
    add_area("cyan_back_rim", (0.0, 10.0, 10.5), 300, 6.0, (0.18, 0.62, 1.0), target=(0, 0, 1.3))
    add_area("soft_overhead_board_fill", (0.0, 0.0, 14.0), 620, 14.0, (0.56, 0.70, 0.84), target=(0, 0, 0))

    bpy.ops.object.camera_add(location=(11.8, -19.5, 15.2))
    camera = bpy.context.object
    camera.name = "wizard_preview_camera"
    target = Vector((0, 0, 0.55))
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 50
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = direction.length
    camera.data.dof.aperture_fstop = 9.0
    bpy.context.scene.camera = camera

    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "RENDERED"
                    space.shading.use_scene_lights_render = True
                    space.shading.use_scene_world_render = True
                    space.overlay.show_relationship_lines = False
                    space.overlay.show_floor = False
                    space.overlay.show_axis_x = False
                    space.overlay.show_axis_y = False
                    space.overlay.show_extras = False

    bpy.ops.object.select_all(action="DESELECT")

    blend_path = OUTPUT / "gridfall_wizard_invoker_pass.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))


if __name__ == "__main__":
    clear_scene()
    setup_scene()
