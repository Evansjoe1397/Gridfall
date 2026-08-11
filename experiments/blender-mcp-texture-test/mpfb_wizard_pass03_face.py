import bpy
import importlib
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output"


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def get_collection(name):
    collection = bpy.data.collections.get(name)
    if collection:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def bone_parent_keep_world(obj, rig, bone_name):
    obj["wizard_attachment_rig"] = rig.name
    obj["wizard_attachment_bone"] = bone_name


def principled_material(name, base, roughness, emission=None, emission_strength=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*base, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.055
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return material


def add_uv_sphere(name, location, scale, material, collection, rig):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, collection)
    bone_parent_keep_world(obj, rig, "head")
    return obj


def add_brow(name, points, material, collection, rig):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 4
    curve.bevel_depth = 0.0023
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bone_parent_keep_world(obj, rig, "head")
    return obj


def apply_face_targets(human):
    services = importlib.import_module("bl_ext.user_default.mpfb.services")
    root = Path(services.LocationService.get_mpfb_data("targets"))
    targets = {
        "WizardFace_HeadRectangular": ("head/head-rectangular.target.gz", 0.18),
        "WizardFace_ChinWide": ("chin/chin-width-incr.target.gz", 0.24),
        "WizardFace_ChinTall": ("chin/chin-height-incr.target.gz", 0.10),
        "WizardFace_ChinCleft": ("chin/chin-cleft-incr.target.gz", 0.10),
        "WizardFace_CheekL": ("cheek/l-cheek-bones-incr.target.gz", 0.20),
        "WizardFace_CheekR": ("cheek/r-cheek-bones-incr.target.gz", 0.20),
        "WizardFace_BrowAngle": ("eyebrows/eyebrows-angle-down.target.gz", 0.13),
        "WizardFace_NoseBridge": ("nose/nose-hump-incr.target.gz", 0.08),
    }
    existing = human.data.shape_keys.key_blocks if human.data.shape_keys else None
    for name, (relative, value) in targets.items():
        if existing and name in existing:
            existing[name].value = value
        else:
            services.TargetService.load_target(human, str(root / relative), weight=value, name=name)


def build_face(human, rig):
    collection = get_collection("Wizard_Face")
    apply_face_targets(human)

    skin = bpy.data.materials.get("Wizard Skin Preview")
    if skin and skin.use_nodes:
        bsdf = skin.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (0.43, 0.205, 0.12, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.58
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = 0.065

    sclera = principled_material(
        "Eye Sclera",
        (0.025, 0.20, 0.42),
        0.24,
        emission=(0.015, 0.30, 0.85),
        emission_strength=2.8,
    )
    glow = principled_material(
        "Arcane Eye Glow",
        (0.02, 0.42, 0.72),
        0.18,
        emission=(0.05, 0.65, 1.0),
        emission_strength=4.0,
    )
    brow_mat = principled_material("Silver Brows", (0.055, 0.075, 0.10), 0.72)

    for side, x in (("L", 0.0335), ("R", -0.0335)):
        add_uv_sphere(
            f"Face_Eye_{side}",
            (x, -0.121, 1.656),
            (0.0145, 0.0135, 0.0115),
            sclera,
            collection,
            rig,
        )
        add_uv_sphere(
            f"Face_Iris_{side}",
            (x, -0.1365, 1.656),
            (0.0062, 0.0028, 0.0062),
            glow,
            collection,
            rig,
        )

    add_brow(
        "Face_Brow_L",
        ((0.010, -0.158, 1.681), (0.034, -0.160, 1.684), (0.063, -0.147, 1.676)),
        brow_mat,
        collection,
        rig,
    )
    add_brow(
        "Face_Brow_R",
        ((-0.010, -0.158, 1.681), (-0.034, -0.160, 1.684), (-0.063, -0.147, 1.676)),
        brow_mat,
        collection,
        rig,
    )


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
    build_face(human, rig)

    render_from(
        "Face Closeup",
        (0.0, -1.9, 1.76),
        (0.0, 0.0, 1.60),
        82,
        "wizard_mpfb_pass03_face_closeup.png",
    )
    render_from(
        "Character Three Quarter",
        (3.6, -5.5, 3.0),
        (0.0, 0.0, 0.95),
        72,
        "wizard_mpfb_pass03_three_quarter.png",
    )
    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (0.0, 0.0, 0.9),
        58,
        "wizard_mpfb_pass03_tactical.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({"face_objects": len(bpy.data.collections["Wizard_Face"].objects)})


main()
