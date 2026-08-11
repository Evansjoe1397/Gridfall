import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"
STAFF_X = -0.47
STAFF_Y = -0.19


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
    return collection


def material(name, base, roughness=0.55, metallic=0.0, emission=None, strength=0.0):
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


def add_bezier(name, points, radii, bevel, mat, collection, resolution=6):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate, radius in zip(spline.bezier_points, points, radii):
        point.co = coordinate
        point.radius = radius
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


def add_poly_curve(name, points, bevel, mat, collection):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
        point.radius = 1.0
    spline.order_u = 3
    spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def add_torus(name, z, major_radius, minor_radius, rotation, mat, collection):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=40,
        minor_segments=10,
        location=(STAFF_X, STAFF_Y, z),
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    return obj


def add_sphere(name, location, radius, mat, collection):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, collection)
    return obj


def add_cone(name, location, radius, depth, mat, collection, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius, radius2=0.0, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, collection)
    return obj


def build_staff(collection):
    wood = material("Staff Dark Wood", (0.055, 0.026, 0.018), 0.60)
    silver = material("Staff Moon Silver", (0.28, 0.38, 0.53), 0.22, metallic=0.82)
    leather = material("Staff Grip", (0.09, 0.035, 0.025), 0.78)
    crystal = material(
        "Staff Arcane Core",
        (0.005, 0.16, 0.48),
        0.14,
        metallic=0.08,
        emission=(0.01, 0.42, 1.0),
        strength=5.2,
    )

    shaft_points = (
        (STAFF_X + 0.018, STAFF_Y, 0.06),
        (STAFF_X - 0.012, STAFF_Y + 0.006, 0.30),
        (STAFF_X + 0.010, STAFF_Y - 0.004, 0.58),
        (STAFF_X - 0.006, STAFF_Y + 0.004, 0.88),
        (STAFF_X + 0.012, STAFF_Y, 1.18),
        (STAFF_X - 0.006, STAFF_Y, 1.46),
        (STAFF_X, STAFF_Y, 1.61),
    )
    add_bezier("Staff_Shaft", shaft_points, (0.82, 1.0, 0.95, 1.0, 0.92, 0.80, 0.62), 0.030, wood, collection)

    for helix_index, phase in enumerate((0.0, math.pi)):
        points = []
        turns = 4.8
        samples = 86
        for index in range(samples):
            t = index / (samples - 1)
            angle = phase + turns * 2.0 * math.pi * t
            radius = 0.036 * (1.0 - 0.30 * t)
            points.append(
                (
                    STAFF_X + radius * math.cos(angle),
                    STAFF_Y + radius * math.sin(angle),
                    0.22 + 1.26 * t,
                )
            )
        add_poly_curve(f"Staff_Silver_Vine_{helix_index + 1}", points, 0.0055, silver, collection)

    for z, radius in ((0.08, 0.048), (0.93, 0.050), (1.47, 0.043)):
        add_torus(f"Staff_Ring_{z:.2f}", z, radius, 0.007, (0.0, 0.0, 0.0), silver, collection)
    for z in (0.72, 0.77, 0.82, 0.87):
        add_torus(f"Staff_Grip_{z:.2f}", z, 0.040, 0.0075, (0.0, 0.0, 0.0), leather, collection)

    core = Vector((STAFF_X, STAFF_Y, 1.73))
    add_sphere("Staff_Arcane_Core", core, 0.082, crystal, collection)
    add_torus("Staff_Core_Ring_A", core.z, 0.110, 0.008, (math.radians(90), 0.0, 0.0), silver, collection)
    add_torus("Staff_Core_Ring_B", core.z, 0.112, 0.006, (0.0, math.radians(58), 0.0), silver, collection)

    left_crown = (
        (STAFF_X - 0.012, STAFF_Y, 1.53),
        (STAFF_X - 0.075, STAFF_Y, 1.60),
        (STAFF_X - 0.125, STAFF_Y, 1.72),
        (STAFF_X - 0.100, STAFF_Y, 1.86),
        (STAFF_X - 0.052, STAFF_Y, 1.92),
    )
    right_crown = tuple((2.0 * STAFF_X - x, y, z) for x, y, z in left_crown)
    add_bezier("Staff_Crown_L", left_crown, (0.65, 1.0, 0.90, 0.55, 0.18), 0.018, silver, collection)
    add_bezier("Staff_Crown_R", right_crown, (0.65, 1.0, 0.90, 0.55, 0.18), 0.018, silver, collection)
    add_cone("Staff_Crown_Tip_L", (STAFF_X - 0.052, STAFF_Y, 1.94), 0.022, 0.11, crystal, collection)
    add_cone("Staff_Crown_Tip_R", (STAFF_X + 0.052, STAFF_Y, 1.94), 0.022, 0.11, crystal, collection)

    for obj in collection.objects:
        obj["wizard_attachment_bone"] = "hand_r"


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
    collection = reset_collection("Wizard_Staff")
    build_staff(collection)
    render_from(
        "Staff Three Quarter",
        (2.8, -4.3, 2.7),
        (0.0, 0.0, 1.00),
        75,
        "wizard_mpfb_pass06_staff_close.png",
    )
    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (0.0, 0.0, 0.9),
        58,
        "wizard_mpfb_pass06_tactical.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({"staff_objects": len(collection.objects)})


main()
