import bpy
import math
from mathutils import Vector
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"
SAVE_WORKING = globals().get("WIZARD_SAVE_CUSTOM_FIST", False)
FIST_NAME = "Wizard_Custom_Fist_R"
THUMB_NAME = "Wizard_Custom_Thumb_R"
CREASES_NAME = "Wizard_Custom_Fist_Creases_R"
MASK_GROUP = "Wizard_Replaced_Right_Hand"
MASK_MODIFIER = "Hide replaced right hand"


def find_rig(human):
    return next(
        modifier.object
        for modifier in human.modifiers
        if modifier.type == "ARMATURE" and modifier.object
    )


def remove_object(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        return
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data and data.users == 0:
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.MetaBall):
            bpy.data.metaballs.remove(data)


def ensure_collection():
    collection = bpy.data.collections.get("Wizard_Polish")
    if collection is None:
        collection = bpy.data.collections.new("Wizard_Polish")
        bpy.context.scene.collection.children.link(collection)
    return collection


def rebuild_hand_mask(human):
    old_modifier = human.modifiers.get(MASK_MODIFIER)
    if old_modifier:
        human.modifiers.remove(old_modifier)
    old_group = human.vertex_groups.get(MASK_GROUP)
    if old_group:
        human.vertex_groups.remove(old_group)

    source_names = {
        "hand_r",
        *(f"{finger}_{joint:02d}_r" for finger in ("index", "middle", "ring", "pinky", "thumb") for joint in (1, 2, 3)),
    }
    source_indices = {
        group.index for group in human.vertex_groups if group.name in source_names
    }
    hidden_vertices = []
    for vertex in human.data.vertices:
        if any(
            assignment.group in source_indices and assignment.weight > 0.01
            for assignment in vertex.groups
        ):
            hidden_vertices.append(vertex.index)

    group = human.vertex_groups.new(name=MASK_GROUP)
    group.add(hidden_vertices, 1.0, "REPLACE")
    modifier = human.modifiers.new(MASK_MODIFIER, "MASK")
    modifier.vertex_group = group.name
    modifier.invert_vertex_group = True
    return len(hidden_vertices)


def shaft_point_at_height(height):
    shaft = bpy.data.objects.get("Staff_Shaft")
    if shaft is None or not shaft.data.splines:
        raise RuntimeError("Staff_Shaft curve is missing")
    spline = shaft.data.splines[0]
    if spline.type == "BEZIER":
        points = [shaft.matrix_world @ point.co for point in spline.bezier_points]
    else:
        points = [shaft.matrix_world @ point.co.to_3d() for point in spline.points]
    return min(points, key=lambda point: abs(point.z - height))


def signed_power(value, exponent):
    if abs(value) < 1e-8:
        return 0.0
    return math.copysign(abs(value) ** exponent, value)


def loft_geometry(sections, segments=32):
    """Build a wrist-to-knuckles volume instead of disguising a sphere as a hand."""
    vertices = []
    faces = []
    for section_index, (center, radius_x, radius_y) in enumerate(sections):
        section_t = section_index / (len(sections) - 1)
        for segment in range(segments):
            theta = math.tau * segment / segments
            cos_theta = math.cos(theta)
            sin_theta = math.sin(theta)
            box_cos = signed_power(cos_theta, 0.82)
            box_sin = signed_power(sin_theta, 0.82)
            x = center.x + radius_x * box_cos
            y = center.y + radius_y * box_sin

            # Four restrained knuckle pads and one diagonal thumb ridge are authored
            # directly into the surface; there are no intersecting primitive parts.
            front = max(0.0, -sin_theta)
            normalized_x = cos_theta
            knuckle_stack = sum(
                math.exp(-((section_t - target) / 0.065) ** 2)
                for target in (0.34, 0.50, 0.66, 0.82)
            )
            if cos_theta > 0.0:
                x += 0.0085 * (cos_theta ** 2) * knuckle_stack
            thumb_line = 0.46 + 0.16 * normalized_x
            thumb_ridge = math.exp(-((section_t - thumb_line) / 0.11) ** 2)
            thumb_width = math.exp(-((normalized_x - 0.05) / 0.82) ** 4)
            y -= 0.0105 * front * thumb_ridge * thumb_width
            vertices.append((x, y, center.z))

    for section in range(len(sections) - 1):
        current = section * segments
        following = current + segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((
                current + segment,
                current + nxt,
                following + nxt,
                following + segment,
            ))
    faces.append(tuple(reversed(range(segments))))
    last = (len(sections) - 1) * segments
    faces.append(tuple(last + segment for segment in range(segments)))
    return vertices, faces


def create_loft_fist(name, sections, material, collection):
    vertices, faces = loft_geometry(sections)
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    subdivision = obj.modifiers.new("Fist surface smoothing", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    return obj


def make_crease_material(skin):
    material = bpy.data.materials.get("Wizard Fist Crease")
    if material is None:
        material = bpy.data.materials.new("Wizard Fist Crease")
    material.diffuse_color = (0.18, 0.075, 0.045, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.12, 0.040, 0.022, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.72
    return material


def create_finger_creases(grip_center, collection, skin):
    curve = bpy.data.curves.new(f"{CREASES_NAME}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = 0.00075
    curve.bevel_resolution = 2
    for z in (0.936, 0.920, 0.904):
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(2)
        for point, coordinate in zip(
            spline.bezier_points,
            (
                (grip_center.x + 0.012, grip_center.y - 0.050, z + 0.002),
                (grip_center.x + 0.024, grip_center.y - 0.047, z),
                (grip_center.x + 0.036, grip_center.y - 0.044, z + 0.001),
            ),
        ):
            point.co = coordinate
            point.handle_left_type = "AUTO"
            point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(CREASES_NAME, curve)
    collection.objects.link(obj)
    curve.materials.append(make_crease_material(skin))
    return obj


def bone_parent_preserve_world(obj, rig, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world


def build_fist(human, rig):
    remove_object(FIST_NAME)
    remove_object(THUMB_NAME)
    remove_object(CREASES_NAME)
    remove_object(f"{FIST_NAME}_Meta")
    collection = ensure_collection()
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    grip_height = 0.950
    shaft = shaft_point_at_height(grip_height)
    center = Vector((shaft.x, shaft.y, grip_height))
    grip_center = center + Vector((0.028, -0.008, 0.0))
    wrist = rig.matrix_world @ rig.pose.bones["hand_r"].head

    skin = human.data.materials[0]
    sections = []
    section_count = 21
    top_z = wrist.z + 0.004
    bottom_z = grip_center.z - 0.082
    for index in range(section_count):
        t = index / (section_count - 1)
        transition = min(1.0, t / 0.28)
        transition = transition * transition * (3.0 - 2.0 * transition)
        section_center = wrist.lerp(grip_center, transition)
        section_center.z = top_z * (1.0 - t) + bottom_z * t
        section_center.y += 0.006 * max(0.0, (t - 0.60) / 0.40)
        if t < 0.24:
            blend = t / 0.24
            radius_x = 0.026 + 0.022 * blend
            radius_y = 0.023 + 0.019 * blend
        else:
            bottom_taper = max(0.0, (t - 0.86) / 0.14)
            radius_x = 0.048 * (1.0 - 0.42 * bottom_taper)
            radius_y = 0.042 * (1.0 - 0.44 * bottom_taper)
        sections.append((section_center, radius_x, radius_y))
    sections = tuple(sections)
    fist = create_loft_fist(FIST_NAME, sections, skin, collection)
    creases = create_finger_creases(grip_center, collection, skin)

    bone_parent_preserve_world(fist, rig, "hand_r")
    bone_parent_preserve_world(creases, rig, "hand_r")
    fist["wizard_replaces_body_part"] = "right hand"
    fist["wizard_attachment_bone"] = "hand_r"
    fist["wizard_grip_height"] = grip_height
    return fist, center


def reset_original_finger_pose(rig):
    for finger in ("index", "middle", "ring", "pinky", "thumb"):
        for joint in (1, 2, 3):
            bone = rig.pose.bones.get(f"{finger}_{joint:02d}_r")
            if bone:
                bone.rotation_mode = "XYZ"
                bone.rotation_euler = (0.0, 0.0, 0.0)


def clear_staff_grip_zone():
    changed = []
    for name in ("Staff_Silver_Vine_1", "Staff_Silver_Vine_2"):
        obj = bpy.data.objects.get(name)
        if obj is None or obj.get("wizard_custom_fist_gap"):
            continue
        curve = obj.data
        if not curve.splines:
            continue
        source = curve.splines[0]
        if source.type not in {"POLY", "NURBS"}:
            continue
        spline_type = source.type
        chunks = []
        current = []
        for point in source.points:
            world_z = (obj.matrix_world @ point.co.to_3d()).z
            if 0.845 <= world_z <= 1.085:
                if len(current) >= 2:
                    chunks.append(current)
                current = []
            else:
                current.append((tuple(point.co), point.radius, point.tilt))
        if len(current) >= 2:
            chunks.append(current)
        curve.splines.clear()
        for chunk in chunks:
            spline = curve.splines.new(spline_type)
            spline.points.add(len(chunk) - 1)
            for target, (co, radius, tilt) in zip(spline.points, chunk):
                target.co = co
                target.radius = radius
                target.tilt = tilt
            if spline_type == "NURBS":
                spline.order_u = min(4, len(chunk))
                spline.use_endpoint_u = True
        obj["wizard_custom_fist_gap"] = True
        changed.append(name)
    return changed


def leave_idle_ready(rig):
    scene = bpy.context.scene
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions.get("Wizard_Idle")
    orbs = bpy.data.objects.get("Wizard_Orbital_Controller")
    if orbs:
        orbs.animation_data_create()
        orbs.animation_data.action = bpy.data.actions.get("Wizard_Idle_Orbs")
    scene.frame_start = 1
    scene.frame_end = 72
    scene.frame_set(1)


def main():
    human = bpy.data.objects["Wizard_Base_Mesh"]
    rig = find_rig(human)
    leave_idle_ready(rig)
    reset_original_finger_pose(rig)
    hidden_vertices = rebuild_hand_mask(human)
    fist, center = build_fist(human, rig)
    trimmed_vines = clear_staff_grip_zone()
    leave_idle_ready(rig)
    if SAVE_WORKING:
        bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({
        "fist": fist.name,
        "vertices": len(fist.data.vertices),
        "polygons": len(fist.data.polygons),
        "center": tuple(round(value, 4) for value in center),
        "masked_body_vertices": hidden_vertices,
        "trimmed_vines": trimmed_vines,
        "saved": SAVE_WORKING,
    })


main()
