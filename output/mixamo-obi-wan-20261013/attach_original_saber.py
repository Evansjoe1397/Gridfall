import bpy, json, os
from mathutils import Matrix, Vector

scene=bpy.context.scene
assert scene.name=='Obi-Wan Mixamo Sword Slash'
rig=scene.objects['Obi_Wan_Mixamo_Rig']
source=bpy.data.objects['Lightsaber']
old_rig=source.parent
old_hand=old_rig.data.bones['RightHand']
new_hand=rig.data.bones['RightHand']
action=rig.animation_data.action
destination='C:/Users/artur/git/Gridfall/experiments/Obi-Wan-Mixamo-Slash-With-Lightsaber-20261013.blend'
assert not os.path.exists(destination)
assert not any(o.parent==rig and o.parent_bone=='RightHand' for o in scene.objects)
if bpy.context.screen.is_animation_playing:
    bpy.ops.screen.animation_cancel(restore_frame=False)

grip=Matrix(json.loads(source['gridfall_animation_pose_map'])['Flip']['matrix_basis'])
# Convert the original bone-tail parent transform into a hand-head-relative
# transform, then into the imported skeleton's rest frame and bone-tail frame.
original_relative=Matrix.Translation((0,old_hand.length,0)) @ source.matrix_parent_inverse @ grip
new_relative=new_hand.matrix_local.inverted() @ old_hand.matrix_local @ original_relative
new_basis=Matrix.Translation((0,-new_hand.length,0)) @ new_relative
saber=source.copy()
saber.name='Obi_Wan_Mixamo_Lightsaber'
scene.collection.objects.link(saber)
saber.animation_data_clear()
saber.parent=rig
saber.parent_type='BONE'
saber.parent_bone='RightHand'
saber.matrix_parent_inverse=Matrix.Identity(4)
saber.matrix_basis=new_basis
saber.hide_set(False)
saber.hide_viewport=False
saber.hide_render=False
stored={'matrix_basis':[list(row) for row in new_basis]}
saber['gridfall_animation_pose_map']=json.dumps({'default':stored,action.name:stored})
saber['gridfall_grip_source']='Original Flip animation'

measurements=[]
for frame in (1,11,21,31,42):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    actual=rig.pose.bones['RightHand'].matrix.inverted() @ rig.matrix_world.inverted() @ saber.matrix_world
    error=max(abs(actual[i][j]-new_relative[i][j]) for i in range(4) for j in range(4))
    assert error<.001, (frame,error)
    measurements.append({'frame':frame,'hand_relative_matrix_error':error})
assert rig.animation_data.action==action
scene.frame_set(21)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=destination)
result={'file':destination,'saber':saber.name,'grip_source':'Original Flip',
        'bone_parent':saber.parent_bone,'verified_frames':measurements,
        'action':action.name,'mesh_reused':saber.data==source.data}
