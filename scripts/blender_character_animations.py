"""Run in Blender's Text Editor to restore the scene-scoped animation sidebar."""
import bpy


def character(context):
    obj = context.object
    if obj and obj.type == 'ARMATURE':
        return obj
    if obj:
        rig = obj.find_armature()
        if rig:
            return rig
    return next((o for o in context.scene.objects if o.type == 'ARMATURE'), None)


class GRIDFALL_OT_play_character_animation(bpy.types.Operator):
    bl_idname = 'gridfall.play_character_animation'
    bl_label = 'Preview character animation'
    action_name: bpy.props.StringProperty()

    def execute(self, context):
        rig = character(context)
        action = bpy.data.actions.get(self.action_name)
        if not rig or not action:
            return {'CANCELLED'}
        animation = rig.animation_data_create()
        strips = [s for t in animation.nla_tracks for s in t.strips if s.action == action]
        if not strips:
            return {'CANCELLED'}
        for track in animation.nla_tracks:
            track.mute = True
        animation.action = action
        if action.slots:
            animation.action_slot = strips[0].action_slot or action.slots[0]
        context.scene.frame_start = int(action.frame_range[0])
        context.scene.frame_end = int(action.frame_range[1])
        context.scene.frame_set(context.scene.frame_start)
        return {'FINISHED'}


class GRIDFALL_PT_character_animations(bpy.types.Panel):
    bl_label = 'Character Animations'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Animation'

    def draw(self, context):
        rig = character(context)
        if not rig or not rig.animation_data:
            self.layout.label(text='Select a rigged character')
            return
        self.layout.label(text=rig.name)
        seen = set()
        for track in reversed(rig.animation_data.nla_tracks):
            for strip in track.strips:
                action = strip.action
                if not action or action.name in seen:
                    continue
                seen.add(action.name)
                label = action.get('source_clip', track.name)
                op = self.layout.operator('gridfall.play_character_animation', text=label, icon='ACTION', depress=rig.animation_data.action == action)
                op.action_name = action.name
        self.layout.operator('screen.animation_play', text='Play / Pause', icon='PLAY')


def register():
    for cls in (GRIDFALL_OT_play_character_animation, GRIDFALL_PT_character_animations):
        old = getattr(bpy.types, cls.__name__, None)
        if old:
            bpy.utils.unregister_class(old)
        bpy.utils.register_class(cls)


register()
