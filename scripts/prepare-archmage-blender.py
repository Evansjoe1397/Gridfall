"""Run through experiments/blender-rpc.cjs; never overwrite the source GLB."""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix

root = Path(r'C:\Users\artur\git\Gridfall')
folder = root / 'experiments'
source = bpy.data.scenes['Celestial Archmage']
bpy.context.window.scene = source
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'Celestial_Archmage_Before_Optimization.blend'), copy=True)
scene = bpy.data.scenes.new('Celestial Archmage Game')
bpy.context.window.scene = scene
scene.render.fps = 24
source_rig = source.objects[source['gridfall_character_armature']]
source_body = next(o for o in source.objects if o.type == 'MESH')
rig = source_rig.copy()
rig.data = source_rig.data.copy()
rig.name = 'Archmage_Game_Rig'
scene.collection.objects.link(rig)
body = source_body.copy()
body.data = source_body.data.copy()
body.name = 'Archmage_Game_Body'
scene.collection.objects.link(body)
body.parent = rig
for modifier in body.modifiers:
    if modifier.type == 'ARMATURE': modifier.object = rig
rig.hide_set(False)
rig.show_in_front = False
bpy.context.view_layer.objects.active = body
body.select_set(True)
rig.select_set(False)
decimate = body.modifiers.new('Conservative Game Decimation', 'DECIMATE')
decimate.ratio = 0.5
bpy.ops.object.modifier_move_up(modifier=decimate.name)
bpy.ops.object.modifier_apply(modifier=decimate.name)
images = {}
for index, material in enumerate(body.data.materials):
    material = material.copy()
    body.data.materials[index] = material
    for node in material.node_tree.nodes:
        if node.type != 'TEX_IMAGE' or not node.image: continue
        original = node.image
        if original.name not in images:
            image = original.copy()
            image.name = 'Archmage_Game_' + original.name
            image.scale(1024, 1024)
            image.pack()
            images[original.name] = image
        node.image = images[original.name]

renames = {
    '01a0ea43-e141-76eb-8e15-fbad51d8b45b': 'Walk',
    '01a0ea51-e374-711d-805f-c775b7c6e6ff': 'Summon',
    '01a08602-fddf-710a-8cd6-02df116b4303': 'Conjure',
    '01a0ea50-1820-71e8-8833-28face8b1671': 'Power',
    '01a0ea47-8774-7647-9c41-f4a4b7d89ac4': 'Wall',
}
clips = {}
for track in source_rig.animation_data.nla_tracks:
    name = renames.get(track.name, track.name)
    action = track.strips[0].action.copy()
    action.name = 'Archmage/' + name
    action['source_clip'] = name
    action.use_fake_user = True
    clips[name] = action
rig.animation_data_clear()
animation = rig.animation_data_create()
animation.use_nla = False

def bind(action):
    animation.action = action
    animation.action_slot = action.slots[0]

hip = rig.pose.bones['mixamorig:Hips']
foot_report = []
for name in ('Summon', 'Conjure', 'Power', 'Wall'):
    action = clips[name]
    bind(action)
    frames = range(math.floor(action.frame_range[0]), math.ceil(action.frame_range[1])+1)
    samples = []
    for frame in frames:
        scene.frame_set(frame)
        samples.append((frame, hip.matrix.copy(), {side: rig.pose.bones['mixamorig:'+side+'Foot'].matrix.copy() for side in ('Left','Right')}))
    for frame, hip_matrix, feet in samples:
        scene.frame_set(frame)
        offset = sum(rig.data.bones['mixamorig:'+side+'Foot'].head_local.z - feet[side].translation.z for side in feet) / 2
        hip_matrix.translation.z += offset
        hip.matrix = hip_matrix
        hip.keyframe_insert('location', frame=frame, group=hip.name)
        bpy.context.view_layer.update()
        for side, foot_matrix in feet.items():
            bone = rig.pose.bones['mixamorig:'+side+'Foot']
            rest = bone.bone.matrix_local
            local_forward = rest.to_3x3().inverted() @ Vector((0,-1,0))
            heading = foot_matrix.to_3x3() @ local_forward
            yaw = math.atan2(heading.x, -heading.y)
            target = Quaternion((0,0,1), yaw).to_matrix().to_4x4() @ rest.copy()
            target.translation = foot_matrix.translation + Vector((0,0,offset))
            bone.matrix = target
            bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
            for suffix in ('ToeBase', 'Toe_End'):
                toe = rig.pose.bones['mixamorig:'+side+suffix]
                toe.rotation_quaternion = Quaternion()
                toe.keyframe_insert('rotation_quaternion', frame=frame, group=toe.name)
        bpy.context.view_layer.update()
    foot_report.append({'clip':name,'frames':len(samples),'correction':'Neutral boot pitch/roll, preserve foot heading; restore ankle ground height through hips.'})

# Remove the authored forward root motion, retaining vertical motion and side sway.
action = clips['Walk']
bind(action)
frames = range(math.floor(action.frame_range[0]), math.ceil(action.frame_range[1])+1)
samples=[]
for frame in frames:
    scene.frame_set(frame)
    samples.append((frame, hip.matrix.copy()))
displacement = samples[-1][1].translation - samples[0][1].translation
displacement.z = 0
walk_speed = displacement.length / ((samples[-1][0]-samples[0][0])/24)
for frame, matrix in samples:
    scene.frame_set(frame)
    matrix.translation -= displacement * ((frame-samples[0][0])/(samples[-1][0]-samples[0][0]))
    hip.matrix = matrix
    hip.keyframe_insert('location', frame=frame, group=hip.name)

# Breathe around Summon's first corrected frame. Legs and feet remain fixed.
bind(clips['Summon'])
scene.frame_set(int(clips['Summon'].frame_range[0]))
pose = {b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in rig.pose.bones}
idle = bpy.data.actions.new('Archmage/Idle')
idle['source_clip'] = 'Idle'
idle.use_fake_user = True
animation.action = idle
for frame in range(0,97,4):
    phase = math.sin(frame/96*math.tau)
    for bone in rig.pose.bones:
        location, rotation, scale = pose[bone.name]
        bone.location = location
        bone.rotation_quaternion = rotation
        bone.scale = scale
        if bone.name == 'mixamorig:Spine2':
            bone.rotation_quaternion = rotation @ Quaternion((1,0,0), phase * 0.012)
            bone.scale = Vector((scale.x*(1+phase*.006),scale.y,scale.z*(1+phase*.006)))
        if bone.name == 'mixamorig:Neck':
            bone.rotation_quaternion = rotation @ Quaternion((1,0,0), -phase * .006)
        bone.keyframe_insert('location', frame=frame, group=bone.name)
        bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
        bone.keyframe_insert('scale', frame=frame, group=bone.name)
clips['Idle'] = idle
animation.action = None
for name, action in clips.items():
    track = animation.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(action.frame_range[0]), action)
    strip.action_slot = action.slots[0]
    track.mute = True
scene['gridfall_character_armature'] = rig.name
scene['gridfall_character_actions'] = '\n'.join(a.name for a in clips.values())
scene['gridfall_source_glb'] = source['gridfall_source_glb']
scene['archmage_walk_speed'] = walk_speed
scene['archmage_running_speed'] = 5.13802033290267
scene['archmage_foot_corrections'] = json.dumps(foot_report)
addon_source = Path(sys.modules['gridfall_character_animations'].__file__).read_text(encoding='utf-8')
scene['gridfall_animation_panel_script'] = str(folder / 'celestial_archmage_animations_addon.py')
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.shading.type = 'MATERIAL'
        area.spaces.active.overlay.show_extras = False
        area.spaces.active.show_region_ui = True
        with bpy.context.temp_override(area=area,region=next(r for r in area.regions if r.type=='WINDOW')):
            bpy.ops.view3d.view_selected(use_all_regions=False)
        area.spaces.active.region_3d.view_rotation = Quaternion((1,0,0), math.pi/2)

# Export named tracks before selecting an active preview action.
animation.use_nla = True
for track in animation.nla_tracks: track.mute=False
scene.frame_start=0
scene.frame_end=97
output = folder / 'Celestial_Archmage_Optimized_All_Animations.glb'
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(output), use_active_scene=True, use_selection=True, export_animation_mode='NLA_TRACKS', export_frame_range=False, export_force_sampling=True, export_image_format='JPEG', export_image_quality=88, export_extras=True)
for track in animation.nla_tracks: track.mute=True
animation.use_nla=False
bind(idle)
scene.frame_set(0)
scene['gridfall_active_animation'] = idle.name
rig.hide_set(True)
checkpoint=folder / 'Celestial_Archmage_Game_Prepared.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
report={'file':str(output),'MiB':output.stat().st_size/1048576,'triangles':sum(len(p.vertices)-2 for p in body.data.polygons),'vertices':len(body.data.vertices),'clips':list(clips),'walk_speed':walk_speed,'running_speed':scene['archmage_running_speed'],'textures':[(i.name,list(i.size)) for i in images.values()],'checkpoint':str(checkpoint)}
(folder/'archmage-preparation-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
