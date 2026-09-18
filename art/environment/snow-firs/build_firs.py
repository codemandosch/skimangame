"""Reproducible, original alpine firs. Run: blender --background --python <this file>."""
import bpy
import bmesh
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .92
    attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Color'
    mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    return mat

materials = [material('Fir / fissured bark', (.16,.105,.063)),
             material('Fir / evergreen needles', (.042,.105,.085)),
             material('Fir / settled snow', (.83,.9,.94))]

for variant in range(3):
    rng = random.Random(807 + variant * 123)
    parts = [{'v': [], 'f': [], 'c': []} for _ in range(3)]
    height = [9.4, 8.3, 10.6][variant]

    def shape(part, center, scale, angle=0, jagged=False):
        """Closed, asymmetric bough volume; needle edges have individual tips."""
        data=parts[part]; start=len(data['v']); sectors=10 if jagged else 8
        base=[(.16,.105,.063),(.042,.105,.085),(.83,.9,.94)][part]
        for ring in range(5):
            latitude=-math.pi/2+ring*math.pi/4
            for j in range(sectors):
                a=j/sectors*math.tau
                ripple=1+(rng.uniform(-.24,.24) if jagged else rng.uniform(-.06,.06))
                x=math.cos(latitude)*math.cos(a)*scale[0]*ripple
                y=math.cos(latitude)*math.sin(a)*scale[1]*ripple
                z=math.sin(latitude)*scale[2]
                data['v'].append((center[0]+x*math.cos(angle)-y*math.sin(angle),
                                  center[1]+x*math.sin(angle)+y*math.cos(angle),
                                  center[2]+z-.09*abs(x)))
                shade=rng.uniform(.76,1.15) if part!=2 else rng.uniform(.93,1.02)
                data['c'].append(tuple(v*shade for v in base)+(1,))
        for ring in range(4):
            for j in range(sectors):
                a=start+ring*sectors+j; b=start+ring*sectors+(j+1)%sectors
                data['f'].append((a,b,b+sectors,a+sectors))

    def branch(a,b,r1,r2):
        data=parts[0]; start=len(data['v']); axis=(Vector(b)-Vector(a)).normalized()
        u=axis.cross(Vector((0,1,0))).normalized(); v=axis.cross(u)
        for pos,radius in [(Vector(a),r1),(Vector(b),r2)]:
            for j in range(6):
                p=pos+radius*(u*math.cos(j*math.tau/6)+v*math.sin(j*math.tau/6))
                data['v'].append(tuple(p)); shade=.75+(j%3)*.23
                data['c'].append((.16*shade,.105*shade,.063*shade,1))
        for j in range(6):
            data['f'].append((start+j,start+(j+1)%6,start+(j+1)%6+6,start+j+6))
        data['f'].append(tuple(start+j+6 for j in range(6)))

    def needles(center, angle, reach, tier):
        # Short tapered needle fans around each bough break up the smooth edges.
        data=parts[1]
        for side in [-1,1]:
            for j in range(9):
                along=(j/8-.5)*reach*.68
                across=side*(.21*(1-tier*.065))
                x=center[0]+math.cos(angle)*along-math.sin(angle)*across
                y=center[1]+math.sin(angle)*along+math.cos(angle)*across
                z=center[2]+rng.uniform(-.12,.05)
                fan=angle+side*(.55+rng.random()*.65)
                length=rng.uniform(.13,.33)
                start=len(data['v'])
                data['v'].extend([(x-.025,y,z),(x+.025,y,z+.035),
                    (x+math.cos(fan)*length,y+math.sin(fan)*length,z-.05)])
                data['c'].extend([(.036,.09,.065,1),(.056,.14,.105,1),(.08,.17,.12,1)])
                data['f'].append((start,start+1,start+2))

    branch((0,0,-.3),(.08,-.04,height),.28,.025)
    for tier in range(8):
        z=1.35+tier*(height-2.0)/8+rng.uniform(-.16,.16)
        radius=(1-tier/8.8)*[2.65,2.9,2.35][variant]
        for b in range(6 if tier<5 else 5):
            angle=b*math.tau/(6 if tier<5 else 5)+tier*2.39+rng.uniform(-.15,.15)
            reach=radius*rng.uniform(.72,1.16)
            end=(math.cos(angle)*reach,math.sin(angle)*reach,z-.28)
            branch((0,0,z+.12),end,.065*(1-tier*.08),.012)
            for t in [.38,.7,.96]:
                center=(end[0]*t,end[1]*t,z-.32*t)
                shape(1,center,(reach*.38,.34*(1-tier*.075),.22),angle,True)
                needles(center,angle,reach,tier)
                # Snow rests above the branch, leaving dark needle fringes visible.
                if rng.random()>.12:
                    shape(2,(center[0]-.07,center[1],center[2]+.22),
                          (reach*.33,.29*(1-tier*.065),.19*rng.uniform(.8,1.3)),angle)
            shape(1,(end[0]*.97,end[1]*.97,z-.27),(.22,.16,.14),angle,True)
    # Fine crown whorls taper continuously into the leader, without a solid cone.
    for crown in range(4):
        z=height-1.1+crown*.3
        reach=.6-crown*.14
        for j in range(5):
            a=j*math.tau/5+crown*1.7
            center=(math.cos(a)*reach*.5,math.sin(a)*reach*.5,z)
            branch((0,0,z+.1),(math.cos(a)*reach,math.sin(a)*reach,z-.05),.025,.008)
            shape(1,center,(reach*.75,.14,.15),a,True)
            shape(2,(center[0],center[1],z+.09),(reach*.6,.11,.1),a)
    parent=bpy.data.objects.new('AlpineFir_'+str(variant),None)
    bpy.context.collection.objects.link(parent)
    for kind,data in enumerate(parts):
        mesh=bpy.data.meshes.new(f'Fir_{variant}_{kind}')
        mesh.from_pydata(data['v'],[],data['f']); mesh.update()
        colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(data['c']): colors.data[i].color=c
        # Weld the poles of the bough volumes before export and simplification.
        bm=bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
        bm.to_mesh(mesh); bm.free(); mesh.update()
        obj=bpy.data.objects.new(mesh.name,mesh); bpy.context.collection.objects.link(obj)
        obj.parent=parent; obj.data.materials.append(materials[kind])
        for poly in mesh.polygons: poly.use_smooth=kind==2
    # Reduced distant meshes preserve the snow/bough silhouette at little cost.
    distant=bpy.data.objects.new('AlpineFir_'+str(variant)+'_LOD',None)
    bpy.context.collection.objects.link(distant)
    for obj in list(parent.children):
        low=obj.copy(); low.data=obj.data.copy(); low.parent=distant
        bpy.context.collection.objects.link(low)
        bpy.context.view_layer.objects.active=low
        modifier=low.modifiers.new('Distant tree simplification','DECIMATE')
        modifier.ratio=.2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        low.data.validate(); low.data.update()

OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'snow-firs.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/snow-firs.glb'),
    export_format='GLB',export_yup=True)
print('Exported three original snow fir variants.')
