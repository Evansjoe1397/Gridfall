import bpy
import math
from mathutils import Matrix, Vector
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"
SAVE_WORKING = globals().get("WIZARD_SAVE_STAFF_BEARING", False)

CONTROLLER_NAME = "Wizard_Staff_Controller"
TARGET_NAME = "Wizard_Staff_Grip_Target"
STAFF_ROOT_NAME = "Wizard_Staff_Root"
ARM_STUB_NAME = "Wizard_Arm_WristStub_R"
FOREARM_ANCHOR_NAME = "Wizard_Forearm_Stub_Anchor_R"
WRIST_CUFF_NAME = "Wizard_Wrist_Bearing_Cuff_R"
WRIST_BEARING_NAME = "Wizard_Wrist_Bearing_R"
GRIP_PREFIX = "Wizard_StaffGrip_"
ANATOMICAL_HAND_NAME = f"{GRIP_PREFIX}AnatomicalHand_R"
GRIP_TEMPLATE_NAME = "Wizard_Internal_RightHandGrip_Template_R"
SELECTED_GRIP_SOURCE_NAME = "Wizard_Dev_RightHand_TrimmedWrist"
WRIST_AXIS = Vector((0.56219, 0.80768, -0.17777)).normalized()


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
        elif isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)


def remove_previous_grip():
    for obj in tuple(bpy.data.objects):
        if obj.name.startswith(GRIP_PREFIX) or obj.name in {
            "Wizard_Custom_Fist_R",
            "Wizard_Custom_Fist_Creases_R",
            "Wizard_Custom_Thumb_R",
            ARM_STUB_NAME,
            FOREARM_ANCHOR_NAME,
            WRIST_CUFF_NAME,
            WRIST_BEARING_NAME,
        }:
            remove_object(obj.name)


def ensure_collection():
    collection = bpy.data.collections.get("Wizard_Polish")
    if collection is None:
        collection = bpy.data.collections.new("Wizard_Polish")
        bpy.context.scene.collection.children.link(collection)
    return collection


def ensure_internal_collection():
    collection = bpy.data.collections.get("Wizard_Internal")
    if collection is None:
        collection = bpy.data.collections.new("Wizard_Internal")
        bpy.context.scene.collection.children.link(collection)
    collection.hide_viewport = True
    collection.hide_render = True
    return collection


def ensure_grip_template():
    template = bpy.data.objects.get(GRIP_TEMPLATE_NAME)
    source = bpy.data.objects.get(SELECTED_GRIP_SOURCE_NAME)
    if source is None:
        if template is None:
            raise RuntimeError(
                f"Missing both {SELECTED_GRIP_SOURCE_NAME} and {GRIP_TEMPLATE_NAME}"
            )
        return template

    if template is not None:
        remove_object(template.name)
    collection = ensure_internal_collection()
    template = source.copy()
    template.data = source.data.copy()
    template.name = GRIP_TEMPLATE_NAME
    collection.objects.link(template)
    template.matrix_world = source.matrix_world.copy()
    template.hide_viewport = True
    template.hide_render = True
    template.data.use_fake_user = True
    template["wizard_hand_source"] = "default MPFB right hand"
    template["wizard_grip_method"] = "mesh-weighted cylindrical finger wrap"
    template["wizard_grip_variant"] = "LowA"
    return template


def preserve_object_parent(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.parent_type = "OBJECT"
    obj.parent_bone = ""
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ world


def bake_mesh_into_parent_space(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.data.transform(world)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.transform(parent.matrix_world.inverted())
    obj.parent = parent
    obj.parent_type = "OBJECT"
    obj.parent_bone = ""
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = Matrix.Identity(4)


def preserve_bone_parent(obj, rig, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    bpy.context.view_layer.update()
    obj.matrix_world = world


def shaft_control_points():
    shaft = bpy.data.objects["Staff_Shaft"]
    points = []
    for spline in shaft.data.splines:
        if spline.type == "BEZIER":
            local_points = [point.co for point in spline.bezier_points]
        else:
            local_points = [point.co.to_3d() for point in spline.points]
        points.extend(shaft.matrix_world @ point for point in local_points)
    return sorted(points, key=lambda point: point.z)


def shaft_point_at_height(height):
    points = shaft_control_points()
    for lower, upper in zip(points, points[1:]):
        if lower.z <= height <= upper.z:
            factor = (height - lower.z) / max(upper.z - lower.z, 1e-8)
            return lower.lerp(upper, factor)
    return min(points, key=lambda point: abs(point.z - height))


def create_torus_segment(name, radius_x, radius_y, tube_radius, z, start, end, material, collection):
    arc_segments = 20
    tube_segments = 8
    vertices = []
    faces = []
    for arc_index in range(arc_segments + 1):
        angle = start + (end - start) * arc_index / arc_segments
        center = Vector((radius_x * math.cos(angle), radius_y * math.sin(angle), z))
        radial = Vector((math.cos(angle), math.sin(angle), 0.0))
        for tube_index in range(tube_segments):
            tube_angle = math.tau * tube_index / tube_segments
            offset = radial * (tube_radius * math.cos(tube_angle))
            offset.z = tube_radius * math.sin(tube_angle)
            vertices.append(center + offset)
    for arc_index in range(arc_segments):
        row = arc_index * tube_segments
        next_row = row + tube_segments
        for tube_index in range(tube_segments):
            following = (tube_index + 1) % tube_segments
            faces.append((
                row + tube_index,
                row + following,
                next_row + following,
                next_row + tube_index,
            ))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("Soft fingertip ends", "BEVEL")
    bevel.width = 0.003
    bevel.segments = 2
    return obj


def create_uv_ellipsoid(name, center, scale, material, collection, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=center,
    )
    obj = bpy.context.object
    obj.name = name
    for old_collection in tuple(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def create_curve(name, points, bevel_depth, material, collection):
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    curve.materials.append(material)
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    return obj


def create_cylinder_between(name, start, end, radius_start, radius_end, material, collection):
    direction = end - start
    length = direction.length
    if length < 1e-6:
        raise RuntimeError(f"Cannot build zero-length cylinder {name}")
    segments = 20
    vertices = []
    faces = []
    for z, radius in ((-length * 0.5, radius_start), (length * 0.5, radius_end)):
        for segment in range(segments):
            angle = math.tau * segment / segments
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    for segment in range(segments):
        following = (segment + 1) % segments
        faces.append((segment, following, segments + following, segments + segment))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple(segments + segment for segment in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = (start + end) * 0.5
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("Rounded wrist seam", "BEVEL")
    bevel.width = min(0.005, length * 0.15)
    bevel.segments = 2
    return obj


def create_tapered_hand_back(name, wrist, knuckles, material, collection):
    axis = (knuckles - wrist).normalized()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(axis.dot(reference)) > 0.92:
        reference = Vector((0.0, 1.0, 0.0))
    basis_u = axis.cross(reference).normalized()
    basis_v = axis.cross(basis_u).normalized()
    sections = (
        (0.00, 0.025, 0.022),
        (0.24, 0.031, 0.025),
        (0.55, 0.039, 0.028),
        (0.82, 0.043, 0.030),
        (1.00, 0.040, 0.028),
    )
    segments = 24
    vertices = []
    faces = []
    for factor, radius_u, radius_v in sections:
        center = wrist.lerp(knuckles, factor)
        for segment in range(segments):
            angle = math.tau * segment / segments
            vertices.append(
                center
                + basis_u * (radius_u * math.cos(angle))
                + basis_v * (radius_v * math.sin(angle))
            )
    for section in range(len(sections) - 1):
        row = section * segments
        following_row = row + segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append((
                row + segment,
                row + following,
                following_row + following,
                following_row + segment,
            ))
    faces.append(tuple(reversed(range(segments))))
    last = (len(sections) - 1) * segments
    faces.append(tuple(last + segment for segment in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("Soft hand silhouette", "BEVEL")
    bevel.width = 0.0035
    bevel.segments = 2
    return obj


def build_controller(rig, pivot):
    staff_root = bpy.data.objects[STAFF_ROOT_NAME]
    staff_world = staff_root.matrix_world.copy()

    old_controller = bpy.data.objects.get(CONTROLLER_NAME)
    if old_controller and staff_root.parent == old_controller:
        staff_root.parent = None
        staff_root.matrix_world = staff_world
    remove_object(CONTROLLER_NAME)
    remove_object(TARGET_NAME)

    controller = bpy.data.objects.new(CONTROLLER_NAME, None)
    bpy.context.scene.collection.objects.link(controller)
    controller.empty_display_type = "CIRCLE"
    controller.empty_display_size = 0.06
    controller.rotation_mode = "XYZ"
    controller.matrix_world = Matrix.Translation(pivot)
    constraint = controller.constraints.new("COPY_LOCATION")
    constraint.name = "Follow hand position only"
    constraint.target = rig
    constraint.subtarget = "hand_r"
    constraint.head_tail = 0.0
    constraint.use_x = True
    constraint.use_y = True
    constraint.use_z = True
    constraint.owner_space = "WORLD"
    constraint.target_space = "WORLD"
    bpy.context.view_layer.update()

    staff_root.parent = controller
    staff_root.parent_type = "OBJECT"
    staff_root.matrix_world = staff_world
    controller["wizard_staff_pivot"] = tuple(pivot)
    controller["wizard_staff_motion"] = "position follows hand; rotation is independently animated"
    return controller


def build_grip(template, rig, controller, grip_center, joint):
    collection = ensure_collection()
    wrist = rig.matrix_world @ rig.pose.bones["hand_r"].head
    hand = template.copy()
    hand.data = template.data.copy()
    hand.name = ANATOMICAL_HAND_NAME
    collection.objects.link(hand)
    hand.matrix_world = template.matrix_world.copy()
    hand.hide_viewport = False
    hand.hide_render = False
    for polygon in hand.data.polygons:
        polygon.use_smooth = True
    preserve_object_parent(hand, controller)
    hand["wizard_bearing_side"] = "staff"
    hand["wizard_hand_source"] = "default MPFB right hand"
    hand["wizard_grip_method"] = "mesh-weighted cylindrical finger wrap"
    hand["wizard_grip_variant"] = "LowA"

    bearing = create_uv_ellipsoid(
        WRIST_BEARING_NAME,
        joint + WRIST_AXIS * 0.002,
        (0.020, 0.020, 0.028),
        hand.data.materials[0],
        collection,
        segments=32,
        rings=16,
    )
    bearing.rotation_mode = "QUATERNION"
    bearing.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(
        WRIST_AXIS
    )
    preserve_object_parent(bearing, controller)
    bearing["wizard_bearing_role"] = "compact wrist overlap"

    return [hand, bearing], None, wrist


def key_rotation(action, controller, frame, rotation_degrees):
    controller.rotation_euler = tuple(math.radians(value) for value in rotation_degrees)
    controller.keyframe_insert(data_path="rotation_euler", frame=frame, group="Staff Pivot")


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return tuple(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                channelbag = strip.channelbag(slot)
                if channelbag:
                    curves.extend(channelbag.fcurves)
    return tuple(curves)


def make_action(controller, name, keys, cyclic):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name)
    controller.animation_data_create()
    controller.animation_data.action = action
    for frame, rotation in keys:
        key_rotation(action, controller, frame, rotation)
    for fcurve in action_fcurves(action):
        for point in fcurve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        if cyclic:
            fcurve.modifiers.new("CYCLES")
    action["wizard_staff_action"] = True
    return action


def build_actions(controller):
    idle = make_action(controller, "Wizard_Staff_Idle", (
        (1, (0.0, 0.0, 0.0)),
        (19, (-1.4, 0.8, 0.5)),
        (37, (0.7, -0.9, 0.0)),
        (55, (1.2, 0.7, -0.4)),
        (73, (0.0, 0.0, 0.0)),
    ), True)
    walk = make_action(controller, "Wizard_Staff_Walk", (
        (1, (-3.0, -1.5, -1.0)),
        (9, (2.5, 1.5, 1.5)),
        (17, (-3.0, -1.5, -1.0)),
        (25, (2.5, 1.5, 1.5)),
        (33, (-3.0, -1.5, -1.0)),
    ), True)
    attack = make_action(controller, "Wizard_Staff_Attack", (
        (1, (0.0, 0.0, 0.0)),
        (7, (-8.0, -1.0, -2.0)),
        (15, (-36.0, -7.0, -4.0)),
        (22, (-48.0, -10.0, -6.0)),
        (25, (-20.0, -38.0, -2.0)),
        (26, (0.0, -50.0, 0.0)),
        (27, (24.0, -40.0, 3.0)),
        (29, (50.0, 7.0, 5.0)),
        (34, (32.0, 4.0, 3.0)),
        (39, (9.0, 1.0, 1.0)),
        (43, (0.0, 0.0, 0.0)),
    ), False)
    controller.animation_data.action = idle
    return idle, walk, attack


def main():
    scene = bpy.context.scene
    if bpy.context.screen and bpy.context.screen.is_animation_playing:
        bpy.ops.screen.animation_cancel(restore_frame=False)
    human = bpy.data.objects["Wizard_Base_Mesh"]
    rig = find_rig(human)
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions.get("Wizard_Idle")
    scene.frame_set(1)
    bpy.context.view_layer.update()

    template = ensure_grip_template()
    remove_previous_grip()
    grip_center = shaft_point_at_height(0.955)
    wrist = rig.matrix_world @ rig.pose.bones["hand_r"].head
    joint = wrist
    controller = build_controller(rig, joint)
    grip, arm_stub, wrist = build_grip(template, rig, controller, grip_center, joint)
    actions = build_actions(controller)

    controller.animation_data.action = actions[0]
    scene.frame_start = 1
    scene.frame_end = 72
    scene.frame_set(1)
    scene["wizard_active_clip"] = "IDLE"
    bpy.context.view_layer.update()
    if SAVE_WORKING:
        bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print({
        "controller": controller.name,
        "pivot": tuple(round(value, 4) for value in joint),
        "grip_center": tuple(round(value, 4) for value in grip_center),
        "wrist": tuple(round(value, 4) for value in wrist),
        "joint": tuple(round(value, 4) for value in joint),
        "grip_objects": [obj.name for obj in grip],
        "arm_stub": arm_stub.name if arm_stub else None,
        "actions": [action.name for action in actions],
        "saved": SAVE_WORKING,
    })


main()
