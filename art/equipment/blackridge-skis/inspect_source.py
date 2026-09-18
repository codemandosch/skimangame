"""Inspect and preserve the BLACKRIDGE Tripo export in a Blender source file."""

import json
from pathlib import Path

import bpy
from mathutils import Vector


BASE = Path(__file__).resolve().parent
SOURCE = next((BASE / "tripo" / "download").glob("*.fbx"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(SOURCE))

for image in bpy.data.images:
    if image.source != "FILE":
        continue
    candidates = list(SOURCE.parent.rglob(Path(image.filepath.replace("\\", "/")).name))
    if candidates:
        image.filepath = str(candidates[0])
        image.reload()
    if image.has_data:
        image.pack()

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
report = {
    "source": str(SOURCE),
    "bounds": [[min(point[i] for point in points), max(point[i] for point in points)] for i in range(3)],
    "meshes": {
        obj.name: {
            "vertices": len(obj.data.vertices),
            "triangles": sum(len(face.vertices) - 2 for face in obj.data.polygons),
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        }
        for obj in meshes
    },
    "images": [
        {"name": image.name, "size": list(image.size), "loaded": image.has_data}
        for image in bpy.data.images
    ],
}

(BASE / "tripo" / "source-report.json").write_text(json.dumps(report, indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(BASE / "tripo" / "source.blend"))
print(json.dumps(report), flush=True)
