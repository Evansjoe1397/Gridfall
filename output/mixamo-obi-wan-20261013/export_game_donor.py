import bpy, os
scene=bpy.data.scenes['Obi-Wan Mixamo Sword Slash']
bpy.context.window.scene=scene
rig=scene.objects['Obi_Wan_Mixamo_Rig']
action=rig.animation_data.action
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.co.x-=1
                    key.handle_left.x-=1
                    key.handle_right.x-=1
scene.frame_start=0
scene.frame_end=41
scene.frame_set(0)
rig.hide_set(False)
for o in bpy.context.view_layer.objects:
    o.select_set(o.type in {'ARMATURE','MESH'})
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(
    filepath='C:/Users/artur/git/Gridfall/output/mixamo-obi-wan-20261013/obi-wan-mixamo-game-donor.glb',
    export_format='GLB',use_selection=True,use_active_scene=True,
    export_animations=True,export_animation_mode='ACTIVE_ACTIONS',
    export_nla_strips_merged_animation_name='Cut_Them_Legs',
    export_force_sampling=True,export_frame_range=True,
    export_bake_animation=True,export_materials='EXPORT',
)
