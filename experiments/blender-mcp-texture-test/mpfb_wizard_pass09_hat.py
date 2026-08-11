import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"
COLLECTION_NAME = "Wizard_Hat"


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def reset_collection(name):
    collection = bpy.data.collections.get(name)
    if collection:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)

    for datablocks in (bpy.data.meshes, bpy.data.curves):
        for datablock in list(datablocks):
            if datablock.users == 0 and datablock.name.startswith("Wizard_Hat"):
                datablocks.remove(datablock)
    return collection


def fallback_material(name, base, roughness=0.55, metallic=0.0, emission=None, strength=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*base, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return material


def hat_materials():
    cloth = (
        bpy.data.materials.get("Wizard Cloak Indigo")
        or bpy.data.materials.get("Wizard Robe Navy")
        or fallback_material("Wizard Hat Midnight", (0.025, 0.045, 0.14), 0.68)
    )
    silver = (
        bpy.data.materials.get("Wizard Silver Trim")
        or bpy.data.materials.get("Staff Moon Silver")
        or fallback_material("Wizard Hat Silver", (0.30, 0.40, 0.55), 0.24, metallic=0.78)
    )
    arcane = bpy.data.materials.get("Wizard Arcane Trim") or fallback_material(
        "Wizard Hat Arcane",
        (0.006, 0.09, 0.34),
        0.18,
        emission=(0.01, 0.38, 1.0),
        strength=3.4,
    )
    return cloth, silver, arcane


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def mark_attachment(obj, root):
    if obj is not root:
        obj.parent = root
    obj["wizard_attachment_bone"] = "head"
    obj["wizard_optional_item"] = True


def evaluated_head_bounds(human):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()

    if not points:
        raise RuntimeError("Wizard base mesh has no evaluated vertices")
    top = max(point.z for point in points)
    head_points = [point for point in points if point.z >= top - 0.225]
    if len(head_points) < 24:
        raise RuntimeError("Could not derive a stable head bound from Wizard_Base_Mesh")

    minimum = Vector((
        min(point.x for point in head_points),
        min(point.y for point in head_points),
        min(point.z for point in head_points),
    ))
    maximum = Vector((
        max(point.x for point in head_points),
        max(point.y for point in head_points),
        max(point.z for point in head_points),
    ))
    center = (minimum + maximum) * 0.5
    return center, minimum, maximum


def brim_surface_point(center, brim_z, inner_rx, inner_ry, outer_rx, outer_ry, theta, radial_t):
    asymmetry = 1.0 + 0.055 * math.cos(theta - 0.70) + 0.025 * math.sin(3.0 * theta + 0.35)
    edge_rx = outer_rx * asymmetry
    edge_ry = outer_ry * (1.0 + 0.035 * math.cos(theta + 1.15))
    rx = inner_rx + (edge_rx - inner_rx) * radial_t
    ry = inner_ry + (edge_ry - inner_ry) * radial_t
    x = center.x + rx * math.cos(theta)
    y = center.y + ry * math.sin(theta)
    edge_wave = 0.010 * math.sin(2.0 * theta + 0.30) * (radial_t ** 1.7)
    tilt = 0.038 * (x - center.x) - 0.018 * (y - center.y)
    return Vector((x, y, brim_z + tilt + edge_wave))


def make_brim(collection, material, center, brim_z, base_rx, base_ry):
    segments = 48
    radial_steps = 4
    thickness = 0.020
    inner_rx = base_rx * 0.89
    inner_ry = base_ry * 0.89
    outer_rx = max(0.285, base_rx * 2.10)
    outer_ry = max(0.235, base_ry * 1.72)
    vertices = []

    for layer_offset in (thickness * 0.5, -thickness * 0.5):
        for radial_index in range(radial_steps):
            radial_t = radial_index / (radial_steps - 1)
            for segment in range(segments):
                theta = 2.0 * math.pi * segment / segments
                point = brim_surface_point(
                    center,
                    brim_z,
                    inner_rx,
                    inner_ry,
                    outer_rx,
                    outer_ry,
                    theta,
                    radial_t,
                )
                point.z += layer_offset
                vertices.append(tuple(point))

    faces = []
    layer_stride = radial_steps * segments
    for layer in range(2):
        base = layer * layer_stride
        for radial_index in range(radial_steps - 1):
            ring_a = base + radial_index * segments
            ring_b = ring_a + segments
            for segment in range(segments):
                nxt = (segment + 1) % segments
                face = (ring_a + segment, ring_b + segment, ring_b + nxt, ring_a + nxt)
                faces.append(face if layer == 0 else tuple(reversed(face)))

    for radial_index in (0, radial_steps - 1):
        top = radial_index * segments
        bottom = layer_stride + radial_index * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            face = (top + segment, top + nxt, bottom + nxt, bottom + segment)
            faces.append(tuple(reversed(face)) if radial_index == 0 else face)

    mesh = bpy.data.meshes.new("Wizard_Hat_Brim_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Wizard_Hat_Brim", mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("Hat brim softness", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 2
    return obj, (inner_rx, inner_ry, outer_rx, outer_ry)


def crown_specs(center, brim_z, base_rx, base_ry):
    raw = (
        (0.000, 0.000, 0.000, 1.00, 1.00),
        (0.005, 0.002, 0.070, 0.97, 0.97),
        (0.012, 0.007, 0.145, 0.90, 0.91),
        (0.026, 0.014, 0.225, 0.80, 0.82),
        (0.052, 0.020, 0.310, 0.67, 0.70),
        (0.090, 0.021, 0.390, 0.53, 0.57),
        (0.132, 0.012, 0.462, 0.39, 0.43),
        (0.170, -0.006, 0.520, 0.27, 0.31),
        (0.196, -0.032, 0.562, 0.15, 0.18),
        (0.207, -0.057, 0.585, 0.070, 0.085),
    )
    return [
        (Vector((center.x + dx, center.y + dy, brim_z + dz)), base_rx * sx, base_ry * sy)
        for dx, dy, dz, sx, sy in raw
    ]


def ring_frame(specs, index):
    if index == 0:
        tangent = specs[1][0] - specs[0][0]
    elif index == len(specs) - 1:
        tangent = specs[-1][0] - specs[-2][0]
    else:
        tangent = specs[index + 1][0] - specs[index - 1][0]
    tangent.normalize()
    axis_x = Vector((1.0, 0.0, 0.0))
    axis_x = (axis_x - tangent * axis_x.dot(tangent)).normalized()
    axis_y = tangent.cross(axis_x).normalized()
    return axis_x, axis_y


def make_crown(collection, material, specs):
    segments = 36
    vertices = []
    for ring_index, (center, radius_x, radius_y) in enumerate(specs):
        axis_x, axis_y = ring_frame(specs, ring_index)
        for segment in range(segments):
            theta = 2.0 * math.pi * segment / segments
            irregularity = 1.0 + 0.018 * math.sin(3.0 * theta + ring_index * 0.31)
            point = center + axis_x * (radius_x * irregularity * math.cos(theta))
            point += axis_y * (radius_y * irregularity * math.sin(theta))
            vertices.append(tuple(point))

    apex = specs[-1][0] + Vector((0.006, -0.010, 0.020))
    vertices.append(tuple(apex))
    apex_index = len(vertices) - 1
    faces = []
    for ring_index in range(len(specs) - 1):
        ring_a = ring_index * segments
        ring_b = (ring_index + 1) * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((ring_a + segment, ring_a + nxt, ring_b + nxt, ring_b + segment))
    last_ring = (len(specs) - 1) * segments
    for segment in range(segments):
        faces.append((last_ring + segment, last_ring + (segment + 1) % segments, apex_index))

    mesh = bpy.data.meshes.new("Wizard_Hat_Crown_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Wizard_Hat_Crown", mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("Hat cloth thickness", "SOLIDIFY")
    solidify.thickness = 0.006
    solidify.offset = -0.45
    bevel = obj.modifiers.new("Hat crown softness", "BEVEL")
    bevel.width = 0.003
    bevel.segments = 2
    return obj, apex


def add_closed_bezier(name, points, bevel, material, collection):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 4
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bezier_point, coordinate in zip(spline.bezier_points, points):
        bezier_point.co = coordinate
        bezier_point.handle_left_type = "AUTO"
        bezier_point.handle_right_type = "AUTO"
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(material)
    return obj


def add_bezier(name, points, bevel, material, collection):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 5
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bezier_point, coordinate in zip(spline.bezier_points, points):
        bezier_point.co = coordinate
        bezier_point.handle_left_type = "AUTO"
        bezier_point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(material)
    return obj


def add_gem(name, location, scale, material, collection):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, collection)
    return obj


def make_accents(collection, silver, arcane, center, brim_z, brim_dimensions, base_rx, base_ry, apex):
    _, _, outer_rx, outer_ry = brim_dimensions
    brim_edge = []
    for index in range(20):
        theta = 2.0 * math.pi * index / 20
        point = brim_surface_point(
            center,
            brim_z + 0.012,
            base_rx * 0.89,
            base_ry * 0.89,
            outer_rx,
            outer_ry,
            theta,
            1.0,
        )
        brim_edge.append(point)
    add_closed_bezier("Wizard_Hat_Silver_Brim_Edge", brim_edge, 0.0055, silver, collection)

    band_points = []
    for index in range(18):
        theta = 2.0 * math.pi * index / 18
        band_points.append(
            Vector((
                center.x + base_rx * 0.95 * math.cos(theta),
                center.y + base_ry * 0.95 * math.sin(theta),
                brim_z + 0.078 + 0.005 * math.cos(theta - 0.4),
            ))
        )
    add_closed_bezier("Wizard_Hat_Silver_Crown_Band", band_points, 0.009, silver, collection)

    front_y = center.y - base_ry * 0.99
    brooch_location = Vector((center.x - 0.010, front_y - 0.010, brim_z + 0.085))
    add_gem("Wizard_Hat_Arcane_Brooch", brooch_location, (0.034, 0.014, 0.046), arcane, collection)
    add_bezier(
        "Wizard_Hat_Arcane_Crescent",
        (
            Vector((center.x - 0.165, center.y - 0.150, brim_z + 0.028)),
            Vector((center.x - 0.105, center.y - 0.205, brim_z + 0.038)),
            Vector((center.x - 0.018, center.y - 0.226, brim_z + 0.041)),
            Vector((center.x + 0.065, center.y - 0.212, brim_z + 0.039)),
            Vector((center.x + 0.125, center.y - 0.168, brim_z + 0.031)),
        ),
        0.0065,
        arcane,
        collection,
    )
    add_gem("Wizard_Hat_Tip_Gem", apex + Vector((0.010, -0.012, 0.006)), (0.022, 0.022, 0.030), arcane, collection)


def build_hat(collection, human):
    cloth, silver, arcane = hat_materials()
    head_center, head_minimum, head_maximum = evaluated_head_bounds(human)
    head_width = head_maximum.x - head_minimum.x
    head_depth = head_maximum.y - head_minimum.y
    base_rx = min(0.155, max(0.126, head_width * 0.76))
    base_ry = min(0.170, max(0.140, head_depth * 0.72))
    center = Vector((head_center.x, head_center.y, head_maximum.z))
    hair_top = head_maximum.z
    hair_collection = bpy.data.collections.get("Wizard_Hair")
    if hair_collection:
        for obj in hair_collection.objects:
            if obj.type not in {"MESH", "CURVE", "CURVES"}:
                continue
            hair_top = max(
                hair_top,
                max((obj.matrix_world @ Vector(corner)).z for corner in obj.bound_box),
            )
    brim_z = hair_top + 0.010

    root = bpy.data.objects.new("Wizard_Hat_Root", None)
    collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.08
    root["wizard_item_name"] = "Pointed Arcane Hat"
    root["wizard_removable"] = True
    mark_attachment(root, root)

    brim, brim_dimensions = make_brim(collection, cloth, center, brim_z, base_rx, base_ry)
    specs = crown_specs(center, brim_z, base_rx, base_ry)
    crown, apex = make_crown(collection, cloth, specs)
    make_accents(collection, silver, arcane, center, brim_z, brim_dimensions, base_rx, base_ry, apex)

    for obj in collection.objects:
        mark_attachment(obj, root)

    collection["wizard_optional_item"] = True
    collection["wizard_attachment_bone"] = "head"
    collection["wizard_fit_source"] = "Wizard_Base_Mesh evaluated head bounds"
    return root, brim, crown


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
    human = bpy.data.objects.get("Wizard_Base_Mesh")
    if not human:
        raise RuntimeError("Wizard_Base_Mesh is missing")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    collection = reset_collection(COLLECTION_NAME)
    root, brim, crown = build_hat(collection, human)

    render_from(
        "Hat Three Quarter",
        (2.65, -4.25, 3.05),
        (0.0, 0.0, 1.42),
        72,
        "wizard_mpfb_pass09_hat_close.png",
    )
    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (0.0, 0.0, 1.05),
        58,
        "wizard_mpfb_pass09_hat_tactical.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({
        "hat_objects": len(collection.objects),
        "hat_vertices_before_modifiers": len(brim.data.vertices) + len(crown.data.vertices),
        "removable_root": root.name,
    })


main()
