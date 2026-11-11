# Збирає й експортує всі лісові моделі (зачарований нічний ліс, різнобарвне світіння):
#   blender --background --python docs/models/forest/build_all.py
# У цьому наборі колір граней меша «Glow» — це колір світіння (у грі береться з кольорів вершин).
import bpy, os
ROOT_ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
bpy.ops.wm.read_factory_settings(use_empty=True)
exec(open(os.path.join(ROOT_, 'docs/models/kit.py')).read())
ROOT = ROOT_

# Палітра лісу: темні нічні тіла зі світлішими акцентами.
F_NIGHT, F_INDIGO, F_SLATE = 0x161d3a, 0x2a2f6e, 0x35487c
F_TEAL, F_TEALD, F_PLUM, F_MOSS = 0x1d5560, 0x123840, 0x4a2a6a, 0x41602e
F_BARK, F_BARKL, F_PALE, F_CREAM, F_BLACK = 0x3e2c24, 0x6e5038, 0x9fb8c4, 0xd6ceb0, 0x0e1216
# Світіння (насичені): блакитне, маджента, лайм, фіолет, бурштин.
G_CYAN, G_MAGENTA, G_LIME, G_VIOLET, G_AMBER = 0x30f0ff, 0xff40d0, 0x90ff40, 0xa060ff, 0xffb030


def L3(a, b, t):
    """Точка на відрізку a→b."""
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def tipped(hull, glow, col, gcol, base, tip, w, d, f=0.55):
    """Шип/голка корпусу зі світним кінчиком (остання частка 1−f довжини)."""
    spike(hull, col, base, tip, w, d)
    k = (1 - f) * 1.5
    spike(glow, gcol, L3(base, tip, f), L3(base, tip, 1.04), w * k, d * k)


for _type in ('scout', 'gunner', 'wasp', 'kamikaze', 'sniper', 'swarm', 'shell', 'spider', 'repairer', 'turret', 'foreman'):
    exec(open(os.path.join(ROOT, 'docs/models/forest', _type + '.py')).read())
    export('F' + _type.capitalize(), 'packages/screen/public/models/forest/' + _type + '.glb')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'docs/models/forest/forest.blend'))
