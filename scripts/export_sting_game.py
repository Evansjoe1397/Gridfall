"""Background Blender export: geometry-only Sting plus calibrated hand offsets."""
import bpy, json
from mathutils import Matrix

root=bpy.data.objects['Weapon_ElvenSilverblade']
mesh=bpy.data.objects['Mesh_0.001']
rig=bpy.data.objects['Armature']
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
def hand_offset():
    bpy.context.view_layer.update()
    # glTF joints retain Blender's bone-local axes; only mesh vertex coordinates
    # are converted to Y-up. A leading C here incorrectly rotates the grip 90°.
    m=(rig.matrix_world @ rig.pose.bones['RightHand'].matrix).inverted() @ mesh.matrix_world @ C.inverted()
    return [m[r][c] for c in range(4) for r in range(4)]
running=hand_offset()
saved=[(o,o.matrix_basis.copy(),o.matrix_parent_inverse.copy()) for o in [root,mesh]]
with bpy.data.libraries.load('C:/Users/artur/git/Gridfall/experiments/Merylin_Sting_Before_Running_Adjustments_20260914_181820.blend',link=False) as (src,dst):
    dst.objects=['Weapon_ElvenSilverblade','Mesh_0.001']
for current,prior in zip([root,mesh],dst.objects):
    current.matrix_basis=prior.matrix_basis
    current.matrix_parent_inverse=prior.matrix_parent_inverse
idle=hand_offset()
for o,basis,inverse in saved:
    o.matrix_basis=basis
    o.matrix_parent_inverse=inverse

# Only export a standalone copy of this mesh, with no rig/body duplication.
scene=bpy.data.scenes.new('Sting_Game_Export')
bpy.context.window.scene=scene
copy=mesh.copy(); copy.data=mesh.data.copy(); copy.parent=None
copy.animation_data_clear(); copy.matrix_world=Matrix.Identity(4)
copy.name='Sting_Blade'; scene.collection.objects.link(copy)
copy.hide_viewport=False; copy.hide_render=False; copy.hide_set(False)
copy['sting_idle_matrix']=idle
copy['sting_running_matrix']=running
copy['sting_pose_source']='Idle/Alert/Casual: pre-Running checkpoint; Running/Attack: approved checkpoint'
images=set()
for slot in copy.material_slots:
    slot.material=slot.material.copy()
    for node in slot.material.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image:
            original=node.image
            image=original.copy()
            node.image=image
            if max(image.size)>1024: image.scale(1024,1024)
            image.pack(); images.add(image)
copy.select_set(True); bpy.context.view_layer.objects.active=copy
out='C:/Users/artur/git/Gridfall/public/models/sting.glb'
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_animations=False,export_extras=True)
result={'output':out,'MiB':__import__('os').path.getsize(out)/1048576,'vertices':len(copy.data.vertices),'triangles':sum(len(p.vertices)-2 for p in copy.data.polygons),'texture_sizes':[list(i.size) for i in images],'idle_matrix':idle,'running_matrix':running}
