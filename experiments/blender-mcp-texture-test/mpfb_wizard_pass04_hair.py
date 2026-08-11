import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"


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
    for datablocks in (bpy.data.hair_curves, bpy.data.curves, bpy.data.meshes):
        for datablock in list(datablocks):
            if datablock.users == 0 and datablock.name.startswith("Wizard_Hair"):
                datablocks.remove(datablock)
    return collection


def hair_material():
    material = bpy.data.materials.get("Wizard Silver Hair") or bpy.data.materials.new("Wizard Silver Hair")
    material.diffuse_color = (0.18, 0.24, 0.33, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.12, 0.18, 0.28, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.04
    bsdf.inputs["Roughness"].default_value = 0.38
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.32
        bsdf.inputs["Coat Roughness"].default_value = 0.22
    if "Anisotropic IOR Level" in bsdf.inputs:
        bsdf.inputs["Anisotropic IOR Level"].default_value = 0.55
    return material


def crown_material():
    material = bpy.data.materials.get("Wizard Silver Hair Crown") or bpy.data.materials.new("Wizard Silver Hair Crown")
    material.diffuse_color = (0.10, 0.14, 0.21, 1.0)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 42.0
    wave.inputs["Distortion"].default_value = 7.0
    wave.inputs["Detail"].default_value = 4.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.012, 0.020, 0.040, 1.0)
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[1].color = (0.075, 0.105, 0.16, 1.0)
    ramp.color_ramp.elements[1].position = 0.74
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.008
    bsdf.inputs["Roughness"].default_value = 0.46
    if "Anisotropic IOR Level" in bsdf.inputs:
        bsdf.inputs["Anisotropic IOR Level"].default_value = 0.48
    links.new(wave.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(wave.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return material


def make_scalp_cap(collection, material):
    center = Vector((0.0, -0.057, 1.687))
    rx, ry, rz = 0.093, 0.113, 0.092
    segments = 48
    rings = 12
    vertices = [tuple(center + Vector((0.0, 0.0, rz)))]
    for ring in range(1, rings + 1):
        t = ring / rings
        for segment in range(segments):
            theta = 2.0 * math.pi * segment / segments
            frontness = max(0.0, -math.sin(theta))
            backness = max(0.0, math.sin(theta))
            phi_max = 1.60 - 0.42 * frontness + 0.40 * backness
            phi_max += 0.13 * frontness * (1.0 - abs(math.cos(theta))) ** 2
            phi = phi_max * t
            point = center + Vector(
                (
                    rx * math.sin(phi) * math.cos(theta),
                    ry * math.sin(phi) * math.sin(theta),
                    rz * math.cos(phi),
                )
            )
            if ring > 1:
                relief = 0.0015 * math.sin(theta * 22.0 + phi * 3.0) * math.sin(phi) ** 1.4
                point += (point - center).normalized() * relief
            vertices.append(tuple(point))

    faces = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(1, rings):
        start_a = 1 + (ring - 1) * segments
        start_b = 1 + ring * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((start_a + segment, start_b + segment, start_b + nxt, start_a + nxt))

    mesh = bpy.data.meshes.new("Wizard_HairCap_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Wizard_HairCap", mesh)
    collection.objects.link(obj)
    mesh.materials.append(crown_material())
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("Hair cap thickness", "SOLIDIFY")
    solidify.thickness = 0.004
    solidify.offset = -0.2
    bevel = obj.modifiers.new("Hairline softness", "BEVEL")
    bevel.width = 0.0022
    bevel.segments = 2
    obj["wizard_attachment_bone"] = "head"
    return obj


def add_lock_spline(curve, points, radii):
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate, radius in zip(spline.bezier_points, points, radii):
        point.co = coordinate
        point.radius = radius
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"


def make_crown_locks(collection, material):
    curve = bpy.data.curves.new("Wizard_Hair_Crown_Locks", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 6
    curve.bevel_depth = 0.0023
    curve.bevel_resolution = 2
    center_y = -0.057
    radius_y = 0.113
    for side in (-1.0, 1.0):
        for index in range(18):
            t = index / 17.0
            root_y = -0.145 + 0.165 * t
            normalized_y = max(-0.98, min(0.98, (root_y - center_y) / radius_y))
            root_z = 1.687 + 0.092 * math.sqrt(max(0.0, 1.0 - normalized_y * normalized_y)) + 0.004
            root = Vector((side * 0.006, root_y, root_z))
            shoulder = Vector((side * (0.045 + 0.016 * t), root_y + 0.012, root_z + 0.003))
            temple = Vector((side * (0.090 + 0.018 * t), root_y + 0.030 + 0.035 * t, 1.695 - 0.055 * t))
            end = Vector((side * (0.122 + 0.030 * t), root_y + 0.055 + 0.080 * t, 1.52 - 0.18 * t))
            add_lock_spline(curve, (root, shoulder, temple, end), (0.74, 1.0, 0.78, 0.16))
    obj = bpy.data.objects.new("Wizard_Hair_Crown_Locks", curve)
    collection.objects.link(obj)
    curve.materials.append(material)
    obj["wizard_attachment_bone"] = "head"
    return obj


def make_long_locks(collection, material):
    curve = bpy.data.curves.new("Wizard_Hair_Guides", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 5
    curve.bevel_depth = 0.0125
    curve.bevel_resolution = 3
    curve.resolution_u = 5

    lock_count = 28
    for index in range(lock_count):
        theta = 2.0 * math.pi * index / lock_count
        frontness = max(0.0, -math.sin(theta))
        side = math.cos(theta)
        root = Vector(
            (
                0.088 * math.cos(theta),
                0.072 * math.sin(theta),
                1.775 - 0.035 * (0.5 + 0.5 * math.sin(theta)),
            )
        )
        if frontness > 0.82 and abs(side) < 0.48:
            continue
        side_weight = abs(side) ** 0.8
        end_x = 0.13 * side + 0.065 * side_weight * (1.0 if side >= 0 else -1.0)
        end_y = 0.055 + 0.035 * math.sin(theta)
        end_z = 1.055 + 0.19 * side_weight + 0.10 * frontness
        outward = Vector((0.040 * side, 0.028 * math.sin(theta), -0.02))
        mid1 = root + outward + Vector((0.0, 0.0, -0.18))
        mid2 = Vector((end_x * 0.92, end_y, (root.z + end_z) * 0.49 - 0.02))
        sway = 0.018 * math.sin(index * 2.399)
        mid2.x += sway
        end = Vector((end_x + sway * 0.5, end_y, end_z))
        add_lock_spline(curve, (root, mid1, mid2, end), (0.82, 1.05, 0.88, 0.16))

    fringe_specs = (
        (-0.070, -0.054, 1.790, -0.150, -0.080, 1.330),
        (-0.045, -0.071, 1.804, -0.105, -0.100, 1.400),
        (0.045, -0.071, 1.804, 0.105, -0.100, 1.400),
        (0.070, -0.054, 1.790, 0.150, -0.080, 1.330),
    )
    for x0, y0, z0, x1, y1, z1 in fringe_specs:
        root = Vector((x0, y0, z0))
        end = Vector((x1, y1, z1))
        mid1 = root.lerp(end, 0.32) + Vector((0.018 * (1 if x1 > 0 else -1), -0.015, 0.025))
        mid2 = root.lerp(end, 0.70) + Vector((0.012 * (1 if x1 > 0 else -1), -0.010, -0.015))
        add_lock_spline(curve, (root, mid1, mid2, end), (0.70, 0.95, 0.72, 0.12))

    obj = bpy.data.objects.new("Wizard_Long_Hair", curve)
    collection.objects.link(obj)
    curve.materials.append(material)
    obj["wizard_attachment_bone"] = "head"
    return obj


def make_dense_hair(collection, material):
    hair = bpy.data.hair_curves.new("Wizard_Hair_Strands")
    points_per_strand = 9
    center = Vector((0.0, -0.057, 1.687))
    rx, ry, rz = 0.093, 0.113, 0.092
    golden = 0.6180339887498949
    strand_indices = []
    for index in range(960):
        theta = 2.0 * math.pi * ((index * golden) % 1.0)
        frontness = max(0.0, -math.sin(theta))
        side = math.cos(theta)
        if frontness > 0.45 and abs(side) < 0.78:
            continue
        strand_indices.append(index)
    hair.add_curves([points_per_strand] * len(strand_indices))
    hair.set_types(type="CATMULL_ROM")

    positions = []
    radii = []
    for index in strand_indices:
        phase = (index * golden) % 1.0
        theta = 2.0 * math.pi * phase
        frontness = max(0.0, -math.sin(theta))
        backness = max(0.0, math.sin(theta))
        side = math.cos(theta)
        phi_max = 1.58 - 0.40 * frontness + 0.40 * backness
        latitude_noise = (index * 0.7548776662466927) % 1.0
        phi = 0.10 + latitude_noise * (phi_max - 0.10)
        root = center + Vector(
            (
                rx * math.sin(phi) * math.cos(theta),
                ry * math.sin(phi) * math.sin(theta),
                rz * math.cos(phi),
            )
        )

        jitter = math.sin(index * 12.9898) * 0.5 + 0.5
        if frontness > 0.52:
            direction = 1.0 if root.x >= 0.0 else -1.0
            if abs(root.x) < 0.012:
                direction = 1.0 if index % 2 == 0 else -1.0
            end = Vector(
                (
                    direction * (0.125 + 0.035 * jitter),
                    -0.205 + 0.016 * jitter,
                    1.08 + 0.14 * abs(side) + 0.08 * jitter,
                )
            )
        elif backness > 0.42:
            end = Vector(
                (
                    0.14 * side + 0.022 * math.sin(index * 1.37),
                    0.180 + 0.040 * backness,
                    0.92 + 0.12 * abs(side) + 0.08 * jitter,
                )
            )
        else:
            direction = 1.0 if side >= 0.0 else -1.0
            end = Vector(
                (
                    direction * (0.145 + 0.035 * jitter),
                    -0.075 + 0.025 * math.sin(theta),
                    0.99 + 0.16 * jitter,
                )
            )

        normal = (root - center).normalized()
        wave = 0.008 * math.sin(index * 2.399)
        for point_index in range(points_per_strand):
            t = point_index / (points_per_strand - 1)
            fall = t ** 1.10
            point = root.lerp(end, fall)
            point += normal * (0.025 * math.sin(math.pi * t) * (1.0 - 0.35 * t))
            part_direction = 1.0 if root.x >= 0.0 else -1.0
            point.x += part_direction * 0.018 * math.sin(math.pi * t) * (1.0 - t)
            point.x += wave * math.sin(math.pi * t) * (0.45 + t)
            point.x += 0.013 * math.sin(t * 2.2 * math.pi + index * 0.17) * (t ** 1.35)
            point.y += 0.012 * math.sin(index * 0.73 + t * 1.8 * math.pi) * math.sin(math.pi * t)
            if frontness > 0.42 and t > 0.08:
                face_clearance = (0.042 + 0.105 * t) * min(1.0, (t - 0.08) / 0.28)
                point.x = part_direction * max(abs(point.x), face_clearance)
            positions.append(point)
            radii.append(0.00155 * (1.0 - t) + 0.00022 * t)

    for point, position, radius in zip(hair.points, positions, radii):
        point.position = position
        point.radius = radius
    hair.materials.append(material)
    obj = bpy.data.objects.new("Wizard_Dense_Hair", hair)
    collection.objects.link(obj)
    obj["wizard_attachment_bone"] = "head"
    return obj


def make_hair_ribbons(collection, material):
    vertices = []
    faces = []
    ribbon_count = 20
    segments = 12
    for index in range(ribbon_count):
        theta = 2.0 * math.pi * (index + 0.5) / ribbon_count
        frontness = max(0.0, -math.sin(theta))
        side = math.cos(theta)
        if frontness > 0.82 and abs(side) < 0.44:
            continue
        root = Vector((0.087 * math.cos(theta), -0.057 + 0.105 * math.sin(theta), 1.735 - 0.020 * frontness))
        if frontness > 0.45:
            direction = 1.0 if side >= 0.0 else -1.0
            end = Vector((direction * (0.15 + 0.025 * abs(side)), -0.205, 1.12 + 0.08 * abs(side)))
        elif math.sin(theta) > 0.35:
            end = Vector((0.15 * side, 0.205, 0.96 + 0.10 * abs(side)))
        else:
            direction = 1.0 if side >= 0.0 else -1.0
            end = Vector((direction * 0.18, -0.070, 1.02))

        tangent_width = Vector((-math.sin(theta), math.cos(theta), 0.0)).normalized()
        base = len(vertices)
        for segment in range(segments):
            t = segment / (segments - 1)
            fall = t ** 1.08
            center = root.lerp(end, fall)
            center += Vector((side * 0.050, math.sin(theta) * 0.034, 0.0)) * math.sin(math.pi * t)
            center.x += 0.024 * math.sin(index * 1.7 + t * 1.8 * math.pi) * (t ** 1.25)
            center.y += 0.017 * math.sin(index * 0.9 + t * math.pi) * math.sin(math.pi * t)
            width = 0.022 * (1.0 - t) + 0.0055 * t
            vertices.append(tuple(center - tangent_width * width))
            vertices.append(tuple(center + tangent_width * width))
        for segment in range(segments - 1):
            i = base + segment * 2
            faces.append((i, i + 1, i + 3, i + 2))

    mesh = bpy.data.meshes.new("Wizard_Hair_Ribbons_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Wizard_Hair_Ribbons", mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("Lock thickness", "SOLIDIFY")
    solidify.thickness = 0.012
    solidify.offset = 0.0
    bevel = obj.modifiers.new("Lock edge softness", "BEVEL")
    bevel.width = 0.006
    bevel.segments = 4
    obj["wizard_attachment_bone"] = "head"
    return obj


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
    collection = reset_collection("Wizard_Hair")
    material = hair_material()
    make_scalp_cap(collection, material)
    ribbons = make_hair_ribbons(collection, material)

    render_from(
        "Hair Three Quarter",
        (2.15, -3.2, 2.35),
        (0.0, 0.0, 1.40),
        78,
        "wizard_mpfb_pass04_hair_close.png",
    )
    render_from(
        "Character Three Quarter",
        (3.6, -5.5, 3.0),
        (0.0, 0.0, 0.95),
        72,
        "wizard_mpfb_pass04_three_quarter.png",
    )
    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (0.0, 0.0, 0.9),
        58,
        "wizard_mpfb_pass04_tactical.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({"hair_objects": len(collection.objects), "ribbon_vertices": len(ribbons.data.vertices), "ribbon_polygons": len(ribbons.data.polygons)})


main()
