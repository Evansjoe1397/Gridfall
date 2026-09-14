"""Background Blender export: geometry-only Excalibur plus calibrated hand offsets."""
import bpy, json, os
from mathutils import Matrix

root=bpy.data.objects['Weapon_Excalibur']
mesh=bpy.data.objects['Mesh_0.002']
rig=bpy.data.objects['Armature']
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
poses=json.loads(mesh.get('gridfall_animation_pose_map','{}'))

def hand_offset(pose_name):
    mesh.matrix_basis=Matrix(poses[pose_name]['matrix_basis'])
    bpy.context.view_layer.update()
    matrix=(rig.matrix_world @ rig.pose.bones['RightHand'].matrix).inverted() @ mesh.matrix_world @ C.inverted()
    return [matrix[r][c] for c in range(4) for r in range(4)]

idle=hand_offset('Idle_Wielding')
running=hand_offset('Running')
attack=hand_offset('Attack')

scene=bpy.data.scenes.new('Excalibur_Game_Export')
bpy.context.window.scene=scene
copy=mesh.copy(); copy.data=mesh.data.copy(); copy.parent=None
copy.animation_data_clear(); copy.matrix_world=Matrix.Identity(4)
copy.name='Excalibur_Blade'; scene.collection.objects.link(copy)
copy.hide_viewport=False; copy.hide_render=False; copy.hide_set(False)
copy['excalibur_idle_matrix']=idle
copy['excalibur_running_matrix']=running
copy['excalibur_attack_matrix']=attack
copy['excalibur_pose_source']='Idle/Alert/Casual, Running, and Attack authored on the Merylin rig'
copy['excalibur_attack_action']='Attack'
copy['excalibur_impact_frame']=28
images=set()
for slot in copy.material_slots:
    slot.material=slot.material.copy()
    for node in slot.material.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image:
            image=node.image.copy(); node.image=image
            if max(image.size)>1024: image.scale(1024,1024)
            image.pack(); images.add(image)
copy.select_set(True); bpy.context.view_layer.objects.active=copy
out='C:/Users/artur/git/Gridfall/public/models/excalibur.glb'
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_animations=False,export_extras=True)
print(json.dumps({'output':out,'MiB':os.path.getsize(out)/1048576,
    'vertices':len(copy.data.vertices),'triangles':sum(len(p.vertices)-2 for p in copy.data.polygons),
    'texture_sizes':[list(i.size) for i in images]}))
