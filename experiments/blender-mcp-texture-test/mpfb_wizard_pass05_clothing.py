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
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0 and mesh.name.startswith("Wizard_Cloth"):
            bpy.data.meshes.remove(mesh)
    return collection


def material(name, base, roughness=0.65, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*base, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def make_ring_mesh(name, rings, segments, mat, collection, fold_strength=0.0):
    vertices = []
    faces = []
    ring_count = len(rings)
    for ring_index, (z, rx, ry, center_y) in enumerate(rings):
        t = ring_index / max(1, ring_count - 1)
        for segment in range(segments):
            theta = 2.0 * math.pi * segment / segments
            fold = 1.0 + fold_strength * (t ** 1.4) * math.sin(theta * 8.0 + 0.45)
            vertices.append((rx * fold * math.cos(theta), center_y + ry * fold * math.sin(theta), z))
    for ring_index in range(ring_count - 1):
        a = ring_index * segments
        b = (ring_index + 1) * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((a + segment, a + nxt, b + nxt, b + segment))
    mesh = bpy.data.meshes.new(f"Wizard_Cloth_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("Fabric thickness", "SOLIDIFY")
    solidify.thickness = 0.009
    solidify.offset = 0.0
    bevel = obj.modifiers.new("Soft fabric edges", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 2
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
        if abs(tangent.dot(reference)) > 0.92:
            reference = Vector((0.0, 1.0, 0.0))
        axis_x = tangent.cross(reference).normalized()
        axis_y = tangent.cross(axis_x).normalized()
        for segment in range(segments):
            theta = 2.0 * math.pi * segment / segments
            offset = axis_x * math.cos(theta) * radii[point_index] + axis_y * math.sin(theta) * radii[point_index]
            vertices.append(tuple(point + offset))
    for point_index in range(len(points) - 1):
        a = point_index * segments
        b = (point_index + 1) * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((a + segment, a + nxt, b + nxt, b + segment))
    mesh = bpy.data.meshes.new(f"Wizard_Cloth_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    subdivision = obj.modifiers.new("Sleeve smoothing", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 2
    subdivision.render_levels = 2
    solidify = obj.modifiers.new("Sleeve thickness", "SOLIDIFY")
    solidify.thickness = 0.006
    solidify.offset = 0.0
    return obj


def make_cloak(collection, mat, human):
    columns = 30
    rows = 34
    vertices = []
    faces = []
    for row in range(rows):
        t = row / (rows - 1)
        z_base = 1.48 * (1.0 - t) + 0.18 * t
        width = 0.22 * (1.0 - t) + 0.36 * t
        for column in range(columns):
            u = column / (columns - 1) * 2.0 - 1.0
            z = z_base + 0.028 * (t ** 1.4) * math.cos(u * math.pi * 3.0)
            y = 0.145 + 0.075 * t + 0.026 * math.cos(u * math.pi * 5.0 + 0.5) * (0.25 + 0.75 * t)
            x = width * u
            vertices.append((x, y, z))
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            faces.append((a, a + 1, a + 1 + columns, a + columns))
    mesh = bpy.data.meshes.new("Wizard_Cloth_Cloak_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    cloak = bpy.data.objects.new("Wizard_Cloak", mesh)
    collection.objects.link(cloak)
    mesh.materials.append(mat)
    pin = cloak.vertex_groups.new(name="Cloak_Pin")
    pin.add(list(range(columns)), 1.0, "REPLACE")
    pin.add(list(range(columns, columns * 2)), 0.72, "REPLACE")
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    cloth = cloak.modifiers.new("Cloak Cloth", "CLOTH")
    cloth.settings.quality = 4
    cloth.settings.vertex_group_mass = pin.name
    cloth.settings.tension_stiffness = 18.0
    cloth.settings.compression_stiffness = 16.0
    cloth.settings.shear_stiffness = 10.0
    cloth.settings.bending_stiffness = 0.8
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = 18
    solidify = cloak.modifiers.new("Cloak thickness", "SOLIDIFY")
    solidify.thickness = 0.008
    solidify.offset = 0.0
    bevel = cloak.modifiers.new("Cloak edge softness", "BEVEL")
    bevel.width = 0.0035
    bevel.segments = 2

    if not human.modifiers.get("Wizard Collision"):
        collision = human.modifiers.new("Wizard Collision", "COLLISION")
        collision.settings.thickness_outer = 0.008
    return cloak


def add_torus(name, location, major_radius, minor_radius, scale_y, mat, collection):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=40, minor_segments=10, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale.y = scale_y
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def add_cube(name, location, scale, mat, collection, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def add_pauldron(name, location, rotation_y, mat, collection):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, location=location, rotation=(0.0, rotation_y, 0.0))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (0.122, 0.102, 0.043)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
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
    human = bpy.data.objects.get("Wizard_Base_Mesh")
    rig = bpy.data.objects.get("Wizard_Rig") or bpy.data.objects.get("Wizard_Rig.001")
    if not human or not rig:
        raise RuntimeError("Wizard base mesh or rig is missing")
    collection = reset_collection("Wizard_Clothing")
    navy = material("Wizard Robe Navy", (0.025, 0.055, 0.13), 0.62)
    cloak_mat = material("Wizard Cloak Indigo", (0.035, 0.065, 0.19), 0.72)
    leather = material("Wizard Belt Leather", (0.08, 0.045, 0.035), 0.70)
    silver = material("Wizard Silver Trim", (0.30, 0.38, 0.50), 0.27, metallic=0.72)
    arcane = material("Wizard Arcane Trim", (0.01, 0.23, 0.48), 0.28, emission=(0.02, 0.45, 1.0), strength=2.4)

    torso_rings = (
        (1.37, 0.232, 0.172, -0.006),
        (1.30, 0.222, 0.170, -0.007),
        (1.23, 0.205, 0.166, -0.009),
        (1.13, 0.187, 0.160, -0.010),
        (0.99, 0.198, 0.170, -0.010),
        (0.86, 0.225, 0.190, -0.006),
    )
    make_ring_mesh("Wizard_Robe_Torso", torso_rings, 36, navy, collection, fold_strength=0.015)
    skirt_rings = (
        (0.91, 0.232, 0.187, -0.006),
        (0.76, 0.242, 0.198, -0.004),
        (0.58, 0.255, 0.213, 0.000),
        (0.39, 0.280, 0.235, 0.008),
        (0.18, 0.320, 0.274, 0.018),
        (0.08, 0.340, 0.292, 0.025),
    )
    make_ring_mesh("Wizard_Robe_Skirt", skirt_rings, 40, cloak_mat, collection, fold_strength=0.07)

    matrix = rig.matrix_world
    for side, suffix in (("l", "L"), ("r", "R")):
        upper = rig.data.bones[f"upperarm_{side}"]
        lower = rig.data.bones[f"lowerarm_{side}"]
        hand = rig.data.bones[f"hand_{side}"]
        rig_to_body = Vector((0.0, 0.0, 0.81))
        points = [
            matrix @ upper.head_local + rig_to_body,
            matrix @ upper.tail_local + rig_to_body,
            matrix @ lower.tail_local + rig_to_body,
            matrix @ hand.head_local + rig_to_body,
        ]
        make_sleeve(f"Wizard_Sleeve_{suffix}", points, (0.112, 0.098, 0.082, 0.074), navy, collection)

    make_cloak(collection, cloak_mat, human)
    add_torus("Wizard_Belt", (0.0, -0.004, 0.91), 0.248, 0.024, 0.78, leather, collection)
    add_torus("Wizard_High_Collar", (0.0, 0.0, 1.49), 0.125, 0.025, 0.78, silver, collection)
    add_cube("Wizard_Belt_Gem", (0.0, -0.205, 0.91), (0.045, 0.018, 0.060), arcane, collection, bevel=0.012)
    add_pauldron("Wizard_Pauldron_L", (0.245, -0.002, 1.365), math.radians(-12.0), silver, collection)
    add_pauldron("Wizard_Pauldron_R", (-0.245, -0.002, 1.365), math.radians(12.0), silver, collection)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 18
    bpy.context.scene.frame_set(18)
    render_from(
        "Clothing Three Quarter",
        (2.8, -4.3, 2.7),
        (0.0, 0.0, 0.92),
        75,
        "wizard_mpfb_pass05_clothing_close.png",
    )
    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (0.0, 0.0, 0.9),
        58,
        "wizard_mpfb_pass05_tactical.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({"clothing_objects": len(collection.objects), "frame": bpy.context.scene.frame_current})


main()
