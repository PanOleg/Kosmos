# Спільні функції для скриптів моделей (docs/models/<тип>.py), виконуються в Blender:
#   exec(open('docs/models/kit.py').read()); exec(open('docs/models/scout.py').read())
# Координати — як у грі: X вправо, Y вгору, +Z вперед (у Blender: Z вгору, вперед = −Y).
# Корпус — кольори вершин (лінійні, як PALETTE у грі), меш «<Name>Glow» — світні частини.
# Вимоги до моделей — DECISIONS.md, п. 45.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = '/Users/ok/PhpstormProjects/Games/Kosmos'
PALE, MID, DARK, RED, WHITE = 0xb4b8c0, 0x8d9198, 0x2a2c31, 0x8e1f26, 0xffffff
STEEL, RUST, YELLOW, STRIPE, BLUE = 0x5a5e66, 0x7a4a3a, 0xe8b020, 0x2a2420, 0x2d5aa8


def lin(h):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


def G(x, y, z):
    return Vector((x, -z, y))


def _lay(bm):
    return bm.faces.layers.int.get('col') or bm.faces.layers.int.new('col')


def _frame(a, b):
    ax = (b - a).normalized()
    side = ax.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = ax.cross(Vector((1, 0, 0)))
    side.normalize()
    return ax, side, side.cross(ax).normalized()


def _faces(bm, col, vs, faces):
    lay = _lay(bm)
    for f in faces:
        fc = bm.faces.new([vs[i] for i in f])
        fc[lay] = col


def frustum(bm, col, a, b, w0, d0, w1=None, d1=None):
    """Брусок уздовж відрізка a→b (координати гри), перетин w×d, до b може звужуватись."""
    w1 = w0 if w1 is None else w1
    d1 = d0 if d1 is None else d1
    A, B = G(*a), G(*b)
    ax, side, nrm = _frame(A, B)
    vs = []
    for P, w, d in ((A, w0, d0), (B, w1, d1)):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append(bm.verts.new(P + side * (sx * w / 2) + nrm * (sy * d / 2)))
    _faces(bm, col, vs, ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)))


def box(bm, col, c, s, rx=0.0, ry=0.0, rz=0.0):
    """Коробка: центр c, розмір s (гра), повороти навколо X, Y, Z гри (радіани)."""
    rot = Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X') @ Matrix.Rotation(rz, 3, 'Z')
    vs = []
    for dx, dy, dz in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)):
        v = rot @ Vector((dx * s[0] / 2, dy * s[1] / 2, dz * s[2] / 2))
        vs.append(bm.verts.new(G(c[0] + v.x, c[1] + v.y, c[2] + v.z)))
    _faces(bm, col, vs, ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)))


def spike(bm, col, base, tip, w, d):
    """Пірамідка: прямокутна основа w×d у base, вершина в tip."""
    B, T = G(*base), G(*tip)
    ax, side, nrm = _frame(B, T)
    vs = [bm.verts.new(B + side * (sx * w / 2) + nrm * (sy * d / 2)) for sx, sy in ((-1,-1),(1,-1),(1,1),(-1,1))]
    vs.append(bm.verts.new(T))
    _faces(bm, col, vs, ((0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)))


def cyl(bm, col, a, b, r0, r1=None, n=8, cap=True):
    """N-кутна призма/зрізаний конус уздовж a→b."""
    r1 = r0 if r1 is None else r1
    A, B = G(*a), G(*b)
    ax, side, nrm = _frame(A, B)
    vs = []
    for P, r in ((A, r0), (B, r1)):
        for k in range(n):
            t = 2 * math.pi * k / n
            vs.append(bm.verts.new(P + side * (math.cos(t) * r) + nrm * (math.sin(t) * r)))
    faces = [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    if cap:
        faces += [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    _faces(bm, col, vs, faces)


def blob(bm, col, c, s, sub=1):
    """Гранчаста «куля» (ікосфера) з центром c і розмірами s (гра)."""
    ret = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=0.5)
    m = Matrix.Diagonal((s[0], s[2], s[1], 1.0))
    bmesh.ops.transform(bm, matrix=m, verts=ret['verts'])
    bmesh.ops.translate(bm, vec=G(*c), verts=ret['verts'])
    lay = _lay(bm)
    fs = {f for v in ret['verts'] for f in v.link_faces}
    for f in fs:
        f[lay] = col


def mirror(fn):
    """Викликає fn(sx) для правого (+1) і лівого (−1) боку."""
    for sx in (1, -1):
        fn(sx)


def _material(name, emissive):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.5
    bsdf.inputs['Metallic'].default_value = 0.4
    if emissive:
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.03, 0.01, 1)
        bsdf.inputs['Emission Strength'].default_value = 4.0
    return m


def _to_obj(bm, name, emissive):
    bm.faces.index_update()
    lay = _lay(bm)
    cols = [f[lay] for f in bm.faces]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        c = lin(cols[poly.index])
        poly.use_smooth = False
        for li in poly.loop_indices:
            attr.data[li].color = c
    me.materials.append(_material('KitGlow' if emissive else 'KitArmor', emissive))
    ob = bpy.data.objects.new(name, me)
    coll = bpy.data.collections.get('Models') or bpy.data.collections.new('Models')
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    coll.objects.link(ob)
    return ob


def build(name, hull, glow, offset_x=0.0):
    """Створює <Name>Hull і <Name>Glow; старі з тими ж іменами видаляє."""
    for n in (name + 'Hull', name + 'Glow'):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    h = _to_obj(hull, name + 'Hull', False)
    g = _to_obj(glow, name + 'Glow', True)
    for o in (h, g):
        o.location.x = offset_x
    tris = sum(len(p.vertices) - 2 for p in h.data.polygons) + sum(len(p.vertices) - 2 for p in g.data.polygons)
    zs = [v.co.z for v in h.data.vertices]
    print(f'{name}: {tris} трикутників, висота {min(zs):.2f}..{max(zs):.2f}')
    return h, g


def export(name, rel_glb):
    """Експорт <Name>Hull + <Name>Glow у GLB (без зсуву offset_x)."""
    objs = [bpy.data.objects[name + 'Hull'], bpy.data.objects[name + 'Glow']]
    saved = [o.location.x for o in objs]
    for o in objs:
        o.location.x = 0
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    out = os.path.join(ROOT, rel_glb)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_vertex_color='ACTIVE', export_normals=True)
    for o, x in zip(objs, saved):
        o.location.x = x
    zs = [v.co.z for v in objs[0].data.vertices]
    print(f'export {rel_glb}: {os.path.getsize(out)} B, size_y {max(zs) - min(zs):.3f}, top {max(zs):.3f}')
