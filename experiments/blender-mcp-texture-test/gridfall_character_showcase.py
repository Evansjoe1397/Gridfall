from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"
OUTPUT.mkdir(exist_ok=True)

FRAME_IDLE_START = 1
FRAME_WALK_START = 70
FRAME_ATTACK_START = 150
FRAME_END = 230


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def rgba(hex_color: int, alpha: float = 1.0) -> tuple[float, float, float, float]:
    return (
        ((hex_color >> 16) & 255) / 255,
        ((hex_color >> 8) & 255) / 255,
        (hex_color & 255) / 255,
        alpha,
    )


def make_mat(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float = 0.72,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    strength: float = 0.0,
    noise: bool = True,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        return mat
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    if noise and not emission:
        tex = nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 24
        tex.inputs["Detail"].default_value = 7
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.22
        ramp.color_ramp.elements[0].color = tuple(max(0, c * 0.58) for c in color[:3]) + (color[3],)
        ramp.color_ramp.elements[1].position = 1.0
        ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.25 + 0.04) for c in color[:3]) + (color[3],)
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.04
        bump.inputs["Distance"].default_value = 0.055
        links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(tex.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def cube(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = parent
    if bevel:
        mod = obj.modifiers.new("softened edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def sphere(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    segments: int = 24,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def cyl(
    name: str,
    loc: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    vertices: int = 18,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cone(
    name: str,
    loc: tuple[float, float, float],
    radius1: float,
    radius2: float,
    depth: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    vertices: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def capsule_like(
    name: str,
    loc: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    # Capsule primitives exist in recent Blender, but this stays portable.
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = loc
    root.parent = parent
    body = cyl(f"{name}_body", (0, 0, 0), radius, depth, mat, root, 18)
    body.rotation_euler[0] = math.radians(90)
    sphere(f"{name}_cap_a", (0, -depth / 2, 0), (radius, radius, radius), mat, root, 18, 8)
    sphere(f"{name}_cap_b", (0, depth / 2, 0), (radius, radius, radius), mat, root, 18, 8)
    return root


def empty(name: str, loc: tuple[float, float, float]) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.35
    obj.location = loc
    return obj


def key(obj: bpy.types.Object, data_path: str, frame: int) -> None:
    obj.keyframe_insert(data_path=data_path, frame=frame)


def animate_root_idle_walk_attack(root: bpy.types.Object, stride: float = 0.32, bob: float = 0.10) -> None:
    start = root.location.copy()
    for frame, z in [(1, start.z), (30, start.z + bob), (60, start.z)]:
        root.location.z = z
        key(root, "location", frame)

    for frame, xoff, zoff in [
        (70, 0, 0),
        (95, stride, bob * 0.8),
        (120, stride * 2, 0),
        (145, stride * 2.7, bob * 0.4),
    ]:
        root.location = (start.x + xoff, start.y, start.z + zoff)
        key(root, "location", frame)

    for frame, xoff, zoff in [(150, stride * 2.7, 0), (175, stride * 3.0, bob * 0.7), (210, stride * 2.7, 0)]:
        root.location = (start.x + xoff, start.y, start.z + zoff)
        key(root, "location", frame)


def animate_limb_swing(left: bpy.types.Object, right: bpy.types.Object, amount: float = 18) -> None:
    for frame, angle in [(70, -amount), (95, amount), (120, -amount), (145, amount)]:
        left.rotation_euler[0] = math.radians(angle)
        right.rotation_euler[0] = math.radians(-angle)
        key(left, "rotation_euler", frame)
        key(right, "rotation_euler", frame)


def make_character_label(text: str, loc: tuple[float, float, float], mat: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(68), 0, 0))
    obj = bpy.context.object
    obj.name = f"label_{text}"
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = 0.36
    obj.data.extrude = 0.012
    obj.data.materials.append(mat)
    return obj


def create_magician(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = empty("Long Hat Logan_rig_root", (-4.1, -0.4, 0.0))
    root["character"] = "magician"

    robe = cone("logan_layered_robe", (0, 0, 0.98), 0.58, 0.30, 1.55, mats["logan_robe"], root, 30)
    collar = cyl("logan_gold_collar", (0, 0, 1.72), 0.38, 0.08, mats["gold"], root, 28)
    collar.scale.y = 0.72
    head = sphere("logan_head", (0, 0, 1.96), (0.26, 0.24, 0.26), mats["skin"], root, 24, 12)
    brim = cyl("logan_hat_brim", (0, 0, 2.18), 0.46, 0.07, mats["logan_trim"], root, 32)
    hat = cone("logan_bent_tall_hat", (0.06, 0, 2.78), 0.32, 0.045, 1.25, mats["logan_robe"], root, 32)
    hat.rotation_euler[1] = math.radians(-8)

    beard = cone("logan_short_beard", (0, -0.23, 1.78), 0.18, 0.02, 0.42, mats["silver_hair"], root, 18)
    beard.rotation_euler[0] = math.radians(18)

    left_arm = capsule_like("logan_left_sleeve", (-0.43, -0.02, 1.32), 0.085, 0.65, mats["logan_robe"], root)
    right_arm = capsule_like("logan_right_sleeve_cast_arm", (0.48, -0.02, 1.36), 0.085, 0.70, mats["logan_robe"], root)
    left_arm.rotation_euler[2] = math.radians(-18)
    right_arm.rotation_euler[2] = math.radians(22)

    staff = cyl("logan_arcane_staff", (0.72, -0.08, 1.26), 0.035, 1.35, mats["dark_wood"], root, 12)
    staff.rotation_euler[0] = math.radians(8)
    staff.rotation_euler[2] = math.radians(-18)
    orb = sphere("logan_floating_arcane_orb", (0.84, -0.12, 2.08), (0.16, 0.16, 0.16), mats["cyan_magic"], root, 32, 16)
    halo = cyl("logan_orb_ring", (0.84, -0.12, 2.08), 0.24, 0.018, mats["cyan_magic"], root, 48)
    halo.rotation_euler[1] = math.radians(90)

    for frame, scale in [(150, (0.16, 0.16, 0.16)), (178, (0.27, 0.27, 0.27)), (210, (0.16, 0.16, 0.16))]:
        orb.scale = scale
        key(orb, "scale", frame)
    for frame, rz in [(150, 22), (178, -30), (210, 22)]:
        right_arm.rotation_euler[2] = math.radians(rz)
        key(right_arm, "rotation_euler", frame)
    for frame, rot in [(1, 0), (60, 360), (120, 720), (180, 1080), (230, 1440)]:
        halo.rotation_euler[2] = math.radians(rot)
        key(halo, "rotation_euler", frame)

    animate_root_idle_walk_attack(root, 0.24, 0.09)
    make_character_label("Long Hat Logan", (-4.1, -1.55, 0.05), mats["label"])
    return root


def create_shinobi(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = empty("Obi Wan Shinobi_rig_root", (0.0, -0.25, 0.0))
    root["character"] = "shinobi"

    robe = cone("shinobi_robed_torso", (0, 0, 1.05), 0.46, 0.28, 1.30, mats["shinobi_robe"], root, 28)
    sash = cyl("shinobi_sash", (0, -0.01, 1.08), 0.32, 0.08, mats["sash"], root, 30)
    sash.scale.y = 0.72
    head = sphere("shinobi_head", (0, 0, 1.86), (0.24, 0.23, 0.24), mats["skin"], root, 24, 12)
    hair = sphere("shinobi_hair_cap", (0, 0.03, 2.00), (0.25, 0.20, 0.12), mats["silver_hair"], root, 24, 8)
    beard = cone("shinobi_pointed_beard", (0, -0.19, 1.67), 0.14, 0.02, 0.34, mats["silver_hair"], root, 16)
    beard.rotation_euler[0] = math.radians(15)

    cloak = cone("shinobi_back_cloak", (0, 0.24, 1.05), 0.56, 0.20, 1.45, mats["cloak"], root, 24)
    cloak.scale.y = 0.32
    cloak.rotation_euler[0] = math.radians(-8)

    left_arm = capsule_like("shinobi_left_arm", (-0.39, -0.02, 1.33), 0.075, 0.58, mats["shinobi_robe"], root)
    right_arm = capsule_like("shinobi_saber_arm", (0.42, -0.05, 1.36), 0.075, 0.64, mats["shinobi_robe"], root)
    left_arm.rotation_euler[2] = math.radians(-18)
    right_arm.rotation_euler[2] = math.radians(25)
    left_leg = capsule_like("shinobi_left_leg", (-0.17, 0, 0.45), 0.085, 0.54, mats["dark_cloth"], root)
    right_leg = capsule_like("shinobi_right_leg", (0.17, 0, 0.45), 0.085, 0.54, mats["dark_cloth"], root)

    hilt = cyl("shinobi_saber_hilt", (0.65, -0.08, 1.15), 0.045, 0.32, mats["metal"], root, 16)
    hilt.rotation_euler[2] = math.radians(-20)
    blade = cyl("shinobi_lightsaber_blade", (0.95, -0.12, 1.65), 0.025, 1.15, mats["blue_saber"], root, 18)
    blade.rotation_euler[2] = math.radians(-20)
    trail = cube("shinobi_saber_motion_trail", (1.05, -0.16, 1.58), (0.05, 0.02, 1.35), mats["blue_saber_soft"], root, 0.01)
    trail.rotation_euler[2] = math.radians(-20)

    animate_limb_swing(left_leg, right_leg, 20)
    animate_limb_swing(left_arm, right_arm, 14)
    for frame, rz in [(150, 25), (170, -72), (192, -18), (210, 25)]:
        right_arm.rotation_euler[2] = math.radians(rz)
        blade.rotation_euler[2] = math.radians(rz - 45)
        hilt.rotation_euler[2] = math.radians(rz - 45)
        trail.rotation_euler[2] = math.radians(rz - 45)
        key(right_arm, "rotation_euler", frame)
        key(blade, "rotation_euler", frame)
        key(hilt, "rotation_euler", frame)
        key(trail, "rotation_euler", frame)
    for frame, scale in [(150, (0.05, 0.02, 0.2)), (170, (0.12, 0.025, 1.55)), (210, (0.05, 0.02, 0.2))]:
        trail.scale = scale
        key(trail, "scale", frame)

    animate_root_idle_walk_attack(root, 0.42, 0.08)
    make_character_label("Obi Wan Shinobi", (0, -1.55, 0.05), mats["label"])
    return root


def create_orkk(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = empty("Da Orkk_rig_root", (4.2, -0.35, 0.0))
    root["character"] = "orkk"

    torso = sphere("orkk_heavy_torso", (0, 0, 1.08), (0.50, 0.38, 0.62), mats["orkk_skin"], root, 28, 14)
    belly_plate = cube("orkk_belly_iron_plate", (0, -0.31, 1.05), (0.62, 0.08, 0.58), mats["dark_metal"], root, 0.04)
    head = sphere("orkk_head", (0, -0.02, 1.83), (0.34, 0.30, 0.30), mats["orkk_skin"], root, 28, 12)
    brow = cube("orkk_heavy_brow", (0, -0.25, 1.93), (0.58, 0.09, 0.08), mats["dark_orkk"], root, 0.025)
    for side in (-1, 1):
        tusk = cone(f"orkk_tusk_{side}", (side * 0.18, -0.33, 1.68), 0.04, 0.0, 0.34, mats["tusk"], root, 12)
        tusk.rotation_euler[0] = math.radians(78)
        tusk.rotation_euler[2] = math.radians(side * 12)

    left_arm = capsule_like("orkk_left_massive_arm", (-0.54, -0.03, 1.25), 0.14, 0.78, mats["orkk_skin"], root)
    right_arm = capsule_like("orkk_club_arm", (0.58, -0.03, 1.27), 0.14, 0.82, mats["orkk_skin"], root)
    left_arm.rotation_euler[2] = math.radians(-24)
    right_arm.rotation_euler[2] = math.radians(28)
    left_leg = capsule_like("orkk_left_leg", (-0.24, 0.02, 0.42), 0.13, 0.55, mats["orkk_skin"], root)
    right_leg = capsule_like("orkk_right_leg", (0.24, 0.02, 0.42), 0.13, 0.55, mats["orkk_skin"], root)

    club = cyl("orkk_spiked_club_handle", (0.82, -0.08, 1.25), 0.055, 1.15, mats["dark_wood"], root, 12)
    club.rotation_euler[2] = math.radians(-28)
    club_head = cyl("orkk_spiked_club_head", (1.08, -0.12, 1.82), 0.18, 0.42, mats["wood"], root, 12)
    club_head.rotation_euler[2] = math.radians(-28)
    for idx, z in enumerate([1.70, 1.83, 1.96]):
        spike = cone(f"orkk_club_spike_{idx}", (1.10, -0.33, z), 0.045, 0.0, 0.20, mats["metal"], root, 10)
        spike.rotation_euler[0] = math.radians(90)

    shield = cyl("orkk_iron_shield", (-0.73, -0.14, 1.14), 0.37, 0.10, mats["dark_metal"], root, 32)
    shield.scale.x = 0.78
    shield.rotation_euler[0] = math.radians(90)
    shield_boss = sphere("orkk_shield_boss", (-0.73, -0.21, 1.14), (0.12, 0.04, 0.12), mats["metal"], root, 18, 8)
    rage_aura = sphere("orkk_rage_aura", (0, 0, 1.10), (0.72, 0.55, 0.84), mats["rage_glow"], root, 32, 12)
    rage_aura.display_type = "WIRE"

    animate_limb_swing(left_leg, right_leg, 14)
    animate_limb_swing(left_arm, right_arm, 12)
    for frame, rz in [(150, 28), (178, -60), (205, 20)]:
        right_arm.rotation_euler[2] = math.radians(rz)
        club.rotation_euler[2] = math.radians(rz - 58)
        club_head.rotation_euler[2] = math.radians(rz - 58)
        key(right_arm, "rotation_euler", frame)
        key(club, "rotation_euler", frame)
        key(club_head, "rotation_euler", frame)
    for frame, scale in [(150, (0.55, 0.42, 0.66)), (178, (0.82, 0.62, 0.96)), (205, (0.55, 0.42, 0.66))]:
        rage_aura.scale = scale
        key(rage_aura, "scale", frame)

    animate_root_idle_walk_attack(root, 0.30, 0.07)
    make_character_label("Da Orkk", (4.2, -1.55, 0.05), mats["label"])
    return root


def create_showcase_stage(mats: dict[str, bpy.types.Material]) -> None:
    cube("character_showcase_base", (0, 0, -0.08), (11.8, 4.4, 0.16), mats["stage"], None, 0.08)
    for x in [-4.2, 0, 4.2]:
        cube(f"hero_plinth_{x}", (x, -0.15, 0.035), (2.4, 2.4, 0.12), mats["plinth"], None, 0.05)
    for x in [-5.4, -3.0, -1.2, 1.2, 3.0, 5.4]:
        cube(f"background_tile_{x}", (x, 1.55, 0.0), (1.08, 1.08, 0.08), mats["stage_tile"], None, 0.03)


def create_effects(mats: dict[str, bpy.types.Material]) -> None:
    # Magician projectile crossing the showcase.
    start = Vector((-3.35, -0.55, 2.15))
    mid = Vector((-1.2, -0.55, 2.72))
    end = Vector((0.85, -0.55, 1.92))
    projectile = sphere("logan_cast_projectile_animated", tuple(start), (0.10, 0.10, 0.10), mats["cyan_magic"], None, 32, 12)
    for frame, loc, scale in [
        (150, start, (0.10, 0.10, 0.10)),
        (180, mid, (0.22, 0.22, 0.22)),
        (215, end, (0.14, 0.14, 0.14)),
    ]:
        projectile.location = loc
        projectile.scale = scale
        key(projectile, "location", frame)
        key(projectile, "scale", frame)

    ring = cyl("shared_attack_timing_ring", (0.85, -0.55, 0.08), 0.52, 0.025, mats["amber_magic"], None, 64)
    ring.rotation_euler[0] = math.radians(90)
    for frame, scale in [(150, (0.45, 0.45, 0.45)), (180, (1.0, 1.0, 1.0)), (215, (0.58, 0.58, 0.58))]:
        ring.scale = scale
        key(ring, "scale", frame)


def add_lights_camera() -> None:
    bpy.ops.object.light_add(type="AREA", location=(0, -4.8, 7.2))
    key_light = bpy.context.object
    key_light.name = "wide_soft_key_light"
    key_light.data.energy = 720
    key_light.data.size = 7.0

    bpy.ops.object.light_add(type="POINT", location=(-5.0, -1.8, 3.2))
    blue = bpy.context.object
    blue.name = "cyan_character_rim_light"
    blue.data.color = (0.2, 0.8, 1)
    blue.data.energy = 170

    bpy.ops.object.light_add(type="POINT", location=(5.0, -1.5, 3.0))
    red = bpy.context.object
    red.name = "warm_rage_rim_light"
    red.data.color = (1, 0.36, 0.16)
    red.data.energy = 150

    bpy.ops.object.camera_add(location=(0.4, -7.6, 3.35), rotation=(math.radians(64), 0, math.radians(2)))
    camera = bpy.context.object
    camera.name = "character_showcase_camera"
    camera.data.lens = 34
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 7.0
    camera.data.dof.aperture_fstop = 7.5
    bpy.context.scene.camera = camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.frame_start = FRAME_IDLE_START
    scene.frame_end = FRAME_END
    scene.frame_set(1)
    scene.render.fps = 24
    engine_ids = {item.identifier for item in scene.render.bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engine_ids else "BLENDER_EEVEE"
    scene.world.color = (0.015, 0.018, 0.018)
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    for name, frame in [
        ("Idle loop begins", 1),
        ("Walk cycle begins", FRAME_WALK_START),
        ("Attack/Cast begins", FRAME_ATTACK_START),
        ("Showcase end", FRAME_END),
    ]:
        scene.timeline_markers.new(name, frame=frame)

    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.overlay.show_floor = False


def save_outputs() -> None:
    blend_path = OUTPUT / "gridfall_character_showcase.blend"
    glb_path = OUTPUT / "gridfall_character_showcase.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", export_animations=True)
    print(f"Saved {blend_path}")
    print(f"Saved {glb_path}")


def main() -> None:
    clear_scene()
    mats = {
        "stage": make_mat("showcase dark slate base", rgba(0x101816), 0.88),
        "plinth": make_mat("showcase carved hero plinth", rgba(0x1b3029), 0.8),
        "stage_tile": make_mat("showcase rear tactical tile", rgba(0x243b34), 0.82),
        "label": make_mat("warm label text", rgba(0xffd166), 0.45, 0.0, rgba(0xffb84d), 0.35, False),
        "skin": make_mat("stylized warm skin", rgba(0xb78663), 0.68),
        "silver_hair": make_mat("silver gray hair", rgba(0xb8c0bd), 0.74),
        "metal": make_mat("bright worn steel", rgba(0xa8b3b4), 0.38, 0.45),
        "dark_metal": make_mat("dark battered iron", rgba(0x343b3d), 0.46, 0.55),
        "gold": make_mat("aged gold trim", rgba(0xd7a83d), 0.42, 0.30),
        "dark_wood": make_mat("dark weapon wood", rgba(0x40220e), 0.88),
        "wood": make_mat("club stained wood", rgba(0x7a451f), 0.86),
        "tusk": make_mat("orkk ivory tusks", rgba(0xe6d5a6), 0.72),
        "logan_robe": make_mat("logan deep arcane robe", rgba(0x17225d), 0.75),
        "logan_trim": make_mat("logan violet trim", rgba(0x826ac5), 0.62),
        "cyan_magic": make_mat("cyan arcane emission", rgba(0x4bdcff), 0.22, 0.0, rgba(0x4bdcff), 3.3, False),
        "amber_magic": make_mat("amber target emission", rgba(0xffa13a), 0.32, 0.0, rgba(0xff7a18), 2.1, False),
        "shinobi_robe": make_mat("shinobi sand robe", rgba(0xb3a178), 0.82),
        "sash": make_mat("shinobi dark red sash", rgba(0x6e2724), 0.7),
        "cloak": make_mat("shinobi charcoal cloak", rgba(0x252b2b), 0.9),
        "dark_cloth": make_mat("dark under cloth", rgba(0x34312b), 0.86),
        "blue_saber": make_mat("blue saber core", rgba(0x9deaff), 0.16, 0.0, rgba(0x2ba8ff), 5.0, False),
        "blue_saber_soft": make_mat("blue saber transparent trail", rgba(0x48bfff, 0.35), 0.2, 0.0, rgba(0x2ba8ff), 1.8, False),
        "orkk_skin": make_mat("orkk green skin", rgba(0x4c8b3e), 0.78),
        "dark_orkk": make_mat("orkk dark facial brow", rgba(0x25491f), 0.8),
        "rage_glow": make_mat("orkk rage transparent glow", rgba(0xff5a24, 0.20), 0.25, 0.0, rgba(0xff3a11), 1.3, False),
    }
    create_showcase_stage(mats)
    create_magician(mats)
    create_shinobi(mats)
    create_orkk(mats)
    create_effects(mats)
    add_lights_camera()
    configure_scene()
    save_outputs()


if __name__ == "__main__":
    main()

