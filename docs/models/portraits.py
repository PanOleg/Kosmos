# Портрети класів для вибору персонажа (DECISIONS.md, п. 54): рендер моделей гравців з models.blend
# у PNG з прозорим тлом. Запуск із кореня:
#   /Applications/Blender.app/Contents/MacOS/Blender -b docs/models/models.blend -P docs/models/portraits.py
import bpy, math, os
from mathutils import Vector

ROOT = '/Users/ok/PhpstormProjects/Games/Kosmos'
OUTS = [os.path.join(ROOT, 'packages/controller/public/classes'), os.path.join(ROOT, 'packages/screen/public/classes')]
CLASS = {'assault': 0xe8323a, 'engineer': 0xff8a1f, 'medic': 0x3fd45a, 'tech': 0x2f7bff}


def lin(h):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


scene = bpy.context.scene
for o in scene.objects:
    o.hide_render = True
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        pass
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
try:
    scene.view_settings.view_transform = 'Standard'
except TypeError:
    pass

# Камера й світло: ключ спереду-збоку, контровий ззаду кольору класу, м'яке заповнення.
cam_data = bpy.data.cameras.new('PortraitCam')
cam_data.lens = 60
cam = bpy.data.objects.new('PortraitCam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def light(name, kind, energy, loc, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = color
    if kind == 'AREA':
        d.size = 3
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    return o


key = light('Key', 'AREA', 400, (2.5, -3.5, 3.5))
fill = light('Fill', 'AREA', 120, (-3, -2.5, 1.5))
rim = light('Rim', 'AREA', 500, (0, 3, 2.8))
world = scene.world or bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Strength'].default_value = 0.35

for o in (key, fill, rim):
    o.rotation_mode = 'QUATERNION'

for cls, col in CLASS.items():
    name = cls.capitalize()
    parts = [bpy.data.objects[name + p] for p in ('Body', 'Glow', 'LegL', 'LegR')]
    for o in scene.objects:
        if o.type == 'MESH':
            o.hide_render = o not in parts
    # Візор і світні деталі — колір класу (у грі це матеріал візора).
    glow = parts[1]
    m = bpy.data.materials.new(f'Glow_{cls}')
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = lin(col)
    bsdf.inputs['Emission Color'].default_value = lin(col)
    bsdf.inputs['Emission Strength'].default_value = 6.0
    glow.data.materials.clear()
    glow.data.materials.append(m)
    rim.data.color = lin(col)[:3]

    xs = [(o.matrix_world @ v.co).x for o in parts for v in o.data.vertices]
    cx = (min(xs) + max(xs)) / 2
    # Однаковий масштаб для всіх класів: антени й рюкзаки не віддаляють камеру.
    target = Vector((cx, -0.15, 0.78))
    # Три чверті спереду (у Blender перед моделі — −Y), трохи згори.
    cam.location = target + Vector((1.9, -3.6, 0.9)) * 0.92
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    for o in (key, fill, rim):
        o.location.x += cx - o.get('cx', 0)
        o['cx'] = cx
        o.rotation_quaternion = (target - o.location).to_track_quat('-Z', 'Y')
    for out in OUTS:
        os.makedirs(out, exist_ok=True)
        scene.render.filepath = os.path.join(out, f'{cls}.png')
        bpy.ops.render.render(write_still=True)
    print('portrait', cls)
