# Контактний аркуш лісових моделей (лише для перевірки вигляду):
#   blender --background docs/models/forest/forest.blend --python docs/models/forest/preview.py -- <тека>
# Кожна модель — окрема плитка, два аркуші: вид згори-ззаду (як у грі) і згори-спереду.
# У матеріалі світіння колір вершин під'єднується до емісії (лише тут, файл не зберігається).
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/forest-preview'
os.makedirs(OUT, exist_ok=True)
TYPES = ('scout', 'gunner', 'wasp', 'kamikaze', 'sniper', 'swarm', 'shell', 'spider', 'repairer', 'turret', 'foreman')
TILE, COLS = 420, 4
sc = bpy.context.scene

m = bpy.data.materials['KitGlow']
nt = m.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
attr = next(n for n in nt.nodes if n.type == 'VERTEX_COLOR')
nt.links.new(attr.outputs[0], bsdf.inputs['Emission Color'])
bsdf.inputs['Emission Strength'].default_value = 1.0

for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.render.resolution_x = sc.render.resolution_y = TILE
sc.render.image_settings.file_format = 'PNG'
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('W')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.08, 0.12, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.world = world
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 2.5
sun.rotation_euler = (math.radians(40), 0, math.radians(30))
sc.collection.objects.link(sun)
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -0.001))
ground = bpy.context.object
gm = bpy.data.materials.new('Ground')
gm.use_nodes = True
next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.03, 0.07, 0.05, 1)
ground.data.materials.append(gm)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
cam.data.type = 'ORTHO'
sc.collection.objects.link(cam)
sc.camera = cam
models = [o for o in bpy.data.objects if o.name.endswith(('Hull', 'Glow'))]

def tile(t, front):
    name = 'F' + t.capitalize()
    pair = [bpy.data.objects[name + 'Hull'], bpy.data.objects[name + 'Glow']]
    for o in models:
        o.hide_render = o not in pair
    pts = [o.matrix_world @ v.co for o in pair for v in o.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    ground.location.z = min(lo.z, 0) - (0.0 if lo.z > -0.01 else 0.4)
    el = math.radians(55)
    # Модель дивиться на −Y (Blender); «ззаду» — камера з боку +Y.
    d = Vector((0.25, -1.0 if front else 1.0, 0)).normalized() * math.cos(el) + Vector((0, 0, math.sin(el)))
    cam.location = c + d * 30
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = (hi - lo).length * 1.05
    cam.data.clip_end = 200
    path = os.path.join(OUT, f'_{t}_{int(front)}.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(TILE, TILE, 4)
    bpy.data.images.remove(img)
    os.remove(path)
    return a

for front in (False, True):
    rows = math.ceil(len(TYPES) / COLS)
    sheet = np.zeros((rows * TILE, COLS * TILE, 4), dtype=np.float32)
    sheet[..., 3] = 1
    for i, t in enumerate(TYPES):
        r, cidx = divmod(i, COLS)
        y0 = (rows - 1 - r) * TILE
        sheet[y0:y0 + TILE, cidx * TILE:(cidx + 1) * TILE] = tile(t, front)
    out = bpy.data.images.new('sheet', COLS * TILE, rows * TILE)
    out.pixels = sheet.ravel()
    out.filepath_raw = os.path.join(OUT, 'forest-front.png' if front else 'forest-behind.png')
    out.file_format = 'PNG'
    out.save()
    print('SHEET', out.filepath_raw)
