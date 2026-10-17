"""Author Cut Them Legs using world-space limb targets on the existing rig.

Run in background Blender against before-custom-low-cut.blend.
All authoring occurs in a new scene; the imported actions are preserved.
"""
import bpy
import json
import math
import os
import numpy as np
from mathutils import Matrix, Quaternion, Vector

FOLDER = os.path.dirname(os.path.abspath(__file__))
ACTION = 'Low_Cut_Custom'
source = bpy.data.scenes['Obi-Wan Game Low Cut']
scene = bpy.data.scenes.new('Obi-Wan Custom Low Sweep')
scene.render.fps = 24
bpy.context.window.scene = scene
rig = source.objects['target_character.001'].copy()
rig.data = rig.data.copy()
rig.name = 'Obi_Wan_Custom_Rig'
scene.collection.objects.link(rig)
rig.parent = None
rig.matrix_world = rig.matrix_basis.copy()
rig.hide_viewport = False
rig.hide_set(False)
rig.show_in_front = False
body = source.objects['char1.001'].copy()
body.name = 'Obi_Wan_Custom_Body'
scene.collection.objects.link(body)
body.parent = rig
for modifier in body.modifiers:
    if modifier.type == 'ARMATURE':
        modifier.object = rig
saber = source.objects['Lightsaber'].copy()
saber.name = 'Obi_Wan_Custom_Lightsaber'
scene.collection.objects.link(saber)
saber.parent = rig
saber.animation_data_clear()
default_grip = Matrix(json.loads(saber['gridfall_animation_pose_map'])['default']['matrix_basis'])
saber.matrix_basis = default_grip

anim = rig.animation_data
anim.use_nla = False
for track in anim.nla_tracks:
    track.mute = True
idle = bpy.data.actions['Idle']
anim.action = idle
anim.action_slot = idle.slots[0]
scene.frame_set(1)
bpy.context.view_layer.update()
idle_basis = {p.name:p.matrix_basis.copy() for p in rig.pose.bones}
idle_matrices = {p.name:p.matrix.copy() for p in rig.pose.bones}
idle_heads = {p.name:p.head.copy() for p in rig.pose.bones}

vertices = np.array([list(v.co) for v in saber.data.vertices])
center = vertices.mean(axis=0)
_, _, axes = np.linalg.svd(vertices-center, full_matrices=False)
blade_axis_mesh = Vector(axes[0])
projection = (vertices-center) @ axes[0]
tip_mesh = Vector(center) + blade_axis_mesh * float(projection.max())
hand_to_saber = rig.pose.bones['RightHand'].matrix.inverted() @ rig.matrix_world.inverted() @ saber.matrix_world
blade_hand = (hand_to_saber.to_3x3() @ blade_axis_mesh).normalized()

anim.action = None
action = bpy.data.actions.new(ACTION)
action.use_fake_user = True
action['source_clip'] = 'Cut Them Legs - Custom Low Sweep'
action['description'] = 'Authored planted-foot crouch, low horizontal saber sweep, and return to Idle.'
anim.action = action
scene.frame_start = 1
scene.frame_end = 49
scene['gridfall_character_armature'] = rig.name
scene['gridfall_active_animation'] = ACTION

def quat(axis, degrees):
    return Quaternion(axis, math.radians(degrees))

def place(name, position, rotation):
    rig.pose.bones[name].matrix = Matrix.LocRotScale(position, rotation, Vector((1,1,1)))
    bpy.context.view_layer.update()

def aim(name, child, target):
    bone = rig.pose.bones[name]
    delta = (rig.pose.bones[child].head - bone.head).rotation_difference(target-bone.head)
    place(name, bone.head.copy(), delta @ bone.matrix.to_quaternion())

def solve_limb(upper, lower, end, target, pole):
    root = rig.pose.bones[upper].head.copy()
    length_a = (idle_heads[lower]-idle_heads[upper]).length
    length_b = (idle_heads[end]-idle_heads[lower]).length
    direction = target-root
    distance = min(direction.length, length_a+length_b-0.05)
    direction.normalize()
    bend = pole-root
    bend -= direction * bend.dot(direction)
    bend.normalize()
    along = (length_a**2-length_b**2+distance**2)/(2*distance)
    height = math.sqrt(max(0, length_a**2-along**2))
    elbow = root + direction*along + bend*height
    aim(upper, lower, elbow)
    aim(lower, end, target)

def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3.-2.*t)

# Timing: preparation 1-14, fast strike 15-23, settle 24-29, recovery 30-49.
# Values: frame, crouch amount, sweep angle, hip yaw, chest yaw, forward lean.
keys = [
    (1, 0, -85, 0, 0, 0),
    (7, .55, -90, -10, -15, 10),
    (13, 1, -95, -20, -24, 23),
    (15, 1, -88, -18, -22, 25),
    (19, 1, -12, 0, -3, 25),
    (23, 1, 68, 24, 30, 22),
    (27, .94, 82, 27, 32, 20),
    (33, .70, 55, 15, 15, 13),
    (41, .22, -35, 3, 3, 4),
    (49, 0, -85, 0, 0, 0),
]

def params(frame):
    for a,b in zip(keys, keys[1:]):
        if a[0] <= frame <= b[0]:
            t=(frame-a[0])/(b[0]-a[0])
            # Keep velocity through the central contact interval.
            u=t if 15 <= a[0] <= 19 else smooth(t)
            return [x+(y-x)*u for x,y in zip(a[1:],b[1:])]
    return list(keys[-1][1:])

samples=[]
previous_quaternions={}
for frame in range(1,50):
    scene.frame_set(frame)
    for p in rig.pose.bones:
        p.matrix_basis = idle_basis[p.name]
    bpy.context.view_layer.update()
    amount,theta,hip_yaw,chest_yaw,lean = params(frame)
    hip_pos=idle_heads['Hips']+Vector((-2*amount,-33*amount,-10*amount))
    hip_q=quat((0,1,0),hip_yaw) @ idle_matrices['Hips'].to_quaternion()
    place('Hips',hip_pos,hip_q)
    for name,fraction in [('Spine02',.3),('Spine01',.65),('Spine',1.)]:
        p=rig.pose.bones[name]
        q=quat((0,1,0),hip_yaw+chest_yaw*fraction) @ quat((1,0,0),lean*fraction) @ idle_matrices[name].to_quaternion()
        place(name,p.head.copy(),q)
    # Keep the gaze generally forward while the torso follows the strike.
    for name,fraction in [('neck',.6),('Head',.3)]:
        p=rig.pose.bones[name]
        q=quat((0,1,0),(hip_yaw+chest_yaw)*fraction) @ quat((1,0,0),-3*amount) @ idle_matrices[name].to_quaternion()
        place(name,p.head.copy(),q)

    for side,sign in [('Left',1),('Right',-1)]:
        ankle=idle_heads[side+'Foot'].copy()
        pole=Vector((sign*40,45,90))
        solve_limb(side+'UpLeg',side+'Leg',side+'Foot',ankle,pole)
        p=rig.pose.bones[side+'Foot']
        place(p.name,p.head.copy(),idle_matrices[p.name].to_quaternion())
        p=rig.pose.bones[side+'ToeBase']
        place(p.name,p.head.copy(),idle_matrices[p.name].to_quaternion())

    radians=math.radians(theta)
    radial=Vector((math.sin(radians),0,math.cos(radians)))
    attack_hand=Vector((radial.x*14,66,12+radial.z*14))
    wrist=idle_heads['RightHand'].lerp(attack_hand,amount)
    pole=Vector((-55,80,35))
    solve_limb('RightArm','RightForeArm','RightHand',wrist,pole)
    p=rig.pose.bones['RightHand']
    inherited_q=p.matrix.to_quaternion()
    desired_blade=(radial+Vector((0,-.17,0))).normalized()
    aimed_q=(inherited_q @ blade_hand).rotation_difference(desired_blade) @ inherited_q
    q=idle_matrices['RightHand'].to_quaternion().slerp(aimed_q,amount)
    place('RightHand',p.head.copy(),q)

    # Free hand stays outside the torso and counterbalances the weapon arm.
    counter=Vector((33,91,15))
    left_target=idle_heads['LeftHand'].lerp(counter,amount)
    solve_limb('LeftArm','LeftForeArm','LeftHand',left_target,Vector((60,95,-15)))

    # Blend the very beginning/end exactly to the existing idle pose.
    if frame in (1,49):
        for p in rig.pose.bones:
            p.matrix_basis=idle_basis[p.name]
    for p in rig.pose.bones:
        p.rotation_mode='QUATERNION'
        q=p.rotation_quaternion
        if p.name in previous_quaternions and q.dot(previous_quaternions[p.name])<0:
            q.negate()
        previous_quaternions[p.name]=q.copy()
        p.keyframe_insert('location',frame=frame,group=p.name)
        p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
        p.keyframe_insert('scale',frame=frame,group=p.name)
    bpy.context.view_layer.update()
    tip=rig.matrix_world.inverted() @ saber.matrix_world @ tip_mesh
    samples.append({'frame':frame,'hips':list(rig.pose.bones['Hips'].head),
                    'wrist':list(rig.pose.bones['RightHand'].head),'tip':list(tip),
                    'left_ankle':list(rig.pose.bones['LeftFoot'].head),
                    'right_ankle':list(rig.pose.bones['RightFoot'].head),
                    'wrist_target_error':(rig.pose.bones['RightHand'].head-wrist).length})

for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation='LINEAR'
track=anim.nla_tracks.new()
track.name=ACTION
strip=track.strips.new(ACTION,1,action)
strip.action_slot=anim.action_slot
track.mute=True

# Store the grip specifically for the new clip, and name the prop as expected
# by the existing sidebar helper without breaking the source scene's prop.
grip_map=json.loads(saber['gridfall_animation_pose_map'])
grip_map[ACTION]={'matrix_basis':[list(row) for row in default_grip]}
saber['gridfall_animation_pose_map']=json.dumps(grip_map)
scene.frame_set(19)
rig.hide_set(True)
bpy.context.view_layer.objects.active=body
body.select_set(True)

# Scene-specific label is already picked up from the named NLA track by the
# installed Character Animations sidebar. Keep its source in the checkpoint.
panel_path='C:/Users/artur/git/Gridfall/scripts/blender_character_animations.py'
text=bpy.data.texts.get('blender_character_animations.py')
if text is None:
    text=bpy.data.texts.new('blender_character_animations.py')
text.clear()
with open(panel_path,encoding='utf-8') as panel_file:
    text.write(panel_file.read())
text.use_module=True

report={'action':action.name,'fps':24,'frames':[1,49], 'samples':samples,
        'source_scene':source.name,'scene':scene.name}
with open(os.path.join(FOLDER,'low-cut-measurements.json'),'w',encoding='utf-8') as handle:
    json.dump(report,handle,indent=2)

# Simple floor, lightsaber-colored material, and two diagnostic viewpoints.
scene.world=bpy.data.worlds.new('Custom low sweep world')
scene.world.color=(.12,.12,.12)
scene.render.engine='BLENDER_WORKBENCH'
shading=scene.display.shading
shading.light='STUDIO'
shading.color_type='TEXTURE'
shading.show_shadows=True
shading.show_cavity=True
shading.background_type='WORLD'
scene.render.resolution_x=640
scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
camera_data=bpy.data.cameras.new('Low Sweep Review Camera')
camera=bpy.data.objects.new('Low Sweep Review Camera',camera_data)
scene.collection.objects.link(camera)
scene.camera=camera
camera_data.type='ORTHO'
camera_data.ortho_scale=2.65
target=Vector((0,0,.80))

for angle,offset in [('front',Vector((0,-4,.5))),('threequarter',Vector((3,-4,1.4)))]:
    camera.location=target+offset
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    for frame in [1,13,19,23,33]:
        scene.frame_set(frame)
        scene.render.filepath=os.path.join(FOLDER,f'{angle}-{frame:02d}.png')
        bpy.ops.render.render(write_still=True)

frames_folder=os.path.join(FOLDER,'preview-frames')
os.makedirs(frames_folder,exist_ok=True)
for frame in range(1,49):
    scene.frame_set(frame)
    scene.render.filepath=os.path.join(frames_folder,f'{frame:03d}.png')
    bpy.ops.render.render(write_still=True)
camera.hide_set(True)
scene.render.engine='CYCLES'
scene.frame_set(1)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_bones=False
            area.spaces.active.region_3d.view_location=(0,0,.85)
            area.spaces.active.region_3d.view_distance=3.2
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            area.spaces.active.show_region_ui=True
output=os.path.join(FOLDER,'Obi-Wan-Custom-Low-Cut.blend')
bpy.ops.wm.save_as_mainfile(filepath=output)
print('CUSTOM_LOW_CUT '+json.dumps({'file':output,'action':ACTION,'scene':scene.name,'bones':len(rig.pose.bones),'max_wrist_error':max(s['wrist_target_error'] for s in samples),'blade_heights_strike':[s['tip'][1] for s in samples if 15<=s['frame']<=23]}))
