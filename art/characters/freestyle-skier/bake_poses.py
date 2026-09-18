"""Bake verified runtime skeletal poses into editable Blender actions."""
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix

base=Path(__file__).resolve().parent
path=base/'game'/'freestyle-skier.blend'
bpy.ops.wm.open_mainfile(filepath=str(path))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
data=json.loads((base/'game'/'poses.json').read_text())
conversion=Matrix.Rotation(math.pi/2,4,'X')
def matrix(values):
    return Matrix([values[i::4] for i in range(4)])
def convert(values):
    # glTF applies Y-up at the armature root; bone-local axes remain unchanged.
    return conversion@matrix(values)
error=max(max(abs(convert(m)[i][j]-rig.data.bones[n].matrix_local[i][j]) for i in range(4) for j in range(4)) for n,m in data['rest'].items())
print('REST_MATRIX_ERROR',error,flush=True)
assert error<.0001, 'GLB-to-Blender bone basis mismatch; do not bake incorrect poses'
rig.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
rig.animation_data_create()
bpy.context.scene.render.fps=data['fps']
for name,frames in data['actions'].items():
    action=bpy.data.actions.new(name)
    action.use_fake_user=True
    rig.animation_data.action=action
    for index,frame in enumerate(frames,1):
        bpy.context.scene.frame_set(index)
        for bone in rig.pose.bones:
            bone.rotation_mode='QUATERNION'
            bone.matrix=convert(frame[bone.name])
            bpy.context.view_layer.update()
            bone.keyframe_insert('location',frame=index,group=bone.name)
            bone.keyframe_insert('rotation_quaternion',frame=index,group=bone.name)
            bone.keyframe_insert('scale',frame=index,group=bone.name)
    # A freshly created layered action binds to the rig's slot after key insertion.
    print('BAKED',name,len(frames),flush=True)
rig.animation_data.action=bpy.data.actions['Neutral']
bpy.context.scene.frame_start=1
bpy.context.scene.frame_end=49
bpy.context.scene.frame_set(49)
bpy.ops.wm.save_as_mainfile(filepath=str(path))
