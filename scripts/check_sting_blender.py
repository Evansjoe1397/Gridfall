import bpy,json
from mathutils import Matrix
rig=bpy.data.objects['Armature']; mesh=bpy.data.objects['Mesh_0.001']
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
for t in rig.animation_data.nla_tracks: t.mute=True
data=[]
root=bpy.data.objects['Weapon_ElvenSilverblade']
with bpy.data.libraries.load('C:/Users/artur/git/Gridfall/experiments/Merylin_Sting_Before_Running_Adjustments_20260914_181820.blend',link=False) as (src,dst):
    dst.objects=['Weapon_ElvenSilverblade','Mesh_0.001']
for name,frame in [('Attack_DoubleSwing',7),('Running',7),('Idle_Wielding',0),('Alert_Wielding',28),('Casual_Walk',7)]:
    if name=='Idle_Wielding':
        for current,prior in zip([root,mesh],dst.objects):
            current.matrix_basis=prior.matrix_basis
            current.matrix_parent_inverse=prior.matrix_parent_inverse
    a=bpy.data.actions[name]; rig.animation_data.action=a
    if a.slots: rig.animation_data.action_slot=a.slots[0]
    bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
    hand=C @ rig.matrix_world @ rig.pose.bones['RightHand'].matrix @ C.inverted()
    data.append({'name':name,'frame':frame,'hand':[hand[r][c] for c in range(4) for r in range(4)],
        'vertices':[(C @ mesh.matrix_world @ mesh.data.vertices[i].co).to_tuple() for i in [0,100,1000]],
        'local_vertices':[(C @ mesh.data.vertices[i].co).to_tuple() for i in [0,100,1000]]})
with open('C:/Users/artur/git/Gridfall/experiments/sting_coordinate_check.json','w') as f: json.dump(data,f)
