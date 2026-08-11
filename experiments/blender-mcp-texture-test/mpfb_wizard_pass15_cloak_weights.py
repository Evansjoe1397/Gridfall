import bpy
from pathlib import Path


ROOT = Path(r"C:\Users\artur\OneDrive\Documents\Gridfall\experiments\blender-mcp-texture-test")
WORKING_BLEND = ROOT / "output" / "gridfall_wizard_mpfb_working.blend"


ARM_PREFIXES = (
    "upperarm_",
    "lowerarm_",
    "hand_",
    "index_",
    "middle_",
    "ring_",
    "pinky_",
    "thumb_",
)


def make_chest_rigid(obj):
    indices = [vertex.index for vertex in obj.data.vertices]
    for group in obj.vertex_groups:
        group.remove(indices)
    chest = obj.vertex_groups.get("spine_03") or obj.vertex_groups.new(name="spine_03")
    chest.add(indices, 1.0, "REPLACE")
    if not obj.get("wizard_mantle_reseated"):
        obj.location.y -= 0.018
        obj.location.z -= 0.035
        obj["wizard_mantle_reseated"] = True
    obj["wizard_chest_rigid"] = True


def remove_arm_influence(obj):
    removed_groups = [
        group for group in obj.vertex_groups if group.name.startswith(ARM_PREFIXES)
    ]
    indices = [vertex.index for vertex in obj.data.vertices]
    for group in removed_groups:
        group.remove(indices)

    normalized = 0
    fallback = 0
    for vertex in obj.data.vertices:
        weighted = []
        for assignment in vertex.groups:
            group = obj.vertex_groups[assignment.group]
            if assignment.weight > 1e-8:
                weighted.append((group, assignment.weight))
        total = sum(weight for _group, weight in weighted)
        if total > 1e-8:
            for group, weight in weighted:
                group.add([vertex.index], weight / total, "REPLACE")
            normalized += 1
            continue

        z = vertex.co.z
        if z > 1.18:
            name = "spine_03"
        elif z > 0.82:
            name = "spine_02"
        else:
            name = "pelvis"
        group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        group.add([vertex.index], 1.0, "REPLACE")
        fallback += 1
    obj["wizard_cloak_arm_weights_removed"] = True
    return len(removed_groups), normalized, fallback


def main():
    results = {}
    for name in ("Wizard_Cloak", "Wizard_Cloak_Mantle"):
        obj = bpy.data.objects.get(name)
        if obj and obj.type == "MESH" and obj.vertex_groups:
            results[name] = remove_arm_influence(obj)
            if name == "Wizard_Cloak_Mantle":
                make_chest_rigid(obj)
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND))
    print(results)


main()
