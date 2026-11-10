# Чотири класи гравців (concept classes.jpg). Кожен — окремі меші:
#   <Cls>Body (тулуб, голова, руки, зброя), <Cls>LegL / <Cls>LegR (нога від стегна — код
#   розгойдує її на бігу навколо верхньої точки), <Cls>Glow (візор і світні деталі кольору класу).
# Чорний комбінезон, пластини — притемнений колір класу (як у грі), Медик — білі пластини.
SUIT, SUIT_L, SUIT_D = 0x2b2f37, 0x5a606c, 0x1c1f25
WHITE_P = 0xdfe3ea
CLASS = {'assault': 0xe8323a, 'engineer': 0xff8a1f, 'medic': 0x3fd45a, 'tech': 0x2f7bff}


def dim(h, k):
    r, g, b, _ = lin(h)
    def enc(v):
        v = max(0.0, min(1.0, v * k))
        v = v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        return int(round(v * 255))
    return (enc(r) << 16) | (enc(g) << 8) | enc(b)


def make(cls, offset_x):
    c = dim(CLASS[cls], 0.6)
    medic, eng = cls == 'medic', cls == 'engineer'
    plate = WHITE_P if medic else c
    acc = c if medic else dim(CLASS[cls], 0.85)
    k = 0.86 if medic else (1.12 if eng else 1.0)
    body, glow = bmesh.new(), bmesh.new()
    legs = {}
    for sx, nm in ((1, 'LegR'), (-1, 'LegL')):
        lg = bmesh.new()
        x = 0.14 * sx * k
        frustum(lg, SUIT, (0.13*sx*k, 0.66, 0), (x, 0.38, 0.05), 0.18*k, 0.2, 0.16*k, 0.18)
        box(lg, plate, (x + 0.035*sx, 0.54, 0.02), (0.06, 0.18, 0.16))
        box(lg, plate, (x, 0.38, 0.13), (0.14*k, 0.13, 0.07), rx=-0.25)
        frustum(lg, SUIT_D, (x, 0.37, 0.05), (x, 0.1, 0.0), 0.15*k, 0.17, 0.14*k, 0.16)
        box(lg, plate, (x, 0.24, 0.08), (0.14*k, 0.2, 0.05))
        box(lg, SUIT, (x, 0.055, 0.05), (0.18*k, 0.11, 0.3))
        box(lg, acc, (x, 0.03, 0.19), (0.17*k, 0.06, 0.04))
        box(lg, SUIT_L, (x, 0.03, -0.09), (0.15*k, 0.06, 0.04))
        legs[nm] = lg
    # Таз, пояс із підсумками, талія, груди.
    box(body, SUIT, (0, 0.68, 0), (0.38*k, 0.16, 0.25))
    box(body, SUIT_L, (0, 0.74, 0), (0.4*k, 0.05, 0.27))
    for px in (-0.12, 0.12):
        box(body, SUIT_D, (px*k, 0.7, 0.14), (0.09, 0.09, 0.05))
    frustum(body, SUIT, (0, 0.76, 0), (0, 0.9, 0.0), 0.32*k, 0.22, 0.36*k, 0.24)
    frustum(body, SUIT, (0, 0.88, 0), (0, 1.16, 0.0), 0.44*k, 0.27, 0.54*k, 0.3)
    box(body, plate, (0, 1.04, 0.15), (0.42*k, 0.22, 0.05), rx=-0.08)
    box(body, plate, (0, 0.92, 0.13), (0.26*k, 0.08, 0.04))
    box(body, plate, (0, 1.04, -0.15), (0.38*k, 0.2, 0.04))
    box(body, SUIT_D, (0, 1.17, 0), (0.15, 0.07, 0.15))
    # Шолом: гранчаста сфера, лицьова пластина, щілина візора, «вушка».
    blob(body, c if medic else plate, (0, 1.31, 0.0), (0.32, 0.31, 0.34))
    box(body, SUIT_D, (0, 1.29, 0.12), (0.27, 0.13, 0.12))
    box(body, SUIT_L, (0.165, 1.31, 0.0), (0.04, 0.12, 0.14))
    box(body, SUIT_L, (-0.165, 1.31, 0.0), (0.04, 0.12, 0.14))
    box(body, plate, (0, 1.44, 0.02), (0.08, 0.04, 0.26))
    box(glow, WHITE, (0, 1.31, 0.185), (0.21, 0.045, 0.02))
    sR, sL = (0.33*k, 1.07, 0), (-0.33*k, 1.07, 0)

    def arms_two_handed(grip, fore):
        eR, eL = (0.35*k, 0.86, 0.1), (-0.22*k, 0.86, 0.2)
        frustum(body, SUIT, sR, eR, 0.13*k, 0.13*k)
        frustum(body, plate, eR, (0.13, 0.88, grip), 0.12*k, 0.12*k, 0.1*k, 0.1*k)
        box(body, SUIT_D, (0.12, 0.88, grip + 0.02), (0.09, 0.09, 0.09))
        frustum(body, SUIT, sL, eL, 0.13*k, 0.13*k)
        frustum(body, plate, eL, (0.08, 0.86, fore), 0.12*k, 0.12*k, 0.1*k, 0.1*k)
        box(body, SUIT_D, (0.08, 0.87, fore + 0.02), (0.09, 0.09, 0.09))

    def pads(w, h, d, tilt, y=1.12):
        for sx in (1, -1):
            box(body, plate, (0.36*sx*k, y, 0), (w, h, d), rz=-tilt*sx)
            box(body, SUIT, (0.37*sx*k, y - h*0.55, 0), (w*0.9, h*0.4, d*0.9), rz=-tilt*sx)

    if cls == 'assault':
        pads(0.3, 0.22, 0.38, 0.32)
        for sx in (1, -1):
            box(body, SUIT_D, (0.4*sx, 1.19, 0.19), (0.16, 0.05, 0.02), rz=-0.32*sx)
            box(body, SUIT_D, (0.4*sx, 1.13, 0.19), (0.12, 0.04, 0.02), rz=-0.32*sx)
        box(body, SUIT_D, (0, 1.06, -0.25), (0.36, 0.34, 0.12))
        # Імпульсна гвинтівка.
        box(body, SUIT_D, (0.1, 0.9, 0.5), (0.11, 0.16, 0.82))
        box(body, SUIT_L, (0.1, 0.99, 0.48), (0.07, 0.04, 0.5))
        box(body, SUIT, (0.1, 0.93, 1.0), (0.07, 0.07, 0.26))
        cyl(body, SUIT_L, (0.1, 0.93, 1.12), (0.1, 0.93, 1.16), 0.045, n=6)
        box(body, SUIT_D, (0.1, 0.77, 0.42), (0.07, 0.16, 0.1), rx=0.25)
        box(body, SUIT_D, (0.1, 0.92, 0.08), (0.09, 0.14, 0.24))
        box(body, SUIT_L, (0.1, 1.04, 0.36), (0.05, 0.06, 0.12))
        box(glow, WHITE, (0.16, 0.92, 0.55), (0.012, 0.03, 0.6))
        box(glow, WHITE, (0.04, 0.92, 0.55), (0.012, 0.03, 0.6))
        arms_two_handed(0.28, 0.62)
        muzzle = (0.1, 0.93, 1.16)
    elif cls == 'engineer':
        pads(0.26, 0.2, 0.36, 0.1, y=1.1)
        # Рюкзак-генератор вищий за плечі, з шестернею й антеною.
        box(body, SUIT, (0, 1.1, -0.32), (0.64, 0.8, 0.34))
        box(body, plate, (0, 1.48, -0.3), (0.54, 0.07, 0.3))
        box(body, plate, (0.3, 1.1, -0.32), (0.06, 0.6, 0.3))
        box(body, plate, (-0.3, 1.1, -0.32), (0.06, 0.6, 0.3))
        cyl(body, plate, (0, 1.12, -0.49), (0, 1.12, -0.53), 0.19, n=8)
        for t in range(8):
            a = t * math.pi / 4
            box(body, plate, (math.cos(a)*0.2, 1.12 + math.sin(a)*0.2, -0.51), (0.06, 0.06, 0.04), rz=a)
        cyl(body, SUIT_L, (0.22, 1.5, -0.38), (0.24, 1.82, -0.42), 0.02, n=6)
        cyl(glow, WHITE, (0, 1.12, -0.53), (0, 1.12, -0.55), 0.11, n=8)
        # Короткий важкий дробовик.
        box(body, SUIT_D, (0.1, 0.88, 0.42), (0.16, 0.18, 0.6))
        box(body, SUIT, (0.1, 0.8, 0.5), (0.12, 0.08, 0.36))
        cyl(body, SUIT_L, (0.1, 0.92, 0.72), (0.1, 0.92, 0.82), 0.06, n=8)
        box(glow, WHITE, (0.185, 0.92, 0.42), (0.012, 0.03, 0.4))
        arms_two_handed(0.22, 0.52)
        muzzle = (0.1, 0.92, 0.84)
    elif cls == 'medic':
        pads(0.17, 0.14, 0.26, 0.05, y=1.09)
        box(body, SUIT, (0, 0.98, -0.22), (0.32, 0.36, 0.14))
        box(body, plate, (0, 1.02, -0.3), (0.2, 0.14, 0.02))
        for px in (-0.1, 0.1):
            box(body, plate, (px, 0.72, 0.16), (0.08, 0.1, 0.04))
        # Права рука вперед із пістолетом, ліва вздовж тіла.
        frustum(body, SUIT, (0.28, 1.06, 0), (0.28, 1.02, 0.28), 0.11, 0.11)
        frustum(body, plate, (0.28, 1.02, 0.28), (0.26, 1.0, 0.5), 0.1, 0.1, 0.09, 0.09)
        box(body, SUIT_D, (0.26, 1.02, 0.6), (0.07, 0.11, 0.24))
        box(body, SUIT_D, (0.26, 0.95, 0.53), (0.06, 0.1, 0.06), rx=0.3)
        frustum(body, SUIT, (-0.28, 1.06, 0), (-0.3, 0.84, 0.04), 0.11, 0.11)
        frustum(body, plate, (-0.3, 0.84, 0.04), (-0.3, 0.64, 0.08), 0.1, 0.1, 0.09, 0.09)
        box(body, SUIT_D, (-0.3, 0.6, 0.08), (0.09, 0.09, 0.09))
        box(glow, WHITE, (0, 1.04, 0.18), (0.1, 0.028, 0.01))
        box(glow, WHITE, (0, 1.04, 0.18), (0.028, 0.1, 0.01))
        box(glow, WHITE, (0.26, 1.06, 0.6), (0.012, 0.02, 0.18))
        muzzle = (0.26, 1.03, 0.74)
    else:  # tech
        pads(0.24, 0.18, 0.32, 0.2, y=1.1)
        box(body, SUIT, (0, 1.0, -0.26), (0.4, 0.48, 0.2))
        box(body, plate, (0, 1.12, -0.37), (0.3, 0.12, 0.02))
        cyl(body, SUIT_L, (0.12, 1.2, -0.3), (0.16, 1.95, -0.36), 0.03, n=6)
        blob(body, SUIT_L, (0.16, 1.96, -0.36), (0.07, 0.07, 0.07))
        # Дугова гармата з трьома котушками.
        box(body, SUIT_D, (0.1, 0.9, 0.56), (0.11, 0.14, 1.06))
        box(body, SUIT_L, (0.1, 0.9, 1.13), (0.05, 0.05, 0.14))
        spike(body, SUIT_L, (0.1, 0.9, 1.18), (0.1, 0.9, 1.3), 0.08, 0.02)
        box(body, SUIT_D, (0.1, 0.8, 0.3), (0.07, 0.12, 0.1), rx=0.25)
        for i in range(3):
            box(glow, WHITE, (0.1, 0.9, 0.5 + i * 0.2), (0.17, 0.2, 0.05))
        blob(glow, WHITE, (0.16, 1.96, -0.36), (0.05, 0.05, 0.05))
        arms_two_handed(0.25, 0.74)
        muzzle = (0.1, 0.9, 1.3)

    name = cls.capitalize()
    objs = [_to_obj(body, name + 'Body', False), _to_obj(glow, name + 'Glow', True)]
    for nm, lg in legs.items():
        objs.append(_to_obj(lg, name + nm, False))
    for o in objs:
        o.location.x = offset_x
    tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
    zs = [v.co.z for o in objs for v in o.data.vertices]
    print(f'{name}: {tris} трикутників, висота {max(zs):.2f}, дуло {muzzle}')
    return objs, muzzle


def make_all():
    out = {}
    for i, cls in enumerate(CLASS):
        name = cls.capitalize()
        for part in ('Body', 'Glow', 'LegL', 'LegR', 'Hull'):
            if name + part in bpy.data.objects:
                bpy.data.objects.remove(bpy.data.objects[name + part], do_unlink=True)
        out[cls] = make(cls, 3.0 + i * 1.6)
    return out


def export_player(cls, objs):
    saved = [o.location.x for o in objs]
    for o in objs:
        o.location.x = 0
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    out = os.path.join(ROOT, f'packages/screen/public/models/{cls}.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_vertex_color='ACTIVE', export_normals=True)
    for o, x in zip(objs, saved):
        o.location.x = x
    print('export', cls, os.path.getsize(out))
