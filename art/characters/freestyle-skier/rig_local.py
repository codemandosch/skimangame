"""A fitted Blender deform rig for the exported skier, in metres, Z-up/+Y-forward."""
import bpy
from mathutils import Vector


def build_rig(meshes):
    data = bpy.data.armatures.new('FreestyleSkeleton')
    rig = bpy.data.objects.new('FreestyleRig', data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None, deform=True):
        b = data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = data.edit_bones[parent]
        b.use_deform = deform
        return b

    bone('Root', (0, 0, 0), (0, 0, .16), deform=False)
    bone('Hip', (0, -.015, 1.00), (0, -.015, 1.13), 'Root')
    bone('Spine01', (0, -.015, 1.13), (0, -.008, 1.35), 'Hip')
    bone('Spine02', (0, -.008, 1.35), (0, 0, 1.61), 'Spine01')
    bone('Neck', (0, 0, 1.61), (0, .005, 1.77), 'Spine02')
    bone('Head', (0, .005, 1.77), (0, .005, 2.035), 'Neck')
    for prefix, sign in [('L', 1), ('R', -1)]:
        def p(x, y, z):
            return (sign*x, y, z)
        bone(prefix+'_Clavicle', p(.03, 0, 1.59), p(.245, 0, 1.55), 'Spine02')
        bone(prefix+'_Upperarm', p(.245, 0, 1.55), p(.415, .005, 1.25), prefix+'_Clavicle')
        bone(prefix+'_Forearm', p(.415, .005, 1.25), p(.535, .015, 1.025), prefix+'_Upperarm')
        bone(prefix+'_Hand', p(.535, .015, 1.025), p(.59, .025, .90), prefix+'_Forearm')
        bone(prefix+'_Thigh', p(.15, -.015, 1.00), p(.205, .015, .59), 'Hip')
        bone(prefix+'_Calf', p(.205, .015, .59), p(.265, -.025, .155), prefix+'_Thigh')
        bone(prefix+'_Foot', p(.265, -.025, .155), p(.265, .16, .07), prefix+'_Calf')
        bone(prefix+'_ToeBase', p(.265, .16, .07), p(.265, .235, .065), prefix+'_Foot', deform=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    # The generated clothing contains disconnected/open surfaces. Heat weights on
    # the original fail, so bind a watertight voxel proxy, then interpolate its
    # weights onto the unchanged textured production mesh.
    from mathutils.bvhtree import BVHTree
    for mesh in meshes:
        proxy = mesh.copy()
        proxy.data = mesh.data.copy()
        bpy.context.collection.objects.link(proxy)
        bpy.ops.object.select_all(action='DESELECT')
        proxy.select_set(True)
        bpy.context.view_layer.objects.active = proxy
        remesh = proxy.modifiers.new('Watertight bind proxy', 'REMESH')
        remesh.mode = 'VOXEL'
        remesh.voxel_size = .016
        bpy.ops.object.modifier_apply(modifier=remesh.name)
        smooth = proxy.modifiers.new('Smooth bind surface', 'SMOOTH')
        smooth.factor = .6
        smooth.iterations = 4
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        if not any(v.groups for v in proxy.data.vertices):
            raise RuntimeError('Heat weights failed on the watertight bind proxy')
        proxy.data.calc_loop_triangles()
        triangles = [tuple(t.vertices) for t in proxy.data.loop_triangles]
        tree = BVHTree.FromPolygons([v.co for v in proxy.data.vertices], triangles, all_triangles=True)
        for g in proxy.vertex_groups:
            mesh.vertex_groups.new(name=g.name)
        for v in mesh.data.vertices:
            hit, _, index, _ = tree.find_nearest(v.co)
            ids = triangles[index]
            a, b, c = [proxy.data.vertices[i].co for i in ids]
            e0, e1, d = b-a, c-a, hit-a
            aa, ab, bb = e0.dot(e0), e0.dot(e1), e1.dot(e1)
            denom = aa*bb-ab*ab
            w1 = (bb*d.dot(e0)-ab*d.dot(e1))/denom if abs(denom)>1e-12 else 0
            w2 = (aa*d.dot(e1)-ab*d.dot(e0))/denom if abs(denom)>1e-12 else 0
            weights = {}
            for vi, amount in zip(ids, [1-w1-w2, w1, w2]):
                for g in proxy.data.vertices[vi].groups:
                    weights[g.group] = weights.get(g.group, 0) + max(0, amount)*g.weight
            for group, weight in weights.items():
                if weight > .00001:
                    mesh.vertex_groups[group].add([v.index], weight, 'REPLACE')
        mesh.parent = rig
        armature = mesh.modifiers.new('Freestyle deformation', 'ARMATURE')
        armature.object = rig
        bpy.data.objects.remove(proxy, do_unlink=True)
    # Helmet/goggles and rigid boot shells must not squash with neck/toe bending.
    for mesh in meshes:
        if not any(v.groups for v in mesh.data.vertices):
            raise RuntimeError('Blender heat weighting failed; mesh has no deform weights')
        for v in mesh.data.vertices:
            target = None
            if v.co.z > 1.78:
                target = 'Head'
            elif v.co.z < .235:
                target = ('L' if v.co.x > 0 else 'R') + '_Foot'
            if target:
                for group in mesh.vertex_groups:
                    group.remove([v.index])
                mesh.vertex_groups[target].add([v.index], 1.0, 'REPLACE')
        bpy.ops.object.select_all(action='DESELECT')
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.vertex_group_limit_total(limit=4)
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)
        unweighted = [v.index for v in mesh.data.vertices if not v.groups or sum(g.weight for g in v.groups) < .99]
        if unweighted:
            raise RuntimeError(f'{len(unweighted)} vertices have invalid skin weights')
    rig.show_in_front = True
    return rig
