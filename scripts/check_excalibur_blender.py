import bpy, json
from mathutils import Matrix

rig=bpy.data.objects['Armature']
mesh=bpy.data.objects['Mesh_0.002']
poses=json.loads(mesh['gridfall_animation_pose_map'])
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
for track in rig.animation_data.nla_tracks: track.mute=True
samples=[]
for name,frame,preset in [
    ('Idle_Wielding',0,'idle'),('Alert_Wielding',28,'idle'),('Casual_Walk',7,'idle'),
    ('Running',7,'running'),('Attack',28,'attack')]:
    mesh.matrix_basis=Matrix(poses[name]['matrix_basis'])
    action=bpy.data.actions[name]; rig.animation_data.action=action
    if action.slots: rig.animation_data.action_slot=action.slots[0]
    bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
    hand=C @ rig.matrix_world @ rig.pose.bones['RightHand'].matrix @ C.inverted()
    samples.append({'name':name,'frame':frame,'preset':preset,
        'hand':[hand[r][c] for c in range(4) for r in range(4)],
        'vertices':[(C @ mesh.matrix_world @ mesh.data.vertices[i].co).to_tuple() for i in [0,100,1000]],
        'local_vertices':[(C @ mesh.data.vertices[i].co).to_tuple() for i in [0,100,1000]]})
with open('C:/Users/artur/git/Gridfall/experiments/excalibur_coordinate_check.json','w') as file:
    json.dump(samples,file)
