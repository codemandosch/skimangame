"""Reload the deliverable and compare keyed bones with the runtime capture."""
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix

base = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(base / 'game' / 'freestyle-skier.blend'))
data = json.loads((base / 'game' / 'poses.json').read_text())
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
conversion = Matrix.Rotation(math.pi / 2, 4, 'X')
maximum_error = 0.0
for name, frames in data['actions'].items():
    action = bpy.data.actions[name]
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    for frame in (1, 12, 25, 49):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        for bone in rig.pose.bones:
            values = frames[frame - 1][bone.name]
            expected = conversion @ Matrix([values[i::4] for i in range(4)])
            error = max(abs(expected[i][j] - bone.matrix[i][j]) for i in range(4) for j in range(4))
            maximum_error = max(maximum_error, error)
            assert error < 0.0002, (name, frame, bone.name, error)
report = {'actions': len(data['actions']), 'bones': len(rig.pose.bones),
          'sampledFramesPerAction': 4, 'maximumMatrixError': maximum_error}
(base / 'game' / 'bake-verification.json').write_text(json.dumps(report, indent=2))
print('VERIFIED_BAKE', json.dumps(report), flush=True)
