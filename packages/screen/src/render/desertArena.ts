import * as THREE from 'three';
import type { MapDef, Obstacle } from '@horizon/sim';
import { BOX, CONE4, CYL, SPHERE, merge, part, seg, type Part } from './mesh';
import { toX, toZ } from './coords';
import { SHADOW_HALF, followShadow, type ArenaView } from './arena';
import { contactShadows } from './contact';

/**
 * Пустельний аванпост (DECISIONS.md, п. 49): світла денна карта. Пісок із брижами, дюни й скелі
 * по колу, ворота каньйонів на місці шлюзів, бурова вежа в центрі. Скелет перешкод той самий,
 * що на станції (sim/config/map.ts), тож бій і бос не змінюються — лише вигляд.
 * Майже все — вершинні кольори, злиті в кілька мешів: на телевізорі це кілька викликів малювання.
 */

type V3 = [number, number, number];
const P = (x: number, y: number, h: number): V3 => [toX(x), h, toZ(y)];

let SAND = 0xe2bd86;
const SUN_OFFSET = new THREE.Vector3(-25, 45, 18);
/** Груба куля для дюн, мішків і острівців: з пласким затіненням різниці не видно, трикутників утричі менше. */
const LOW = new THREE.SphereGeometry(0.5, 8, 5);
const BAG = new THREE.SphereGeometry(0.5, 6, 4);
const DESERT = {
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
  island: 0xc89a64,
  islandTop: 0x6a8a3e,
  slow: 0xb98e58,
  slowRing: 0x8a6a40,
};
/** Крижана база (п. 61): та сама геометрія, сніг і лід замість піску й скель, ялини замість пальм. */
const ICE: typeof DESERT = {
  rock: [0x9fc4de, 0x86b0d0, 0xb8d8ea, 0x94bcd8],
  dune: [0xe4eef6, 0xd6e4f0, 0xf0f6fa],
  canvas: 0xd8dde4,
  canvasDark: 0xa8b0bc,
  pole: 0x4a5058,
  rust: 0xc8502a,
  rustDark: 0x3a3e46,
  tire: 0x22242a,
  wood: 0x5a6672,
  woodDark: 0x3c4650,
  bag: 0xe8f0f6,
  bagDark: 0xc8d6e2,
  trunk: 0x4a3626,
  leaf: [0x2f5a40, 0x26503a, 0x3a6a4a],
  steel: 0x8a9098,
  steelDark: 0x4a4f56,
  hazard: 0xe8a020,
  bush: [0x6a7a80, 0x58686e, 0x7a8a90],
  pebble: [0xa8c4d8, 0x90b0c8, 0xc0d8e6],
  track: 0xc4d4e2,
  island: 0xe0eaf2,
  islandTop: 0xf2f6fa,
  slow: 0xf6fafc,
  slowRing: 0xbcd0e0,
};
/**
 * Чарівний ліс (п. 73): ніч, темний мох і кора; світяться рослини, гриби й кристали — їх малює
 * окремий світний меш різними кольорами (LUM).
 */
const FOREST: typeof DESERT = {
  rock: [0x4a5a62, 0x3e4e58, 0x56666c, 0x445460],
  dune: [0x1f5a48, 0x1a4e44, 0x266a50],
  canvas: 0x8a4ab0,
  canvasDark: 0x5e3288,
  pole: 0xd8cfe6,
  rust: 0x5a4034,
  rustDark: 0x33241e,
  tire: 0x2a1e1a,
  wood: 0x6a4c3a,
  woodDark: 0x3c2a22,
  bag: 0x6a4a38,
  bagDark: 0x4a3226,
  trunk: 0x3a2c40,
  leaf: [0x1f7a6a, 0x5a3a9a, 0x2a6a8a],
  steel: 0x4a3a30,
  steelDark: 0x2e2420,
  hazard: 0x38c8b8,
  bush: [0x2a7a58, 0x227050, 0x348a60],
  pebble: [0x55666c, 0x48585e, 0x62747a],
  track: 0x2a6a58,
  island: 0x245848,
  islandTop: 0x2f7a5c,
  slow: 0x0e3e4a,
  slowRing: 0x38d8c8,
};
/** Кольори світіння лісу; у світному меші множаться на ~3, тож тут — помірні. */
const LUM = [0x1fa8b8, 0xb02a90, 0x62b02a, 0x7040c8, 0xb87a20];
let C = DESERT;
let ICY = false;
let WOOD = false;
let G = { red: 0xff3a2a, amber: 0xffa830, core: 0xff6a2a };

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
  // Безшовна плитка: усі хвилі мають ціле число періодів на сторону, тож край плитки
  // продовжує протилежний і на землі не видно квадратів. Плитка велика (≈13 м), а поверх
  // брижів — повільні плями, щоб повтор не впадав в око.
  const W = 512;
  const k = (Math.PI * 2) / W;
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, W);
  const r = rng(7);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const ripple =
        Math.sin(k * 26 * y + 1.4 * Math.sin(k * 3 * x) + 0.8 * Math.sin(k * (2 * x + y))) * 9;
      const blotch = Math.sin(k * (x + 2 * y) + 1) * Math.sin(k * (2 * x - y)) * 6;
      const v = 214 + ripple + blotch + (r() - 0.5) * 20;
      const i = (y * W + x) * 4;
      // Ліс: плями моху замість брижів — темніші й світліші латки.
      const moss = WOOD
        ? 178 +
          Math.sin(k * (3 * x + y) + 2.2 * Math.sin(k * 2 * y)) * Math.cos(k * (2 * y - x)) * 22 +
          Math.sin(k * (5 * x - 3 * y)) * 9 +
          (r() - 0.5) * 26
        : 0;
      img.data[i] = WOOD ? moss * 0.82 : ICY ? v * 0.94 : v;
      img.data[i + 1] = WOOD ? moss : ICY ? v * 0.98 : v * 0.86;
      img.data[i + 2] = WOOD ? moss * 0.92 : ICY ? v * 1.04 : v * 0.64;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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

/** Теги крижаної карти — ті самі будівники, що й у пустелі (палітра інша). */
const SAME_AS: Record<string, string> = {
  ice: 'rock',
  snowbank: 'sandbag',
  module: 'tent',
  pine: 'palm',
  sled: 'wreck',
  boulder: 'rock',
  roots: 'sandbag',
};

export function buildDesertArena(map: MapDef): ArenaView {
  ICY = map.id === 'ice';
  WOOD = map.id === 'forest';
  C = WOOD ? FOREST : ICY ? ICE : DESERT;
  SAND = WOOD ? 0x2c6652 : ICY ? 0xe6eef6 : 0xe2bd86;
  G = WOOD
    ? { red: 0xb02a90, amber: 0x1fa8b8, core: 0x62b02a }
    : { red: 0xff3a2a, amber: 0xffa830, core: 0xff6a2a };
  const g = new THREE.Group();
  const R = map.radius;
  const r = rng(4242);
  const solid: Part[] = [];
  const glow: Part[] = [];
  const free = (x: number, y: number, m: number) =>
    Math.hypot(x, y) < R - 0.8 && !map.obstacles.some((o) => inside(o, x, y, m));

  // ---------- Земля: пісок до горизонту ----------
  const sand = sandTexture();
  sand.repeat.set(26, 26);
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
    if (WOOD) {
      // Узлісся: темні ялини щільною стіною, на кожній третій — світна верхівка.
      const h = 5 + r() * 4;
      solid.push(part(CYL, C.trunk, P(x, y, 0.6), [0.6, 1.2, 0.6]));
      for (let k = 0; k < 3; k++)
        solid.push(
          part(
            CONE4,
            C.dune[(i + k) % 3]!,
            P(x, y, 1.2 + k * h * 0.24 + h * 0.2),
            [4.2 - k * 1.1, h * 0.5, 4.2 - k * 1.1],
            [0, k * 0.7 + a, 0],
          ),
        );
      if (i % 3 === 0)
        glow.push(part(SPHERE, LUM[i % LUM.length]!, P(x, y, 1.6 + h * 0.95), [0.5, 0.5, 0.5]));
      solid.push(
        part(LOW, C.dune[i % 3]!, P(x - Math.cos(a) * 1.6, y - Math.sin(a) * 1.6, 0), [
          3 + r() * 2,
          1.2 + r(),
          3 + r() * 2,
        ]),
      );
    } else if (rockSide) stone(solid, C.rock[i % 4]!, x, y, 3 + r() * 2.5, 2.6 + r() * 2.2, r);
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
  for (let i = 0; i < 9 && !WOOD; i++) {
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
  for (const src of map.obstacles) {
    const o = { ...src, tag: (SAME_AS[src.tag] ?? src.tag) as string };
    if (o.tag === 'core' && o.kind === 'circle') {
      reactor = WOOD ? crystalAltar(o.r, o.height) : drillRig(o.r, o.height);
      g.add(reactor);
      continue;
    }
    if (WOOD && o.kind === 'circle' && o.tag === 'tree') {
      glowTree(solid, glow, o.x, o.y, o.r, r);
      continue;
    }
    if (WOOD && o.kind === 'rect' && o.tag !== 'rock' && o.tag !== 'sandbag' && o.tag !== 'rim') {
      const c = Math.cos(o.rot);
      const s = Math.sin(o.rot);
      const L = (u: number, v: number, h: number): V3 =>
        P(o.x + u * c - v * s, o.y + u * s + v * c, h);
      if (o.tag === 'mushroom') {
        giantMushrooms(solid, glow, L, o.hw, o.hh, o.height, r);
        continue;
      }
      if (o.tag === 'log') {
        fallenLog(solid, glow, L, o.hw, o.hh, o.height);
        continue;
      }
      if (o.tag === 'stump') {
        stumps(solid, glow, L, o.hw, o.hh, o.height, r);
        continue;
      }
    }
    if (o.kind === 'circle') {
      if (WOOD) glow.push(...crystals(o.x, o.y, o.r, r));
      if (o.tag === 'palm') (ICY ? pineIsland : palmIsland)(solid, o.x, o.y, o.r, r);
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
    if (WOOD && n % 5 < 2) {
      // Світні квіти й грибочки: стебельце і крапля світла.
      const col = LUM[n % LUM.length]!;
      const h = 0.18 + r() * 0.22;
      solid.push(part(CYL, C.trunk, P(x, y, h / 2), [0.04, h, 0.04]));
      glow.push(part(SPHERE, col, P(x, y, h + 0.05), [0.16, n % 2 ? 0.1 : 0.16, 0.16]));
    } else if (r() < 0.6)
      stone(solid, C.pebble[n % 3]!, x, y, 0.15 + r() * 0.2, 0.08 + r() * 0.08, r);
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
    for (const off of WOOD ? [] : [-0.8, 0.8])
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
  g.add(solidMesh, glowMesh, contactShadows(map, WOOD ? 0.5 : ICY ? 0.3 : 0.42, 1.4));

  // Зони сповільнення (зибучі піски / замети): пляма іншого тону з кільцем-попередженням.
  if (map.slowZones?.length) {
    const zp: Part[] = [];
    for (const z of map.slowZones) {
      zp.push(part(CYL, C.slow, P(z.x, z.y, 0.009), [z.r * 2, 0.012, z.r * 2]));
      for (let k = 0; k < 28; k++) {
        if (k % 2) continue;
        const a0 = (k / 28) * Math.PI * 2;
        const a1 = ((k + 1) / 28) * Math.PI * 2;
        zp.push(
          seg(
            BOX,
            C.slowRing,
            P(z.x + Math.cos(a0) * z.r, z.y + Math.sin(a0) * z.r, 0.016),
            P(z.x + Math.cos(a1) * z.r, z.y + Math.sin(a1) * z.r, 0.016),
            0.14,
            0.012,
          ),
        );
      }
      // Спіраль усередині — «затягує».
      for (let k = 0; k < 22; k++) {
        const t0 = k / 22;
        const t1 = (k + 1) / 22;
        const sp = (t: number): V3 =>
          P(
            z.x + Math.cos(t * 9) * z.r * 0.85 * (1 - t),
            z.y + Math.sin(t * 9) * z.r * 0.85 * (1 - t),
            0.017,
          );
        zp.push(seg(BOX, C.slowRing, sp(t0), sp(t1), 0.08, 0.01));
      }
    }
    const zm = new THREE.Mesh(
      merge(zp),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    );
    zm.receiveShadow = true;
    g.add(zm);
  }

  // Відьмині кола (ліс): кільце світних грибів — тут здоров'я повільно відновлюється.
  if (map.healZones?.length) {
    const hp: Part[] = [];
    const hg: Part[] = [];
    for (const z of map.healZones) {
      hg.push(part(CYL, 0x2a8a3a, P(z.x, z.y, 0.012), [z.r * 2, 0.012, z.r * 2]));
      const n = Math.round(z.r * 7);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = z.x + Math.cos(a) * z.r;
        const y = z.y + Math.sin(a) * z.r;
        const h = 0.3 + (k % 3) * 0.12;
        hp.push(part(CYL, 0xe8e0f0, P(x, y, h / 2), [0.1, h, 0.1]));
        hg.push(part(SPHERE, 0x58c83a, P(x, y, h + 0.04), [0.34, 0.16, 0.34]));
      }
      // Хрест посередині — «лікує».
      hg.push(part(BOX, 0x7ae850, P(z.x, z.y, 0.03), [1.1, 0.02, 0.3]));
      hg.push(part(BOX, 0x7ae850, P(z.x, z.y, 0.03), [0.3, 0.02, 1.1]));
    }
    g.add(
      new THREE.Mesh(
        merge(hp),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
      ),
      new THREE.Mesh(
        merge(hg),
        new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.6) }),
      ),
    );
  }

  // ---------- Світло: яскравий день (пустеля) або полярні сутінки (крижана база) ----------
  const HEMI = WOOD ? 1.5 : ICY ? 1.25 : 1.7;
  const SUN = WOOD ? 1.7 : ICY ? 2.1 : 3.2;
  const hemi = new THREE.HemisphereLight(
    WOOD ? 0x7a9cff : ICY ? 0xbcd4f0 : 0xfff2dc,
    WOOD ? 0x1f5a48 : ICY ? 0x6a7c98 : 0xb08a5a,
    HEMI,
  );
  g.add(hemi);
  // У лісі «сонце» — місяць: холодне світло згори, тіні дерев лишаються.
  const sun = new THREE.DirectionalLight(WOOD ? 0xb0d0ff : ICY ? 0xd8e6ff : 0xfff0d6, SUN);
  sun.position.set(-25, 45, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF;
  sc.right = SHADOW_HALF;
  sc.top = SHADOW_HALF;
  sc.bottom = -SHADOW_HALF;
  sc.near = 1;
  sc.far = 140;
  sun.shadow.bias = -0.0008;
  g.add(sun, sun.target);

  let dark = 0;
  return {
    group: g,
    sky: WOOD
      ? {
          background: 0x060a1e,
          fog: 0x0e2e3a,
          fogDensity: 0.0075,
          env: 0.5,
          exposure: 1.1,
          bloom: [1.0, 0.6],
          grade: { shadowTint: 0x180a40, contrast: 1.12, saturation: 1.3, vignette: 0.5 },
          // Звірі розфарбовані самі: множник не потрібен.
          enemyTint: 0xffffff,
        }
      : ICY
        ? {
            background: 0x18284a,
            fog: 0xb8cce0,
            fogDensity: 0.0048,
            env: 0.7,
            exposure: 0.95,
            bloom: [1.9, 0.45],
            grade: { shadowTint: 0x0a1a40, contrast: 1.15, saturation: 1.1, vignette: 0.4 },
            // Звірі криги розфарбовані під сніг самі (п. 73) — лише трохи притемнюємо.
            enemyTint: 0xc4c8d2,
          }
        : {
            background: 0xc9dcea,
            fog: 0xe8d6b8,
            fogDensity: 0.0042,
            env: 0.85,
            exposure: 1.0,
            bloom: [2.4, 0.4],
            // Холодні сині тіні проти теплого піску, більше контрасту, слабша віньєтка.
            grade: { shadowTint: 0x05103a, contrast: 1.2, saturation: 1.18, vignette: 0.3 },
            // Темна сталь: світло-сірі роботи на світлому піску губились.
            enemyTint: 0x6f7480,
          },
    setDarkness(k: number) {
      dark = k;
    },
    setReactorVisible(on: boolean) {
      if (reactor) reactor.visible = on;
    },
    update(time: number, focus?: THREE.Vector3) {
      followShadow(sun, SUN_OFFSET, focus);
      // Фаза 1 Ядра в пустелі — піщана буря: світло меркне, лишаються вогні й ліхтарі.
      hemi.intensity = HEMI * (1 - 0.82 * dark);
      sun.intensity = SUN * (1 - 0.92 * dark);
      if (reactor) reactor.rotation.y = time * 0.15;
    },
  };
}

/** Острівець оази: піщаний пагорб, пальми з похилими стовбурами й листям-віялом. */
function palmIsland(out: Part[], x: number, y: number, rad: number, r: () => number): void {
  out.push(part(LOW, C.island, P(x, y, 0), [rad * 2.2, 0.7, rad * 2.2]));
  out.push(part(CYL, C.islandTop, P(x, y, 0.2), [rad * 1.6, 0.12, rad * 1.6]));
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

/** Сніговий горбок з ялинами: три яруси гілок-пірамід зі снігом на верхівці. */
function pineIsland(out: Part[], x: number, y: number, rad: number, r: () => number): void {
  out.push(part(LOW, C.island, P(x, y, 0), [rad * 2.2, 0.6, rad * 2.2]));
  const n = 1 + Math.round(rad);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const bx = x + Math.cos(a) * rad * 0.35;
    const by = y + Math.sin(a) * rad * 0.35;
    const h = 2.0 + r() * 0.8;
    out.push(part(CYL, C.trunk, P(bx, by, 0.35), [0.2, 0.7, 0.2]));
    for (let k = 0; k < 3; k++) {
      const w = (1.5 - k * 0.38) * Math.min(1, rad * 0.8);
      out.push(
        part(
          CONE4,
          C.leaf[k % 3]!,
          P(bx, by, 0.6 + k * h * 0.26 + h * 0.15),
          [w, h * 0.42, w],
          [0, k * 0.6, 0],
        ),
      );
    }
    out.push(part(CONE4, 0xf2f6fa, P(bx, by, 0.6 + h * 0.78), [0.42, 0.3, 0.42]));
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

const ICO = new THREE.IcosahedronGeometry(0.5, 0);

/** Світне дерево: темний стовбур, пласка крона з трьох «хмар» і ліхтарики-плоди під нею. */
function glowTree(
  out: Part[],
  glow: Part[],
  x: number,
  y: number,
  rad: number,
  r: () => number,
): void {
  out.push(part(LOW, C.island, P(x, y, 0), [rad * 2.2, 0.5, rad * 2.2]));
  const n = 1 + Math.round(rad);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const bx = x + Math.cos(a) * rad * 0.3;
    const by = y + Math.sin(a) * rad * 0.3;
    // Невисокі, як пальми оази: крона не ховає бій під собою.
    const h = 1.9 + r() * 0.7;
    const col = LUM[Math.floor(r() * LUM.length)]!;
    out.push(seg(CYL, C.trunk, P(bx, by, 0), P(bx, by, h), 0.26));
    out.push(part(CONE4, C.trunk, P(bx, by, 0.25), [0.7, 0.5, 0.7], [0, r() * 3, 0]));
    // Світні жилки на корі.
    for (let k = 0; k < 3; k++) {
      const va = r() * 6.28;
      glow.push(
        part(
          BOX,
          col,
          P(bx + Math.cos(va) * 0.14, by + Math.sin(va) * 0.14, 0.5 + k * 0.45),
          [0.05, 0.3, 0.05],
        ),
      );
    }
    const w = Math.min(1.9, 0.9 + rad * 0.6);
    for (let k = 0; k < 3; k++) {
      const ca = (k / 3) * Math.PI * 2 + r();
      out.push(
        part(
          ICO,
          C.leaf[(i + k) % 3]!,
          P(bx + Math.cos(ca) * w * 0.28, by + Math.sin(ca) * w * 0.28, h + 0.15 + k * 0.12),
          [w, 0.55, w],
          [0, r() * 3, 0],
        ),
      );
    }
    for (let k = 0; k < 4; k++) {
      const fa = (k / 4) * Math.PI * 2 + r();
      glow.push(
        part(
          SPHERE,
          k % 2 ? col : LUM[(i + k) % LUM.length]!,
          P(bx + Math.cos(fa) * w * 0.42, by + Math.sin(fa) * w * 0.42, h - 0.18 - r() * 0.2),
          [0.16, 0.22, 0.16],
        ),
      );
    }
  }
}

/** Велетенські гриби на місці наметів: один великий і два менші, на шапках — світні плями. */
function giantMushrooms(
  out: Part[],
  glow: Part[],
  L: (u: number, v: number, h: number) => V3,
  hw: number,
  hh: number,
  height: number,
  r: () => number,
): void {
  const spots: [number, number, number, number][] = [
    [0, 0, 1, height],
    [-hw * 0.55, hh * 0.35, 0.55, height * 0.6],
    [hw * 0.55, -hh * 0.3, 0.6, height * 0.7],
  ];
  spots.forEach(([u, v, k, h], i) => {
    const capW = Math.min(hw, hh) * 2 * k;
    const col = LUM[(i + Math.floor(r() * 3)) % LUM.length]!;
    const [bx, , bz] = L(u, v, 0);
    out.push(part(CYL, C.pole, [bx, h * 0.45, bz], [capW * 0.22, h * 0.9, capW * 0.22]));
    out.push(part(LOW, i ? C.canvasDark : C.canvas, [bx, h * 0.9, bz], [capW, h * 0.42, capW]));
    // Світна «спідничка» під шапкою й плями зверху — їх видно з висоти камери.
    glow.push(part(CYL, col, [bx, h * 0.84, bz], [capW * 0.62, 0.05, capW * 0.62]));
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + r();
      const d = capW * 0.26;
      glow.push(
        part(
          SPHERE,
          col,
          [bx + Math.cos(a) * d, h * 1.06, bz + Math.sin(a) * d],
          [capW * 0.16, 0.08, capW * 0.16],
        ),
      );
    }
  });
}

/** Повалений порожній стовбур із мохом і світними грибами на корі. */
function fallenLog(
  out: Part[],
  glow: Part[],
  L: (u: number, v: number, h: number) => V3,
  hw: number,
  hh: number,
  height: number,
): void {
  const rad = Math.min(hh, height * 0.6);
  out.push(seg(CYL, C.wood, L(-hw, 0, rad), L(hw, 0, rad), rad * 2));
  out.push(seg(CYL, C.woodDark, L(-hw - 0.02, 0, rad), L(-hw + 0.1, 0, rad), rad * 1.5));
  out.push(seg(CYL, C.woodDark, L(hw - 0.1, 0, rad), L(hw + 0.02, 0, rad), rad * 1.5));
  out.push(
    seg(BOX, C.islandTop, L(-hw * 0.5, 0, rad * 1.95), L(hw * 0.3, 0, rad * 1.95), 0.5, 0.08),
  );
  for (let k = 0; k < 4; k++) {
    const u = (k / 3 - 0.5) * hw * 1.5;
    glow.push(part(SPHERE, LUM[k % LUM.length]!, L(u, rad * 0.8, rad * 1.3), [0.22, 0.12, 0.22]));
  }
}

/** Пні з річними кільцями; на зрізі — світний мох. */
function stumps(
  out: Part[],
  glow: Part[],
  L: (u: number, v: number, h: number) => V3,
  hw: number,
  hh: number,
  height: number,
  r: () => number,
): void {
  const n = Math.max(1, Math.round(Math.max(hw, hh) / Math.min(hw, hh)));
  const along = hw >= hh;
  const rad = Math.min(hw, hh);
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * (Math.max(hw, hh) - rad);
    const p = along ? L(t, 0, 0) : L(0, t, 0);
    const h = height * (0.8 + r() * 0.3);
    out.push(part(CYL, C.wood, [p[0], h / 2, p[2]], [rad * 2, h, rad * 2], [0, r() * 3, 0]));
    out.push(part(CYL, C.woodDark, [p[0], 0.12, p[2]], [rad * 2.5, 0.24, rad * 2.5]));
    out.push(part(CYL, 0x9a7a5a, [p[0], h + 0.01, p[2]], [rad * 1.7, 0.02, rad * 1.7]));
    glow.push(
      part(CYL, LUM[(k + 2) % LUM.length]!, [p[0], h + 0.03, p[2]], [rad * 0.7, 0.02, rad * 0.7]),
    );
  }
}

/** Кілька світних кристалів біля підніжжя брили. */
function crystals(x: number, y: number, rad: number, r: () => number): Part[] {
  const out: Part[] = [];
  const col = LUM[Math.floor(r() * LUM.length)]!;
  for (let k = 0; k < 3; k++) {
    const a = r() * Math.PI * 2;
    const h = 0.5 + r() * 0.6;
    out.push(
      part(
        CONE4,
        col,
        P(x + Math.cos(a) * rad * 1.05, y + Math.sin(a) * rad * 1.05, h / 2),
        [0.22, h, 0.22],
        [(r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6],
      ),
    );
  }
  return out;
}

/** Серце лісу на місці бурової: кам'яне коло з рунами й великий кристал; повільно обертається. */
function crystalAltar(rad: number, h: number): THREE.Object3D {
  const parts: Part[] = [];
  const glowParts: Part[] = [];
  parts.push(part(CYL, C.rock[0]!, [0, 0.3, 0], [rad * 2, 0.6, rad * 2]));
  parts.push(part(CYL, C.islandTop, [0, 0.62, 0], [rad * 1.7, 0.06, rad * 1.7]));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const x = Math.cos(a) * rad * 0.82;
    const z = Math.sin(a) * rad * 0.82;
    parts.push(part(BOX, C.rock[k % 4]!, [x, 1.3, z], [0.6, 1.6, 0.4], [0, -a, 0.08]));
    glowParts.push(
      part(BOX, LUM[k % LUM.length]!, [x * 1.03, 1.4, z * 1.03], [0.16, 0.7, 0.44], [0, -a, 0.08]),
    );
  }
  const top = h + 1.2;
  glowParts.push(part(CONE4, LUM[0]!, [0, 0.6 + top * 0.55, 0], [1.3, top, 1.3]));
  glowParts.push(part(CONE4, LUM[3]!, [0.7, 1.5, 0.3], [0.6, 2, 0.6], [0.3, 0.5, -0.35]));
  glowParts.push(part(CONE4, LUM[1]!, [-0.6, 1.3, -0.4], [0.5, 1.6, 0.5], [-0.3, 1, 0.4]));
  const grp = new THREE.Group();
  const m = new THREE.Mesh(
    merge(parts),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    }),
  );
  m.castShadow = true;
  const gm = new THREE.Mesh(
    merge(glowParts),
    new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) }),
  );
  grp.add(m, gm);
  grp.userData.dynamic = true;
  return grp;
}
