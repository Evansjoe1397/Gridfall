"""Run in Blender after importing the original Hi3D cemetery arena.

Extract six regular stone slabs from the source's UV-mapped albedo, using
emission so no additional lighting is baked in. Coordinates are inset from
grout and avoid colored squares, the tomb, pillars, and crates.
"""
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'textures' / 'lordaeron'
out.mkdir(parents=True, exist_ok=True)
source = next(o for o in bpy.data.scenes['Lordaeron - Source Floor Tiles'].objects if o.type == 'MESH')
scene = bpy.data.scenes.get('Lordaeron - Tile Sampling')
if scene is None:
    scene = bpy.data.scenes.new('Lordaeron - Tile Sampling')
    obj = source.copy()
    obj.data = source.data.copy()
    scene.collection.objects.link(obj)
    shader = next(n for n in source.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    material = bpy.data.materials.new('Lordaeron tile albedo sampling')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = shader.inputs['Base Color'].links[0].from_node.image
    material.node_tree.links.new(texture.outputs['Color'], emission.inputs['Color'])
    material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    obj.data.materials.clear()
    obj.data.materials.append(material)
    camera = bpy.data.objects.new('Lordaeron Sampling Camera', bpy.data.cameras.new('Lordaeron Sampling Camera'))
    scene.collection.objects.link(camera)
    scene.camera = camera

scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.resolution_percentage = 100
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.camera.data.type = 'ORTHO'
scene.camera.data.ortho_scale = 0.041
scene.camera.rotation_euler = (0, 0, 0)
# Pixel centers on a 1024px, 1.05-unit orthographic source overview.
for index, (px, py) in enumerate([(462, 252), (512, 302), (560, 353), (608, 407), (462, 617), (560, 727)], 1):
    scene.camera.location = ((px - 512) * 1.05 / 1024, (512 - py) * 1.05 / 1024, 2)
    scene.render.filepath = str(out / f'base-{index}.png')
    bpy.ops.render.render(write_still=True, scene=scene.name)
