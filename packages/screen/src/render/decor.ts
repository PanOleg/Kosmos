import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MapDef, Obstacle } from '@horizon/sim';
import { BOX, CONE4, CYL, SPHERE, merge, part, seg, type Part } from './mesh';
import { toX, toZ } from './coords';

/**
 * Наповнення локації (DECISIONS.md, п. 47) за концептом map.jpg: труби й щитки на стінах,
 * розмітка й назви відсіків на підлозі, палети й ящики на дахах контейнерів, обладнання на
 * столах лабораторії, трава й поливні труби в оранжереї, поручні біля ілюмінатора, кабелі
 * до реактора. Лише візуал: усе або на рівні підлоги (≤ 0.15 м), або на стінах / столах /
 * дахах — нічого, що виглядало б перешкодою без колізії. Усе злито в три меші (корпус,
 * світні деталі, написи): на телевізорі це три виклики малювання на всю локацію.
 */

type V3 = [number, number, number];
/** Точка арени (x, y симуляції) на висоті h — у координатах three. */
const P = (x: number, y: number, h: number): V3 => [toX(x), h, toZ(y)];

const C = {
  pipe: 0x6a707c,
  pipeDark: 0x3a3e46,
  bracket: 0x2a2d33,
  panel: 0x4a4f58,
  vent: 0x23262c,
  yellow: 0xd8a830,
  pallet: 0x7a5a36,
  crate: [0x6b5236, 0x55606a, 0x8a6a3e, 0x3e5a4a],
  cable: 0x1c1e22,
  grass: [0x3f8a3c, 0x4f9a4a, 0x2f7034, 0x6ab04f],
  soil: 0x2e2419,
  flower: [0xd8584a, 0xe8c040, 0xb070e0, 0xf0f0f0],
  rail: 0x8a909c,
  carpet: 0x1f2a44,
  grate: 0x2a2c31,
  steel: 0x9aa0aa,
  lab: 0xd8dde4,
};
const G = {
  red: 0xff3a2a,
  cyan: 0x6fe8ff,
  green: 0x6aff8a,
  amber: 0xffc860,
  white: 0xf0f4ff,
};

/** Детермінований генератор: та сама локація щоразу. */
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

/** Кут у секторі з центром mid і пів-шириною half (усе в радіанах). */
function inSector(a: number, mid: number, half: number): boolean {
  const d = Math.atan2(Math.sin(a - mid), Math.cos(a - mid));
  return Math.abs(d) <= half;
}

const WEST = Math.PI;
const WINDOW_HALF = Math.PI / 4;
const AIRLOCK_ANGLES = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];

export function buildDecor(map: MapDef): THREE.Group {
  const R = map.radius;
  const hull: Part[] = [];
  const glow: Part[] = [];
  const rand = rng(1337);
  const free = (x: number, y: number, m: number) =>
    Math.hypot(x, y) < R - 0.8 && !map.obstacles.some((o) => inside(o, x, y, m));
  const nearAirlock = (a: number, w: number) => AIRLOCK_ANGLES.some((b) => inSector(a, b, w));

  // ---------- Стіни: дві труби з кронштейнами, щитки, вентиляційні ґрати, LED-індикатори ----------
  const N = 120;
  const wallR = R - 0.12;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (inSector(am, WEST, WINDOW_HALF + 0.02) || nearAirlock(am, 0.1)) continue;
    for (const [h, r, col] of [
      [1.95, 0.07, C.pipe],
      [2.28, 0.05, C.pipeDark],
    ] as const)
      hull.push(
        seg(
          CYL,
          col,
          P(Math.cos(a0) * wallR, Math.sin(a0) * wallR, h),
          P(Math.cos(a1) * wallR, Math.sin(a1) * wallR, h),
          r * 2,
        ),
      );
    if (i % 5 === 0)
      hull.push(
        part(
          BOX,
          C.bracket,
          P(Math.cos(am) * (R - 0.06), Math.sin(am) * (R - 0.06), 2.1),
          [0.12, 0.5, 0.12],
          [0, am, 0],
        ),
      );
    if (i % 10 === 5) {
      // Щиток з індикатором або ґрати вентиляції — по черзі.
      const x = Math.cos(am) * (R - 0.05);
      const y = Math.sin(am) * (R - 0.05);
      if ((i / 10) % 2 < 1) {
        hull.push(part(BOX, C.panel, P(x, y, 1.15), [0.1, 0.7, 0.55], [0, am, 0]));
        glow.push(
          part(
            BOX,
            i % 20 === 5 ? G.green : G.amber,
            P(Math.cos(am) * (R - 0.11), Math.sin(am) * (R - 0.11), 1.35),
            [0.03, 0.06, 0.06],
            [0, am, 0],
          ),
        );
      } else {
        hull.push(part(BOX, C.vent, P(x, y, 0.45), [0.08, 0.5, 0.9], [0, am, 0]));
        for (let k = 0; k < 4; k++)
          hull.push(
            part(
              BOX,
              C.panel,
              P(Math.cos(am) * (R - 0.1), Math.sin(am) * (R - 0.1), 0.27 + k * 0.12),
              [0.03, 0.03, 0.85],
              [0, am, 0],
            ),
          );
      }
    }
  }

  // ---------- Реакторна зала: решітка навколо реактора, кабелі від пультів, шеврони біля проходів ----------
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    hull.push(
      seg(
        BOX,
        C.grate,
        P(Math.cos(a) * 2.75, Math.sin(a) * 2.75, 0.012),
        P(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0.012),
        0.06,
        0.02,
      ),
    );
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const off = 0.25;
    for (const s of [-1, 1]) {
      const ox = -Math.sin(a) * off * s;
      const oy = Math.cos(a) * off * s;
      hull.push(
        seg(
          BOX,
          C.cable,
          P(Math.cos(a) * 2.8 + ox, Math.sin(a) * 2.8 + oy, 0.02),
          P(Math.cos(a) * 5.9 + ox, Math.sin(a) * 5.9 + oy, 0.02),
          0.12,
          0.04,
        ),
      );
    }
    glow.push(
      seg(
        BOX,
        G.red,
        P(Math.cos(a) * 3.0, Math.sin(a) * 3.0, 0.035),
        P(Math.cos(a) * 5.8, Math.sin(a) * 5.8, 0.035),
        0.04,
        0.01,
      ),
    );
  }
  for (const a of AIRLOCK_ANGLES)
    for (let k = 0; k < 3; k++) {
      // Шеврон «до реактора» у проході бортика: дві смужки під кутом.
      const r = 9.2 + k * 0.7;
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r;
      for (const s of [-1, 1]) {
        const tx = -Math.sin(a) * s;
        const ty = Math.cos(a) * s;
        hull.push(
          seg(
            BOX,
            C.yellow,
            P(cx + tx * 0.5 + Math.cos(a) * 0.3, cy + ty * 0.5 + Math.sin(a) * 0.3, 0.013),
            P(cx - Math.cos(a) * 0.1, cy - Math.sin(a) * 0.1, 0.013),
            0.14,
            0.012,
          ),
        );
      }
    }

  // ---------- Вантажний відсік (північ): жовті смуги проїздів, палети, ящики на дахах контейнерів ----------
  for (const ly of [15.25, 19.75]) {
    const half = Math.sqrt(Math.max(0, (R - 2) ** 2 - ly * ly));
    for (let x = -half; x < half - 0.6; x += 1.4)
      hull.push(part(BOX, C.yellow, P(x + 0.4, ly, 0.012), [0.8, 0.012, 0.1]));
  }
  for (const o of map.obstacles) {
    if (o.tag !== 'container' || o.kind !== 'rect') continue;
    const n = Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const s = 0.55 + rand() * 0.3;
      const lx = (rand() - 0.5) * (o.hw * 2 - s);
      const ly = (rand() - 0.5) * (o.hh * 2 - s);
      hull.push(
        part(
          BOX,
          C.crate[Math.floor(rand() * C.crate.length)]!,
          P(o.x + lx, o.y + ly, o.height + s / 2),
          [s, s, s],
          [0, rand() * 0.6, 0],
        ),
      );
    }
  }
  for (let tries = 0, placed = 0; tries < 200 && placed < 12; tries++) {
    const a = Math.PI / 4 + rand() * (Math.PI / 2);
    const r = 12 + rand() * 14;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (!free(x, y, 1)) continue;
    const rot = rand() * Math.PI;
    hull.push(part(BOX, C.pallet, P(x, y, 0.07), [1.1, 0.14, 1.1], [0, rot, 0]));
    for (let k = -1; k <= 1; k++)
      hull.push(
        part(
          BOX,
          0x5a4228,
          P(x + Math.cos(rot) * k * 0.4, y - Math.sin(rot) * k * 0.4, 0.145),
          [0.14, 0.012, 1.1],
          [0, rot, 0],
        ),
      );
    placed++;
  }

  // ---------- Лабораторія (схід): обладнання на столах, кабелі до стіни, серверні шафи на стіні ----------
  for (const o of map.obstacles) {
    if (o.tag !== 'table' || o.kind !== 'rect') continue;
    const long = o.hw > o.hh;
    const L = (u: number, v: number, h: number): V3 => {
      // u — уздовж довгої сторони, v — поперек; у світ через поворот стола.
      const lx = long ? u : v;
      const ly = long ? v : u;
      const c = Math.cos(o.rot);
      const s = Math.sin(o.rot);
      return P(o.x + lx * c - ly * s, o.y + lx * s + ly * c, h);
    };
    const len = Math.max(o.hw, o.hh) * 2;
    const top = o.height + 0.01;
    hull.push(
      part(
        BOX,
        C.vent,
        L(-len * 0.15, 0.18, top + 0.015),
        [long ? 0.5 : 0.18, 0.03, long ? 0.18 : 0.5],
        [0, o.rot, 0],
      ),
    );
    // Штатив із колбами — світяться блакитним.
    hull.push(
      part(
        BOX,
        C.lab,
        L(len * 0.3, 0.1, top + 0.03),
        [long ? 0.4 : 0.14, 0.06, long ? 0.14 : 0.4],
        [0, o.rot, 0],
      ),
    );
    for (let k = -1; k <= 1; k++)
      glow.push(part(CYL, G.cyan, L(len * 0.3 + k * 0.12, 0.1, top + 0.15), [0.07, 0.18, 0.07]));
    // Мікроскоп: основа й нахилена труба.
    hull.push(part(BOX, C.steel, L(-len * 0.35, -0.15, top + 0.04), [0.18, 0.08, 0.18]));
    hull.push(
      seg(
        CYL,
        C.pipeDark,
        L(-len * 0.35, -0.15, top + 0.08),
        L(-len * 0.35 + 0.08, -0.12, top + 0.35),
        0.06,
      ),
    );
    // Кабель від стола до найближчої стіни лабораторії — пласка смуга.
    const ex = Math.cos(Math.atan2(o.y, o.x)) * (R - 0.3);
    const ey = Math.sin(Math.atan2(o.y, o.x)) * (R - 0.3);
    hull.push(seg(BOX, C.cable, P(o.x, o.y, 0.015), P(ex, ey, 0.015), 0.07, 0.025));
  }
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 4 + 0.12 + (i / 13) * (Math.PI / 2 - 0.24);
    if (nearAirlock(a, 0.12)) continue;
    const x = Math.cos(a) * (R - 0.1);
    const y = Math.sin(a) * (R - 0.1);
    hull.push(part(BOX, C.vent, P(x, y, 1.0), [0.16, 2.0, 0.9], [0, a, 0]));
    for (let k = 0; k < 6; k++)
      glow.push(
        part(
          BOX,
          (i + k) % 3 === 0 ? G.green : G.cyan,
          P(Math.cos(a) * (R - 0.19), Math.sin(a) * (R - 0.19), 0.35 + k * 0.28),
          [0.02, 0.03, 0.5],
          [0, a, 0],
        ),
      );
  }

  // ---------- Оранжерея (південь): ґрунт під клумбами, трава й квіти, поливна труба ----------
  for (const o of map.obstacles)
    if (o.tag === 'planter' && o.kind === 'circle')
      hull.push(part(CYL, C.soil, P(o.x, o.y, 0.006), [(o.r + 0.6) * 2, 0.012, (o.r + 0.6) * 2]));
  // Трава кущиками: центри куп, навколо кілька пучків по 3 травинки, зрідка квітка.
  for (let tries = 0, placed = 0; tries < 900 && placed < 140; tries++) {
    const a = -Math.PI / 4 - rand() * (Math.PI / 2);
    const r = 11.2 + rand() * 17;
    const cx = Math.cos(a) * r;
    const cy = Math.sin(a) * r;
    if (!free(cx, cy, 0.4)) continue;
    const col = C.grass[Math.floor(rand() * C.grass.length)]!;
    const tufts = 4 + Math.floor(rand() * 5);
    for (let t = 0; t < tufts; t++) {
      const x = cx + (rand() - 0.5) * 1.1;
      const y = cy + (rand() - 0.5) * 1.1;
      if (!free(x, y, 0.3)) continue;
      const h = 0.12 + rand() * 0.16;
      for (let k = 0; k < 3; k++)
        hull.push(
          part(
            CONE4,
            col,
            P(x + (rand() - 0.5) * 0.14, y + (rand() - 0.5) * 0.14, h / 2),
            [0.06, h, 0.06],
            [(rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6],
          ),
        );
      if (rand() < 0.15)
        hull.push(
          part(
            SPHERE,
            C.flower[Math.floor(rand() * C.flower.length)]!,
            P(x, y, h + 0.03),
            [0.09, 0.07, 0.09],
          ),
        );
    }
    placed++;
  }
  const irrR = R - 1.4;
  for (let k = 0; k < 24; k++) {
    const a0 = -Math.PI / 4 - 0.1 - (k / 24) * (Math.PI / 2 - 0.2);
    const a1 = -Math.PI / 4 - 0.1 - ((k + 1) / 24) * (Math.PI / 2 - 0.2);
    if (nearAirlock((a0 + a1) / 2, 0.12)) continue;
    hull.push(
      seg(
        CYL,
        0x3a6a8a,
        P(Math.cos(a0) * irrR, Math.sin(a0) * irrR, 0.06),
        P(Math.cos(a1) * irrR, Math.sin(a1) * irrR, 0.06),
        0.1,
      ),
    );
    if (k % 3 === 0)
      glow.push(
        part(
          BOX,
          G.amber,
          P(Math.cos(a0) * (R - 0.05), Math.sin(a0) * (R - 0.05), 2.45),
          [0.9, 0.06, 0.08],
          [0, a0 + Math.PI / 2, 0],
        ),
      );
  }

  // ---------- Оглядова палуба (захід): килим, поручні біля ілюмінатора, підсвітка підлоги ----------
  // Прямокутний килим з окантовкою й світлими смугами вздовж країв.
  hull.push(part(BOX, 0x2a3346, P(-20, 0, 0.006), [9.4, 0.012, 6.4]));
  hull.push(part(BOX, C.carpet, P(-20, 0, 0.009), [8.8, 0.012, 5.8]));
  for (const dz of [-1, 1])
    glow.push(part(BOX, G.white, P(-20, dz * 3.35, 0.02), [8.4, 0.012, 0.05]));
  const railR = R - 0.15;
  for (let k = 0; k <= 30; k++) {
    const a = WEST - WINDOW_HALF + (k / 30) * WINDOW_HALF * 2;
    if (inSector(a, WEST, 0.1)) continue;
    const x = Math.cos(a) * railR;
    const y = Math.sin(a) * railR;
    hull.push(part(BOX, C.rail, P(x, y, 0.5), [0.06, 1.0, 0.06]));
    if (k < 30) {
      const b = WEST - WINDOW_HALF + ((k + 1) / 30) * WINDOW_HALF * 2;
      if (inSector(b, WEST, 0.1)) continue;
      hull.push(
        seg(CYL, C.rail, P(x, y, 1.0), P(Math.cos(b) * railR, Math.sin(b) * railR, 1.0), 0.06),
      );
      glow.push(
        seg(
          BOX,
          G.cyan,
          P(Math.cos(a) * (R - 0.35), Math.sin(a) * (R - 0.35), 0.02),
          P(Math.cos(b) * (R - 0.35), Math.sin(b) * (R - 0.35), 0.02),
          0.05,
          0.01,
        ),
      );
    }
  }

  const group = new THREE.Group();
  const hullMesh = new THREE.Mesh(
    merge(hull),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.35,
      flatShading: true,
    }),
  );
  // Без проходу тіней: дрібниці на підлозі й стінах тіні майже не дають, а трикутників багато.
  hullMesh.castShadow = false;
  hullMesh.receiveShadow = true;
  // Світні деталі: колір понад 1 — їх підхоплює bloom (поріг 0.9).
  const glowMesh = new THREE.Mesh(
    merge(glow),
    new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.6) }),
  );
  group.add(hullMesh, glowMesh, sectorLabels());
  // Уже зібрано в три меші: batchStatic не має що тут зливати.
  group.userData.dynamic = true;
  return group;
}

/** Назви відсіків, нанесені фарбою на підлогу: одна текстура-атлас, один меш. */
function sectorLabels(): THREE.Mesh {
  const labels: [string, number, number, number][] = [
    ['ВАНТАЖНИЙ ВІДСІК', 0, 15.25, 7.2],
    ['ЛАБОРАТОРІЯ', 18.5, 4.2, 5.4],
    ['ОРАНЖЕРЕЯ', -0.4, -12.7, 4.6],
    ['ОГЛЯДОВА ПАЛУБА', -20, 0, 7.0],
  ];
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const ctx = cv.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "800 82px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(232,236,244,0.9)';
  labels.forEach(([text], i) => ctx.fillText(text, 512, 64 + i * 128, 1000));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const geos = labels.map(([, x, y, w], i) => {
    const g = new THREE.PlaneGeometry(w, w / 8).rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / 4);
    g.translate(toX(x), 0.016, toZ(y));
    return g;
  });
  const geo = mergeGeometries(geos)!;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      roughness: 0.8,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
