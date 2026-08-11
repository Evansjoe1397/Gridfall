import bpy
import json
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"
COLLECTION_NAME = "Wizard_Clothing"
BODY_NAME = "Wizard_Base_Mesh"
CELL_SIZE = 2.2


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def reset_collection(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    else:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)

    for mesh in list(bpy.data.meshes):
        if mesh.users == 0 and mesh.name.startswith("Wizard_Suit_"):
            bpy.data.meshes.remove(mesh)
    for curve in list(bpy.data.curves):
        if curve.users == 0 and curve.name.startswith("Wizard_Suit_"):
            bpy.data.curves.remove(curve)
    return collection


def discover_deform_rig(human):
    candidates = [
        modifier.object
        for modifier in human.modifiers
        if modifier.type == "ARMATURE"
        and modifier.object is not None
        and modifier.object.type == "ARMATURE"
    ]
    if not candidates:
        raise RuntimeError(
            f"{human.name} has no Armature modifier with a valid deform rig"
        )
    visible = [rig for rig in candidates if not rig.hide_render]
    return visible[0] if visible else candidates[0]


def tag_attachment(obj, rig, mode, bones, region):
    obj["wizard_attachment_schema"] = "gridfall.wizard.clothing.v1"
    obj["wizard_attachment_rig"] = rig.name
    obj["wizard_attachment_mode"] = mode
    obj["wizard_attachment_bones"] = json.dumps(list(bones))
    obj["wizard_attachment_region"] = region
    obj["wizard_bind_pending"] = True


def material(name, base, roughness=0.62, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*base, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def evaluated_world_vertices(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    matrix = evaluated.matrix_world
    points = [matrix @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def bounds(points):
    low = Vector((
        min(point.x for point in points),
        min(point.y for point in points),
        min(point.z for point in points),
    ))
    high = Vector((
        max(point.x for point in points),
        max(point.y for point in points),
        max(point.z for point in points),
    ))
    return low, high


def slice_profile(points, z, center_x, half_band, x_limit):
    candidates = [
        point
        for point in points
        if abs(point.z - z) <= half_band and abs(point.x - center_x) <= x_limit
    ]
    if len(candidates) < 12:
        candidates = [
            point
            for point in points
            if abs(point.z - z) <= half_band * 2.5
            and abs(point.x - center_x) <= x_limit
        ]
    if len(candidates) < 6:
        raise RuntimeError(f"Could not sample the wizard body around z={z:.3f}")
    x_min = min(point.x for point in candidates)
    x_max = max(point.x for point in candidates)
    y_min = min(point.y for point in candidates)
    y_max = max(point.y for point in candidates)
    return {
        "center_x": (x_min + x_max) * 0.5,
        "center_y": (y_min + y_max) * 0.5,
        "radius_x": (x_max - x_min) * 0.5,
        "radius_y": (y_max - y_min) * 0.5,
        "front_y": y_min,
        "back_y": y_max,
    }


def weighted_group_center(human, world_points, names):
    for name in names:
        group = human.vertex_groups.get(name)
        if group is None:
            continue
        weighted = Vector((0.0, 0.0, 0.0))
        total = 0.0
        limit = min(len(world_points), len(human.data.vertices))
        for index in range(limit):
            try:
                weight = group.weight(index)
            except RuntimeError:
                continue
            if weight <= 0.0:
                continue
            weighted += world_points[index] * weight
            total += weight
        if total > 1e-6:
            return weighted / total, name
    return None, None


def add_surface_modifiers(obj, thickness=0.008, bevel=0.004, subdivision=1):
    if subdivision:
        modifier = obj.modifiers.new("Cartoon surface smoothing", "SUBSURF")
        modifier.subdivision_type = "CATMULL_CLARK"
        modifier.levels = subdivision
        modifier.render_levels = subdivision
    solidify = obj.modifiers.new("Tailored fabric thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.0
    if bevel:
        edge = obj.modifiers.new("Soft tailored edges", "BEVEL")
        edge.width = bevel
        edge.segments = 2


def make_ring_surface(name, rings, segments, mat, collection, fold_strength=0.0):
    vertices = []
    faces = []
    ring_count = len(rings)
    for ring_index, ring in enumerate(rings):
        t = ring_index / max(1, ring_count - 1)
        z, rx, ry, cx, cy = ring
        for segment in range(segments):
            angle = math.tau * segment / segments
            fold = 1.0 + fold_strength * (0.25 + 0.75 * t) * math.cos(angle * 8.0 + 0.35)
            vertices.append((
                cx + rx * fold * math.cos(angle),
                cy + ry * fold * math.sin(angle),
                z,
            ))
    for ring_index in range(ring_count - 1):
        lower = ring_index * segments
        upper = (ring_index + 1) * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((lower + segment, lower + nxt, upper + nxt, upper + segment))

    mesh = bpy.data.meshes.new(f"Wizard_Suit_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    add_surface_modifiers(obj, thickness=0.008, bevel=0.0035, subdivision=1)
    return obj


def make_sleeve(name, points, radii, mat, collection):
    segments = 20
    vertices = []
    faces = []
    for point_index, point in enumerate(points):
        if point_index == 0:
            tangent = (points[1] - point).normalized()
        elif point_index == len(points) - 1:
            tangent = (point - points[point_index - 1]).normalized()
        else:
            tangent = (points[point_index + 1] - points[point_index - 1]).normalized()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.90:
            reference = Vector((0.0, 1.0, 0.0))
        axis_x = tangent.cross(reference).normalized()
        axis_y = tangent.cross(axis_x).normalized()
        for segment in range(segments):
            angle = math.tau * segment / segments
            radius = radii[point_index] * (1.0 + 0.035 * math.cos(angle * 4.0))
            offset = axis_x * math.cos(angle) * radius + axis_y * math.sin(angle) * radius
            vertices.append(tuple(point + offset))
    for point_index in range(len(points) - 1):
        lower = point_index * segments
        upper = (point_index + 1) * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((lower + segment, lower + nxt, upper + nxt, upper + segment))

    mesh = bpy.data.meshes.new(f"Wizard_Suit_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    add_surface_modifiers(obj, thickness=0.006, bevel=0.0025, subdivision=1)
    return obj


def make_cape(name, center_x, neck_z, shoulder_z, hem_z, back_y, mat, collection):
    columns = 35
    rows = 19
    vertices = []
    faces = []
    neck_width = 0.105
    shoulder_width = 0.335
    hem_width = 0.410

    for row in range(rows):
        t = row / (rows - 1)
        if t < 0.18:
            blend = math.sin((t / 0.18) * math.pi * 0.5) ** 2
            width = neck_width + (shoulder_width - neck_width) * blend
        else:
            blend = (t - 0.18) / 0.82
            width = shoulder_width + (hem_width - shoulder_width) * blend
        z = neck_z * (1.0 - t) + hem_z * t
        if t < 0.18:
            z = neck_z + (shoulder_z - neck_z) * (t / 0.18)
        for column in range(columns):
            u = column / (columns - 1) * 2.0 - 1.0
            edge_drop = 0.040 * abs(u) ** 1.7 * (0.25 + 0.75 * t)
            fold = 0.022 * math.cos(u * math.pi * 4.0 + 0.5) * (0.35 + 0.65 * t)
            # The cape wraps around the back instead of reading as a thickened plane.
            center_bulge = 0.060 * (1.0 - u * u) * (0.30 + 0.70 * t)
            side_return = -0.095 * abs(u) ** 1.55 * (0.45 + 0.55 * t)
            vertices.append((
                center_x + width * u,
                back_y + 0.028 + 0.110 * (t ** 1.25) + center_bulge + side_return + fold,
                z - edge_drop + 0.012 * math.cos(u * math.pi * 3.0) * t,
            ))
    for row in range(rows - 1):
        for column in range(columns - 1):
            index = row * columns + column
            faces.append((index, index + 1, index + 1 + columns, index + columns))

    mesh = bpy.data.meshes.new(f"Wizard_Suit_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    add_surface_modifiers(obj, thickness=0.016, bevel=0.0040, subdivision=1)
    return obj


def make_mantle(name, center, inner, outer, z, mat, collection):
    segments = 36
    start = math.radians(-74.0)
    end = math.radians(74.0)
    vertices = []
    faces = []
    for radius_index, (rx, ry) in enumerate((inner, outer)):
        for index in range(segments):
            angle = start + (end - start) * index / (segments - 1)
            lift = 0.028 * math.cos(angle) + 0.014 * radius_index
            vertices.append((
                center.x + rx * math.sin(angle),
                center.y + ry * math.cos(angle),
                z + lift,
            ))
    for index in range(segments - 1):
        faces.append((index, index + 1, segments + index + 1, segments + index))

    mesh = bpy.data.meshes.new(f"Wizard_Suit_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    add_surface_modifiers(obj, thickness=0.012, bevel=0.005, subdivision=2)
    return obj


def make_shoulder_shell(name, center, radius_x, radius_y, height, mat, collection):
    rings = 6
    segments = 28
    vertices = [tuple(center + Vector((0.0, 0.0, height)))]
    faces = []
    for ring in range(1, rings + 1):
        radial = ring / rings
        z = center.z + height * (1.0 - radial ** 1.65)
        for segment in range(segments):
            angle = math.tau * segment / segments
            vertices.append((
                center.x + radius_x * radial * math.cos(angle),
                center.y + radius_y * radial * math.sin(angle),
                z,
            ))
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(rings - 1):
        current = 1 + ring * segments
        following = current + segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((current + segment, following + segment, following + nxt, current + nxt))

    mesh = bpy.data.meshes.new(f"Wizard_Suit_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    add_surface_modifiers(obj, thickness=0.010, bevel=0.003, subdivision=1)
    return obj


def add_curve(name, points, bevel, mat, collection, cyclic=False):
    curve = bpy.data.curves.new(f"Wizard_Suit_{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 4
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bezier, coordinate in zip(spline.bezier_points, points):
        bezier.co = coordinate
        bezier.handle_left_type = "VECTOR"
        bezier.handle_right_type = "VECTOR"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


def add_torus(name, location, major_radius, minor_radius, scale_y, mat, collection):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=40,
        minor_segments=8,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale.y = scale_y
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    return obj


def add_buckle(name, location, mat, collection):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (0.052, 0.020, 0.067)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Rounded heraldic buckle", "BEVEL")
    bevel.width = 0.014
    bevel.segments = 3
    move_to_collection(obj, collection)
    return obj


def object_world_bounds(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        if obj.type == "CURVE":
            margin = obj.data.bevel_depth + 0.004
            for spline in obj.data.splines:
                if spline.type == "BEZIER":
                    for point in spline.bezier_points:
                        world = obj.matrix_world @ point.co
                        points.extend((
                            world + Vector((margin, margin, margin)),
                            world - Vector((margin, margin, margin)),
                        ))
                else:
                    for point in spline.points:
                        world = obj.matrix_world @ point.co.xyz
                        points.extend((
                            world + Vector((margin, margin, margin)),
                            world - Vector((margin, margin, margin)),
                        ))
            continue
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    return bounds(points)


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
    OUTPUT.mkdir(parents=True, exist_ok=True)
    human = bpy.data.objects.get(BODY_NAME)
    if human is None or human.type != "MESH":
        raise RuntimeError(f"Missing mesh object: {BODY_NAME}")
    rig = discover_deform_rig(human)
    world_points = evaluated_world_vertices(human)
    low, high = bounds(world_points)
    height = high.z - low.z
    center_x = (low.x + high.x) * 0.5
    torso_limit = min(0.34, (high.x - low.x) * 0.33)

    waist_z = low.z + height * 0.515
    chest_z = low.z + height * 0.690
    shoulder_z = low.z + height * 0.770
    neck_z = low.z + height * 0.835
    hem_z = low.z + max(0.075, height * 0.045)
    profile_waist = slice_profile(world_points, waist_z, center_x, 0.025, torso_limit)
    profile_chest = slice_profile(world_points, chest_z, center_x, 0.025, torso_limit)
    profile_shoulder = slice_profile(world_points, shoulder_z, center_x, 0.025, torso_limit)
    profile_neck = slice_profile(world_points, neck_z, center_x, 0.022, torso_limit)

    collection = reset_collection(COLLECTION_NAME)
    collection["wizard_attachment_schema"] = "gridfall.wizard.clothing.v1"
    collection["wizard_deform_rig"] = rig.name
    collection["wizard_bind_status"] = "pending"
    collection["wizard_fit_source"] = human.name
    collection["wizard_cell_size"] = CELL_SIZE

    navy = material("Wizard Robe Navy", (0.022, 0.050, 0.135), 0.66)
    indigo = material("Wizard Cloak Indigo", (0.040, 0.060, 0.205), 0.72)
    leather = material("Wizard Belt Leather", (0.085, 0.040, 0.028), 0.74)
    silver = material("Wizard Silver Trim", (0.32, 0.42, 0.58), 0.28, metallic=0.68)
    arcane = material(
        "Wizard Arcane Trim",
        (0.008, 0.16, 0.42),
        0.30,
        emission=(0.01, 0.35, 1.0),
        strength=2.3,
    )

    torso_rings = []
    torso_levels = 9
    for index in range(torso_levels):
        t = index / (torso_levels - 1)
        z = neck_z * (1.0 - t) + waist_z * t
        profile = slice_profile(world_points, z, center_x, 0.027, torso_limit)
        shoulder_ease = math.sin((1.0 - t) * math.pi * 0.5) ** 2
        rx = profile["radius_x"] * 1.045 + 0.012 + 0.018 * shoulder_ease
        ry = profile["radius_y"] * 1.055 + 0.014
        torso_rings.append((z, rx, ry, profile["center_x"], profile["center_y"] - 0.003))
    torso = make_ring_surface(
        "Wizard_Robe_Torso",
        torso_rings,
        44,
        navy,
        collection,
        fold_strength=0.008,
    )
    tag_attachment(
        torso,
        rig,
        "DEFORM_TRANSFER",
        ("pelvis", "spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r"),
        "torso",
    )

    top_rx = torso_rings[-1][1] * 1.025 + 0.012
    top_ry = torso_rings[-1][2] * 1.035 + 0.030
    bottom_rx = min(CELL_SIZE * 0.20, max(0.335, top_rx * 1.42))
    bottom_ry = min(CELL_SIZE * 0.17, max(0.285, top_ry * 1.36))
    skirt_rings = []
    skirt_levels = 13
    for index in range(skirt_levels):
        t = index / (skirt_levels - 1)
        eased = t * t * (3.0 - 2.0 * t)
        z = waist_z * (1.0 - t) + hem_z * t
        rx = top_rx * (1.0 - eased) + bottom_rx * eased
        ry = top_ry * (1.0 - eased) + bottom_ry * eased + 0.018
        center_y = profile_waist["center_y"] + 0.018 * eased
        skirt_rings.append((z, rx, ry, center_x, center_y))
    skirt = make_ring_surface(
        "Wizard_Robe_Skirt",
        skirt_rings,
        48,
        indigo,
        collection,
        fold_strength=0.030,
    )
    tag_attachment(
        skirt,
        rig,
        "DEFORM_TRANSFER",
        ("pelvis", "thigh_l", "thigh_r", "spine_01"),
        "lower_robe",
    )

    for side, suffix, sign in (("l", "L", 1.0), ("r", "R", -1.0)):
        upper, upper_name = weighted_group_center(
            human,
            world_points,
            (f"upperarm_{side}", f"upper_arm.{suffix}", f"upper_arm_{side}"),
        )
        lower, lower_name = weighted_group_center(
            human,
            world_points,
            (f"lowerarm_{side}", f"forearm.{suffix}", f"lower_arm_{side}"),
        )
        hand, hand_name = weighted_group_center(
            human,
            world_points,
            (f"hand_{side}", f"hand.{suffix}"),
        )
        if upper is None:
            upper = Vector((center_x + sign * 0.31, profile_shoulder["center_y"], shoulder_z - 0.035))
            upper_name = f"upperarm_{side}"
        if lower is None:
            lower = upper + Vector((sign * 0.18, 0.0, -0.18))
            lower_name = f"lowerarm_{side}"
        if hand is None:
            hand = lower + Vector((sign * 0.15, 0.0, -0.14))
            hand_name = f"hand_{side}"

        shoulder_anchor = Vector((
            upper.x * 0.72 + center_x * 0.28,
            upper.y * 0.70 + profile_shoulder["center_y"] * 0.30,
            upper.z + 0.028,
        ))
        elbow = upper.lerp(lower, 0.72)
        cuff = lower.lerp(hand, 0.70)
        sleeve = make_sleeve(
            f"Wizard_Sleeve_{suffix}",
            (shoulder_anchor, upper, elbow, cuff),
            (0.112, 0.108, 0.086, 0.068),
            navy,
            collection,
        )
        tag_attachment(
            sleeve,
            rig,
            "DEFORM_TRANSFER",
            (upper_name, lower_name, hand_name),
            f"arm_{side}",
        )

        shell_center = Vector((
            shoulder_anchor.x + sign * 0.012,
            shoulder_anchor.y,
            shoulder_anchor.z + 0.006,
        ))
        shell_center.x += sign * 0.045
        lower_shell = make_shoulder_shell(
            f"Wizard_Pauldron_{suffix}_Lower",
            shell_center,
            0.145,
            0.115,
            0.090,
            silver,
            collection,
        )
        upper_shell = make_shoulder_shell(
            f"Wizard_Pauldron_{suffix}_Upper",
            shell_center + Vector((-sign * 0.018, -0.010, 0.035)),
            0.112,
            0.090,
            0.070,
            indigo,
            collection,
        )
        for obj in (lower_shell, upper_shell):
            tag_attachment(obj, rig, "BONE", (f"clavicle_{side}", upper_name), f"shoulder_{side}")

    cape = make_cape(
        "Wizard_Cloak",
        center_x,
        neck_z - 0.018,
        shoulder_z + 0.010,
        hem_z + 0.070,
        max(profile_neck["back_y"], profile_shoulder["back_y"]),
        indigo,
        collection,
    )
    tag_attachment(
        cape,
        rig,
        "DEFORM_TRANSFER",
        ("spine_03", "clavicle_l", "clavicle_r", "pelvis"),
        "back_cape",
    )

    mantle_center = Vector((center_x, profile_neck["center_y"] + 0.008, neck_z - 0.030))
    mantle = make_mantle(
        "Wizard_Cloak_Mantle",
        mantle_center,
        (0.105, 0.072),
        (0.225, 0.145),
        neck_z - 0.018,
        silver,
        collection,
    )
    tag_attachment(
        mantle,
        rig,
        "DEFORM_TRANSFER",
        ("spine_03", "clavicle_l", "clavicle_r"),
        "shoulder_mantle",
    )

    belt = add_torus(
        "Wizard_Belt",
        (center_x, profile_waist["center_y"], waist_z + 0.006),
        top_rx * 1.01,
        0.022,
        top_ry / max(top_rx, 1e-6),
        leather,
        collection,
    )
    tag_attachment(belt, rig, "DEFORM_TRANSFER", ("pelvis", "spine_01"), "waist")
    buckle = add_buckle(
        "Wizard_Belt_Buckle",
        (center_x, profile_waist["front_y"] - 0.032, waist_z + 0.006),
        arcane,
        collection,
    )
    tag_attachment(buckle, rig, "BONE", ("pelvis",), "waist_front")

    front_y_neck = profile_neck["front_y"] - 0.026
    front_y_waist = profile_waist["front_y"] - 0.030
    for sign, suffix in ((-1.0, "L"), (1.0, "R")):
        lapel = add_curve(
            f"Wizard_Robe_Lapel_{suffix}",
            (
                (center_x + sign * 0.060, front_y_neck, neck_z - 0.020),
                (center_x + sign * 0.090, (front_y_neck + front_y_waist) * 0.5, chest_z),
                (center_x + sign * 0.105, front_y_waist, waist_z + 0.030),
            ),
            0.009,
            silver,
            collection,
        )
        tag_attachment(lapel, rig, "DEFORM_TRANSFER", ("spine_02", "spine_03"), "torso_front")

    hem_trim = add_torus(
        "Wizard_Robe_Hem_Trim",
        (center_x, profile_waist["center_y"] + 0.018, hem_z + 0.015),
        bottom_rx * 0.995,
        0.009,
        bottom_ry / max(bottom_rx, 1e-6),
        silver,
        collection,
    )
    tag_attachment(hem_trim, rig, "DEFORM_TRANSFER", ("pelvis", "thigh_l", "thigh_r"), "lower_hem")

    bpy.context.view_layer.update()
    clothing_low, clothing_high = object_world_bounds(collection.objects)
    footprint = max(clothing_high.x - clothing_low.x, clothing_high.y - clothing_low.y)
    if footprint > CELL_SIZE * 0.92:
        raise RuntimeError(
            f"Clothing footprint {footprint:.3f} exceeds the one-cell budget {CELL_SIZE:.3f}"
        )
    collection["wizard_footprint"] = round(footprint, 4)
    collection["wizard_object_count"] = len(collection.objects)

    render_from(
        "Suit Refit Three Quarter",
        (2.8, -4.3, 2.7),
        (center_x, profile_chest["center_y"], low.z + height * 0.53),
        75,
        "wizard_mpfb_pass08_suit_close.png",
    )
    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (center_x, profile_chest["center_y"], low.z + height * 0.51),
        58,
        "wizard_mpfb_pass08_suit_tactical.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({
        "clothing_objects": len(collection.objects),
        "deform_rig": rig.name,
        "fit_source": human.name,
        "footprint": round(footprint, 4),
        "binding": "metadata_only_pending_rig_pass",
    })


main()
