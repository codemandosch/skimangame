"""Finish the preserved Tripo mesh, build a rig if needed, and export runtime GLB."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

base = Path(__file__).resolve().parent
project = base.parents[2]
out = base / 'game'
out.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(base / 'tripo' / 'source.blend'))
rig = next((o for o in bpy.context.scene.objects if o.type == 'ARMATURE'), None)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
original_rig = bool(rig)
if rig:
    rig.animation_data_clear()
    for b in rig.pose.bones:
        b.matrix_basis = Matrix.Identity(4)
    rig.data.pose_position = 'REST'
bpy.context.view_layer.update()
points = [m.matrix_world @ v.co for m in meshes for v in m.data.vertices]
bottom = min(v.z for v in points)
height = max(v.z for v in points) - bottom
scale = 2.05 / height
hip = rig.matrix_world @ rig.data.bones['Hip'].head_local if rig else Vector((0, 0, 0))
forward = sum((rig.matrix_world.to_3x3() @
               (rig.data.bones[s+'_ToeBase'].head_local - rig.data.bones[s+'_Foot'].head_local)
               for s in ('L', 'R')), Vector()) if rig else Vector((0, -1, 0))
angle = math.pi / 2 - math.atan2(forward.y, forward.x)
rotate = Matrix.Rotation(angle, 4, 'Z')
center = rotate @ hip
transform = Matrix.Translation((-center.x*scale, -center.y*scale, -bottom*scale)) @ Matrix.Scale(scale, 4) @ rotate
# Bake a shared transform into both rest skeleton and mesh. Keep Tripo bones and weights.
rig_world = rig.matrix_world.copy() if rig else Matrix.Identity(4)
mesh_world = {m.name: m.matrix_world.copy() for m in meshes}
if rig:
    rig.parent = None
    rig.data.transform(transform @ rig_world)
    rig.matrix_world = Matrix.Identity(4)
for m in meshes:
    m.data.transform(transform @ mesh_world[m.name])
    m.parent = rig
    m.matrix_parent_inverse = Matrix.Identity(4)
    m.matrix_world = Matrix.Identity(4)
    m.name = 'FreestyleSkier'
    bpy.ops.object.select_all(action='DESELECT')
    m.select_set(True)
    bpy.context.view_layer.objects.active = m
    if rig:
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    for polygon in m.data.polygons:
        polygon.use_smooth = True
if not rig:
    sys.path.insert(0, str(base))
    from rig_local import build_rig
    rig = build_rig(meshes)
rig.data.pose_position = 'POSE'
rig.name = 'FreestyleRig'
for img in bpy.data.images:
    if img.has_data:
        img.pack()
for material in bpy.data.materials:
    if material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Roughness'].default_value = 0.82
                node.inputs['Metallic'].default_value = 0.0
bpy.context.view_layer.update()
report = {
    'sourceWorkspace': 'https://studio.tripo3d.ai/workspace/rigging/6f32b9db-23eb-4654-849c-dbedfffb0656',
    'sourceRig': 'Tripo skeleton retained' if original_rig else 'Custom fitted Blender rig with voxel-proxy heat weights transferred to original mesh and rigid boot/helmet corrections',
    'height': 2.05, 'forward': '-Z', 'up': '+Y', 'maxInfluences': 4,
    'triangles': sum(len(p.vertices)-2 for m in meshes for p in m.data.polygons),
    'bones': {b.name: {'parent': b.parent.name if b.parent else None,
                       'head': [b.head_local.x, b.head_local.z, -b.head_local.y],
                       'tail': [b.tail_local.x, b.tail_local.z, -b.tail_local.y]} for b in rig.data.bones},
}
(out / 'report.json').write_text(json.dumps(report, indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'freestyle-skier.blend'))
runtime = project / 'public' / 'models'
runtime.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(runtime / 'freestyle-skier.glb'), export_format='GLB',
                          export_animations=False, export_yup=True, export_skins=True)
print(json.dumps({'height': report['height'], 'triangles': report['triangles'],
                  'bones': len(report['bones']), 'runtime': str(runtime)}), flush=True)
