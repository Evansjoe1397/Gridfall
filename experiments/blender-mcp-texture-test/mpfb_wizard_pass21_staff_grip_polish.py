import bpy
from mathutils import Vector


SOURCE_NAME = "Wizard_GripV2_D"
FINAL_NAME = "Wizard_Grip_Final_R"
WRIST_ANCHOR_NAME = "Wizard_Staff_Wrist_Anchor"
PALM_CENTER = Vector((-0.47676, -0.18347, 1.04473))
HAND_DROP = Vector((0.0, 0.0, -0.015))


def copy_source():
    source = bpy.data.objects[SOURCE_NAME]
    previous = bpy.data.objects.get(FINAL_NAME)
    if previous is not None:
        bpy.data.objects.remove(previous, do_unlink=True)
    result = source.copy()
    result.data = source.data.copy()
    source.users_collection[0].objects.link(result)
    result.name = FINAL_NAME
    result.hide_viewport = False
    result.hide_render = False
    return result


def group_ids(obj, prefixes):
    return {
        group.index
        for group in obj.vertex_groups
        if any(group.name.startswith(prefix) for prefix in prefixes)
    }


def sculpt_palm_and_wrist(obj):
    anchor = bpy.data.objects[WRIST_ANCHOR_NAME].matrix_world.translation
    axis = (anchor - PALM_CENTER).normalized()
    finger_ids = group_ids(obj, ("index_", "middle_", "ring_", "pinky_"))
    thumb_ids = group_ids(obj, ("thumb_",))
    hand_id = obj.vertex_groups["hand_r"].index
    inverse = obj.matrix_world.inverted()

    for vertex in obj.data.vertices:
        hand_weight = 0.0
        digit_weight = 0.0
        for assignment in vertex.groups:
            if assignment.group == hand_id:
                hand_weight += assignment.weight
            elif assignment.group in finger_ids or assignment.group in thumb_ids:
                digit_weight += assignment.weight
        ratio = hand_weight / max(hand_weight + digit_weight, 1e-8)
        influence = max(0.0, min(1.0, (ratio - 0.55) / 0.35))
        if influence <= 0.0:
            continue

        point = obj.matrix_world @ vertex.co
        relative = point - PALM_CENTER
        distance = relative.dot(axis)
        radial = relative - axis * distance
        radial_length = radial.length
        target_distance = max(-0.026, min(0.030, distance))
        target_radius = min(radial_length, 0.036)
        if target_distance > 0.012:
            taper = 1.0 - 0.55 * ((target_distance - 0.012) / 0.018)
            target_radius *= max(0.45, taper)
        target = PALM_CENTER + axis * target_distance
        if radial_length > 1e-8:
            target += radial.normalized() * target_radius
        vertex.co = inverse @ point.lerp(target, influence * 0.9)


def move_thumb(obj):
    obj.matrix_world.translation += HAND_DROP
    bpy.context.view_layer.update()
    inverse_rotation = obj.matrix_world.to_3x3().inverted()
    deltas = {
        "thumb_01_r": Vector((0.000, 0.000, 0.001)),
        "thumb_02_r": Vector((-0.001, -0.002, 0.008)),
        "thumb_03_r": Vector((0.001, -0.003, 0.016)),
    }
    delta_by_group = {
        obj.vertex_groups[name].index: delta for name, delta in deltas.items()
    }
    for vertex in obj.data.vertices:
        world_delta = Vector()
        for assignment in vertex.groups:
            delta = delta_by_group.get(assignment.group)
            if delta is not None:
                world_delta += delta * assignment.weight
        if world_delta.length:
            vertex.co += inverse_rotation @ world_delta

    thumb_ids = group_ids(obj, ("thumb_",))
    center = Vector()
    total = 0.0
    for vertex in obj.data.vertices:
        weight = min(
            1.0,
            sum(
                assignment.weight
                for assignment in vertex.groups
                if assignment.group in thumb_ids
            ),
        )
        if weight > 0.05:
            center += (obj.matrix_world @ vertex.co) * weight
            total += weight
    center /= total
    inverse = obj.matrix_world.inverted()
    shift = Vector((-0.003, -0.001, -0.002))
    for vertex in obj.data.vertices:
        weight = min(
            1.0,
            sum(
                assignment.weight
                for assignment in vertex.groups
                if assignment.group in thumb_ids
            ),
        )
        if weight <= 0.02:
            continue
        point = obj.matrix_world @ vertex.co
        relative = point - center
        shaped = center + Vector(
            (relative.x * 1.05, relative.y * 0.82, relative.z * 0.70)
        )
        vertex.co = inverse @ point.lerp(shaped + shift, weight)


def round_pinky_web(obj):
    hand_id = obj.vertex_groups["hand_r"].index
    pinky_id = obj.vertex_groups["pinky_01_r"].index
    palm = PALM_CENTER + HAND_DROP
    inverse = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        hand_weight = 0.0
        pinky_weight = 0.0
        for assignment in vertex.groups:
            if assignment.group == hand_id:
                hand_weight = assignment.weight
            elif assignment.group == pinky_id:
                pinky_weight = assignment.weight
        influence = min(1.0, hand_weight + pinky_weight)
        point = obj.matrix_world @ vertex.co
        if point.z >= 1.002 or influence <= 0.15:
            continue
        amount = min(1.0, (1.002 - point.z) / 0.014) * influence
        target = point.copy()
        target.z += min(0.008, (1.002 - point.z) * 0.58)
        target.x += (palm.x - point.x) * 0.12 * amount
        target.y += (palm.y - point.y) * 0.12 * amount
        vertex.co = inverse @ point.lerp(target, amount)


def main():
    scene = bpy.context.scene
    rig = bpy.data.objects.get("Wizard_Rig.001")
    staff = bpy.data.objects.get("Wizard_Staff_Controller")
    if rig is not None:
        rig.animation_data_create()
        rig.animation_data.action = bpy.data.actions.get("Wizard_Idle")
    if staff is not None:
        staff.animation_data_create()
        staff.animation_data.action = bpy.data.actions.get("Wizard_Staff_Idle")
    scene.frame_set(1)

    result = copy_source()
    sculpt_palm_and_wrist(result)
    move_thumb(result)
    round_pinky_web(result)
    result.data.update()
    result["wizard_active_staff_grip"] = True
    result["wizard_grip_method"] = "protected native fingers plus localized palm sculpt"

    for obj in bpy.data.objects:
        if obj == result:
            continue
        if obj.name.startswith("Wizard_GripV") or obj.name in {
            "Wizard_StaffGrip_AnatomicalHand_R",
            "Wizard_Wrist_Bearing_R",
            "Wizard_Arm_WristConnector_R",
        }:
            obj.hide_viewport = True
            obj.hide_render = True
    print(
        {
            "active_grip": result.name,
            "vertices": len(result.data.vertices),
            "faces": len(result.data.polygons),
        }
    )


main()
