"""Normalize the preserved Tripo ski and export the rigid Three.js runtime asset."""

import json
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[2]
GAME = BASE / "game"
RUNTIME = PROJECT / "public" / "models"
GAME.mkdir(exist_ok=True)
RUNTIME.mkdir(exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(BASE / "tripo" / "source.blend"))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
assert meshes, "Tripo export contains no mesh"

points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
source_min = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
source_max = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
source_size = source_max - source_min

# Tripo interpreted the perspective concept as a wide board. Preserve its detailed
# surface and binding while restoring real freestyle-ski proportions locally.
target_width = 0.19
target_length = 2.82
target_height = 0.32
scale_x = target_width / source_size.x
scale_y = target_length / source_size.y
scale_z = target_height / source_size.z
center_x = (source_min.x + source_max.x) * 0.5
center_y = (source_min.y + source_max.y) * 0.5

for obj in meshes:
    world = obj.matrix_world.copy()
    for vertex in obj.data.vertices:
        source = world @ vertex.co
        vertex.co = Vector(
            (
                (source.x - center_x) * scale_x,
                (source.y - center_y) * scale_y,
                (source.z - source_min.z) * scale_z,
            )
        )
    obj.matrix_world = Matrix.Identity(4)
    obj.name = "BlackridgeSki"
    obj.data.name = "BlackridgeSkiMesh"
    obj.data.update()
    for face in obj.data.polygons:
        face.use_smooth = True

for image in bpy.data.images:
    if image.source == "FILE":
        image.reload()
    if image.has_data:
        image.pack()
    if "normal" in image.name.lower():
        image.colorspace_settings.name = "Non-Color"
bpy.ops.file.pack_all()

for material in bpy.data.materials:
    material.name = "BlackridgeSkiMaterial"
    if not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Metallic"].default_value = 0.18
            node.inputs["Roughness"].default_value = 0.42

bpy.context.view_layer.update()
final_points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
blender_bounds = [
    [min(point[axis] for point in final_points), max(point[axis] for point in final_points)]
    for axis in range(3)
]
final_bounds = [
    blender_bounds[0],
    blender_bounds[2],
    [-blender_bounds[1][1], -blender_bounds[1][0]],
]
report = {
    "sourceWorkspace": "https://studio.tripo3d.ai/workspace/texture/f6c681fd-a26e-4c19-bc88-db9582fced8e",
    "sourceArchiveSha256": "A335F121C60816F6469A67C088FFFA8BD29D985858F0A96B0553602F851E0708",
    "sourceBounds": [list(source_min), list(source_max)],
    "finalBounds": final_bounds,
    "up": "+Y",
    "forward": "-Z",
    "vertices": sum(len(obj.data.vertices) for obj in meshes),
    "triangles": sum(len(face.vertices) - 2 for obj in meshes for face in obj.data.polygons),
    "textures": [
        {"name": image.name, "size": list(image.size)}
        for image in bpy.data.images
    ],
}
(GAME / "report.json").write_text(json.dumps(report, indent=2))

bpy.ops.wm.save_as_mainfile(filepath=str(GAME / "blackridge-ski.blend"))
bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.export_scene.gltf(
    filepath=str(RUNTIME / "blackridge-ski.glb"),
    export_format="GLB",
    use_selection=True,
    export_animations=False,
    export_yup=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)
print(json.dumps(report), flush=True)
