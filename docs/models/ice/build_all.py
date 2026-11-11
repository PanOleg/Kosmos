# Збирає й експортує всі крижані моделі (снігова карта) без інтерфейсу:
#   blender --background --python docs/models/ice/build_all.py
import bpy, os
ROOT_ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
bpy.ops.wm.read_factory_settings(use_empty=True)
exec(open(os.path.join(ROOT_, 'docs/models/kit.py')).read())
ROOT = ROOT_

# Палітра набору. Земля на карті — білий сніг, тож тіла темні й холодні,
# білий/крижаний — лише акценти (черевця, кінчики хвостів, бивні).
FUR, FURD, SLATE, NAVY = 0x5a7391, 0x3c506a, 0x39424f, 0x18284a
TEAL, TEALD, INK = 0x1d5f6c, 0x123f49, 0x10141c
FOX, MAUVE, MAUVED = 0x7190b2, 0x56507c, 0x39355a
SNOW, ICE, ICEB, IVORY, BEAK = 0xe8f1f8, 0x9ccfe8, 0x5f9fd0, 0xe9e3cf, 0xe8962a
# Світні частини: у цьому наборі колір грані меша Glow — це колір світіння.
CYAN, EBLUE, VIOLET, AURORA = 0x60e8ff, 0x4080ff, 0xb090ff, 0x60ffb0


def post(bm, col, a, b, wx0, dz0, wx1=None, dz1=None):
    """Стовпчик (нога) між a і b з перетином «ширина по X × глибина по Z» —
    на відміну від frustum, орієнтація перетину не залежить від нахилу."""
    wx1 = wx0 if wx1 is None else wx1
    dz1 = dz0 if dz1 is None else dz1
    A, B = G(*a), G(*b)
    if A.z < B.z:
        A, B, wx0, dz0, wx1, dz1 = B, A, wx1, dz1, wx0, dz0
    vs = []
    for P, w, d in ((A, wx0, dz0), (B, wx1, dz1)):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append(bm.verts.new(P + Vector((sx * w / 2, sy * d / 2, 0))))
    _faces(bm, col, vs, ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)))


def icicle(hull, glow, base, tip, w, gcol=CYAN, frac=0.55, col=ICE):
    """Бурулька/кристал: крижана основа в корпусі, світний кінчик у Glow."""
    mid = tuple(base[i] + (tip[i] - base[i]) * frac for i in range(3))
    w1 = w * (1 - frac)
    frustum(hull, col, base, mid, w, w, w1, w1)
    spike(glow, gcol, mid, tip, w1, w1)


for t in ('scout', 'gunner', 'wasp', 'kamikaze', 'sniper', 'swarm', 'shell', 'spider', 'repairer', 'turret', 'foreman'):
    exec(open(os.path.join(ROOT, 'docs/models/ice', t + '.py')).read())
    export('I' + t.capitalize(), 'packages/screen/public/models/ice/' + t + '.glb')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'docs/models/ice/ice.blend'))
