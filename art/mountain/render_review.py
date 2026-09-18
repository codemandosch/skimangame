import bpy, json, math
from mathutils import Vector
from pathlib import Path
root=Path('C:/Users/gaza/Projects/skimangame/art/mountain')
data=json.loads((root/'terrain-review.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
n=data['n']; size=data['size']
verts=[((x/(n-1)-.5)*size,(y/(n-1)-.5)*size,data['heights'][y*n+x]) for y in range(n) for x in range(n)]
faces=[]
for y in range(n-1):
 for x in range(n-1):
  a=y*n+x;faces.extend([(a,a+1,a+n),(a+1,a+n+1,a+n)])
mesh=bpy.data.meshes.new('Actual Blackridge terrain');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Blackridge — game heightfield',mesh);bpy.context.collection.objects.link(obj)
attr=mesh.color_attributes.new(name='terrain',type='FLOAT_COLOR',domain='POINT')
for i,r in enumerate(data['rock']): attr.data[i].color=(.82-r*.58,.89-r*.6,.96-r*.59,1)
material=bpy.data.materials.new('Snow and exposed rock');material.use_nodes=True
nodes=material.node_tree.nodes; bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.95
color=nodes.new('ShaderNodeVertexColor');color.layer_name='terrain';material.node_tree.links.new(color.outputs['Color'],bsdf.inputs['Base Color']);obj.data.materials.append(material)
for polygon in mesh.polygons:polygon.use_smooth=True
world=bpy.data.worlds.new('Alpine daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.37,.53,.68,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.context.scene.world=world
bpy.ops.object.light_add(type='SUN',location=(0,0,4000));bpy.context.object.rotation_euler=(math.radians(24),math.radians(-30),math.radians(-25));bpy.context.object.data.energy=2.5;bpy.context.object.data.angle=.08
bpy.ops.object.camera_add(location=(3800,-4300,3300));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,620))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.clip_end=20000;camera.data.type='ORTHO';camera.data.ortho_scale=5900;bpy.context.scene.camera=camera
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'mountain-review.png')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'mountain-review.blend'))
bpy.ops.render.render(write_still=True)

