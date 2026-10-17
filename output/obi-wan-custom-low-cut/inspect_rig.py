import bpy, json, numpy as np
from mathutils import Matrix, Vector
s=bpy.data.scenes['Obi-Wan Game Low Cut']
bpy.context.window.scene=s
r=s.objects['target_character.001']; w=s.objects['Lightsaber']
r.animation_data.use_nla=False
r.animation_data.action=bpy.data.actions['Idle']
r.animation_data.action_slot=r.animation_data.action.slots[0]
s.frame_set(1)
w.matrix_basis=Matrix(json.loads(w['gridfall_animation_pose_map'])['default']['matrix_basis'])
bpy.context.view_layer.update()
v=np.array([list(p.co) for p in w.data.vertices])
center=v.mean(axis=0)
_,_,vh=np.linalg.svd(v-center,full_matrices=False)
axis=vh[0]
proj=(v-center)@axis
hand=r.pose.bones['RightHand']
rel=hand.matrix.inverted()@r.matrix_world.inverted()@w.matrix_world
print('RIG_DIAG '+json.dumps({'idle':[(p.name,list(p.head),list(p.matrix.to_quaternion())) for p in r.pose.bones], 'saber_pca':axis.tolist(),'saber_center':center.tolist(),'saber_range':[float(proj.min()),float(proj.max())],'hand_relative':[list(row) for row in rel], 'mesh_materials':[m.name for m in w.data.materials],'body_bounds':[list(c) for c in s.objects['char1.001'].bound_box], 'arm_matrix':[list(row) for row in r.matrix_world]}))
