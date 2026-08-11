import bpy
import json


CLIPS = {
    "IDLE": ("Wizard_Idle", "Wizard_Idle_Orbs", "Wizard_Staff_Idle", None, 1, 72),
    "WALK": ("Wizard_Walk", "Wizard_Walk_Orbs", "Wizard_Staff_Walk", None, 1, 32),
    "ATTACK": ("Wizard_Attack", "Wizard_Attack_Orbs", "Wizard_Staff_Attack", None, 1, 43),
    "POWER": (
        "Wizard_Power",
        "Wizard_Power_Orbs",
        "Wizard_Staff_Idle",
        "Wizard_Power_LeftHand_Action",
        1,
        52,
    ),
}
BASELINE_PROPERTY = "wizard_animation_baseline_v1"


def find_rig():
    human = bpy.data.objects.get("Wizard_Base_Mesh")
    if human:
        for modifier in human.modifiers:
            if modifier.type == "ARMATURE" and modifier.object:
                return modifier.object
    return None


def restore_rig_baseline(rig):
    stored = rig.get(BASELINE_PROPERTY)
    if not stored:
        return False
    try:
        baseline = json.loads(stored)
    except (TypeError, ValueError):
        return False
    rig.animation_data_create()
    rig.animation_data.action = None
    for bone_name, values in baseline.items():
        bone = rig.pose.bones.get(bone_name)
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        bone.location = values["location"]
        bone.rotation_euler = values["rotation"]
        bone.scale = values["scale"]
    return True


class WIZARD_OT_set_animation(bpy.types.Operator):
    bl_idname = "wizard.set_animation"
    bl_label = "Set Wizard Animation"
    bl_options = {"INTERNAL"}

    clip: bpy.props.StringProperty()

    def execute(self, context):
        spec = CLIPS.get(self.clip)
        rig = find_rig()
        orbs = bpy.data.objects.get("Wizard_Orbital_Controller")
        staff = bpy.data.objects.get("Wizard_Staff_Controller")
        if spec is None or rig is None:
            self.report({"ERROR"}, "Wizard animation objects are missing")
            return {"CANCELLED"}
        rig_action, orb_action, staff_action, hand_action, start, end = spec
        rig.animation_data_create()
        restore_rig_baseline(rig)
        rig.animation_data.action = bpy.data.actions[rig_action]
        if orbs:
            orbs.animation_data_create()
            orbs.animation_data.action = bpy.data.actions[orb_action]
        if staff and staff_action in bpy.data.actions:
            staff.animation_data_create()
            staff.animation_data.action = bpy.data.actions[staff_action]
        hand_controller = bpy.data.objects.get("Wizard_Power_LeftHand_Controller")
        if hand_controller:
            hand_controller.animation_data_create()
            hand_controller.animation_data.action = (
                bpy.data.actions.get(hand_action) if hand_action else None
            )
            if hand_action is None:
                base_location = hand_controller.get("wizard_power_base_location")
                base_rotation = hand_controller.get(
                    "wizard_power_base_rotation_quaternion"
                )
                base_scale = hand_controller.get("wizard_power_base_scale")
                if base_location and base_rotation and base_scale:
                    hand_controller.rotation_mode = "QUATERNION"
                    hand_controller.location = base_location
                    hand_controller.rotation_quaternion = base_rotation
                    hand_controller.scale = base_scale
        context.scene.frame_start = start
        context.scene.frame_end = end
        context.scene.frame_set(start)
        context.scene["wizard_active_clip"] = self.clip
        return {"FINISHED"}


class WIZARD_PT_animation_preview(bpy.types.Panel):
    bl_label = "Animation Preview"
    bl_idname = "WIZARD_PT_animation_preview"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Wizard"

    def draw(self, context):
        layout = self.layout
        active = context.scene.get("wizard_active_clip", "IDLE")
        for clip, label, icon in (
            ("IDLE", "Idle", "PAUSE"),
            ("WALK", "Walk", "MOD_DYNAMICPAINT"),
            ("ATTACK", "Attack", "PLAY"),
            ("POWER", "Power", "LIGHT"),
        ):
            operator = layout.operator(
                WIZARD_OT_set_animation.bl_idname,
                text=label,
                icon=icon,
                depress=active == clip,
            )
            operator.clip = clip
        layout.operator("screen.animation_play", text="Play / Pause", icon="PLAY")


CLASSES = (WIZARD_OT_set_animation, WIZARD_PT_animation_preview)


def register():
    for cls in CLASSES:
        existing = getattr(bpy.types, cls.__name__, None)
        if existing is not None:
            try:
                bpy.utils.unregister_class(existing)
            except (RuntimeError, ValueError):
                pass
        bpy.utils.register_class(cls)


register()
bpy.context.scene["wizard_active_clip"] = "IDLE"
print("Wizard animation controls registered in the 3D View sidebar")
