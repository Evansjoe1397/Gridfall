import bpy
import json
import math
from pathlib import Path


FPS = 30
ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"
BASELINE_PROPERTY = "wizard_animation_baseline_v1"
RECAPTURE_BASELINE = False

RIG_ACTION_NAMES = ("Wizard_Idle", "Wizard_Walk", "Wizard_Attack")
ORB_ACTION_NAMES = (
    "Wizard_Idle_Orbs",
    "Wizard_Walk_Orbs",
    "Wizard_Attack_Orbs",
)


def transform(location=None, rotation=None):
    """Return local-space additive offsets; rotations are expressed in degrees."""
    result = {}
    if location is not None:
        result["location"] = location
    if rotation is not None:
        result["rotation"] = rotation
    return result


def merge_poses(*poses):
    merged = {}
    for pose in poses:
        for bone_name, channels in pose.items():
            target = merged.setdefault(bone_name, {})
            for channel, values in channels.items():
                previous = target.get(channel, (0.0, 0.0, 0.0))
                target[channel] = tuple(a + b for a, b in zip(previous, values))
    return merged


def mirrored_pose(pose, axis_signs=(1.0, -1.0, -1.0)):
    """Mirror an L/R pose while preserving the rig's local Euler convention."""
    mirrored = {}
    for bone_name, channels in pose.items():
        if bone_name.endswith("_l"):
            target_name = bone_name[:-2] + "_r"
        elif bone_name.endswith("_r"):
            target_name = bone_name[:-2] + "_l"
        else:
            target_name = bone_name
        copied = dict(channels)
        if "rotation" in copied:
            copied["rotation"] = tuple(
                value * sign for value, sign in zip(copied["rotation"], axis_signs)
            )
        if "location" in copied:
            copied["location"] = tuple(copied["location"])
        mirrored[target_name] = copied
    return mirrored


IDLE_BASE = {
    "pelvis": transform(rotation=(0.0, 0.0, -0.8)),
    "spine_01": transform(rotation=(-0.5, 0.0, 0.7)),
    "spine_02": transform(rotation=(1.4, 0.0, -0.5)),
    "spine_03": transform(rotation=(-0.8, 0.0, 0.5)),
    "neck_01": transform(rotation=(0.2, 0.0, -0.3)),
    "head": transform(rotation=(-0.8, 0.0, 0.8)),
    "upperarm_l": transform(rotation=(-3.0, 0.0, -33.5)),
    "lowerarm_l": transform(rotation=(-13.0, 0.0, -1.0)),
    "hand_l": transform(rotation=(0.0, 0.0, 4.0)),
    "upperarm_r": transform(rotation=(-2.0, 0.0, -1.2)),
    "lowerarm_r": transform(rotation=(-3.0, 0.0, 0.8)),
}

IDLE_BREATH_IN = {
    "pelvis": transform(location=(0.0, 0.0, 0.006), rotation=(0.2, 0.0, 0.6)),
    "spine_01": transform(rotation=(-0.8, 0.0, -0.5)),
    "spine_02": transform(rotation=(1.8, 0.0, 0.7)),
    "spine_03": transform(rotation=(1.1, 0.0, -0.6)),
    "neck_01": transform(rotation=(-0.3, 0.0, 0.4)),
    "head": transform(rotation=(-0.5, 0.0, -1.0)),
    "clavicle_l": transform(rotation=(0.0, -0.5, 0.0)),
    "clavicle_r": transform(rotation=(0.0, 0.5, 0.0)),
    "upperarm_l": transform(rotation=(-0.8, 0.0, -0.5)),
    "upperarm_r": transform(rotation=(-0.35, 0.0, 0.35)),
    "hand_l": transform(rotation=(0.8, 0.0, -0.5)),
}

IDLE_BREATH_OUT = {
    "pelvis": transform(location=(0.0, 0.0, -0.004), rotation=(-0.2, 0.0, -0.5)),
    "spine_01": transform(rotation=(0.7, 0.0, 0.45)),
    "spine_02": transform(rotation=(-1.3, 0.0, -0.6)),
    "spine_03": transform(rotation=(-0.8, 0.0, 0.5)),
    "neck_01": transform(rotation=(0.25, 0.0, -0.3)),
    "head": transform(rotation=(0.4, 0.0, 0.75)),
    "clavicle_l": transform(rotation=(0.0, 0.35, 0.0)),
    "clavicle_r": transform(rotation=(0.0, -0.35, 0.0)),
    "upperarm_l": transform(rotation=(0.6, 0.0, 0.4)),
    "upperarm_r": transform(rotation=(0.25, 0.0, -0.25)),
    "hand_l": transform(rotation=(-0.6, 0.0, 0.4)),
}

IDLE_KEYS = (
    (1, IDLE_BASE),
    (19, merge_poses(IDLE_BASE, IDLE_BREATH_IN)),
    (37, IDLE_BASE),
    (55, merge_poses(IDLE_BASE, IDLE_BREATH_OUT)),
    (73, IDLE_BASE),
)


WALK_CONTACT_LEFT = {
    "pelvis": transform(location=(0.0, 0.0, 0.008), rotation=(0.0, 0.0, -2.4)),
    "spine_01": transform(rotation=(0.0, 0.0, 1.4)),
    "spine_02": transform(rotation=(1.0, 0.0, 1.4)),
    "spine_03": transform(rotation=(-1.3, 0.0, 1.0)),
    "neck_01": transform(rotation=(0.0, 0.0, -0.6)),
    "head": transform(rotation=(-0.8, 0.0, -1.0)),
    "thigh_l": transform(rotation=(22.0, 0.0, 1.5)),
    "calf_l": transform(rotation=(-8.0, 0.0, 0.0)),
    "foot_l": transform(rotation=(-7.0, 0.0, 0.0)),
    "thigh_r": transform(rotation=(-18.0, 0.0, -1.0)),
    "calf_r": transform(rotation=(31.0, 0.0, 0.0)),
    "foot_r": transform(rotation=(10.0, 0.0, 0.0)),
    "upperarm_l": transform(rotation=(-15.0, 0.0, 2.0)),
    "lowerarm_l": transform(rotation=(-8.0, 0.0, -1.0)),
    "upperarm_r": transform(rotation=(5.0, 0.0, -1.0)),
    "lowerarm_r": transform(rotation=(-4.0, 0.0, 1.0)),
}

WALK_CONTACT_RIGHT = mirrored_pose(WALK_CONTACT_LEFT)
WALK_CONTACT_RIGHT["pelvis"] = transform(
    location=(0.0, 0.0, 0.008), rotation=(0.0, 0.0, 2.4)
)
WALK_CONTACT_RIGHT["spine_01"] = transform(rotation=(0.0, 0.0, -1.4))
WALK_CONTACT_RIGHT["spine_02"] = transform(rotation=(1.0, 0.0, -1.4))
WALK_CONTACT_RIGHT["spine_03"] = transform(rotation=(-1.3, 0.0, -1.0))
WALK_CONTACT_RIGHT["neck_01"] = transform(rotation=(0.0, 0.0, 0.6))
WALK_CONTACT_RIGHT["head"] = transform(rotation=(-0.8, 0.0, 1.0))
# The staff stays in the right hand, so its arm must not inherit the mirrored free-arm swing.
WALK_CONTACT_RIGHT["upperarm_r"] = transform(rotation=(-4.0, 0.0, -1.0))
WALK_CONTACT_RIGHT["lowerarm_r"] = transform(rotation=(-4.0, 0.0, 1.0))
WALK_CONTACT_RIGHT["upperarm_l"] = transform(rotation=(14.0, 0.0, -2.0))
WALK_CONTACT_RIGHT["lowerarm_l"] = transform(rotation=(-10.0, 0.0, 1.0))

WALK_PASSING_LEFT = {
    "pelvis": transform(location=(0.0, 0.0, -0.012), rotation=(0.0, 0.0, 0.0)),
    "spine_02": transform(rotation=(-1.0, 0.0, 0.0)),
    "spine_03": transform(rotation=(1.0, 0.0, 0.0)),
    "head": transform(rotation=(0.8, 0.0, 0.0)),
    "thigh_l": transform(rotation=(-7.0, 0.0, 0.0)),
    "calf_l": transform(rotation=(34.0, 0.0, 0.0)),
    "foot_l": transform(rotation=(-14.0, 0.0, 0.0)),
    "thigh_r": transform(rotation=(7.0, 0.0, 0.0)),
    "calf_r": transform(rotation=(5.0, 0.0, 0.0)),
    "foot_r": transform(rotation=(4.0, 0.0, 0.0)),
    "upperarm_l": transform(rotation=(2.0, 0.0, 0.0)),
    "upperarm_r": transform(rotation=(-2.0, 0.0, 0.0)),
}

WALK_PASSING_RIGHT = mirrored_pose(WALK_PASSING_LEFT)

WALK_UP_LEFT = merge_poses(
    WALK_PASSING_LEFT,
    {
        "pelvis": transform(location=(0.0, 0.0, 0.036), rotation=(0.0, 0.0, -0.9)),
        "spine_02": transform(rotation=(1.2, 0.0, 0.8)),
        "thigh_l": transform(rotation=(-3.0, 0.0, 0.0)),
        "calf_l": transform(rotation=(-8.0, 0.0, 0.0)),
    },
)
WALK_UP_RIGHT = mirrored_pose(WALK_UP_LEFT)

WALK_KEYS = (
    (1, WALK_CONTACT_LEFT),
    (5, WALK_PASSING_LEFT),
    (9, WALK_UP_LEFT),
    (13, WALK_PASSING_RIGHT),
    (17, WALK_CONTACT_RIGHT),
    (21, WALK_PASSING_RIGHT),
    (25, WALK_UP_RIGHT),
    (29, WALK_PASSING_LEFT),
    (33, WALK_CONTACT_LEFT),
)


ATTACK_READY = {
    "pelvis": transform(rotation=(0.0, 0.0, -2.0)),
    "spine_01": transform(rotation=(-1.0, 0.0, 1.5)),
    "spine_02": transform(rotation=(1.5, 0.0, -1.0)),
    "spine_03": transform(rotation=(-1.0, 0.0, 1.0)),
    "head": transform(rotation=(-1.0, 0.0, 1.0)),
    "upperarm_r": transform(rotation=(-5.0, 0.0, -3.0)),
    "lowerarm_r": transform(rotation=(-10.0, 0.0, 2.0)),
    "hand_r": transform(rotation=(3.0, 0.0, -2.0)),
    "upperarm_l": transform(rotation=(-8.0, 0.0, 4.0)),
    "lowerarm_l": transform(rotation=(-15.0, 0.0, -3.0)),
    "hand_l": transform(rotation=(8.0, 0.0, 4.0)),
}

ATTACK_ANTICIPATION = {
    "pelvis": transform(location=(0.0, 0.0, -0.025), rotation=(-2.0, 0.0, -9.0)),
    "spine_01": transform(rotation=(-5.0, 0.0, -5.0)),
    "spine_02": transform(rotation=(-7.0, 0.0, -8.0)),
    "spine_03": transform(rotation=(-4.0, 0.0, -10.0)),
    "neck_01": transform(rotation=(2.0, 0.0, 4.0)),
    "head": transform(rotation=(3.0, 0.0, 8.0)),
    "clavicle_r": transform(rotation=(0.0, -4.0, -5.0)),
    "upperarm_r": transform(rotation=(-28.0, -8.0, -17.0)),
    "lowerarm_r": transform(rotation=(-42.0, 0.0, 9.0)),
    "hand_r": transform(rotation=(12.0, -4.0, -9.0)),
    "clavicle_l": transform(rotation=(0.0, 3.0, 3.0)),
    "upperarm_l": transform(rotation=(18.0, 5.0, 13.0)),
    "lowerarm_l": transform(rotation=(-28.0, 0.0, -8.0)),
    "hand_l": transform(rotation=(-8.0, 5.0, 10.0)),
    "thigh_l": transform(rotation=(4.0, 0.0, 2.0)),
    "thigh_r": transform(rotation=(-5.0, 0.0, -2.0)),
    "calf_l": transform(rotation=(8.0, 0.0, 0.0)),
}

ATTACK_WINDUP = {
    "pelvis": transform(location=(0.0, 0.0, -0.040), rotation=(-3.0, 0.0, -13.0)),
    "spine_01": transform(rotation=(-7.0, 0.0, -8.0)),
    "spine_02": transform(rotation=(-10.0, 0.0, -13.0)),
    "spine_03": transform(rotation=(-7.0, 0.0, -14.0)),
    "neck_01": transform(rotation=(3.0, 0.0, 7.0)),
    "head": transform(rotation=(4.0, 0.0, 11.0)),
    "clavicle_r": transform(rotation=(0.0, -8.0, -8.0)),
    "upperarm_r": transform(rotation=(-48.0, -12.0, -24.0)),
    "lowerarm_r": transform(rotation=(-55.0, 0.0, 15.0)),
    "hand_r": transform(rotation=(19.0, -7.0, -13.0)),
    "clavicle_l": transform(rotation=(0.0, 6.0, 5.0)),
    "upperarm_l": transform(rotation=(29.0, 7.0, 18.0)),
    "lowerarm_l": transform(rotation=(-39.0, 0.0, -11.0)),
    "hand_l": transform(rotation=(-13.0, 8.0, 15.0)),
    "thigh_l": transform(rotation=(7.0, 0.0, 3.0)),
    "thigh_r": transform(rotation=(-8.0, 0.0, -3.0)),
    "calf_l": transform(rotation=(12.0, 0.0, 0.0)),
}

ATTACK_IMPACT = {
    "pelvis": transform(location=(0.0, 0.015, -0.015), rotation=(4.0, 0.0, 13.0)),
    "spine_01": transform(rotation=(7.0, 0.0, 8.0)),
    "spine_02": transform(rotation=(10.0, 0.0, 15.0)),
    "spine_03": transform(rotation=(8.0, 0.0, 17.0)),
    "neck_01": transform(rotation=(-3.0, 0.0, -7.0)),
    "head": transform(rotation=(-5.0, 0.0, -12.0)),
    "clavicle_r": transform(rotation=(0.0, 7.0, 8.0)),
    "upperarm_r": transform(rotation=(37.0, 8.0, 25.0)),
    "lowerarm_r": transform(rotation=(-12.0, 0.0, -14.0)),
    "hand_r": transform(rotation=(-16.0, 6.0, 15.0)),
    "clavicle_l": transform(rotation=(0.0, -7.0, -6.0)),
    "upperarm_l": transform(rotation=(-37.0, -8.0, -22.0)),
    "lowerarm_l": transform(rotation=(-8.0, 0.0, 13.0)),
    "hand_l": transform(rotation=(15.0, -7.0, -16.0)),
    "thigh_l": transform(rotation=(-5.0, 0.0, -2.0)),
    "thigh_r": transform(rotation=(6.0, 0.0, 2.0)),
    "calf_r": transform(rotation=(10.0, 0.0, 0.0)),
}

ATTACK_FOLLOW_THROUGH = {
    "pelvis": transform(location=(0.0, 0.008, -0.028), rotation=(2.0, 0.0, 8.0)),
    "spine_01": transform(rotation=(4.0, 0.0, 5.0)),
    "spine_02": transform(rotation=(6.0, 0.0, 9.0)),
    "spine_03": transform(rotation=(4.0, 0.0, 10.0)),
    "neck_01": transform(rotation=(-2.0, 0.0, -4.0)),
    "head": transform(rotation=(-3.0, 0.0, -7.0)),
    "upperarm_r": transform(rotation=(24.0, 5.0, 16.0)),
    "lowerarm_r": transform(rotation=(-18.0, 0.0, -8.0)),
    "hand_r": transform(rotation=(-9.0, 3.0, 9.0)),
    "upperarm_l": transform(rotation=(-24.0, -5.0, -14.0)),
    "lowerarm_l": transform(rotation=(-14.0, 0.0, 8.0)),
    "hand_l": transform(rotation=(9.0, -4.0, -10.0)),
}

def tame_attack_pose(pose, limb_factor=0.62):
    torso = {"pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"}
    clavicles = {"clavicle_l", "clavicle_r"}
    legs = {"thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r"}
    result = {}
    for bone_name, channels in pose.items():
        if bone_name in torso:
            factor = 0.30
        elif bone_name in clavicles:
            factor = 0.45
        elif bone_name in legs:
            factor = 0.40
        else:
            factor = limb_factor
        scaled = {}
        if "location" in channels:
            scaled["location"] = tuple(value * 0.45 for value in channels["location"])
        if "rotation" in channels:
            scaled["rotation"] = tuple(value * factor for value in channels["rotation"])
        result[bone_name] = scaled
    return result


ATTACK_KEYS = (
    (1, ATTACK_READY),
    (8, merge_poses(ATTACK_READY, tame_attack_pose(ATTACK_ANTICIPATION))),
    (18, merge_poses(ATTACK_READY, tame_attack_pose(ATTACK_WINDUP))),
    (26, merge_poses(ATTACK_READY, tame_attack_pose(ATTACK_IMPACT, limb_factor=0.90))),
    (32, merge_poses(ATTACK_READY, tame_attack_pose(ATTACK_FOLLOW_THROUGH, limb_factor=0.76))),
    (43, ATTACK_READY),
)


ACTION_SPECS = (
    (
        "Wizard_Idle",
        IDLE_KEYS,
        True,
        (("Loop Start", 1), ("Breath In", 19), ("Breath Out", 55), ("Loop End", 73)),
    ),
    (
        "Wizard_Walk",
        WALK_KEYS,
        True,
        (("Contact L", 1), ("Passing L", 5), ("Contact R", 17), ("Passing R", 21), ("Loop End", 33)),
    ),
    (
        "Wizard_Attack",
        ATTACK_KEYS,
        False,
        (("Ready", 1), ("Anticipation", 8), ("Windup", 18), ("Impact", 26), ("Recover", 43)),
    ),
)


ORB_SPECS = (
    (
        "Wizard_Idle_Orbs",
        "Wizard_Idle",
        True,
        (
            (1, (0.0, 0.0, 0.000), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),
            (19, (0.0, 0.0, 0.022), (1.5, -1.0, 90.0), (1.0, 1.0, 1.0)),
            (37, (0.0, 0.0, 0.000), (0.0, 0.0, 180.0), (1.0, 1.0, 1.0)),
            (55, (0.0, 0.0, -0.022), (-1.5, 1.0, 270.0), (1.0, 1.0, 1.0)),
            (73, (0.0, 0.0, 0.000), (0.0, 0.0, 360.0), (1.0, 1.0, 1.0)),
        ),
    ),
    (
        "Wizard_Walk_Orbs",
        "Wizard_Walk",
        True,
        (
            (1, (0.0, 0.0, 0.000), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),
            (9, (0.0, 0.0, 0.035), (2.0, 0.0, 90.0), (1.0, 1.0, 1.0)),
            (17, (0.0, 0.0, 0.000), (0.0, 0.0, 180.0), (1.0, 1.0, 1.0)),
            (25, (0.0, 0.0, 0.035), (-2.0, 0.0, 270.0), (1.0, 1.0, 1.0)),
            (33, (0.0, 0.0, 0.000), (0.0, 0.0, 360.0), (1.0, 1.0, 1.0)),
        ),
    ),
    (
        "Wizard_Attack_Orbs",
        "Wizard_Attack",
        False,
        (
            (1, (0.0, 0.0, 0.000), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),
            (8, (0.0, 0.0, 0.035), (3.0, -2.0, -30.0), (0.82, 0.82, 1.0)),
            (18, (0.0, 0.0, 0.070), (-3.0, 3.0, -70.0), (0.48, 0.48, 1.0)),
            (26, (0.0, 0.0, 0.105), (6.0, -5.0, 70.0), (1.22, 1.22, 1.0)),
            (32, (0.0, 0.0, 0.040), (-2.0, 2.0, 145.0), (1.06, 1.06, 1.0)),
            (43, (0.0, 0.0, 0.000), (0.0, 0.0, 180.0), (1.0, 1.0, 1.0)),
        ),
    ),
)


def find_rig():
    human = bpy.data.objects.get("Wizard_Base_Mesh")
    if human:
        for modifier in human.modifiers:
            if modifier.type == "ARMATURE" and modifier.object:
                return modifier.object
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE" and all(
            bone in obj.pose.bones for bone in ("pelvis", "spine_03", "hand_r", "thigh_l")
        ):
            return obj
    raise RuntimeError("MPFB game_engine wizard rig was not found")


def required_bones():
    names = set()
    for _name, keys, _loop, _markers in ACTION_SPECS:
        for _frame, pose in keys:
            names.update(pose)
    return names


def ensure_euler_bones(rig, bone_names):
    for name in bone_names:
        bone = rig.pose.bones.get(name)
        if bone is None:
            continue
        if bone.rotation_mode not in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}:
            basis = bone.matrix_basis.copy()
            bone.rotation_mode = "XYZ"
            bone.matrix_basis = basis


def capture_pose(rig):
    return {
        bone.name: {
            "location": list(bone.location),
            "rotation": list(bone.rotation_euler),
            "scale": list(bone.scale),
        }
        for bone in rig.pose.bones
    }


def restore_pose(rig, state):
    for bone_name, values in state.items():
        bone = rig.pose.bones.get(bone_name)
        if bone is None:
            continue
        bone.location = values["location"]
        bone.rotation_euler = values["rotation"]
        bone.scale = values["scale"]


def load_or_capture_baseline(rig):
    stored = rig.get(BASELINE_PROPERTY)
    if stored and not RECAPTURE_BASELINE:
        try:
            baseline = json.loads(stored)
            if all(name in baseline for name in required_bones() if name in rig.pose.bones):
                return baseline
        except (TypeError, ValueError):
            pass
    baseline = capture_pose(rig)
    rig[BASELINE_PROPERTY] = json.dumps(baseline, separators=(",", ":"))
    return baseline


def remove_action(name):
    action = bpy.data.actions.get(name)
    if action is not None:
        bpy.data.actions.remove(action, do_unlink=True)


def create_action(name, target, frame_start, frame_end, loop, paired_action=None):
    remove_action(name)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    action["wizard_clip"] = True
    action["wizard_fps"] = FPS
    action["wizard_loop"] = loop
    if paired_action:
        action["wizard_paired_action"] = paired_action
    if hasattr(action, "use_frame_range"):
        action.use_frame_range = True
        action.frame_start = frame_start
        action.frame_end = frame_end
    target.animation_data_create()
    target.animation_data.action = action
    return action


def iter_fcurves(action):
    """Support both legacy and Blender 4.4+ layered Action storage."""
    seen = set()
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        for curve in legacy:
            if curve.as_pointer() not in seen:
                seen.add(curve.as_pointer())
                yield curve
    for layer in getattr(action, "layers", ()):
        for strip in getattr(layer, "strips", ()):
            for channelbag in getattr(strip, "channelbags", ()):
                for curve in getattr(channelbag, "fcurves", ()):
                    if curve.as_pointer() not in seen:
                        seen.add(curve.as_pointer())
                        yield curve


def polish_curves(action, linear_rotation_z=False):
    for curve in iter_fcurves(action):
        curve.extrapolation = "CONSTANT"
        linear = linear_rotation_z and curve.data_path == "rotation_euler" and curve.array_index == 2
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR" if linear else "BEZIER"
            if not linear:
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"


def apply_bone_pose(rig, baseline, bone_names, pose):
    for bone_name in bone_names:
        bone = rig.pose.bones.get(bone_name)
        base = baseline.get(bone_name)
        if bone is None or base is None:
            continue
        bone.location = base["location"]
        bone.rotation_euler = base["rotation"]
        bone.scale = base["scale"]
        offsets = pose.get(bone_name, {})
        if "location" in offsets:
            bone.location = tuple(a + b for a, b in zip(base["location"], offsets["location"]))
        if "rotation" in offsets:
            bone.rotation_euler = tuple(
                a + math.radians(b) for a, b in zip(base["rotation"], offsets["rotation"])
            )


def build_rig_action(rig, baseline, name, keys, loop, markers):
    frame_start = keys[0][0]
    frame_end = keys[-1][0]
    action = create_action(name, rig, frame_start, frame_end, loop)
    animated_bones = sorted({bone_name for _frame, pose in keys for bone_name in pose})
    missing = [name for name in animated_bones if name not in rig.pose.bones]
    if missing:
        print(f"{name}: skipped missing bones {missing}")

    for frame, pose in keys:
        apply_bone_pose(rig, baseline, animated_bones, pose)
        for bone_name in animated_bones:
            bone = rig.pose.bones.get(bone_name)
            if bone is None:
                continue
            bone.keyframe_insert(data_path="location", frame=frame, group=bone_name)
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)

    for marker_name, frame in markers:
        marker = action.pose_markers.new(marker_name)
        marker.frame = frame
    polish_curves(action)
    return action


def capture_object_transform(obj):
    return {
        "location": tuple(obj.location),
        "rotation": tuple(obj.rotation_euler),
        "scale": tuple(obj.scale),
    }


def apply_object_delta(obj, baseline, location, rotation_degrees, scale_factors):
    obj.location = tuple(a + b for a, b in zip(baseline["location"], location))
    obj.rotation_euler = tuple(
        a + math.radians(b) for a, b in zip(baseline["rotation"], rotation_degrees)
    )
    obj.scale = tuple(a * b for a, b in zip(baseline["scale"], scale_factors))


def build_orb_actions(controller):
    baseline = capture_object_transform(controller)
    actions = []
    for name, paired_action, loop, keys in ORB_SPECS:
        action = create_action(name, controller, keys[0][0], keys[-1][0], loop, paired_action)
        for frame, location, rotation, scale in keys:
            apply_object_delta(controller, baseline, location, rotation, scale)
            controller.keyframe_insert(data_path="location", frame=frame)
            controller.keyframe_insert(data_path="rotation_euler", frame=frame)
            controller.keyframe_insert(data_path="scale", frame=frame)
        polish_curves(action, linear_rotation_z=loop)
        actions.append(action)
    return actions, baseline


def restore_action(target, previous_name):
    target.animation_data_create()
    target.animation_data.action = bpy.data.actions.get(previous_name) if previous_name else None


def main():
    scene = bpy.context.scene
    rig = find_rig()
    controller = bpy.data.objects.get("Wizard_Orbital_Controller")
    bone_names = required_bones()
    ensure_euler_bones(rig, bone_names)

    previous_frame = scene.frame_current
    previous_rig_action = rig.animation_data.action.name if rig.animation_data and rig.animation_data.action else None
    previous_orb_action = (
        controller.animation_data.action.name
        if controller and controller.animation_data and controller.animation_data.action
        else None
    )
    visible_pose = capture_pose(rig)
    baseline = load_or_capture_baseline(rig)
    controller_visible = capture_object_transform(controller) if controller else None

    actions = []
    for name, keys, loop, markers in ACTION_SPECS:
        actions.append(build_rig_action(rig, baseline, name, keys, loop, markers))

    orb_actions = []
    controller_baseline = None
    if controller is not None:
        orb_actions, controller_baseline = build_orb_actions(controller)
    else:
        print("Wizard_Orbital_Controller is missing; orb Actions were skipped")

    restore_action(rig, previous_rig_action)
    if controller is not None:
        restore_action(controller, previous_orb_action)
    scene.frame_set(previous_frame)

    if previous_rig_action is None:
        restore_pose(rig, visible_pose)
    if controller is not None and previous_orb_action is None:
        source = controller_visible or controller_baseline
        controller.location = source["location"]
        controller.rotation_euler = source["rotation"]
        controller.scale = source["scale"]

    scene.render.fps = FPS
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print(
        {
            "rig": rig.name,
            "rig_actions": [action.name for action in actions],
            "orb_actions": [action.name for action in orb_actions],
            "fps": FPS,
        }
    )


main()
