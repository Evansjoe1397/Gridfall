from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"
OUTPUT.mkdir(exist_ok=True)


def rgba(value: int, alpha: float = 1.0):
    return (
        ((value >> 16) & 255) / 255,
        ((value >> 8) & 255) / 255,
        (value & 255) / 255,
        alpha,
    )


def material(name, color, roughness=0.62, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def smooth(obj):
    if obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def add_uv_sphere(name, location, scale, mat, segments=64, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def add_curve(name, points, mat, bevel=0.012, resolution=8):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel
    curve.bevel_resolution = 5
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for handle, co in zip(spline.bezier_points, points):
        handle.co = co
        handle.handle_left_type = "AUTO"
        handle.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_capsule(name, start, end, radius, mat):
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=radius,
        depth=direction.length,
        location=(a + b) * 0.5,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("soft anatomical transition", "BEVEL")
    bevel.width = radius * 0.28
    bevel.segments = 5
    smooth(obj)
    return obj


def metaball_surface(name, samples, mat, resolution=0.045):
    data = bpy.data.metaballs.new(f"{name}_implicit_data")
    data.resolution = resolution
    data.render_resolution = resolution * 0.72
    data.threshold = 0.63
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for co, radius, stiffness in samples:
        element = data.elements.new()
        element.co = co
        element.radius = radius
        element.stiffness = stiffness
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def segment_samples(a, b, radius_a, radius_b, count=6, stiffness=2.0):
    a = Vector(a)
    b = Vector(b)
    return [
        (
            a.lerp(b, i / (count - 1)),
            radius_a + (radius_b - radius_a) * i / (count - 1),
            stiffness,
        )
        for i in range(count)
    ]


def cloth_grid(name, rows, columns, point_fn, mat, solidify=0.025, subdivisions=2):
    vertices = []
    for row in range(rows):
        v = row / (rows - 1)
        for column in range(columns):
            u = column / (columns - 1)
            vertices.append(point_fn(u, v))
    faces = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            faces.append((a, a + 1, a + columns + 1, a + columns))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    thickness = obj.modifiers.new("cloth thickness", "SOLIDIFY")
    thickness.thickness = solidify
    subsurf = obj.modifiers.new("cloth subdivision", "SUBSURF")
    subsurf.levels = subdivisions
    subsurf.render_levels = subdivisions
    smooth(obj)
    return obj


def remove_previous_local_pass():
    for obj in list(bpy.data.objects):
        if obj.name.startswith("local_wizard_"):
            bpy.data.objects.remove(obj, do_unlink=True)


def create_local_wizard():
    remove_previous_local_pass()
    for name in (
        "wizard_character_root_for_future_rig",
        "wizard_rodin_high_detail_raw",
        "wizard_rodin_clean_base_v2",
    ):
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_set(True)
            obj.hide_render = True
            for child in obj.children_recursive:
                child.hide_set(True)
                child.hide_render = True

    mats = {
        "skin": material("local sculpt warm skin", rgba(0xC99472), roughness=0.72),
        "skin_shadow": material("local sculpt skin shadow", rgba(0x7F4F3D), roughness=0.78),
        "hair": material("local sculpt platinum hair", rgba(0xD8CDAA), roughness=0.48),
        "hair_dark": material("local sculpt hair depth", rgba(0x74674C), roughness=0.58),
        "tunic": material("local sculpt midnight tunic", rgba(0x15284E), roughness=0.56),
        "tunic_light": material("local sculpt violet blue panels", rgba(0x334E83), roughness=0.52),
        "trousers": material("local sculpt fitted trousers", rgba(0x121720), roughness=0.76),
        "cloak": material("local sculpt deep violet cloak", rgba(0x18152D), roughness=0.70),
        "gold": material("local sculpt engraved gold", rgba(0xB68A42), roughness=0.35, metallic=0.78),
        "silver": material("local sculpt cool silver", rgba(0x8EA8B6), roughness=0.30, metallic=0.82),
        "leather": material("local sculpt dark leather", rgba(0x241713), roughness=0.68),
        "eye_socket": material("local sculpt dark eye socket", rgba(0x121922), roughness=0.82),
        "eye": material(
            "local sculpt cyan iris",
            rgba(0x30A9D4),
            roughness=0.22,
            emission=rgba(0x1593C1),
            strength=0.85,
        ),
        "magic": material(
            "local sculpt cyan magic",
            rgba(0x218EBB),
            roughness=0.18,
            emission=rgba(0x137CA8),
            strength=0.82,
        ),
        "staff": material("local sculpt staff wood", rgba(0x321E19), roughness=0.70),
    }

    root = bpy.data.objects.new("local_wizard_character_root", None)
    bpy.context.collection.objects.link(root)
    created_before = set(bpy.data.objects)

    # One implicit anatomical surface. Closely spaced fields create a unified
    # humanoid volume before Blender converts it to a smooth mesh.
    body = []
    body.extend(
        [
            ((0.0, 0.01, 1.08), 0.26, 2.2),
            ((0.0, 0.015, 1.31), 0.29, 2.2),
            ((0.0, 0.02, 1.54), 0.34, 2.2),
            ((0.0, 0.02, 1.76), 0.31, 2.2),
            ((0.0, 0.015, 1.96), 0.20, 2.2),
            ((0.0, 0.00, 2.13), 0.105, 2.2),
            ((0.0, -0.005, 2.36), 0.235, 2.2),
            ((0.0, -0.045, 2.26), 0.205, 2.2),
        ]
    )
    for side in (-1, 1):
        body.extend(
            segment_samples(
                (side * 0.31, 0.01, 1.78),
                (side * 0.52, -0.015, 1.51),
                0.135,
                0.105,
                count=6,
                stiffness=2.15,
            )
        )
        body.extend(
            segment_samples(
                (side * 0.52, -0.015, 1.51),
                (side * 0.61, -0.09, 1.20),
                0.105,
                0.072,
                count=6,
                stiffness=2.1,
            )
        )
        body.append(((side * 0.62, -0.10, 1.11), 0.085, 2.2))
        body.extend(
            segment_samples(
                (side * 0.16, 0.01, 1.08),
                (side * 0.17, 0.02, 0.62),
                0.145,
                0.115,
                count=7,
                stiffness=2.15,
            )
        )
        body.extend(
            segment_samples(
                (side * 0.17, 0.02, 0.62),
                (side * 0.18, -0.02, 0.20),
                0.115,
                0.080,
                count=7,
                stiffness=2.15,
            )
        )
    anatomy = metaball_surface("local_wizard_unified_anatomy", body, mats["skin"])

    # Fitted clothing follows the anatomical silhouette but remains separate for rigging.
    torso = metaball_surface(
        "local_wizard_fitted_tunic_volume",
        [
            ((0, 0.005, 1.22), 0.285, 2.1),
            ((0, 0.005, 1.45), 0.345, 2.1),
            ((0, 0.0, 1.67), 0.365, 2.1),
            ((0, 0.0, 1.86), 0.315, 2.1),
        ],
        mats["tunic"],
        resolution=0.038,
    )
    for side in (-1, 1):
        upper_sleeve = metaball_surface(
            f"local_wizard_upper_sleeve_{side}",
            segment_samples(
                (side * 0.31, 0.01, 1.78),
                (side * 0.52, -0.015, 1.51),
                0.152,
                0.118,
                count=7,
                stiffness=2.1,
            ),
            mats["tunic_light"],
            resolution=0.035,
        )
        forearm_bracer = add_capsule(
            f"local_wizard_forearm_bracer_{side}",
            (side * 0.52, -0.018, 1.49),
            (side * 0.60, -0.085, 1.23),
            0.092,
            mats["silver"],
        )
        add_uv_sphere(
            f"local_wizard_pauldron_{side}",
            (side * 0.345, -0.015, 1.82),
            (0.19, 0.14, 0.115),
            mats["gold"],
        )

        trouser = metaball_surface(
            f"local_wizard_trouser_leg_{side}",
            segment_samples(
                (side * 0.16, 0.02, 1.08),
                (side * 0.18, 0.0, 0.24),
                0.155,
                0.095,
                count=11,
                stiffness=2.1,
            ),
            mats["trousers"],
            resolution=0.038,
        )
        boot = add_uv_sphere(
            f"local_wizard_boot_{side}",
            (side * 0.18, -0.11, 0.16),
            (0.14, 0.25, 0.11),
            mats["leather"],
        )

    # Structured coat panels make the waist readable without producing a cone.
    for side in (-1, 1):
        cloth_grid(
            f"local_wizard_short_coat_panel_{side}",
            rows=5,
            columns=5,
            point_fn=lambda u, v, side=side: (
                side * (0.025 + (0.30 + 0.08 * v) * u),
                -0.285 - 0.015 * math.sin(u * math.pi),
                1.72 - 0.78 * v + 0.025 * math.sin(v * math.pi),
            ),
            mat=mats["tunic_light"],
            solidify=0.018,
            subdivisions=2,
        )
        add_curve(
            f"local_wizard_coat_gold_edge_{side}",
            [
                (side * 0.025, -0.315, 1.72),
                (side * 0.04, -0.325, 1.32),
                (side * 0.08, -0.31, 0.94),
            ],
            mats["gold"],
            bevel=0.011,
        )

    # Draped cape surface with broad folds; no visible primitive cone.
    def cape_point(u, v):
        x_normalized = u * 2 - 1
        width = 0.43 + 0.28 * v
        x = x_normalized * width
        y = 0.14 + 0.08 * abs(x_normalized) + 0.035 * math.cos(x_normalized * math.pi * 5) * v
        z = 1.98 - 1.78 * v + 0.035 * math.cos(x_normalized * math.pi) * math.sin(v * math.pi)
        return x, y, z

    cape = cloth_grid(
        "local_wizard_draped_cape",
        rows=18,
        columns=22,
        point_fn=cape_point,
        mat=mats["cloak"],
        solidify=0.028,
        subdivisions=2,
    )

    # Face forms remain separate so they can be adjusted from screenshots.
    add_uv_sphere("local_wizard_jaw", (0, -0.185, 2.27), (0.18, 0.08, 0.16), mats["skin_shadow"])
    add_uv_sphere("local_wizard_nose", (0, -0.245, 2.36), (0.038, 0.045, 0.065), mats["skin"])
    for side in (-1, 1):
        add_uv_sphere(
            f"local_wizard_eye_socket_{side}",
            (side * 0.078, -0.231, 2.43),
            (0.055, 0.018, 0.035),
            mats["eye_socket"],
        )
        add_uv_sphere(
            f"local_wizard_glowing_iris_{side}",
            (side * 0.078, -0.248, 2.43),
            (0.024, 0.010, 0.020),
            mats["eye"],
            segments=40,
            rings=20,
        )
        add_curve(
            f"local_wizard_brow_{side}",
            [
                (side * 0.02, -0.252, 2.49),
                (side * 0.08, -0.257, 2.50),
                (side * 0.145, -0.24, 2.485),
            ],
            mats["hair_dark"],
            bevel=0.008,
        )
    add_curve(
        "local_wizard_mouth",
        [(-0.055, -0.247, 2.25), (0, -0.258, 2.24), (0.055, -0.247, 2.25)],
        mats["skin_shadow"],
        bevel=0.006,
    )

    # Hair uses generated guides. Each lock is a smooth interpolated curve;
    # the script controls a few guide parameters, not individual polygons.
    add_uv_sphere("local_wizard_hair_cap", (0, 0.045, 2.49), (0.25, 0.22, 0.25), mats["hair"])
    for side in (-1, 1):
        for index in range(18):
            t = index / 17
            x0 = side * (0.045 + 0.18 * t)
            x1 = side * (0.17 + 0.17 * t)
            z_end = 1.42 + 0.14 * math.sin(index * 1.31)
            add_curve(
                f"local_wizard_long_hair_guide_{side}_{index:02d}",
                [
                    (x0, 0.08 + 0.05 * t, 2.63 - 0.04 * t),
                    (x1, 0.11, 2.20),
                    (x1 + side * 0.05, 0.05, 1.80),
                    (x1 + side * 0.07, 0.02, z_end),
                ],
                mats["hair"] if index % 4 else mats["hair_dark"],
                bevel=0.012 + 0.003 * (index % 3),
                resolution=8,
            )
        for index in range(5):
            add_curve(
                f"local_wizard_face_lock_{side}_{index}",
                [
                    (side * (0.035 + index * 0.035), -0.07, 2.62),
                    (side * (0.12 + index * 0.025), -0.20, 2.46 - index * 0.035),
                    (side * (0.19 + index * 0.018), -0.12, 2.03 - index * 0.07),
                ],
                mats["hair"],
                bevel=0.012,
                resolution=8,
            )

    # Circlet, chest gem and restrained ornament.
    add_curve(
        "local_wizard_circlet",
        [(-0.18, -0.225, 2.54), (0, -0.255, 2.58), (0.18, -0.225, 2.54)],
        mats["gold"],
        bevel=0.013,
    )
    add_uv_sphere("local_wizard_circlet_gem", (0, -0.263, 2.58), (0.040, 0.014, 0.055), mats["magic"])
    add_uv_sphere("local_wizard_chest_gem", (0, -0.355, 1.76), (0.060, 0.020, 0.085), mats["magic"])
    for z, width in ((1.55, 0.20), (1.38, 0.23), (1.20, 0.25), (1.02, 0.28)):
        add_curve(
            f"local_wizard_tunic_embroidery_{int(z * 100)}",
            [(-width, -0.35, z), (0, -0.37, z + 0.045), (width, -0.35, z)],
            mats["gold"],
            bevel=0.007,
        )

    # Staff and three orbiting spheres remain independent animation objects.
    add_capsule("local_wizard_staff", (0.70, -0.09, 0.15), (0.70, -0.09, 2.66), 0.034, mats["staff"])
    add_uv_sphere("local_wizard_staff_socket", (0.70, -0.09, 2.52), (0.12, 0.12, 0.11), mats["gold"])
    add_uv_sphere("local_wizard_staff_core", (0.70, -0.09, 2.72), (0.13, 0.13, 0.13), mats["magic"])
    for index in range(3):
        angle = index * math.tau / 3
        orb = add_uv_sphere(
            f"local_wizard_idle_orb_{index + 1}",
            (math.cos(angle) * 0.67, math.sin(angle) * 0.46, 1.92),
            (0.075, 0.075, 0.075),
            mats["magic"],
        )
        for frame in (1, 31, 61, 91, 121):
            t = angle + (frame - 1) / 120 * math.tau
            orb.location = (
                math.cos(t) * 0.67,
                math.sin(t) * 0.46,
                1.92 + 0.10 * math.sin(t * 2),
            )
            orb.keyframe_insert(data_path="location", frame=frame)

    for obj in set(bpy.data.objects) - created_before:
        if obj is not root and obj.parent is None:
            obj.parent = root
    root.location = (-1.0, -1.0, 0.0)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 120
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_local_sculpt_v1.blend"))


if __name__ == "__main__":
    create_local_wizard()
