# Пустеля, Павук → Сольпуга (фаланга): видовжене смугасте черевце, масивні червоні хеліцери,
# вісім ламаних ніг. Стоїть на підлозі.
hull, glow = bmesh.new(), bmesh.new()
blob(hull, RUST, (0, 0.48, -0.18), (0.5, 0.34, 0.7))
for k in range(3):
    box(hull, YELLOW, (0, 0.62 - k*0.025, -0.02 - k*0.17), (0.34 - k*0.05, 0.04, 0.05))
blob(hull, PALE, (0, 0.5, 0.26), (0.34, 0.26, 0.3))
box(hull, DARK, (0, 0.6, 0.26), (0.16, 0.05, 0.2))
def legs(sx):
    for z in (0.3, 0.12, -0.06, -0.24):
        hip = (0.16*sx, 0.48, z)
        knee = (0.46*sx, 0.8, z*1.5)
        mid = (0.66*sx, 0.25, z*1.9)
        frustum(hull, DARK, hip, knee, 0.06, 0.06, 0.05, 0.05)
        box(hull, MID, knee, (0.07, 0.07, 0.07))
        frustum(hull, PALE, knee, mid, 0.05, 0.06, 0.04, 0.05)
        spike(hull, DARK, mid, (0.76*sx, 0.0, z*2.1), 0.04, 0.04)
    frustum(hull, RED, (0.07*sx, 0.48, 0.38), (0.08*sx, 0.42, 0.58), 0.1, 0.12, 0.06, 0.07)
    spike(hull, DARK, (0.08*sx, 0.42, 0.58), (0.03*sx, 0.3, 0.7), 0.05, 0.05)
mirror(legs)
for x, y in ((0.06, 0.6), (-0.06, 0.6), (0.13, 0.55), (-0.13, 0.55)):
    box(glow, WHITE, (x, y, 0.395), (0.045, 0.045, 0.02))
build('DSpider', hull, glow, offset_x=-6.0)
