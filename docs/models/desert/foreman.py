# Пустеля, Прораб → Цар-скорпіон: шість ніг, дві жовто-чорні клешні замість кранів,
# хвіст дугою над спиною з червоним жалом, кабіна з помаранчевим вікном. Висота ~3.
hull, glow = bmesh.new(), bmesh.new()
def side(sx):
    for z in (0.55, 0.0, -0.55):
        hip = (0.6*sx, 1.0, z)
        knee = (1.1*sx, 1.5, z*1.2)
        foot = (1.45*sx, 0.14, z*1.5)
        frustum(hull, DARK, hip, knee, 0.2, 0.2, 0.16, 0.16)
        box(hull, YELLOW, knee, (0.22, 0.22, 0.22))
        frustum(hull, PALE, knee, foot, 0.16, 0.18, 0.12, 0.14)
        box(hull, DARK, (1.47*sx, 0.07, z*1.5), (0.3, 0.14, 0.34))
    # Клешня: плече, передпліччя зі смугами, два пальці.
    box(hull, DARK, (0.66*sx, 1.3, 0.8), (0.36, 0.36, 0.4))
    frustum(hull, YELLOW, (0.7*sx, 1.3, 0.8), (1.0*sx, 1.7, 1.5), 0.26, 0.26, 0.22, 0.22)
    for k in range(3):
        t = 0.25 + k * 0.25
        p = (0.7*sx + 0.3*sx*t, 1.3 + 0.4*t, 0.8 + 0.7*t)
        frustum(hull, STRIPE, (p[0], p[1] - 0.02, p[2] - 0.04), (p[0], p[1] + 0.02, p[2] + 0.04), 0.28, 0.28)
    box(hull, DARK, (1.0*sx, 1.7, 1.66), (0.44, 0.32, 0.4))
    spike(hull, STEEL, (1.13*sx, 1.7, 1.82), (1.22*sx, 1.52, 2.36), 0.14, 0.22)
    spike(hull, STEEL, (0.87*sx, 1.7, 1.82), (0.86*sx, 1.56, 2.3), 0.12, 0.18)
    box(glow, WHITE, (1.0*sx, 1.88, 1.66), (0.1, 0.06, 0.1))
mirror(side)
box(hull, PALE, (0, 1.05, -0.1), (1.3, 0.5, 1.7))
box(hull, YELLOW, (0, 1.38, -0.15), (1.1, 0.2, 1.3))
for k in range(3):
    box(hull, STRIPE, (0, 1.49, 0.25 - k*0.4), (1.12, 0.03, 0.12))
box(hull, MID, (0, 1.4, 0.72), (0.9, 0.5, 0.6))
box(hull, DARK, (0, 1.67, 0.72), (0.96, 0.06, 0.66))
box(glow, WHITE, (0, 1.42, 1.03), (0.62, 0.2, 0.02))
box(hull, RED, (0, 1.05, -0.96), (0.6, 0.08, 0.02))
tail = [(0, 1.3, -0.8), (0, 2.0, -1.35), (0, 2.65, -1.15), (0, 2.98, -0.55), (0, 2.85, 0.05)]
for k in range(4):
    w = 0.38 - k * 0.05
    frustum(hull, YELLOW if k % 2 == 0 else STRIPE, tail[k], tail[k + 1], w, w, w - 0.05, w - 0.05)
    box(hull, DARK, tail[k + 1], (w, w, w))
spike(hull, RED, (0, 2.85, 0.05), (0, 2.4, 0.5), 0.2, 0.2)
blob(glow, WHITE, (0, 2.9, 0.02), (0.2, 0.2, 0.2))
build('DForeman', hull, glow, offset_x=-14.0)
