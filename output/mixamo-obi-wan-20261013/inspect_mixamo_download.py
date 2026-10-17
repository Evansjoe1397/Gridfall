import bpy,json
bpy.ops.import_scene.fbx(filepath='C:/Users/artur/Downloads/Sword And Shield Slash.fbx')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='Cube')
body.data.calc_loop_triangles()
result={'actions':[(a.name,list(a.frame_range),[s.identifier for s in a.slots]) for a in bpy.data.actions], 'rig':rig.name,'matrix':[list(row) for row in rig.matrix_world],'bones':[(b.name,b.length) for b in rig.data.bones],'mesh':body.name,'vertices':len(body.data.vertices),'triangles':len(body.data.loop_triangles),'images':[(i.name,list(i.size),bool(i.packed_file)) for i in bpy.data.images if i.type=='IMAGE'],'active':rig.animation_data.action.name if rig.animation_data and rig.animation_data.action else None}
print('MIXAMO_INSPECT '+json.dumps(result))
