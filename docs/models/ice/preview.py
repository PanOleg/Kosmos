# Контактні аркуші крижаного набору (перевірка вигляду на «снігу»):
#   blender --background docs/models/ice/ice.blend --python docs/models/ice/preview.py -- <тека>
# Камера — згори-ззаду (≈55° донизу, як у грі) і згори-спереду; світіння Glow береться
# з кольору вершин (як робитиме гра), а не з фіксованого червоного в kit.py.
import bpy, sys, math, os
from mathutils import Vector
OUT = sys.argv[-1] if '--' in sys.argv else '/tmp/ice-preview'
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene

m = bpy.data.materials['KitGlow']
nt = m.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
attr = next(n for n in nt.nodes if n.type == 'VERTEX_COLOR')
nt.links.new(attr.outputs[0], bsdf.inputs['Emission Color'])
bsdf.inputs['Emission Strength'].default_value = 2.5

gm = bpy.data.materials.new('Snow')
gm.use_nodes = True
gb = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
gb.inputs['Base Color'].default_value = (0.82, 0.86, 0.9, 1)
gb.inputs['Roughness'].default_value = 0.9
bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.data.materials.append(gm)

bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(30)))
bpy.context.object.data.energy = 3.0
w = bpy.data.worlds.new('W'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.82, 0.9, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.7
sc.world = w
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x, sc.render.resolution_y = 1800, 1000

cam_d = bpy.data.cameras.new('C'); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new('C', cam_d); sc.collection.objects.link(cam); sc.camera = cam

def place(layout):
    """layout: [(тип, x, глибина, підняти)]; x — вправо, глибина — уздовж +Z гри."""
    for o in bpy.data.objects:
        if o.name.startswith('I') and o.name[-4:] in ('Hull', 'Glow'):
            o.location = (1000, 0, 0)
    for t, x, z, lift in layout:
        for s in ('Hull', 'Glow'):
            bpy.data.objects['I' + t.capitalize() + s].location = (x, -z, lift)

def shot(name, centre, scale, behind, yaw=0.0):
    cam_d.ortho_scale = scale
    el = math.radians(55)
    d = 40
    s = 1 if behind else -1          # ззаду: камера на −Z гри = +Y Blender
    a = math.radians(yaw)
    off = Vector((math.sin(a) * math.cos(el) * d, s * math.cos(a) * math.cos(el) * d, math.sin(el) * d))
    c = Vector(centre)
    cam.location = c + off
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)

big = [('foreman', -5.2, 0, 0), ('shell', -1.6, 0, 0), ('turret', 1.2, 0, 0), ('spider', 3.4, 0, 0),
       ('gunner', -4.6, -3.6, 0), ('repairer', -2.8, -3.6, 0), ('scout', -1.0, -3.6, 0)]
place(big)
shot('big-back', (-1.4, 1.2, 0.8), 15.5, True, 15)
shot('big-front', (-1.4, 1.8, 0.8), 15.5, False, 20)
small = [('scout', -2.6, 0, 0), ('gunner', -1.3, 0, 0), ('repairer', 0, 0, 0), ('spider', 1.7, 0, 0),
         ('wasp', -2.2, -2.2, 0.5), ('kamikaze', -0.5, -2.2, 0.5), ('sniper', 1.0, -2.4, 0.5), ('swarm', 2.3, -2.2, 0.5)]
place(small)
shot('small-back', (-0.3, 1.1, 0.4), 7.6, True, 15)
shot('small-front', (-0.3, 1.1, 0.4), 7.6, False, 20)
