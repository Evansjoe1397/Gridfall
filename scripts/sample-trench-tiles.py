"""Run in the open trench-perimeter.blend to extract the eight source tile colors.

The sampling scene uses a copy of Mesh_0 with Image_0 connected directly to an
Emission shader. Orthographic renders extract its UV-mapped albedo, without
adding lights/shadows. The original mesh and materials remain unchanged.
"""
import math
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'textures' / 'trench'
out.mkdir(parents=True, exist_ok=True)
previous = bpy.context.scene
scene = bpy.data.scenes.get('Trench - Tile Sampling')
if scene is None:
    scene = bpy.data.scenes.new('Trench - Tile Sampling')
    source = next(o for o in bpy.data.scenes['Trench - Source Original'].objects if o.type == 'MESH')
    obj = source.copy()
    obj.data = source.data.copy()
    scene.collection.objects.link(obj)
    source_shader = next(n for n in source.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = source_shader.inputs['Base Color'].links[0].from_node.image
    material = bpy.data.materials.new('Trench tile albedo sampling')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    material.node_tree.links.new(texture.outputs['Color'], emission.inputs['Color'])
    material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    obj.data.materials.clear()
    obj.data.materials.append(material)
    camera = bpy.data.objects.new('Tile Sampling Camera', bpy.data.cameras.new('Tile Sampling Camera'))
    scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.resolution_percentage = 100
bpy.context.window.scene = scene
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.camera.data.ortho_scale = 0.145
scene.camera.rotation_euler.z = -math.pi / 2
try:
    if not globals().get('BASE_ONLY', False):
        for row, x in [(4, 0.080), (5, -0.0815)]:
            for column, y in zip('CDEF', [0.226, 0.075, -0.075, -0.225]):
                scene.camera.location = (x, y, 2)
                scene.render.filepath = str(out / f'{column}{row}.png')
                bpy.ops.render.render(write_still=True)
    # Near-square slabs in the clear left/right lanes. Inset the sample from
    # grout and avoid the distorted rectangles, pillars, crates and vegetation.
    scene.camera.data.ortho_scale = 0.122
    for index, (x, y) in enumerate([(-0.577, 0.226), (0.577, 0.226), (-0.577, 0.075), (0.577, 0.075)]):
        scene.camera.location = (x, y, 2)
        scene.render.filepath = str(out / f'base-{index + 1}.png')
        bpy.ops.render.render(write_still=True)
finally:
    bpy.context.window.scene = previous
