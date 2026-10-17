"""Import the user's Mixamo download into its own preserved Blender scene."""
import bpy
import json
import math
import os
from mathutils import Vector

source='C:/Users/artur/git/Gridfall/experiments/Sword And Shield Slash.fbx'
checkpoint='C:/Users/artur/git/Gridfall/experiments/Obi-Wan-Before-Mixamo-Import-20261013.blend'
destination='C:/Users/artur/git/Gridfall/experiments/Obi-Wan-Mixamo-Slash-Prepared-20261013.blend'
if os.path.exists(checkpoint) or os.path.exists(destination):
    raise RuntimeError('Prepared import or checkpoint already exists; refusing to overwrite')
if bpy.context.screen and bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)
bpy.ops.wm.save_as_mainfile(filepath=checkpoint,copy=True)

scene=bpy.data.scenes.new('Obi-Wan Mixamo Sword Slash')
bpy.context.window.scene=scene
old_actions=set(bpy.data.actions)
bpy.ops.import_scene.fbx(filepath=source,use_anim=True)
rigs=[o for o in scene.objects if o.type=='ARMATURE']
meshes=[o for o in scene.objects if o.type=='MESH']
assert len(rigs)==1 and len(meshes)==1
rig,body=rigs[0],meshes[0]
actions=[a for a in bpy.data.actions if a not in old_actions]
assert len(actions)==1
action=actions[0]
original_action_name=action.name
action.name='Sword_And_Shield_Slash_Mixamo'
action['source_clip']='Sword And Shield Slash (Mixamo)'
action['source_file']=source
action['imported_action_name']=original_action_name
action.use_fake_user=True
rig.name='Obi_Wan_Mixamo_Rig'
body.name='Obi_Wan_Mixamo_Body'
animation=rig.animation_data
assert animation.action==action and animation.action_slot
slot=animation.action_slot
track=animation.nla_tracks.new()
track.name='Sword And Shield Slash (Mixamo)'
strip=track.strips.new(track.name,math.floor(action.frame_range[0]),action)
strip.action_slot=slot
track.mute=True
animation.use_nla=False
scene['gridfall_character_armature']=rig.name
scene['gridfall_active_animation']=action.name
scene.frame_start=math.floor(action.frame_range[0])
scene.frame_end=math.ceil(action.frame_range[1])
scene.frame_set(scene.frame_start)
bpy.context.view_layer.update()

body.data.calc_loop_triangles()
images=set()
for material in body.data.materials:
    if material and material.node_tree:
        images.update(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
assert images and all(i.has_data for i in images)
assert any(m.type=='ARMATURE' and m.object==rig for m in body.modifiers)
pose1={p.name:p.matrix.copy() for p in rig.pose.bones}
scene.frame_set(round((scene.frame_start+scene.frame_end)/2))
assert any(sum(abs(p.matrix[i][j]-pose1[p.name][i][j]) for i in range(4) for j in range(4))>.01 for p in rig.pose.bones)

corners=[body.matrix_world@Vector(c) for c in body.bound_box]
center=Vector(tuple((min(p[i] for p in corners)+max(p[i] for p in corners))/2 for i in range(3)))
rig.hide_set(True)
rig.show_in_front=False
for o in bpy.context.selected_objects:
    o.select_set(False)
body.select_set(True)
bpy.context.view_layer.objects.active=body
scene.render.engine='CYCLES'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        space=area.spaces.active
        space.shading.type='MATERIAL'
        space.overlay.show_bones=False
        space.region_3d.view_location=center
        space.region_3d.view_distance=3.2
        space.region_3d.view_rotation=Vector((0,4,-.6)).to_track_quat('-Z','Y')
        space.show_region_ui=True

panel_path='C:/Users/artur/git/Gridfall/scripts/blender_character_animations.py'
text=bpy.data.texts.get('blender_character_animations.py')
if not text:
    text=bpy.data.texts.load(panel_path)
text.use_module=True
exec(text.as_string(),{'__name__':'__main__'})
scene.frame_set(scene.frame_start)
bpy.ops.wm.save_as_mainfile(filepath=destination)
result={'file':destination,'checkpoint':checkpoint,'scene':scene.name,
        'source':source,'source_mib':os.path.getsize(source)/1048576,
        'action':action.name,'frames':[scene.frame_start,scene.frame_end],
        'fps':scene.render.fps/scene.render.fps_base,
        'bones':len(rig.data.bones),'vertices':len(body.data.vertices),
        'triangles':len(body.data.loop_triangles),
        'textures':[list(i.size) for i in images],'animation_verified':True}
