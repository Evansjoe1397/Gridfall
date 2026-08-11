import bpy
import collections
import json
import os
from pathlib import Path
from mathutils import Vector


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
OUTPUT = ROOT / "output" / "power_reviews" / "final"
FRAMES = (1, 15, 24, 31, 38, 45, 52)
QUICK = os.environ.get("POWER_REVIEW_QUICK") == "1"


def find_rig(human):
    for modifier in human.modifiers:
        if modifier.type == "ARMATURE" and modifier.object:
            return modifier.object
    raise RuntimeError("Wizard rig was not found")


def hand_topology_map(human):
    names = ["hand_l"] + [
        f"{finger}_{segment:02d}_l"
        for finger in ("thumb", "index", "middle", "ring", "pinky")
        for segment in (1, 2, 3)
    ]
    group_indices = {
        group.index for group in human.vertex_groups if group.name in names
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
    return {old: new for new, old in enumerate(used)}, used


def weighted_center(human, hand, remap, used, group_name):
    group_index = human.vertex_groups[group_name].index
    points = []
    for source_index in used:
        if any(
            assignment.group == group_index and assignment.weight > 0.05
            for assignment in human.data.vertices[source_index].groups
        ):
            points.append(
                hand.matrix_world @ hand.data.vertices[remap[source_index]].co
            )
    return sum(points, Vector()) / len(points)


def anatomical_axes(human, hand, controller, remap, used):
    pivot = controller.matrix_world.translation.copy()
    finger = (
        weighted_center(human, hand, remap, used, "middle_03_l") - pivot
    ).normalized()
    across = (
        weighted_center(human, hand, remap, used, "index_01_l")
        - weighted_center(human, hand, remap, used, "pinky_01_l")
    ).normalized()
    palm = finger.cross(across).normalized()
    return finger, palm


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


def wrist_boundary_distance(hand, controller):
    pivot = controller.matrix_world.translation.copy()
    centers = []
    for component in boundary_components(hand.data):
        center = sum((hand.data.vertices[index].co for index in component), Vector())
        center /= len(component)
        centers.append(hand.matrix_world @ center)
    return min((center - pivot).length for center in centers)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def ensure_hand_camera():
    scene = bpy.context.scene
    name = "Power Review Hand Close"
    camera = bpy.data.objects.get(name)
    if camera is None:
        data = bpy.data.cameras.new(name)
        camera = bpy.data.objects.new(name, data)
        scene.collection.objects.link(camera)
    camera.location = (1.25, -2.25, 1.72)
    camera.data.lens = 92
    look_at(camera, (0.34, -0.43, 1.34))
    return camera


def activate_actions(rig, hand_controller):
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions["Wizard_Power"]
    hand_controller.animation_data_create()
    hand_controller.animation_data.action = bpy.data.actions[
        "Wizard_Power_LeftHand_Action"
    ]
    orbs = bpy.data.objects.get("Wizard_Orbital_Controller")
    if orbs:
        orbs.animation_data_create()
        orbs.animation_data.action = bpy.data.actions.get("Wizard_Power_Orbs")
    staff = bpy.data.objects.get("Wizard_Staff_Controller")
    if staff:
        staff.animation_data_create()
        staff.animation_data.action = bpy.data.actions.get("Wizard_Staff_Idle")


def reset_hand_controller(hand_controller):
    hand_controller.animation_data_create()
    hand_controller.animation_data.action = None
    hand_controller.rotation_mode = "QUATERNION"
    hand_controller.location = hand_controller["wizard_power_base_location"]
    hand_controller.rotation_quaternion = hand_controller[
        "wizard_power_base_rotation_quaternion"
    ]
    hand_controller.scale = hand_controller["wizard_power_base_scale"]


def activate_existing_clip(rig, hand_controller, clip):
    specs = {
        "idle": ("Wizard_Idle", "Wizard_Idle_Orbs", "Wizard_Staff_Idle", 1),
        "walk": ("Wizard_Walk", "Wizard_Walk_Orbs", "Wizard_Staff_Walk", 17),
        "attack": (
            "Wizard_Attack",
            "Wizard_Attack_Orbs",
            "Wizard_Staff_Attack",
            26,
        ),
    }
    rig_action, orb_action, staff_action, frame = specs[clip]
    rig.animation_data.action = bpy.data.actions[rig_action]
    reset_hand_controller(hand_controller)
    orbs = bpy.data.objects.get("Wizard_Orbital_Controller")
    if orbs:
        orbs.animation_data.action = bpy.data.actions.get(orb_action)
    staff = bpy.data.objects.get("Wizard_Staff_Controller")
    if staff:
        staff.animation_data.action = bpy.data.actions.get(staff_action)
    bpy.context.scene.frame_set(frame)
    return frame


def face_relative_positions(rig):
    head_world = rig.matrix_world @ rig.pose.bones["head"].matrix
    inverse_head = head_world.inverted()
    names = (
        "Face_Eye_L",
        "Face_Eye_R",
        "Face_Iris_L",
        "Face_Iris_R",
        "Face_Brow_L",
        "Face_Brow_R",
    )
    return {
        name: inverse_head @ bpy.data.objects[name].matrix_world.translation
        for name in names
        if name in bpy.data.objects
    }


def render_frame(camera_name, frame, suffix):
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.camera = bpy.data.objects[camera_name]
    path = OUTPUT / f"{suffix}_f{frame:02d}.png"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return str(path)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    human = bpy.data.objects["Wizard_Base_Mesh"]
    rig = find_rig(human)
    hand = bpy.data.objects["Wizard_Power_LeftHand"]
    hand_controller = bpy.data.objects["Wizard_Power_LeftHand_Controller"]
    remap, used = hand_topology_map(human)
    activate_actions(rig, hand_controller)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    close_camera = ensure_hand_camera()
    rendered = []
    metrics = {}
    scene.frame_set(1)
    face_reference = face_relative_positions(rig)
    review_frames = (1, 24, 31, 38, 52) if QUICK else FRAMES
    for frame in review_frames:
        scene.frame_set(frame)
        finger, palm = anatomical_axes(
            human, hand, hand_controller, remap, used
        )
        face_positions = face_relative_positions(rig)
        face_drift = {
            name: (position - face_reference[name]).length
            for name, position in face_positions.items()
        }
        metrics[str(frame)] = {
            "shoulder": list(rig.matrix_world @ rig.pose.bones["upperarm_l"].head),
            "elbow": list(rig.matrix_world @ rig.pose.bones["upperarm_l"].tail),
            "wrist_bone": list(
                rig.matrix_world @ rig.pose.bones["lowerarm_l"].tail
            ),
            "wrist_pivot": list(hand_controller.matrix_world.translation),
            "finger_axis": list(finger),
            "palmar_normal": list(palm),
            "wrist_boundary_distance": wrist_boundary_distance(
                hand, hand_controller
            ),
            "max_face_relative_drift": max(face_drift.values(), default=0.0),
        }
        rendered.append(render_frame("Power Review Front", frame, "front"))

    side_frames = (31, 38) if QUICK else (24, 31, 38, 45)
    for frame in side_frames:
        rendered.append(render_frame("Power Review Side", frame, "side"))
    close_frames = (31, 38) if QUICK else (24, 31, 38)
    for frame in close_frames:
        rendered.append(render_frame(close_camera.name, frame, "hand_close"))
    rendered.append(render_frame("Power Review Tactical", 38, "tactical"))

    compatibility = {}
    if not QUICK:
        for clip in ("idle", "walk", "attack"):
            frame = activate_existing_clip(rig, hand_controller, clip)
            path = render_frame("Power Review Front", frame, f"compat_{clip}")
            compatibility[clip] = {"frame": frame, "render": path}
        activate_actions(rig, hand_controller)
        scene.frame_set(1)

    action = bpy.data.actions["Wizard_Power"]
    hand_action = bpy.data.actions["Wizard_Power_LeftHand_Action"]
    report = {
        "blend": bpy.data.filepath,
        "actions": {
            "rig": action.name,
            "hand": hand_action.name,
            "orbs": "Wizard_Power_Orbs",
            "loop": bool(action.get("wizard_loop", True)),
            "frame_range": [int(action.frame_start), int(action.frame_end)],
        },
        "metrics": metrics,
        "compatibility": compatibility,
        "renders": rendered,
    }
    (OUTPUT / "audit_metrics.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


main()
