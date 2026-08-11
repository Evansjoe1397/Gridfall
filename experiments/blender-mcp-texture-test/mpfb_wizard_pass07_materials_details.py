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
    return collection


def get_bsdf(material):
    material.use_nodes = True
    return material.node_tree.nodes.get("Principled BSDF")


def set_emission(material_name, base, emission, strength, roughness=0.24):
    material = bpy.data.materials.get(material_name)
    if not material:
        material = bpy.data.materials.new(material_name)
    material.diffuse_color = (*base, 1.0)
    bsdf = get_bsdf(material)
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return material


def add_fabric_nodes(material, color_a, color_b):
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    for node in list(nodes):
        if node.name.startswith("WizardFabric_"):
            nodes.remove(node)
    tex = nodes.new("ShaderNodeTexNoise")
    tex.name = "WizardFabric_Noise"
    tex.label = "Subtle woven variation"
    tex.inputs["Scale"].default_value = 24.0
    tex.inputs["Detail"].default_value = 3.0
    tex.inputs["Roughness"].default_value = 0.62
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = "WizardFabric_Color"
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = (*color_a, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (*color_b, 1.0)
    bump = nodes.new("ShaderNodeBump")
    bump.name = "WizardFabric_Bump"
    bump.inputs["Strength"].default_value = 0.10
    bump.inputs["Distance"].default_value = 0.018
    links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def add_bezier(name, points, radii, bevel, mat, collection):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 5
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
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


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def add_torus(name, location, major_radius, minor_radius, scale_y, rotation, mat, collection):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=10,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale.y = scale_y
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    move_to_collection(obj, collection)
    return obj


def add_gem(name, location, scale, mat, collection):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, collection)
    return obj


def setup_render_glow():
    scene = bpy.context.scene
    scene.use_nodes = True
    modern_compositor = hasattr(scene, "compositing_node_group")
    if modern_compositor:
        tree = bpy.data.node_groups.get("Wizard Scene Compositor")
        if tree is None:
            tree = bpy.data.node_groups.new("Wizard Scene Compositor", "CompositorNodeTree")
        scene.compositing_node_group = tree
    else:
        tree = scene.node_tree
    tree.nodes.clear()
    render = tree.nodes.new("CompositorNodeRLayers")
    glare = tree.nodes.new("CompositorNodeGlare")
    if hasattr(glare, "glare_type"):
        glare.glare_type = "FOG_GLOW"
        glare.quality = "HIGH"
        glare.threshold = 0.8
        glare.size = 6
    else:
        glare.inputs["Type"].default_value = "Fog Glow"
        glare.inputs["Quality"].default_value = "High"
        glare.inputs["Threshold"].default_value = 0.8
        glare.inputs["Strength"].default_value = 0.72
        glare.inputs["Size"].default_value = 0.42
    if modern_compositor:
        for item in list(tree.interface.items_tree):
            tree.interface.remove(item)
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        composite = tree.nodes.new("NodeGroupOutput")
    else:
        composite = tree.nodes.new("CompositorNodeComposite")
    tree.links.new(render.outputs["Image"], glare.inputs["Image"])
    tree.links.new(glare.outputs["Image"], composite.inputs["Image"])


def build_details(collection):
    arcane = set_emission("Wizard Arcane Trim", (0.005, 0.075, 0.25), (0.01, 0.30, 1.0), 3.0)
    orb_mat = set_emission("Wizard Orbiting Orbs", (0.004, 0.09, 0.32), (0.01, 0.38, 1.0), 4.2, 0.16)
    silver = bpy.data.materials.get("Wizard Silver Trim")
    set_emission("Staff Arcane Core", (0.003, 0.08, 0.30), (0.01, 0.30, 1.0), 3.2, 0.16)
    set_emission("Eye Sclera", (0.008, 0.11, 0.32), (0.01, 0.30, 1.0), 2.3, 0.20)

    robe = bpy.data.materials.get("Wizard Robe Navy")
    cloak = bpy.data.materials.get("Wizard Cloak Indigo")
    hair = bpy.data.materials.get("Wizard Silver Hair")
    if robe:
        add_fabric_nodes(robe, (0.018, 0.038, 0.105), (0.055, 0.10, 0.22))
    if cloak:
        add_fabric_nodes(cloak, (0.022, 0.038, 0.12), (0.065, 0.085, 0.25))
    if hair:
        bsdf = get_bsdf(hair)
        bsdf.inputs["Base Color"].default_value = (0.11, 0.16, 0.25, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.43
        bsdf.inputs["Metallic"].default_value = 0.02

    add_bezier(
        "Detail_Robe_Trim_L",
        ((-0.105, -0.178, 1.34), (-0.12, -0.195, 1.08), (-0.15, -0.225, 0.72), (-0.19, -0.270, 0.35), (-0.225, -0.302, 0.12)),
        (0.75, 1.0, 0.95, 0.85, 0.55),
        0.007,
        arcane,
        collection,
    )
    add_bezier(
        "Detail_Robe_Trim_R",
        ((0.105, -0.178, 1.34), (0.12, -0.195, 1.08), (0.15, -0.225, 0.72), (0.19, -0.270, 0.35), (0.225, -0.302, 0.12)),
        (0.75, 1.0, 0.95, 0.85, 0.55),
        0.007,
        arcane,
        collection,
    )
    rigid_hem = add_torus("Detail_Robe_Hem", (0.0, 0.022, 0.105), 0.333, 0.007, 0.86, (0.0, 0.0, 0.0), arcane, collection)
    # The skirt is armature-deformed; this rigid pelvis ring separates during Walk.
    rigid_hem.hide_viewport = True
    rigid_hem.hide_render = True
    add_torus("Detail_Chest_Ring", (0.0, -0.184, 1.235), 0.075, 0.009, 1.0, (math.radians(90), 0.0, 0.0), silver, collection)
    add_gem("Detail_Chest_Gem", (0.0, -0.198, 1.235), (0.042, 0.018, 0.056), arcane, collection)
    add_gem("Detail_Pauldron_Gem_L", (0.245, -0.098, 1.38), (0.033, 0.016, 0.033), arcane, collection)
    add_gem("Detail_Pauldron_Gem_R", (-0.245, -0.098, 1.38), (0.033, 0.016, 0.033), arcane, collection)

    controller = bpy.data.objects.get("Wizard_Orbital_Controller")
    if not controller:
        controller = bpy.data.objects.new("Wizard_Orbital_Controller", None)
        collection.objects.link(controller)
    controller["orb_count"] = 3
    controller["wizard_effect"] = "idle_orbit"
    radius = 0.55
    heights = (1.24, 1.44, 1.62)
    for index in range(3):
        angle = 2.0 * math.pi * index / 3.0 + 0.25
        location = (radius * math.cos(angle), radius * math.sin(angle), heights[index])
        orb = add_gem(f"Wizard_Orb_{index + 1}", location, (0.064, 0.064, 0.064), orb_mat, collection)
        orb.parent = controller
        add_torus(
            f"Wizard_Orb_Ring_{index + 1}",
            location,
            0.086,
            0.0045,
            1.0,
            (math.radians(68), math.radians(index * 31), 0.0),
            silver,
            collection,
        ).parent = controller


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
    collection = reset_collection("Wizard_Details")
    setup_render_glow()
    build_details(collection)
    render_from(
        "Details Three Quarter",
        (2.8, -4.3, 2.7),
        (0.0, 0.0, 1.00),
        75,
        "wizard_mpfb_pass07_details_close.png",
    )
    tactical = render_from(
        "Tactical Camera",
        (7.3, -8.8, 8.1),
        (0.0, 0.0, 0.9),
        58,
        "wizard_mpfb_pass07_tactical.png",
    )
    bpy.context.scene.camera = tactical
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gridfall_wizard_mpfb_working.blend"))
    print({"detail_objects": len(collection.objects)})


main()
