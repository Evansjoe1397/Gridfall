import bpy,json
bpy.ops.import_scene.fbx(filepath='C:/Users/artur/git/Gridfall/output/mixamo-obi-wan-20261013/Obi-Wan-Mixamo.fbx')
print('FBX_INSPECT '+json.dumps({'objects':[(o.name,o.type) for o in bpy.context.scene.objects],'actions':[(a.name,list(a.frame_range)) for a in bpy.data.actions]}))
