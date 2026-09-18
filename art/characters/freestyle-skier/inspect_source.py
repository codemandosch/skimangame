"""Run with blender --background --python inspect_source.py after Studio export."""
import json
from pathlib import Path
import bpy
from mathutils import Vector

base = Path(__file__).resolve().parent
source = next((base / 'tripo' / 'download').rglob('*.fbx'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source))
rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
assert len(rigs) <= 1, f'Expected at most one rig, found {len(rigs)}'
rig = rigs[0] if rigs else None
for img in bpy.data.images:
    if img.source != 'FILE':
        continue
    candidates = list(source.parent.rglob(Path(img.filepath.replace('\\', '/')).name))
    if candidates:
        img.filepath = str(candidates[0])
        img.reload()
    if img.has_data:
        img.pack()
if rig:
    rig.data.pose_position = 'REST'
bpy.context.view_layer.update()
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
report = {
    'source': str(source),
    'bones': {b.name: {'parent': b.parent.name if b.parent else None,
                       'head': list(rig.matrix_world @ b.head_local),
                       'tail': list(rig.matrix_world @ b.tail_local)} for b in rig.data.bones} if rig else {},
    'clips': {a.name: list(a.frame_range) for a in bpy.data.actions},
    'bounds': [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)],
    'meshes': {m.name: {'vertices': len(m.data.vertices),
                       'triangles': sum(len(p.vertices)-2 for p in m.data.polygons),
                       'groups': len(m.vertex_groups)} for m in meshes},
    'images': [{'name': i.name, 'size': list(i.size), 'loaded': i.has_data} for i in bpy.data.images],
}
(base / 'tripo' / 'source-report.json').write_text(json.dumps(report, indent=2))
if rig:
    rig.data.pose_position = 'POSE'
bpy.ops.wm.save_as_mainfile(filepath=str(base / 'tripo' / 'source.blend'))
print(json.dumps(report), flush=True)
