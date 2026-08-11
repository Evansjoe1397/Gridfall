import bpy
import bmesh
import math
import numpy as np
from mathutils import Matrix, Vector


BODY_NAME = "Wizard_Base_Mesh"
SOURCE_NAME = "V2_Source_BalanceK70"
CONTROLLER_NAME = "Wizard_Staff_Controller"
CANDIDATE_PREFIX = "Wizard_GripV2_"
WRIST_AXIS = Vector((0.56219, 0.80768, -0.17777)).normalized()
HAND_WRIST_CUT_POINT = Vector((-0.4382, -0.1111, 1.0009))

FINGERS = ("index", "middle", "ring", "pinky")
SEGMENT_GROUPS = tuple(
    f"{finger}_{segment:02d}_r"
    for finger in FINGERS
    for segment in range(1, 4)
)
THUMB_GROUPS = tuple(f"thumb_{segment:02d}_r" for segment in range(1, 4))
DEFORM_GROUPS = ("hand_r",) + THUMB_GROUPS + SEGMENT_GROUPS

VARIANTS = {
    "A": {
        "angles": {
            "index": (-142.0, -178.0, -216.0),
            "middle": (-144.0, -180.0, -217.0),
            "ring": (-145.0, -181.0, -218.0),
            "pinky": (-146.0, -178.0, -210.0),
        },
        "radii": {
            "index": (0.046, 0.038, 0.034),
            "middle": (0.049, 0.040, 0.035),
            "ring": (0.046, 0.038, 0.034),
            "pinky": (0.038, 0.033, 0.030),
        },
    },
    "B": {
        "angles": {
            "index": (-140.0, -174.0, -208.0),
            "middle": (-142.0, -178.0, -214.0),
            "ring": (-144.0, -182.0, -220.0),
            "pinky": (-146.0, -187.0, -228.0),
        },
        "radii": {
            "index": (0.048, 0.045, 0.042),
            "middle": (0.051, 0.047, 0.043),
            "ring": (0.048, 0.044, 0.040),
            "pinky": (0.040, 0.037, 0.034),
        },
    },
    "C": {
        "angles": {
            "index": (-144.0, -182.0, -220.0),
            "middle": (-146.0, -185.0, -224.0),
            "ring": (-148.0, -188.0, -228.0),
            "pinky": (-150.0, -191.0, -232.0),
        },
        "radii": {
            "index": (0.046, 0.043, 0.040),
            "middle": (0.049, 0.045, 0.041),
            "ring": (0.046, 0.042, 0.038),
            "pinky": (0.038, 0.035, 0.032),
        },
    },
    "D": {
        "angles": {
            "index": (-144.0, -105.0, -66.0),
            "middle": (-145.0, -103.0, -61.0),
            "ring": (-146.0, -102.0, -58.0),
            "pinky": (-147.0, -108.0, -69.0),
        },
        "radii": {
            "index": (0.046, 0.038, 0.034),
            "middle": (0.049, 0.040, 0.035),
            "ring": (0.046, 0.038, 0.034),
            "pinky": (0.038, 0.033, 0.030),
        },
        "height_offsets": {
            "index": (0.0, 0.0, 0.0),
            "middle": (0.0, 0.001, 0.0015),
            "ring": (0.0, 0.0025, 0.004),
            "pinky": (0.0, 0.006, 0.010),
        },
        "chain_head_offsets": {
            "pinky": (-0.007, -0.002, 0.004),
        },
    },
}


def remove_object(obj):
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data and data.users == 0:
        bpy.data.meshes.remove(data)


def ensure_polish_collection():
    collection = bpy.data.collections.get("Wizard_Polish")
    if collection is None:
        collection = bpy.data.collections.new("Wizard_Polish")
        bpy.context.scene.collection.children.link(collection)
    return collection


def source_rows(body):
    group_indices = {
        name: body.vertex_groups[name].index for name in DEFORM_GROUPS
    }
    body_group = body.vertex_groups["body"].index
    rows = []
    original_indices = []
    for vertex in body.data.vertices:
        weights = {element.group: element.weight for element in vertex.groups}
        hand_weight = sum(weights.get(index, 0.0) for index in group_indices.values())
        if weights.get(body_group, 0.0) > 0.001 and hand_weight > 0.001:
            rows.append(weights)
            original_indices.append(vertex.index)
    return group_indices, rows, original_indices


def weighted_centers(points, group_indices, rows):
    centers = {}
    for name, group_index in group_indices.items():
        center = Vector()
        total = 0.0
        for point, weights in zip(points, rows):
            weight = weights.get(group_index, 0.0)
            if weight > 0.01:
                center += point * weight
                total += weight
        centers[name] = center / max(total, 1e-8)
    return centers


def native_points_in_grip_frame(body, frame_source, group_indices, rows, original_indices):
    native = np.array([
        tuple(body.matrix_world @ body.data.vertices[index].co)
        for index in original_indices
    ])
    framed = np.array([tuple(vertex.co) for vertex in frame_source.data.vertices])
    hand_index = group_indices["hand_r"]
    finger_indices = {
        group_indices[name] for name in THUMB_GROUPS + SEGMENT_GROUPS
    }
    fit_weights = []
    for weights in rows:
        hand_weight = weights.get(hand_index, 0.0)
        finger_weight = sum(weights.get(index, 0.0) for index in finger_indices)
        fit_weights.append(max(0.0, hand_weight - 0.65 * finger_weight))
    fit_weights = np.array(fit_weights)
    mask = fit_weights > 0.12
    weights = fit_weights[mask]
    weights /= weights.sum()
    source = native[mask]
    target = framed[mask]
    source_center = (source * weights[:, None]).sum(axis=0)
    target_center = (target * weights[:, None]).sum(axis=0)
    source_zero = source - source_center
    target_zero = target - target_center
    covariance = (source_zero * weights[:, None]).T @ target_zero
    u, _, vt = np.linalg.svd(covariance)
    rotation = vt.T @ u.T
    if np.linalg.det(rotation) < 0.0:
        vt[-1] *= -1.0
        rotation = vt.T @ u.T
    translation = target_center - source_center @ rotation.T
    transformed = native @ rotation.T + translation
    residual = np.linalg.norm(transformed[mask] - target, axis=1)
    print({
        "palm_fit_vertices": int(mask.sum()),
        "palm_fit_median_mm": round(float(np.median(residual)) * 1000.0, 3),
        "palm_fit_p95_mm": round(float(np.quantile(residual, 0.95)) * 1000.0, 3),
    })
    return [Vector(point) for point in transformed]


def shaft_points():
    shaft = bpy.data.objects["Staff_Shaft"]
    points = []
    for spline in shaft.data.splines:
        if spline.type == "BEZIER":
            local_points = [point.co for point in spline.bezier_points]
        else:
            local_points = [point.co.to_3d() for point in spline.points]
        points.extend(shaft.matrix_world @ point for point in local_points)
    return sorted(points, key=lambda point: point.z)


def shaft_center_at(height, points):
    for lower, upper in zip(points, points[1:]):
        if lower.z <= height <= upper.z:
            factor = (height - lower.z) / max(upper.z - lower.z, 1e-8)
            return lower.lerp(upper, factor)
    return min(points, key=lambda point: abs(point.z - height)).copy()


def target_centers(variant, source_centers):
    points = shaft_points()
    targets = {"hand_r": source_centers["hand_r"].copy()}
    directions = {}
    thumb_angles = (58.0, -8.0, -96.0)
    thumb_radii = (0.043, 0.039, 0.036)
    thumb_start_z = source_centers["thumb_01_r"].z
    thumb_heights = (
        thumb_start_z + 0.003,
        thumb_start_z - 0.002,
        thumb_start_z - 0.007,
    )
    thumb_ideal = []
    for name, angle_degrees, radius, height in zip(
        THUMB_GROUPS, thumb_angles, thumb_radii, thumb_heights
    ):
        source = source_centers[name]
        shaft = shaft_center_at(height, points)
        angle = math.radians(angle_degrees)
        thumb_ideal.append(Vector((
            shaft.x + radius * math.cos(angle),
            shaft.y + radius * math.sin(angle),
            height,
        )))
    thumb_source = [source_centers[name] for name in THUMB_GROUPS]
    thumb_targets = [thumb_ideal[0]]
    for index in range(2):
        source_length = (thumb_source[index + 1] - thumb_source[index]).length
        direction = (thumb_ideal[index + 1] - thumb_ideal[index]).normalized()
        thumb_targets.append(thumb_targets[-1] + direction * source_length)
        directions[f"thumb_{index + 1:02d}_r"] = direction
    directions["thumb_03_r"] = (
        Matrix.Rotation(math.radians(-22.0), 4, "Z")
        @ directions["thumb_02_r"]
    ).normalized()
    for name, target in zip(THUMB_GROUPS, thumb_targets):
        targets[name] = target
    for finger in FINGERS:
        angles = variant["angles"][finger]
        radii = variant["radii"][finger]
        height_offsets = variant.get("height_offsets", {}).get(
            finger, (0.0, 0.0, 0.0)
        )
        ideal = []
        for segment, (angle_degrees, radius, height_offset) in enumerate(
            zip(angles, radii, height_offsets), 1
        ):
            name = f"{finger}_{segment:02d}_r"
            source = source_centers[name]
            target_height = source.z + height_offset
            shaft = shaft_center_at(target_height, points)
            angle = math.radians(angle_degrees)
            ideal.append(Vector((
                shaft.x + radius * math.cos(angle),
                shaft.y + radius * math.sin(angle),
                target_height,
            )))
        source_chain = [
            source_centers[f"{finger}_{segment:02d}_r"] for segment in range(1, 4)
        ]
        target_chain = [ideal[0]]
        for index in range(2):
            source_length = (source_chain[index + 1] - source_chain[index]).length
            direction = (ideal[index + 1] - ideal[index]).normalized()
            target_chain.append(target_chain[-1] + direction * source_length)
            directions[f"{finger}_{index + 1:02d}_r"] = direction
        directions[f"{finger}_03_r"] = (
            Matrix.Rotation(math.radians(angles[2] - angles[1]), 4, "Z")
            @ directions[f"{finger}_02_r"]
        ).normalized()
        for segment, target in enumerate(target_chain, 1):
            targets[f"{finger}_{segment:02d}_r"] = target
    head_offsets = {
        name: Vector(offset)
        for name, offset in variant.get("chain_head_offsets", {}).items()
    }
    return targets, directions, head_offsets


def tangent(centers, prefix, segment):
    first = centers[f"{prefix}_{segment:02d}_r"]
    if segment < 3:
        second = centers[f"{prefix}_{segment + 1:02d}_r"]
    else:
        second = first + (
            centers[f"{prefix}_03_r"] - centers[f"{prefix}_02_r"]
        )
    return second - first


def group_transforms(source_centers, targets, target_directions):
    transforms = {"hand_r": Matrix.Identity(4)}
    for finger in ("thumb",) + FINGERS:
        for segment in range(1, 4):
            name = f"{finger}_{segment:02d}_r"
            source_direction = tangent(source_centers, finger, segment)
            target_direction = target_directions[name]
            rotation = source_direction.rotation_difference(target_direction).to_matrix().to_4x4()
            transforms[name] = (
                Matrix.Translation(targets[name])
                @ rotation
                @ Matrix.Translation(-source_centers[name])
            )
    return transforms


def preserve_world_parent(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.parent_type = "OBJECT"
    obj.parent_bone = ""
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ world


def create_hand_rig(
    candidate,
    source_centers,
    target_directions,
    chain_head_offsets,
    group_indices,
    rows,
):
    armature_data = bpy.data.armatures.new("Wizard_GripV2_TempRig_Data")
    armature = bpy.data.objects.new("Wizard_GripV2_TempRig", armature_data)
    ensure_polish_collection().objects.link(armature)
    armature.show_in_front = True

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    root = armature_data.edit_bones.new("hand_r")
    root.head = source_centers["hand_r"]
    root.tail = source_centers["hand_r"] + Vector((0.0, 0.0, 0.035))
    root.use_deform = True

    joints = {}
    for finger in ("thumb",) + FINGERS:
        centers = [
            source_centers[f"{finger}_{segment:02d}_r"]
            for segment in range(1, 4)
        ]
        finger_joints = [
            centers[0] - (centers[1] - centers[0]) * 0.5,
            (centers[0] + centers[1]) * 0.5,
            (centers[1] + centers[2]) * 0.5,
            centers[2] + (centers[2] - centers[1]) * 0.5,
        ]
        joints[finger] = finger_joints
        parent = root
        for segment in range(1, 4):
            bone = armature_data.edit_bones.new(f"{finger}_{segment:02d}_r")
            bone.head = finger_joints[segment - 1]
            bone.tail = finger_joints[segment]
            bone.parent = parent
            bone.use_connect = segment > 1
            bone.use_deform = True
            parent = bone
    bpy.ops.object.mode_set(mode="POSE")

    for finger in ("thumb",) + FINGERS:
        head = joints[finger][0] + chain_head_offsets.get(finger, Vector())
        for segment in range(1, 4):
            name = f"{finger}_{segment:02d}_r"
            pose_bone = armature.pose.bones[name]
            length = (joints[finger][segment] - joints[finger][segment - 1]).length
            direction = target_directions[name].normalized()
            orientation = direction.to_track_quat("Y", "Z").to_matrix().to_4x4()
            pose_bone.matrix = Matrix.Translation(head) @ orientation
            head = head + direction * length
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")

    for name, group_index in group_indices.items():
        vertex_group = candidate.vertex_groups.new(name=name)
        for vertex_index, weights in enumerate(rows):
            weight = weights.get(group_index, 0.0)
            if weight > 0.0001:
                vertex_group.add((vertex_index,), weight, "REPLACE")

    modifier = candidate.modifiers.new("Preserve-volume native hand curl", "ARMATURE")
    modifier.object = armature
    modifier.use_deform_preserve_volume = True
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = candidate.evaluated_get(depsgraph)
    baked_mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
    old_mesh = candidate.data
    candidate.modifiers.clear()
    candidate.data = baked_mesh
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    armature_data = armature.data
    bpy.data.objects.remove(armature, do_unlink=True)
    if armature_data.users == 0:
        bpy.data.armatures.remove(armature_data)


def trim_wrist_and_finish(candidate, controller):
    plane_point = HAND_WRIST_CUT_POINT
    mesh = candidate.data
    editable = bmesh.new()
    editable.from_mesh(mesh)
    result = bmesh.ops.bisect_plane(
        editable,
        geom=list(editable.verts) + list(editable.edges) + list(editable.faces),
        dist=0.00005,
        plane_co=plane_point,
        plane_no=WRIST_AXIS,
        clear_outer=True,
        clear_inner=False,
    )
    cut_edges = [
        element
        for element in result.get("geom_cut", ())
        if isinstance(element, bmesh.types.BMEdge) and len(element.link_faces) == 1
    ]
    if cut_edges:
        bmesh.ops.holes_fill(editable, edges=cut_edges, sides=0)
    bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
    editable.to_mesh(mesh)
    editable.free()
    mesh.update()

    bpy.context.view_layer.objects.active = candidate
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    candidate.select_set(True)
    subdivision = candidate.modifiers.new("Hand close-up smoothing", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    for polygon in candidate.data.polygons:
        polygon.use_smooth = True


def build_candidate(variant_name):
    body = bpy.data.objects[BODY_NAME]
    source = bpy.data.objects[SOURCE_NAME]
    controller = bpy.data.objects[CONTROLLER_NAME]
    group_indices, rows, original_indices = source_rows(body)
    if len(rows) != len(source.data.vertices):
        raise RuntimeError(
            f"Native hand mapping mismatch: {len(rows)} rows for "
            f"{len(source.data.vertices)} vertices"
        )

    native_points = native_points_in_grip_frame(
        body, source, group_indices, rows, original_indices
    )
    source_centers = weighted_centers(native_points, group_indices, rows)
    targets, target_directions, chain_head_offsets = target_centers(
        VARIANTS[variant_name], source_centers
    )
    for obj in tuple(bpy.data.objects):
        if obj.name.startswith(CANDIDATE_PREFIX):
            remove_object(obj)

    candidate = source.copy()
    candidate.data = source.data.copy()
    candidate.name = f"{CANDIDATE_PREFIX}{variant_name}"
    ensure_polish_collection().objects.link(candidate)
    candidate.matrix_world = source.matrix_world.copy()
    candidate.hide_viewport = False
    candidate.hide_render = False

    for vertex, point in zip(candidate.data.vertices, native_points):
        vertex.co = point

    create_hand_rig(
        candidate,
        source_centers,
        target_directions,
        chain_head_offsets,
        group_indices,
        rows,
    )
    trim_wrist_and_finish(candidate, controller)

    for polygon in candidate.data.polygons:
        polygon.use_smooth = True
    candidate["wizard_grip_variant"] = variant_name
    candidate["wizard_grip_source"] = "native MPFB right hand"
    candidate["wizard_grip_method"] = "temporary preserve-volume FK hand rig"
    preserve_world_parent(candidate, controller)

    old_hand = bpy.data.objects.get("Wizard_StaffGrip_AnatomicalHand_R")
    old_bearing = bpy.data.objects.get("Wizard_Wrist_Bearing_R")
    if old_hand:
        old_hand.hide_viewport = True
        old_hand.hide_render = True
    if old_bearing:
        old_bearing.hide_viewport = True
        old_bearing.hide_render = True
    bpy.context.view_layer.update()
    return candidate, source_centers, targets


def main():
    variant_name = globals().get("WIZARD_GRIP_V2_VARIANT", "A")
    scene = bpy.context.scene
    if bpy.context.screen and bpy.context.screen.is_animation_playing:
        bpy.ops.screen.animation_cancel(restore_frame=False)
    controller = bpy.data.objects[CONTROLLER_NAME]
    controller.animation_data_create()
    controller.animation_data.action = bpy.data.actions.get("Wizard_Staff_Idle")
    body = bpy.data.objects[BODY_NAME]
    rig = next(
        modifier.object
        for modifier in body.modifiers
        if modifier.type == "ARMATURE" and modifier.object
    )
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions.get("Wizard_Idle")
    scene.frame_set(1)
    bpy.context.view_layer.update()
    candidate, source_centers, targets = build_candidate(variant_name)
    print({
        "candidate": candidate.name,
        "vertices": len(candidate.data.vertices),
        "faces": len(candidate.data.polygons),
        "dimensions": tuple(round(value, 4) for value in candidate.dimensions),
        "wrist_bearing_hidden": True,
        "segment_travel": {
            name: round((targets[name] - source_centers[name]).length, 4)
            for name in SEGMENT_GROUPS
        },
    })


main()
