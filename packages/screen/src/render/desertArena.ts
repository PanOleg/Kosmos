import * as THREE from 'three';
import type { MapDef, Obstacle } from '@horizon/sim';
import { BOX, CONE4, CYL, SPHERE, merge, part, seg, type Part } from './mesh';
import { toX, toZ } from './coords';
import type { ArenaView } from './arena';

/**
 * Пустельний аванпост (DECISIONS.md, п. 49): світла денна карта. Пісок із брижами, дюни й скелі
 * по колу, ворота каньйонів на місці шлюзів, бурова вежа в центрі. Скелет перешкод той самий,
 * що на станції (sim/config/map.ts), тож бій і бос не змінюються — лише вигляд.
 * Майже все — вершинні кольори, злиті в кілька мешів: на телевізорі це кілька викликів малювання.
 */

type V3 = [number, number, number];
const P = (x: number, y: number, h: number): V3 => [toX(x), h, toZ(y)];

const SAND = 0xe2bd86;
/** Груба куля для дюн, мішків і острівців: з пласким затіненням різниці не видно, трикутників утричі менше. */
const LOW = new THREE.SphereGeometry(0.5, 8, 5);
const BAG = new THREE.SphereGeometry(0.5, 6, 4);
const C = {
  rock: [0xa8714a, 0x8f5e3e, 0xb98a5c, 0x9c6844],
  dune: [0xdcb37a, 0xd4a96e, 0xe6c290],
  canvas: 0xd0b07e,
  canvasDark: 0xa88c5e,
  pole: 0x5a4632,
  rust: 0x7a5236,
  rustDark: 0x4a3426,
  tire: 0x25211d,
  wood: 0x9a7448,
  woodDark: 0x6e5232,
  bag: 0xa88a5a,
  bagDark: 0x8a7048,
  trunk: 0x7a5a3a,
  leaf: [0x4f8a3a, 0x3f7a30, 0x6a9a44],
  steel: 0x8a9098,
  steelDark: 0x4a4f56,
  hazard: 0xe8a020,
  bush: [0x8a8a4a, 0x7a6a3a, 0x6a7a40],
  pebble: [0xb08a60, 0x9a7a56, 0xc8a070],
  track: 0xc9a06a,
};
const G = { red: 0xff3a2a, amber: 0xffa830, core: 0xff6a2a };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inside(o: Obstacle, x: number, y: number, m: number): boolean {
  if (o.kind === 'circle') return Math.hypot(x - o.x, y - o.y) < o.r + m;
  const dx = x - o.x;
  const dy = y - o.y;
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return Math.abs(dx * c + dy * s) < o.hw + m && Math.abs(-dx * s + dy * c) < o.hh + m;
}

/** Пісок: теплий шум і хвилясті брижі вітру. */
function sandTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  const r = rng(7);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const ripple = Math.sin((y + Math.sin(x * 0.05) * 9) * 0.32) * 10;
      const v = 214 + ripple + (r() - 0.5) * 22;
      const i = (y * 256 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v * 0.86;
      img.data[i + 2] = v * 0.64;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Гранчастий камінь: ікосаедр, сплющений і повернутий. */
function stone(
  out: Part[],
  col: number,
  x: number,
  y: number,
  s: number,
  h: number,
  r: () => number,
) {
  out.push(
    part(
      new THREE.IcosahedronGeometry(0.5, 0),
      col,
      P(x, y, h * 0.42),
      [s * (0.9 + r() * 0.3), h, s * (0.9 + r() * 0.3)],
      [r() * 0.5, r() * 6, r() * 0.5],
    ),
  );
}

export function buildDesertArena(map: MapDef): ArenaView {
  const g = new THREE.Group();
  const R = map.radius;
  const r = rng(4242);
  const solid: Part[] = [];
  const glow: Part[] = [];
  const free = (x: number, y: number, m: number) =>
    Math.hypot(x, y) < R - 0.8 && !map.obstacles.some((o) => inside(o, x, y, m));

  // ---------- Земля: пісок до горизонту ----------
  const sand = sandTexture();
  sand.repeat.set(60, 60);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(R + 140, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: SAND, map: sand, roughness: 0.95, metalness: 0 }),
  );
  ground.receiveShadow = true;
  g.add(ground);

  // ---------- Межа: дюни й скелі по колу, проходи на місці шлюзів ----------
  const gateAngles = map.airlocks.map((a) => Math.atan2(a.y, a.x));
  const nearGate = (a: number, w: number) =>
    gateAngles.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < w);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + r() * 0.03;
    if (nearGate(a, 0.09)) continue;
    const rockSide = Math.sin(a) > 0.35;
    const d = R + 1.2 + r() * 2.5;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (rockSide) stone(solid, C.rock[i % 4]!, x, y, 3 + r() * 2.5, 2.6 + r() * 2.2, r);
    else
      solid.push(
        part(
          LOW,
          C.dune[i % 3]!,
          P(x, y, 0),
          [5 + r() * 4, 2.2 + r() * 1.8, 4 + r() * 3],
          [0, a, 0],
        ),
      );
  }
  // Дальні дюни й столові гори на горизонті.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + r() * 0.1;
    const d = R + 14 + r() * 30;
    solid.push(
      part(LOW, C.dune[i % 3]!, P(Math.cos(a) * d, Math.sin(a) * d, 0), [
        14 + r() * 10,
        4 + r() * 4,
        10 + r() * 8,
      ]),
    );
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const d = R + 70 + r() * 30;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const w = 14 + r() * 14;
    solid.push(part(CYL, C.rock[i % 4]!, P(x, y, 6), [w, 12 + r() * 8, w * 0.8], [0, r() * 3, 0]));
    solid.push(part(CYL, C.rock[(i + 1) % 4]!, P(x, y, 0.5), [w * 1.4, 2, w * 1.1]));
  }

  // Ворота каньйону: дві скелі-стовпи, металева рама з вогнями, смуга небезпеки на піску.
  for (const lock of map.airlocks) {
    const a = Math.atan2(lock.y, lock.x);
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    const cx = Math.cos(a) * (R - 0.2);
    const cy = Math.sin(a) * (R - 0.2);
    for (const s of [-1, 1]) {
      stone(solid, C.rock[(s + 1) % 4]!, cx + tx * s * 3.6, cy + ty * s * 3.6, 2.6, 4.2, r);
      solid.push(
        part(BOX, C.steelDark, P(cx + tx * s * 2.4, cy + ty * s * 2.4, 1.6), [0.3, 3.2, 0.3]),
      );
      glow.push(
        part(
          BOX,
          G.amber,
          P(cx + tx * s * 2.4 - Math.cos(a) * 0.17, cy + ty * s * 2.4 - Math.sin(a) * 0.17, 2.6),
          [0.2, 0.35, 0.2],
        ),
      );
    }
    solid.push(
      seg(
        BOX,
        C.steelDark,
        P(cx + tx * 2.4, cy + ty * 2.4, 3.2),
        P(cx - tx * 2.4, cy - ty * 2.4, 3.2),
        0.3,
        0.3,
      ),
    );
    for (let k = -4; k <= 4; k++) {
      const c = k % 2 === 0 ? C.hazard : C.rustDark;
      const px = cx - Math.cos(a) * 1.2 + tx * k * 0.5;
      const py = cy - Math.sin(a) * 1.2 + ty * k * 0.5;
      solid.push(part(BOX, c, P(px, py, 0.012), [0.5, 0.012, 0.9], [0, a, 0]));
    }
  }

  // ---------- Перешкоди ----------
  let reactor: THREE.Object3D | null = null;
  for (const o of map.obstacles) {
    if (o.tag === 'core' && o.kind === 'circle') {
      reactor = drillRig(o.r, o.height);
      g.add(reactor);
      continue;
    }
    if (o.kind === 'circle') {
      if (o.tag === 'palm') palmIsland(solid, o.x, o.y, o.r, r);
      else {
        // Брила: велика центральна й кілька менших довкола.
        stone(solid, C.rock[Math.floor(r() * 4)]!, o.x, o.y, o.r * 2.1, o.height, r);
        for (let k = 0; k < 3; k++) {
          const a = r() * Math.PI * 2;
          stone(
            solid,
            C.rock[Math.floor(r() * 4)]!,
            o.x + Math.cos(a) * o.r * 0.7,
            o.y + Math.sin(a) * o.r * 0.7,
            o.r * 0.9,
            o.height * (0.4 + r() * 0.3),
            r,
          );
        }
      }
      continue;
    }
    const c = Math.cos(o.rot);
    const s = Math.sin(o.rot);
    const L = (u: number, v: number, h: number): V3 =>
      P(o.x + u * c - v * s, o.y + u * s + v * c, h);
    const w = o.hw * 2;
    const d = o.hh * 2;
    switch (o.tag) {
      case 'rock': {
        const n = Math.max(2, Math.round(w / 1.6));
        for (let k = 0; k < n; k++) {
          const u = ((k + 0.5) / n - 0.5) * w;
          const [x, , z] = L(u, (r() - 0.5) * 0.3, 0);
          stone(
            solid,
            C.rock[k % 4]!,
            x,
            -z,
            d * 1.6 + r() * 0.6,
            o.height * (0.75 + r() * 0.35),
            r,
          );
        }
        break;
      }
      case 'sandbag': {
        const n = Math.max(2, Math.round(w / 0.55));
        for (let layer = 0; layer < 2; layer++)
          for (let k = 0; k < n; k++) {
            const u = ((k + 0.5 + layer * 0.5) / n - 0.5) * w;
            if (Math.abs(u) > w / 2) continue;
            solid.push(
              part(
                BAG,
                layer ? C.bag : C.bagDark,
                L(u, 0, 0.18 + layer * 0.3),
                [0.6, 0.32, d * 0.95],
                [0, -o.rot, 0],
              ),
            );
          }
        break;
      }
      case 'tent': {
        // Двосхилий намет: дві похилі площини, коник, кілки й мотузки.
        const h = o.height;
        for (const sd of [-1, 1])
          solid.push(
            seg(
              BOX,
              sd > 0 ? C.canvas : C.canvasDark,
              L(0, sd * d * 0.5, 0.05),
              L(0, 0, h),
              w,
              0.05,
            ),
          );
        solid.push(seg(CYL, C.pole, L(-w / 2, 0, h), L(w / 2, 0, h), 0.08));
        for (const su of [-1, 1]) {
          solid.push(seg(CYL, C.pole, L(su * w * 0.5, 0, 0), L(su * w * 0.5, 0, h), 0.07));
          solid.push(
            seg(CYL, C.pole, L(su * w * 0.5, 0, h), L(su * (w * 0.5 + 0.9), 0, 0.02), 0.025),
          );
        }
        break;
      }
      case 'wreck': {
        // Розбитий джип: кузов, кабіна без скла, колеса, запасне колесо.
        solid.push(part(BOX, C.rust, L(0, 0, 0.6), [w, 0.6, d * 0.9], [0, -o.rot, 0]));
        solid.push(
          part(BOX, C.rustDark, L(-w * 0.12, 0, 1.05), [w * 0.4, 0.35, d * 0.85], [0, -o.rot, 0]),
        );
        solid.push(
          part(BOX, C.rustDark, L(w * 0.32, 0, 0.95), [w * 0.3, 0.1, d * 0.9], [0.3, -o.rot, 0]),
        );
        for (const su of [-0.33, 0.33])
          for (const sv of [-0.5, 0.5])
            solid.push(
              part(
                CYL,
                C.tire,
                L(su * w, sv * d, 0.34),
                [0.68, 0.28, 0.68],
                [Math.PI / 2, -o.rot, 0],
              ),
            );
        solid.push(
          part(CYL, C.tire, L(-w * 0.52, 0, 0.75), [0.6, 0.2, 0.6], [0, -o.rot, Math.PI / 2]),
        );
        break;
      }
      default: {
        // Ящики й генератори.
        solid.push(part(BOX, C.wood, L(0, 0, o.height / 2), [w, o.height, d], [0, -o.rot, 0]));
        for (const sv of [-1, 1])
          solid.push(
            part(
              BOX,
              C.woodDark,
              L(0, sv * (d / 2 + 0.01), o.height / 2),
              [w * 0.95, 0.12, 0.02],
              [0, -o.rot, 0],
            ),
          );
        solid.push(
          part(BOX, C.woodDark, L(0, 0, o.height + 0.01), [w * 0.95, 0.02, 0.12], [0, -o.rot, 0]),
        );
      }
    }
  }

  // Точки скидання дронів: помаранчеві мітки на піску.
  for (const v of map.vents)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      solid.push(
        seg(
          BOX,
          C.hazard,
          P(v.x + Math.cos(a) * 1.1, v.y + Math.sin(a) * 1.1, 0.012),
          P(v.x + Math.cos(a + 1.05) * 1.1, v.y + Math.sin(a + 1.05) * 1.1, 0.012),
          0.12,
          0.012,
        ),
      );
    }

  // ---------- Дрібниці на рівні землі: камінці, сухі кущики, сліди шин ----------
  for (let tries = 0, n = 0; tries < 2000 && n < 260; tries++) {
    const a = r() * Math.PI * 2;
    const d = 3.5 + r() * (R - 4.5);
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (!free(x, y, 0.3)) continue;
    if (r() < 0.6) stone(solid, C.pebble[n % 3]!, x, y, 0.15 + r() * 0.2, 0.08 + r() * 0.08, r);
    else
      for (let k = 0; k < 4; k++)
        solid.push(
          part(
            CONE4,
            C.bush[n % 3]!,
            P(x + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.3, 0.1),
            [0.08, 0.22, 0.08],
            [(r() - 0.5) * 1.2, r() * 3, (r() - 0.5) * 1.2],
          ),
        );
    n++;
  }
  for (const [a0, a1, rad] of [
    [2.6, 4.0, 14.5],
    [-0.9, 0.7, 24],
    [3.6, 4.6, 23],
  ] as const)
    for (const off of [-0.8, 0.8])
      for (let k = 0; k < 20; k++) {
        const t0 = a0 + ((a1 - a0) * k) / 20;
        const t1 = a0 + ((a1 - a0) * (k + 1)) / 20;
        const rr = rad + off;
        solid.push(
          seg(
            BOX,
            C.track,
            P(Math.cos(t0) * rr, Math.sin(t0) * rr, 0.006),
            P(Math.cos(t1) * rr, Math.sin(t1) * rr, 0.006),
            0.28,
            0.006,
          ),
        );
      }

  const solidMesh = new THREE.Mesh(
    merge(solid),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    }),
  );
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  const glowMesh = new THREE.Mesh(
    merge(glow),
    new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3.2, 3.2, 3.2) }),
  );
  g.add(solidMesh, glowMesh);

  // ---------- Світло: яскравий день ----------
  const hemi = new THREE.HemisphereLight(0xfff2dc, 0xb08a5a, 1.7);
  g.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.2);
  sun.position.set(-25, 45, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -R - 4;
  sc.right = R + 4;
  sc.top = R + 4;
  sc.bottom = -R - 4;
  sc.near = 1;
  sc.far = 140;
  sun.shadow.bias = -0.0008;
  g.add(sun, sun.target);

  let dark = 0;
  return {
    group: g,
    sky: {
      background: 0xc9dcea,
      fog: 0xe8d6b8,
      fogDensity: 0.0042,
      env: 0.85,
      exposure: 1.0,
      bloom: [2.4, 0.4],
    },
    setDarkness(k: number) {
      dark = k;
    },
    setReactorVisible(on: boolean) {
      if (reactor) reactor.visible = on;
    },
    update(time: number) {
      // Фаза 1 Ядра в пустелі — піщана буря: світло меркне, лишаються вогні й ліхтарі.
      hemi.intensity = 1.7 * (1 - 0.82 * dark);
      sun.intensity = 3.2 * (1 - 0.92 * dark);
      if (reactor) reactor.rotation.y = time * 0.15;
    },
  };
}

/** Острівець оази: піщаний пагорб, пальми з похилими стовбурами й листям-віялом. */
function palmIsland(out: Part[], x: number, y: number, rad: number, r: () => number): void {
  out.push(part(LOW, 0xc89a64, P(x, y, 0), [rad * 2.2, 0.7, rad * 2.2]));
  out.push(part(CYL, 0x6a8a3e, P(x, y, 0.2), [rad * 1.6, 0.12, rad * 1.6]));
  const n = 1 + Math.round(rad);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const bx = x + Math.cos(a) * rad * 0.3;
    const by = y + Math.sin(a) * rad * 0.3;
    // Невисокі, з коротким листям: крона тримається над острівцем і не ховає бій під собою.
    const lean = 0.25 + r() * 0.25;
    const h = 1.9 + r() * 0.6;
    const tx = bx + Math.cos(a) * lean;
    const ty = by + Math.sin(a) * lean;
    // Стовбур із трьох сегментів — легкий вигин.
    let px = bx;
    let py = by;
    for (let k = 1; k <= 3; k++) {
      const t = k / 3;
      const nx = bx + (tx - bx) * t * t;
      const ny = by + (ty - by) * t * t;
      out.push(
        seg(CYL, 0x7a5a3a, P(px, py, (h * (k - 1)) / 3), P(nx, ny, (h * k) / 3), 0.22 - k * 0.03),
      );
      px = nx;
      py = ny;
    }
    for (let k = 0; k < 7; k++) {
      const la = (k / 7) * Math.PI * 2 + r();
      out.push(
        seg(
          BOX,
          C.leaf[k % 3]!,
          P(tx, ty, h),
          P(
            tx + Math.cos(la) * Math.min(1.0, rad * 0.75),
            ty + Math.sin(la) * Math.min(1.0, rad * 0.75),
            h - 0.35,
          ),
          0.3,
          0.04,
        ),
      );
    }
  }
}

/** Бурова вежа: платформа, гратчаста щогла, бур і червоний маяк; обертається повільно. */
function drillRig(rad: number, h: number): THREE.Object3D {
  const parts: Part[] = [];
  const glowParts: Part[] = [];
  parts.push(part(CYL, C.steelDark, [0, 0.25, 0], [rad * 2, 0.5, rad * 2]));
  parts.push(part(CYL, C.hazard, [0, 0.52, 0], [rad * 2 + 0.05, 0.06, rad * 2 + 0.05]));
  const top = h + 1.6;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = Math.cos(a) * rad * 0.8;
    const bz = Math.sin(a) * rad * 0.8;
    parts.push(seg(BOX, C.steel, [bx, 0.5, bz], [bx * 0.25, top, bz * 0.25], 0.16));
    for (let j = 1; j < 4; j++) {
      const t = j / 4;
      const a2 = a + Math.PI / 2;
      const x0 = bx + (bx * 0.25 - bx) * t;
      const z0 = bz + (bz * 0.25 - bz) * t;
      const x1 = Math.cos(a2) * rad * 0.8 * (1 - 0.75 * t);
      const z1 = Math.sin(a2) * rad * 0.8 * (1 - 0.75 * t);
      parts.push(
        seg(
          BOX,
          C.steelDark,
          [x0, 0.5 + (top - 0.5) * t, z0],
          [x1, 0.5 + (top - 0.5) * t, z1],
          0.08,
        ),
      );
    }
  }
  parts.push(part(CYL, C.steelDark, [0, h * 0.5, 0], [0.5, h, 0.5]));
  parts.push(part(BOX, C.hazard, [0, top, 0], [rad * 0.7, 0.25, rad * 0.7]));
  glowParts.push(part(SPHERE, G.red, [0, top + 0.35, 0], [0.4, 0.4, 0.4]));
  glowParts.push(part(CYL, G.core, [0, 1.2, 0], [0.9, 1.4, 0.9]));
  const grp = new THREE.Group();
  const m = new THREE.Mesh(
    merge(parts),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.4,
      flatShading: true,
    }),
  );
  m.castShadow = true;
  const gm = new THREE.Mesh(
    merge(glowParts),
    new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3.4, 3.4, 3.4) }),
  );
  grp.add(m, gm);
  grp.userData.dynamic = true;
  return grp;
}
