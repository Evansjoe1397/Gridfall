import bpy
import collections
import json
import math
from mathutils import Matrix, Quaternion, Vector


FPS = 30
FRAME_START = 1
FRAME_END = 52
BODY_NAME = "Wizard_Base_Mesh"
HAND_NAME = "Wizard_Power_LeftHand"
HAND_CONTROLLER_NAME = "Wizard_Power_LeftHand_Controller"
HINGE_NAME = "Wizard_Power_Wrist_Hinge_L"
CUFF_NAME = "Wizard_Power_LeftCuff_Rim"
HAND_ACTION_NAME = "Wizard_Power_LeftHand_Action"
POWER_ACTION_NAME = "Wizard_Power"
STAGE1_ACTION_NAME = "Wizard_Power_Stage1"
ORB_ACTION_NAME = "Wizard_Power_Orbs"
MASK_GROUP_NAME = "Wizard_Detached_Left_Hand"
MASK_MODIFIER_NAME = "Hide detached left hand"

RIG_KEYS = (
    (1, 0.0),
    (6, 0.0),
    (15, 0.55),
    (24, 1.0),
    (38, 1.0),
    (45, 0.55),
    (52, 0.0),
)
HAND_KEYS = (
    (1, 0.0),
    (15, 0.0),
    (24, 0.0),
    (31, 1.0),
    (38, 1.0),
    (45, 0.45),
    (52, 0.0),
)


def find_rig(human):
    for modifier in human.modifiers:
        if modifier.type == "ARMATURE" and modifier.object:
            return modifier.object
    raise RuntimeError("Wizard armature was not found")


def remove_object(name):
    obj = bpy.data.objects.get(name)
    if obj is not None:
        bpy.data.objects.remove(obj, do_unlink=True)


def remove_action(name):
    action = bpy.data.actions.get(name)
    if action is not None:
        bpy.data.actions.remove(action, do_unlink=True)


def iter_fcurves(action):
    seen = set()
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        for curve in legacy:
            pointer = curve.as_pointer()
            if pointer not in seen:
                seen.add(pointer)
                yield curve
    for layer in getattr(action, "layers", ()):
        for strip in getattr(layer, "strips", ()):
            for channelbag in getattr(strip, "channelbags", ()):
                for curve in getattr(channelbag, "fcurves", ()):
                    pointer = curve.as_pointer()
                    if pointer not in seen:
                        seen.add(pointer)
                        yield curve


def polish_curves(action):
    for curve in iter_fcurves(action):
        curve.extrapolation = "CONSTANT"
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"


def create_action(name, target, paired_action=None, stage=None):
    remove_action(name)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    action["wizard_clip"] = True
    action["wizard_fps"] = FPS
    action["wizard_loop"] = False
    if paired_action:
        action["wizard_paired_action"] = paired_action
    if stage:
        action["wizard_power_stage"] = stage
    if hasattr(action, "use_frame_range"):
        action.use_frame_range = True
        action.frame_start = FRAME_START
        action.frame_end = FRAME_END
    target.animation_data_create()
    target.animation_data.action = action
    return action


def capture_pose(rig):
    state = {}
    for bone in rig.pose.bones:
        basis = bone.matrix_basis.copy()
        bone.rotation_mode = "XYZ"
        bone.matrix_basis = basis
        state[bone.name] = {
            "location": bone.location.copy(),
            "rotation": bone.rotation_euler.copy(),
            "scale": bone.scale.copy(),
        }
    return state


def restore_pose(rig, state):
    for name, values in state.items():
        bone = rig.pose.bones.get(name)
        if bone is None:
            continue
        bone.location = values["location"]
        bone.rotation_euler = values["rotation"]
        bone.scale = values["scale"]
    bpy.context.view_layer.update()


def aim_bone(bone, target):
    head = bone.head.copy()
    direction = (Vector(target) - head).normalized()
    old_x = bone.matrix.to_3x3().col[0].normalized()
    x_axis = old_x - direction * old_x.dot(direction)
    if x_axis.length < 1e-5:
        x_axis = Vector((1.0, 0.0, 0.0)) - direction * direction.x
    x_axis.normalize()
    z_axis = x_axis.cross(direction).normalized()
    x_axis = direction.cross(z_axis).normalized()
    bone.matrix = Matrix(
        (
            (x_axis.x, direction.x, z_axis.x, head.x),
            (x_axis.y, direction.y, z_axis.y, head.y),
            (x_axis.z, direction.z, z_axis.z, head.z),
            (0.0, 0.0, 0.0, 1.0),
        )
    )
    bpy.context.view_layer.update()


def pose_left_arm(rig, amount):
    inverse_rig = rig.matrix_world.inverted()
    final_elbow = inverse_rig @ Vector((0.285, -0.205, 1.292))
    final_wrist = inverse_rig @ Vector((0.300, -0.435, 1.285))
    upper = rig.pose.bones["upperarm_l"]
    lower = rig.pose.bones["lowerarm_l"]
    rest_elbow = upper.tail.copy()
    rest_wrist = lower.tail.copy()
    aim_bone(upper, rest_elbow.lerp(final_elbow, amount))
    aim_bone(lower, rest_wrist.lerp(final_wrist, amount))


def build_rig_action(rig, idle_pose, name, stage):
    action = create_action(name, rig, stage=stage)
    for frame, amount in RIG_KEYS:
        restore_pose(rig, idle_pose)
        if amount:
            rig.pose.bones["clavicle_l"].rotation_euler[2] += math.radians(-3.0 * amount)
            rig.pose.bones["spine_03"].rotation_euler[0] += math.radians(-1.5 * amount)
            rig.pose.bones["neck_01"].rotation_euler[0] += math.radians(0.8 * amount)
            bpy.context.view_layer.update()
        pose_left_arm(rig, amount)
        for bone in rig.pose.bones:
            bone.keyframe_insert("location", frame=frame, group=bone.name)
            bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)
            bone.keyframe_insert("scale", frame=frame, group=bone.name)
    for label, frame in (
        ("Rest", 1),
        ("Raise", 15),
        ("Arm Up", 24),
        ("Power Hold", 38),
        ("Return", 45),
        ("End", 52),
    ):
        marker = action.pose_markers.new(label)
        marker.frame = frame
    polish_curves(action)
    return action


def hand_group_names():
    return ["hand_l"] + [
        f"{finger}_{segment:02d}_l"
        for finger in ("thumb", "index", "middle", "ring", "pinky")
        for segment in (1, 2, 3)
    ]


def selected_hand_topology(human):
    group_indices = {
        group.index for group in human.vertex_groups if group.name in hand_group_names()
    }
    selected = {
        vertex.index
        for vertex in human.data.vertices
        if any(
            assignment.group in group_indices and assignment.weight > 0.001
            for assignment in vertex.groups
        )
    }
    polygons = [
        polygon
        for polygon in human.data.polygons
        if all(index in selected for index in polygon.vertices)
    ]
    used = sorted({index for polygon in polygons for index in polygon.vertices})
    return selected, polygons, used


def boundary_components(mesh):
    edge_counts = collections.Counter()
    for polygon in mesh.polygons:
        vertices = list(polygon.vertices)
        for first, second in zip(vertices, vertices[1:] + vertices[:1]):
            edge_counts[tuple(sorted((first, second)))] += 1
    adjacency = collections.defaultdict(set)
    for (first, second), count in edge_counts.items():
        if count == 1:
            adjacency[first].add(second)
            adjacency[second].add(first)
    components = []
    visited = set()
    for start in adjacency:
        if start in visited:
            continue
        stack = [start]
        visited.add(start)
        component = []
        while stack:
            current = stack.pop()
            component.append(current)
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    return components


def anatomical_wrist_pivot(hand, rig):
    bone_wrist = rig.matrix_world @ rig.pose.bones["hand_l"].head
    elbow = rig.matrix_world @ rig.pose.bones["lowerarm_l"].head
    forearm_axis = (bone_wrist - elbow).normalized()
    candidates = []
    for component in boundary_components(hand.data):
        center = sum((hand.data.vertices[index].co for index in component), Vector())
        center /= len(component)
        projection = (center - bone_wrist).dot(forearm_axis)
        candidates.append((projection, center, len(component)))
    if not candidates:
        raise RuntimeError("Detached left hand has no open wrist boundary")
    candidates.sort(key=lambda item: item[0])
    primary = candidates[0][1]
    wrist_rings = [item[1] for item in candidates if (item[1] - primary).length < 0.012]
    pivot = sum(wrist_rings, Vector()) / len(wrist_rings)
    return pivot, candidates


def extract_native_left_hand(human, rig):
    for name in (HAND_NAME, HAND_CONTROLLER_NAME, HINGE_NAME, CUFF_NAME):
        remove_object(name)
    old_modifier = human.modifiers.get(MASK_MODIFIER_NAME)
    if old_modifier:
        human.modifiers.remove(old_modifier)
    old_group = human.vertex_groups.get(MASK_GROUP_NAME)
    if old_group:
        human.vertex_groups.remove(old_group)

    selected, source_polygons, used = selected_hand_topology(human)
    remap = {old_index: new_index for new_index, old_index in enumerate(used)}

    temporary = human.copy()
    temporary.data = human.data.copy()
    bpy.context.scene.collection.objects.link(temporary)
    for modifier in list(temporary.modifiers):
        if modifier.type != "ARMATURE":
            temporary.modifiers.remove(modifier)
    evaluated = temporary.evaluated_get(bpy.context.evaluated_depsgraph_get())
    evaluated_mesh = evaluated.to_mesh()
    vertices = [evaluated.matrix_world @ evaluated_mesh.vertices[index].co for index in used]
    faces = [[remap[index] for index in polygon.vertices] for polygon in source_polygons]

    mesh = bpy.data.meshes.new(HAND_NAME + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    hand = bpy.data.objects.new(HAND_NAME, mesh)
    bpy.context.scene.collection.objects.link(hand)
    for material in human.data.materials:
        mesh.materials.append(material)
    for destination, source in zip(mesh.polygons, source_polygons):
        destination.material_index = source.material_index
        destination.use_smooth = True
    evaluated.to_mesh_clear()
    bpy.data.objects.remove(temporary, do_unlink=True)

    subdivision = hand.modifiers.new("Power hand smoothing", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1

    mask_group = human.vertex_groups.new(name=MASK_GROUP_NAME)
    mask_group.add(list(selected), 1.0, "REPLACE")
    mask = human.modifiers.new(MASK_MODIFIER_NAME, "MASK")
    mask.vertex_group = MASK_GROUP_NAME
    mask.invert_vertex_group = True

    pivot, boundary_data = anatomical_wrist_pivot(hand, rig)
    controller = bpy.data.objects.new(HAND_CONTROLLER_NAME, None)
    bpy.context.scene.collection.objects.link(controller)
    controller.empty_display_type = "SPHERE"
    controller.empty_display_size = 0.014
    controller.matrix_world = Matrix.Translation(pivot)
    world_matrix = controller.matrix_world.copy()
    controller.parent = rig
    controller.parent_type = "BONE"
    controller.parent_bone = "hand_l"
    controller.matrix_world = world_matrix

    hand_world = hand.matrix_world.copy()
    hand.parent = controller
    hand.matrix_world = hand_world

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=pivot)
    hinge = bpy.context.object
    hinge.name = HINGE_NAME
    hinge.scale = (0.028, 0.026, 0.030)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    skin = bpy.data.materials.get("Wizard Skin Preview")
    if skin:
        hinge.data.materials.append(skin)
    for polygon in hinge.data.polygons:
        polygon.use_smooth = True
    hinge_world = hinge.matrix_world.copy()
    hinge.parent = controller
    hinge.matrix_world = hinge_world
    hinge.hide_select = True
    hinge.hide_viewport = True
    hinge.hide_render = True

    forearm_origin = rig.matrix_world @ rig.pose.bones["lowerarm_l"].head
    cuff_axis = (pivot - forearm_origin).normalized()
    cuff_rotation = Vector((0.0, 0.0, 1.0)).rotation_difference(cuff_axis)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.047,
        minor_radius=0.0045,
        major_segments=32,
        minor_segments=8,
        location=pivot,
        rotation=cuff_rotation.to_euler(),
    )
    cuff = bpy.context.object
    cuff.name = CUFF_NAME
    sleeve = bpy.data.objects.get("Wizard_Sleeve_L")
    cuff_material = (
        sleeve.data.materials[0]
        if sleeve and sleeve.type == "MESH" and sleeve.data.materials
        else None
    )
    if cuff_material:
        cuff.data.materials.append(cuff_material)
    for polygon in cuff.data.polygons:
        polygon.use_smooth = True
    cuff_world = cuff.matrix_world.copy()
    cuff.parent = rig
    cuff.parent_type = "BONE"
    cuff.parent_bone = "hand_l"
    cuff.matrix_world = cuff_world
    cuff.hide_select = True

    for obj in (hand, controller, hinge, cuff):
        obj["wizard_power_asset"] = True
    controller["wizard_power_pivot_frame1"] = list(pivot)
    controller["wizard_power_base_matrix"] = [value for row in controller.matrix_basis for value in row]
    return hand, controller, remap, used, boundary_data


def weighted_group_center(human, hand, remap, used, group_name):
    group_index = human.vertex_groups[group_name].index
    points = []
    for source_index in used:
        if any(
            assignment.group == group_index and assignment.weight > 0.05
            for assignment in human.data.vertices[source_index].groups
        ):
            point = hand.matrix_world @ hand.data.vertices[remap[source_index]].co
            points.append(point)
    if not points:
        raise RuntimeError(f"No detached hand vertices for {group_name}")
    return sum(points, Vector()) / len(points)


def power_hand_world_rotation(human, hand, controller, remap, used):
    pivot = controller.matrix_world.translation.copy()
    finger_axis = (
        weighted_group_center(human, hand, remap, used, "middle_03_l") - pivot
    ).normalized()
    across = (
        weighted_group_center(human, hand, remap, used, "index_01_l")
        - weighted_group_center(human, hand, remap, used, "pinky_01_l")
    ).normalized()
    palm_normal = finger_axis.cross(across).normalized()
    target_finger = Vector((0.0, 0.0, 1.0))
    target_palm = Vector((0.0, -1.0, 0.0))

    raise_rotation = finger_axis.rotation_difference(target_finger)
    raised_palm = raise_rotation @ palm_normal
    raised_palm -= target_finger * raised_palm.dot(target_finger)
    raised_palm.normalize()
    target_palm -= target_finger * target_palm.dot(target_finger)
    target_palm.normalize()
    twist = math.atan2(
        target_finger.dot(raised_palm.cross(target_palm)),
        raised_palm.dot(target_palm),
    )
    return Quaternion(target_finger, twist) @ raise_rotation


def build_hand_action(human, hand, controller, rig, power_action, remap, used):
    basis = controller.matrix_basis.copy()
    controller.rotation_mode = "QUATERNION"
    controller.matrix_basis = basis
    base_basis = controller.matrix_basis.copy()
    action = create_action(HAND_ACTION_NAME, controller, paired_action=POWER_ACTION_NAME)
    action["wizard_power_stage"] = "detached_wrist_rotation"

    rig.animation_data.action = power_action
    for frame, amount in HAND_KEYS:
        bpy.context.scene.frame_set(frame)
        controller.matrix_basis = base_basis
        bpy.context.view_layer.update()
        full_rotation = power_hand_world_rotation(
            human, hand, controller, remap, used
        )
        partial = Quaternion().slerp(full_rotation, amount)
        pivot = controller.matrix_world.translation.copy()
        controller.matrix_world = (
            Matrix.Translation(pivot)
            @ partial.to_matrix().to_4x4()
            @ Matrix.Translation(-pivot)
            @ controller.matrix_world
        )
        bpy.context.view_layer.update()
        controller.keyframe_insert("location", frame=frame)
        controller.keyframe_insert("rotation_quaternion", frame=frame)
        controller.keyframe_insert("scale", frame=frame)
    for label, frame in (
        ("Hand Follows Arm", 24),
        ("Palm Turn", 31),
        ("Palm Hold", 38),
        ("Wrist Return", 45),
        ("End", 52),
    ):
        marker = action.pose_markers.new(label)
        marker.frame = frame
    polish_curves(action)
    controller["wizard_power_base_location"] = list(base_basis.to_translation())
    controller["wizard_power_base_rotation_quaternion"] = list(
        base_basis.to_quaternion()
    )
    controller["wizard_power_base_scale"] = list(base_basis.to_scale())
    return action, base_basis


def build_orb_action(controller):
    if controller is None:
        return None
    idle_action = bpy.data.actions.get("Wizard_Idle_Orbs")
    controller.animation_data_create()
    controller.animation_data.action = idle_action
    bpy.context.scene.frame_set(1)
    base_location = controller.location.copy()
    base_rotation = controller.rotation_euler.copy()
    base_scale = controller.scale.copy()
    action = create_action(ORB_ACTION_NAME, controller, paired_action=POWER_ACTION_NAME)
    keys = (
        (1, 0.0, 0.0, 1.0),
        (24, 0.020, 10.0, 1.10),
        (31, 0.040, 18.0, 1.20),
        (38, 0.040, 24.0, 1.20),
        (45, 0.015, 14.0, 1.08),
        (52, 0.0, 0.0, 1.0),
    )
    for frame, lift, angle, radius in keys:
        controller.location = base_location + Vector((0.0, 0.0, lift))
        rotation_delta = (0.0, 0.0, math.radians(angle))
        controller.rotation_euler = tuple(
            base_rotation[index] + rotation_delta[index] for index in range(3)
        )
        controller.scale = (
            base_scale.x * radius,
            base_scale.y * radius,
            base_scale.z,
        )
        controller.keyframe_insert("location", frame=frame)
        controller.keyframe_insert("rotation_euler", frame=frame)
        controller.keyframe_insert("scale", frame=frame)
    polish_curves(action)
    return action


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def ensure_review_camera(name, location, target, lens):
    camera = bpy.data.objects.get(name)
    if camera is None:
        data = bpy.data.cameras.new(name)
        camera = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    camera.data.lens = lens
    look_at(camera, target)
    camera["wizard_power_asset"] = True
    return camera


def main():
    scene = bpy.context.scene
    human = bpy.data.objects[BODY_NAME]
    rig = find_rig(human)
    previous_frame = scene.frame_current
    previous_rig_action = (
        rig.animation_data.action.name
        if rig.animation_data and rig.animation_data.action
        else None
    )

    idle_action = bpy.data.actions["Wizard_Idle"]
    rig.animation_data_create()
    rig.animation_data.action = idle_action
    scene.frame_set(1)
    idle_pose = capture_pose(rig)

    hand, hand_controller, remap, used, boundary_data = extract_native_left_hand(
        human, rig
    )
    stage1_action = build_rig_action(
        rig, idle_pose, STAGE1_ACTION_NAME, "arm_raise_only"
    )
    power_action = build_rig_action(
        rig, idle_pose, POWER_ACTION_NAME, "arm_raise_and_hold"
    )
    power_action["wizard_paired_hand_action"] = HAND_ACTION_NAME
    hand_action, hand_base_basis = build_hand_action(
        human, hand, hand_controller, rig, power_action, remap, used
    )
    orb_controller = bpy.data.objects.get("Wizard_Orbital_Controller")
    orb_action = build_orb_action(orb_controller)

    ensure_review_camera(
        "Power Review Front", (1.9, -4.5, 2.15), (0.05, -0.16, 1.08), 68
    )
    ensure_review_camera(
        "Power Review Side", (3.6, -1.35, 2.05), (0.1, -0.20, 1.10), 70
    )
    ensure_review_camera(
        "Power Review Tactical", (3.0, -4.0, 4.0), (0.05, -0.15, 0.95), 72
    )

    rig.animation_data.action = power_action
    hand_controller.animation_data.action = hand_action
    if orb_controller and orb_action:
        orb_controller.animation_data.action = orb_action
    staff = bpy.data.objects.get("Wizard_Staff_Controller")
    if staff and "Wizard_Staff_Idle" in bpy.data.actions:
        staff.animation_data_create()
        staff.animation_data.action = bpy.data.actions["Wizard_Staff_Idle"]
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.frame_set(1)
    scene["wizard_active_clip"] = "POWER"
    scene.camera = bpy.data.objects["Power Review Front"]

    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(
        json.dumps(
            {
                "blend": bpy.data.filepath,
                "rig": rig.name,
                "actions": [
                    stage1_action.name,
                    power_action.name,
                    hand_action.name,
                    orb_action.name if orb_action else None,
                ],
                "objects": [
                    hand.name,
                    hand_controller.name,
                    HINGE_NAME,
                    CUFF_NAME,
                ],
                "hand_vertices": len(hand.data.vertices),
                "hand_faces": len(hand.data.polygons),
                "wrist_pivot": list(hand_controller["wizard_power_pivot_frame1"]),
                "boundary_components": [
                    {"projection": item[0], "size": item[2]}
                    for item in boundary_data
                ],
                "frames": [FRAME_START, FRAME_END],
                "previous_frame": previous_frame,
                "previous_action": previous_rig_action,
            },
            indent=2,
        )
    )


main()
