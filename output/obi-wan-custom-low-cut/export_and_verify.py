import bpy, json, os, struct, math
from mathutils import Vector

folder=os.path.dirname(os.path.abspath(__file__))
scene=bpy.data.scenes['Obi-Wan Custom Low Sweep']
bpy.context.window.scene=scene
rig=scene.objects['Obi_Wan_Custom_Rig']
body=scene.objects['Obi_Wan_Custom_Body']
saber=scene.objects['Obi_Wan_Custom_Lightsaber']
action=bpy.data.actions['Low_Cut_Custom']
assert action.use_fake_user
assert any(s.action==action and s.action_slot==rig.animation_data.action_slot
           for t in rig.animation_data.nla_tracks for s in t.strips)
assert bpy.data.scenes['Obi-Wan Game Low Cut'].objects['target_character.001'].animation_data.action.name=='Low_Cut'
rig.hide_set(False)
for obj in bpy.context.view_layer.objects:
    obj.select_set(False)
for obj in (rig,body,saber):
    obj.select_set(True)
bpy.context.view_layer.objects.active=rig
scene.frame_set(1)
first={p.name:p.matrix.copy() for p in rig.pose.bones}
scene.frame_set(49)
endpoint_error=max(abs(first[p.name][i][j]-p.matrix[i][j]) for p in rig.pose.bones for i in range(4) for j in range(4))
assert endpoint_error<1e-5
arm_steps=[]
previous={}
for frame in range(1,50):
    scene.frame_set(frame)
    for name in ('RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'):
        q=rig.pose.bones[name].rotation_quaternion.copy()
        if name in previous:
            angle=math.degrees(previous[name].rotation_difference(q).angle)
            angle=min(angle,360-angle)
            arm_steps.append({'frame':frame,'bone':name,'degrees':angle})
        previous[name]=q
largest_step=max(arm_steps,key=lambda x:x['degrees'])
assert largest_step['degrees']<45, largest_step
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.co.x-=1
                    key.handle_left.x-=1
                    key.handle_right.x-=1
scene.frame_start=0
scene.frame_end=48
scene.frame_set(0)
path=os.path.join(folder,'Obi-Wan-Low-Cut-Custom.glb')
bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,
    export_animations=True,export_animation_mode='ACTIVE_ACTIONS',
    export_nla_strips_merged_animation_name='Low_Cut_Custom',
    export_force_sampling=True,export_frame_range=True,export_anim_slide_to_zero=True,
    export_bake_animation=True,export_materials='EXPORT')
with open(path,'rb') as handle:
    blob=handle.read()
    json_length=struct.unpack_from('<I',blob,12)[0]
    document=json.loads(blob[20:20+json_length])
assert len(document.get('skins',[]))==1
assert len(document['skins'][0]['joints'])==24
assert len(document.get('animations',[]))==1
animation=document['animations'][0]
assert animation['name']=='Low_Cut_Custom'
assert len(document.get('meshes',[]))==2
duration=max(document['accessors'][s['input']]['max'][0] for s in animation['samplers'])
assert abs(duration-2)<.001
assert all('bufferView' in image for image in document['images'])

check=bpy.data.scenes.new('Temporary GLB verification')
check.render.fps=24
bpy.context.window.scene=check
bpy.ops.import_scene.gltf(filepath=path)
imported_rigs=[o for o in check.objects if o.type=='ARMATURE']
assert len(imported_rigs)==1
new_rig=imported_rigs[0]
assert new_rig.animation_data and new_rig.animation_data.action
assert len(new_rig.data.bones)==24
checks=[]
for frame in (1,13,19,23,49):
    bpy.context.window.scene=scene
    scene.frame_set(frame-1)
    expected={n:rig.matrix_world@rig.pose.bones[n].head for n in ['Hips','RightHand','LeftFoot','RightFoot']}
    bpy.context.window.scene=check
    check.frame_set(frame-1)
    error=max((new_rig.matrix_world@new_rig.pose.bones[n].head-expected[n]).length for n in expected)
    checks.append({'frame':frame,'max_joint_error_m':error})
assert max(x['max_joint_error_m'] for x in checks)<.001
report={'glb':path,'bytes':len(blob),'animation':animation['name'],'duration_seconds':duration,
        'bones':24,'meshes':2,'embedded_images':len(document['images']),
        'idle_endpoint_matrix_error':endpoint_error,'round_trip_joint_checks':checks,
        'original_low_cut_preserved':True,'largest_arm_rotation_per_frame':largest_step}
with open(os.path.join(folder,'verification.json'),'w') as handle:
    json.dump(report,handle,indent=2)
print('LOW_CUT_VERIFIED '+json.dumps(report))
