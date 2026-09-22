"""Persistent Gridfall character-animation sidebar for Blender 4.3+.

Install this file as an add-on, or run it from Blender's Text Editor to
restore the scene-scoped animation controls stored in prepared .blend files.
"""
bl_info = {
    "name": "Gridfall Character Animations",
    "author": "Gridfall",
    "version": (1, 3, 0),
    "blender": (4, 3, 0),
    "location": "3D Viewport > Sidebar > Animation",
    "description": "One-click controls for animations bound to a Gridfall character",
    "category": "Animation",
}

import json
import math

import bpy
from mathutils import Matrix


OPERATOR_ID = "gridfall.play_bound_character_animation"

# Hand-local scepter poses from the authored Priest checkpoints.  Blender's
# bone parenting places object.location relative to the bone tail, so the
# hand bone length is subtracted from the Y coordinate below.
SCEPTER_POSES = {
    "Idle": ((-1.29069448, 12.61922646, 2.85937119), (0.10148717, 0.68877989, -0.71565390, 0.05587576)),
    "Walk": ((8.76818562, 13.34613705, -1.54648757), (0.46165374, 0.64134777, -0.57101053, -0.22247671)),
    "Run": ((-0.40190029, 15.96422958, -1.52334976), (0.43208089, 0.65508300, -0.58753252, -0.19742815)),
    "MindBlast": ((1.07135069, 6.86590000, 1.21547055), (0.13074103, -0.97138727, 0.18215443, 0.07831559)),
    "Blessing": ((3.26746321, 13.90686035, -1.33904958), (0.42059341, 0.63792229, -0.63442659, -0.11687256)),
}


def apply_character_staff_pose(rig, action_name):
    staff = bpy.data.objects.get("Golden_Cross_Scepter")
    if not staff or staff.parent != rig or staff.parent_bone != "RightHand":
        return
    hand = rig.data.bones.get("RightHand")
    if not hand:
        return

    # Earlier scene checkpoints stored approved poses directly on the staff.
    # Use those exact transforms when available.
    try:
        saved_poses = json.loads(staff.get("gridfall_animation_pose_map", "{}"))
    except (TypeError, ValueError):
        saved_poses = {}
    saved = saved_poses.get(action_name)
    if saved and "matrix_basis" in saved:
        staff.matrix_basis = Matrix(saved["matrix_basis"])
        return

    if action_name in {"Casual_Walk", "Walking"}:
        pose_name = "Walk"
    elif action_name in {"Run_03", "Running", "RunFast"}:
        pose_name = "Run"
    elif action_name == "Cast":
        pose_name = "MindBlast"
    elif action_name in {"Blessing", "Blessing_Old"}:
        pose_name = "Blessing"
    else:
        pose_name = "Idle"
    position, rotation = SCEPTER_POSES[pose_name]
    staff.location = (position[0], position[1] - hand.length, position[2])
    staff.rotation_mode = "QUATERNION"
    staff.rotation_quaternion = rotation
    staff.scale = (67.68447,) * 3


def character(context):
    configured = context.scene.get("gridfall_character_armature", "")
    rig = bpy.data.objects.get(configured) if configured else None
    if rig and rig.type == "ARMATURE":
        return rig

    obj = context.object
    if obj and obj.type == "ARMATURE":
        return obj
    if obj:
        rig = obj.find_armature()
        if rig:
            return rig

    rigs = [obj for obj in context.scene.objects if obj.type == "ARMATURE"]
    return rigs[0] if len(rigs) == 1 else None


def bound_actions(rig):
    if not rig or not rig.animation_data:
        return []

    actions = []
    seen = set()
    for track in reversed(rig.animation_data.nla_tracks):
        for strip in track.strips:
            action = strip.action
            if action and action.name not in seen:
                seen.add(action.name)
                actions.append((action, track.name, strip))
    return actions


class GRIDFALL_OT_play_bound_character_animation(bpy.types.Operator):
    bl_idname = OPERATOR_ID
    bl_label = "Play Character Animation"
    bl_options = {"REGISTER", "UNDO"}

    action_name: bpy.props.StringProperty()

    def execute(self, context):
        rig = character(context)
        action = bpy.data.actions.get(self.action_name)
        if not rig or not action:
            self.report({"ERROR"}, "Character armature or Action is missing")
            return {"CANCELLED"}

        animation = rig.animation_data_create()
        strips = [
            strip
            for track in animation.nla_tracks
            for strip in track.strips
            if strip.action == action
        ]
        if not strips:
            self.report({"ERROR"}, f"{action.name} is not bound to {rig.name}")
            return {"CANCELLED"}

        was_playing = bool(context.screen and context.screen.is_animation_playing)
        if was_playing:
            bpy.ops.screen.animation_play()

        action.use_fake_user = True
        for track in animation.nla_tracks:
            track.mute = True
        animation.use_nla = False
        animation.action = action

        slot = strips[0].action_slot
        if slot and hasattr(animation, "action_slot"):
            try:
                animation.action_slot = slot
            except (AttributeError, RuntimeError, TypeError):
                self.report({"WARNING"}, "The Action slot could not be selected")

        start = math.floor(action.frame_range[0])
        end = math.ceil(action.frame_range[1])
        context.scene.frame_start = start
        context.scene.frame_end = max(start + 1, end)
        context.scene.frame_set(start)
        context.view_layer.update()
        apply_character_staff_pose(rig, action.name)
        context.scene["gridfall_active_animation"] = action.name

        if context.screen:
            bpy.ops.screen.animation_play()
        return {"FINISHED"}


class GRIDFALL_OT_stop_bound_character_animation(bpy.types.Operator):
    bl_idname = "gridfall.stop_bound_character_animation"
    bl_label = "Stop Animation"

    def execute(self, context):
        if context.screen and context.screen.is_animation_playing:
            bpy.ops.screen.animation_play()
        return {"FINISHED"}


class VIEW3D_PT_gridfall_bound_character_animations(bpy.types.Panel):
    bl_label = "Character Animations"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Animation"

    @classmethod
    def poll(cls, context):
        return character(context) is not None

    def draw(self, context):
        rig = character(context)
        animation = rig.animation_data if rig else None
        if not animation:
            self.layout.label(text="Select a rigged character")
            return

        active = animation.action.name if animation.action else "None"
        box = self.layout.box()
        box.label(text=f"Character: {rig.name}", icon="ARMATURE_DATA")
        box.label(text=f"Active: {active}", icon="ACTION")
        self.layout.operator(
            "gridfall.stop_bound_character_animation", icon="PAUSE"
        )

        for action, track_name, _strip in bound_actions(rig):
            label = action.get("source_clip", track_name)
            row = self.layout.row(align=True)
            row.alert = animation.action == action
            operator = row.operator(OPERATOR_ID, text=label, icon="PLAY")
            operator.action_name = action.name


CLASSES = (
    GRIDFALL_OT_play_bound_character_animation,
    GRIDFALL_OT_stop_bound_character_animation,
    VIEW3D_PT_gridfall_bound_character_animations,
)


def register():
    for legacy_name in (
        "GRIDFALL_OT_play_character_animation",
        "GRIDFALL_OT_stop_character_animation",
        "GRIDFALL_PT_character_animations",
        "VIEW3D_PT_gridfall_character_animations",
    ):
        legacy = getattr(bpy.types, legacy_name, None)
        if legacy:
            try:
                bpy.utils.unregister_class(legacy)
            except RuntimeError:
                pass
    for cls in CLASSES:
        old = getattr(bpy.types, cls.__name__, None)
        if old:
            bpy.utils.unregister_class(old)
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(CLASSES):
        registered = getattr(bpy.types, cls.__name__, None)
        if registered:
            bpy.utils.unregister_class(registered)


register()
