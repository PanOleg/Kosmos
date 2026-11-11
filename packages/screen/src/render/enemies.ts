import * as THREE from 'three';
import {
  GUNNER,
  GUNNER_PEEK,
  GUNNER_HIDE,
  GUNNER_OPEN,
  KAMI_DIVE,
  KAMI_WINDUP,
  KAMIKAZE,
  SCOUT,
  SNIPER,
  SNIPER_AIM,
  SPIDER,
  SPIDER_FLIGHT,
  SPIDER_WINDUP,
  REPAIRER,
  WASP_WINDUP,
  SCOUT_WINDUP,
  FOREMAN,
  FOREMAN_STRIKE,
  TURRET,
  TURRET_WINDUP,
  TURRET_BURST,
  TICKS_PER_SEC,
  type Enemy,
  type EnemyType,
  type Player,
} from '@horizon/sim';
import { PALETTE } from './palette';
import { BOX, CONE4, CYL, SPHERE, merge, part, seg, type Part } from './mesh';
import { models, type ModelInstance } from './models';
import { toX, toZ } from './coords';

/**
 * Вороги кутасті, теплих кольорів, з яскравим «оком» — протилежність округлим світлим гравцям.
 * Корпус кожного типу злито в одну геометрію з вершинними кольорами: 2 draw call на ворога
 * (корпус + світні частини) замість десятка. Заміна на glTF — у build*().
 */
export interface EnemyVisual {
  root: THREE.Group;
  body: THREE.Group;
  hullMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  laser: THREE.Mesh;
  shadow: THREE.Mesh;
  /** Бульбашка щита від Ремонтника. */
  bubble: THREE.Mesh | null;
  type: EnemyType;
  flash: number;
  spawnT: number;
  /** Фаза й сила кроку (0..1) для анімації ніг у шейдері. */
  walk: number;
  walkAmp: number;
  /** Готова glTF-модель замість примітивів, якщо є. */
  model: ModelInstance | null;
  /**
   * Корпус і око малює спільний InstancedMesh типу (EnemyInstances), а не власні меші.
   * hullMat/glowMat тоді — лише носії кольору спалаху й світіння ока для цього ворога.
   */
  instanced: boolean;
}

/** Візуально більші за хітбокс, як і гравці: на телевізорі здалеку інакше губляться. */
const VISUAL_SCALE: Record<EnemyType, number> = {
  scout: 1.35,
  gunner: 1.45,
  wasp: 1.3,
  kamikaze: 1.3,
  sniper: 1.25,
  swarm: 1.1,
  shell: 1.1,
  spider: 1.2,
  repairer: 1.3,
  foreman: 1.15,
  turret: 1.2,
  core: 1,
};
const AIR = new Set<EnemyType>(['wasp', 'kamikaze', 'sniper', 'swarm']);
/** Розмір контактної тіні наземних ворогів (множник кола радіусом 0.45 м). */
const GROUND_SHADOW: Partial<Record<EnemyType, number>> = {
  scout: 1.3,
  gunner: 1.4,
  repairer: 1.5,
  spider: 2.0,
  turret: 2.0,
  shell: 3.4,
  foreman: 3.8,
};

const P = PALETTE;

// Скаут (concept enemies.jpg): високий, двоногий, коліна назад, шип на голові,
// два довгі серпи замість рук — загинаються донизу й уперед.
function scoutParts(): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const hull: Part[] = [];
  const glow: Part[] = [];
  for (const sx of [1, -1]) {
    const hip: V3 = [0.13 * sx, 0.74, -0.02];
    const knee: V3 = [0.16 * sx, 0.48, 0.15];
    const ankle: V3 = [0.16 * sx, 0.17, -0.12];
    const toe: V3 = [0.16 * sx, 0.02, 0.1];
    hull.push(
      seg(BOX, P.enemy, hip, knee, 0.11, 0.13),
      seg(BOX, P.enemyDark, knee, ankle, 0.07),
      seg(BOX, P.enemyMid, ankle, toe, 0.1, 0.06),
      part(BOX, P.enemyDark, knee, [0.1, 0.1, 0.1]),
    );
    const shoulder: V3 = [0.19 * sx, 1.0, 0.02];
    const elbow: V3 = [0.31 * sx, 0.86, 0.14];
    const mid: V3 = [0.36 * sx, 0.6, 0.42];
    const tip: V3 = [0.3 * sx, 0.22, 0.58];
    hull.push(
      part(BOX, P.enemyMid, shoulder, [0.12, 0.1, 0.14]),
      seg(BOX, P.enemyDark, shoulder, elbow, 0.07),
      // Леза пласкі й світлі: саме їх видно в силуеті згори.
      seg(BOX, P.enemy, elbow, mid, 0.03, 0.13),
      seg(BOX, P.enemy, mid, tip, 0.025, 0.08),
    );
  }
  hull.push(
    part(BOX, P.enemyDark, [0, 0.76, -0.02], [0.3, 0.1, 0.18]),
    seg(BOX, P.enemyDark, [0, 0.78, -0.02], [0, 0.88, 0.03], 0.1),
    part(BOX, P.enemy, [0, 0.95, 0.04], [0.3, 0.24, 0.22], [0.25, 0, 0]),
    part(BOX, P.enemyMid, [0, 0.95, 0.15], [0.16, 0.14, 0.04], [0.25, 0, 0]),
    part(BOX, P.enemy, [0, 1.14, 0.1], [0.18, 0.13, 0.2]),
    part(CONE4, P.enemy, [0, 1.36, 0.02], [0.14, 0.34, 0.16], [-0.35, Math.PI / 4, 0]),
  );
  glow.push(part(BOX, 0xffffff, [0, 1.14, 0.205], [0.08, 0.035, 0.02]));
  return { hull: merge(hull), glow: merge(glow) };
}

// Стрілець: гуманоїд у світлій броні, кругла голова з червоним оком, бластер біля плеча.
function gunnerParts(): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const hull: Part[] = [];
  for (const sx of [1, -1]) {
    hull.push(
      seg(BOX, P.enemyDark, [0.14 * sx, 0.64, 0], [0.15 * sx, 0.34, 0.06], 0.15),
      seg(BOX, P.enemy, [0.15 * sx, 0.36, 0.07], [0.15 * sx, 0.06, 0], 0.15, 0.17),
      part(BOX, P.enemyDark, [0.15 * sx, 0.04, 0.05], [0.16, 0.08, 0.26]),
      part(BOX, P.enemy, [0.32 * sx, 1.1, 0], [0.2, 0.15, 0.28]),
    );
  }
  hull.push(
    part(BOX, P.enemyMid, [0, 0.68, 0], [0.36, 0.14, 0.24]),
    part(BOX, P.enemyDark, [0, 0.84, 0], [0.32, 0.2, 0.22]),
    part(BOX, P.enemy, [0, 1.02, 0], [0.48, 0.3, 0.3]),
    part(BOX, P.enemyMid, [0, 1.03, 0.15], [0.3, 0.2, 0.04]),
    part(SPHERE, P.enemy, [0, 1.3, 0.02], [0.28, 0.27, 0.29]),
    part(BOX, P.enemyDark, [0, 1.3, 0.13], [0.22, 0.08, 0.06]),
    // Бластер біля плеча, обидві руки на ньому.
    part(BOX, P.enemyDark, [0.14, 1.0, 0.36], [0.1, 0.14, 0.72]),
    part(BOX, P.enemyMid, [0.14, 1.07, 0.3], [0.06, 0.05, 0.3]),
    seg(BOX, P.enemyDark, [0.32, 1.08, 0], [0.3, 0.9, 0.12], 0.1),
    seg(BOX, P.enemy, [0.3, 0.9, 0.12], [0.16, 0.95, 0.2], 0.09),
    seg(BOX, P.enemyDark, [-0.32, 1.08, 0], [-0.2, 0.9, 0.22], 0.1),
    seg(BOX, P.enemy, [-0.2, 0.9, 0.22], [0.1, 0.97, 0.46], 0.09),
  );
  const glow = [
    part(BOX, 0xffffff, [0, 1.3, 0.165], [0.07, 0.05, 0.02]),
    part(BOX, 0xffffff, [0.14, 1.0, 0.725], [0.07, 0.07, 0.02]),
  ];
  return { hull: merge(hull), glow: merge(glow) };
}

type V3 = [number, number, number];
const scoutGeo = scoutParts();
const gunnerGeo = gunnerParts();

// Дрони (concept enemies.jpg). Початок координат — центр корпусу; висоту дає рендер.
function droneParts(type: 'wasp' | 'kamikaze' | 'sniper' | 'swarm'): {
  hull: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
} {
  const hull: Part[] = [];
  const glow: Part[] = [];
  switch (type) {
    case 'wasp':
      // Гострий корпус, дві пари крил-лопатей, гармата знизу.
      hull.push(
        part(CONE4, P.enemy, [0, 0, 0.1], [0.32, 0.8, 0.3], [Math.PI / 2, Math.PI / 4, 0]),
        part(BOX, P.enemyDark, [0, 0, -0.32], [0.22, 0.2, 0.3]),
        part(BOX, P.enemyDark, [0, -0.17, 0.2], [0.06, 0.06, 0.45]),
      );
      for (const sx of [1, -1])
        for (const z of [0.05, -0.25])
          hull.push(
            part(
              BOX,
              P.enemyMid,
              [0.38 * sx, 0.08, z],
              [0.6, 0.02, 0.16],
              [0, sx * 0.35, sx * 0.25],
            ),
          );
      glow.push(part(BOX, 0xffffff, [0, 0.04, 0.45], [0.1, 0.05, 0.04]));
      break;
    case 'kamikaze':
      // Броньована «крапля»: світлий лобовий щит, червоне світло спереду, короткі крильця.
      hull.push(
        part(SPHERE, P.enemyMid, [0, 0, -0.08], [0.48, 0.42, 0.75]),
        part(CONE4, P.enemy, [0, 0, 0.28], [0.55, 0.42, 0.5], [Math.PI / 2, Math.PI / 4, 0]),
        part(BOX, P.enemyDark, [0.32, 0, -0.1], [0.3, 0.04, 0.18], [0, 0, -0.3]),
        part(BOX, P.enemyDark, [-0.32, 0, -0.1], [0.3, 0.04, 0.18], [0, 0, 0.3]),
      );
      glow.push(
        part(BOX, 0xffffff, [0, -0.02, 0.36], [0.26, 0.08, 0.06]),
        part(SPHERE, 0xffffff, [0, 0, -0.45], [0.14, 0.14, 0.08]),
      );
      break;
    case 'sniper':
      // Тонкий корпус і дуже довгий ствол.
      hull.push(
        part(BOX, P.enemyDark, [0, 0, 0], [0.26, 0.18, 0.55]),
        part(BOX, P.enemy, [0, 0.06, -0.05], [0.22, 0.08, 0.4]),
        part(BOX, P.enemyMid, [0, -0.02, 0.85], [0.05, 0.05, 1.3]),
        part(BOX, P.enemyMid, [0.3, 0.05, -0.12], [0.4, 0.02, 0.12], [0, 0.4, 0]),
        part(BOX, P.enemyMid, [-0.3, 0.05, -0.12], [0.4, 0.02, 0.12], [0, -0.4, 0]),
      );
      glow.push(
        part(BOX, 0xffffff, [0, 0.02, 0.29], [0.08, 0.06, 0.03]),
        part(BOX, 0xffffff, [0, -0.02, 1.5], [0.06, 0.06, 0.03]),
      );
      break;
    case 'swarm':
      // Крихітний колючий дрон.
      hull.push(
        part(CONE4, P.enemyDark, [0, 0, 0], [0.22, 0.32, 0.22], [Math.PI / 2, 0, 0]),
        part(CONE4, P.enemyMid, [0, 0.08, -0.04], [0.08, 0.2, 0.08], [-0.4, 0, 0]),
        part(BOX, P.enemyMid, [0, 0, 0], [0.42, 0.02, 0.06]),
      );
      glow.push(part(BOX, 0xffffff, [0, 0.02, 0.15], [0.07, 0.05, 0.03]));
      break;
  }
  return { hull: merge(hull), glow: merge(glow) };
}

// Панцир (concept: SHELL): величезний мех, ракетні блоки на плечах, світне ядро в грудях
// і на спині — спина світиться, бо це слабке місце (×3).
function shellParts(): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const hull: Part[] = [];
  const glow: Part[] = [];
  for (const sx of [1, -1]) {
    hull.push(
      seg(BOX, P.enemyDark, [0.45 * sx, 1.2, 0], [0.55 * sx, 0.6, 0.12], 0.36, 0.42),
      seg(BOX, P.enemy, [0.55 * sx, 0.62, 0.12], [0.55 * sx, 0.1, -0.02], 0.4, 0.46),
      part(BOX, P.enemyDark, [0.55 * sx, 0.07, 0.08], [0.48, 0.14, 0.7]),
      // Ракетні блоки на плечах.
      part(BOX, P.enemyMid, [0.95 * sx, 2.15, -0.05], [0.6, 0.6, 0.7]),
      part(BOX, P.enemyDark, [0.95 * sx, 2.15, 0.3], [0.5, 0.5, 0.06]),
      // Руки-гармати.
      seg(BOX, P.enemyDark, [1.05 * sx, 1.75, 0], [1.1 * sx, 1.2, 0.3], 0.3),
      part(BOX, P.enemy, [1.1 * sx, 1.1, 0.45], [0.36, 0.36, 0.6]),
    );
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 2; c++)
        glow.push(
          part(
            BOX,
            0xffffff,
            [0.95 * sx + (c - 0.5) * 0.24, 2.15 + (r - 0.5) * 0.24, 0.34],
            [0.12, 0.12, 0.03],
          ),
        );
  }
  hull.push(
    part(BOX, P.enemyDark, [0, 1.35, 0], [1.2, 0.5, 0.8]),
    part(BOX, P.enemy, [0, 1.85, 0], [1.6, 0.8, 1.1]),
    part(BOX, P.enemyMid, [0, 2.35, 0.05], [0.7, 0.3, 0.6]),
    part(BOX, P.enemyDark, [0, 2.4, 0.38], [0.4, 0.12, 0.06]),
  );
  glow.push(
    part(CYL, 0xffffff, [0, 1.85, 0.56], [0.5, 0.04, 0.5], [Math.PI / 2, 0, 0]),
    part(CYL, 0xffffff, [0, 1.85, -0.56], [0.42, 0.04, 0.42], [Math.PI / 2, 0, 0]),
    part(BOX, 0xffffff, [0, 2.4, 0.42], [0.22, 0.05, 0.02]),
  );
  return { hull: merge(hull), glow: merge(glow) };
}

// Павук: світле тіло, шість тонких ламаних ніг, червоні очі.
function spiderParts(): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const hull: Part[] = [
    part(SPHERE, P.enemy, [0, 0.45, 0], [0.55, 0.32, 0.65]),
    part(BOX, P.enemyMid, [0, 0.5, 0.32], [0.28, 0.2, 0.2]),
  ];
  for (const sx of [1, -1])
    for (const z of [0.25, 0, -0.25]) {
      const knee: [number, number, number] = [0.5 * sx, 0.75, z * 1.4];
      hull.push(
        seg(BOX, P.enemyDark, [0.18 * sx, 0.48, z], knee, 0.05),
        seg(BOX, P.enemyMid, knee, [0.72 * sx, 0, z * 1.8], 0.04),
      );
    }
  const glow = [
    part(BOX, 0xffffff, [0.07, 0.55, 0.42], [0.05, 0.05, 0.02]),
    part(BOX, 0xffffff, [-0.07, 0.55, 0.42], [0.05, 0.05, 0.02]),
  ];
  return { hull: merge(hull), glow: merge(glow) };
}

// Ремонтник: згорблений, зварювальні руки, синя пластина-щит (concept: REPAIRER).
function repairerParts(): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const rust = 0x7a4a3a;
  const hull: Part[] = [];
  for (const sx of [1, -1])
    hull.push(
      seg(BOX, P.enemyDark, [0.16 * sx, 0.6, -0.05], [0.18 * sx, 0.3, 0.06], 0.16),
      seg(BOX, rust, [0.18 * sx, 0.32, 0.06], [0.18 * sx, 0.05, 0], 0.16, 0.2),
      seg(BOX, P.enemyDark, [0.32 * sx, 1.0, 0.1], [0.38 * sx, 0.78, 0.36], 0.1),
      seg(BOX, rust, [0.38 * sx, 0.78, 0.36], [0.26 * sx, 0.72, 0.62], 0.08),
    );
  hull.push(
    part(BOX, P.enemyDark, [0, 0.68, 0], [0.42, 0.18, 0.3]),
    part(BOX, rust, [0, 0.95, 0.06], [0.56, 0.42, 0.42], [0.45, 0, 0]),
    part(SPHERE, P.enemy, [0, 1.06, 0.34], [0.26, 0.24, 0.26]),
    // Синя пластина-щит на лівій руці.
    part(BOX, 0x2d5aa8, [-0.5, 0.8, 0.4], [0.06, 0.6, 0.5], [0, 0.3, 0]),
  );
  const glow = [
    part(BOX, 0xffffff, [0, 1.07, 0.47], [0.08, 0.05, 0.02]),
    part(BOX, 0xffffff, [0.26, 0.72, 0.64], [0.06, 0.06, 0.06]),
  ];
  return { hull: merge(hull), glow: merge(glow) };
}

// Прораб (міні-бос): будівельний мех, дві жовті стріли-крани з гаками, кабіна з помаранчевим вікном.
function foremanParts(): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const yellow = 0xe8b020;
  const stripe = 0x2a2420;
  const hull: Part[] = [];
  const glow: Part[] = [];
  for (const sx of [1, -1]) {
    hull.push(
      // Гусениці.
      part(BOX, P.enemyDark, [0.6 * sx, 0.28, 0], [0.45, 0.55, 1.6]),
      part(BOX, stripe, [0.85 * sx, 0.28, 0], [0.05, 0.4, 1.4]),
      // Стріла крана: від плеча вгору-вперед, далі вниз — гак.
      seg(BOX, yellow, [0.75 * sx, 1.9, -0.1], [0.95 * sx, 2.9, 0.9], 0.22),
      seg(BOX, yellow, [0.95 * sx, 2.9, 0.9], [0.95 * sx, 2.6, 1.9], 0.18),
      seg(BOX, stripe, [0.95 * sx, 2.6, 1.9], [0.95 * sx, 1.4, 1.95], 0.04),
      part(BOX, P.enemyDark, [0.95 * sx, 1.25, 1.95], [0.3, 0.25, 0.2]),
    );
    // Чорно-жовті смуги на стрілі.
    for (let k = 0; k < 3; k++)
      hull.push(
        part(
          BOX,
          stripe,
          [0.85 * sx + 0.1 * k * sx * 0.66, 2.05 + k * 0.3, 0.05 + k * 0.3],
          [0.24, 0.06, 0.24],
        ),
      );
    glow.push(part(BOX, 0xffffff, [0.95 * sx, 2.95, 0.9], [0.1, 0.06, 0.1]));
  }
  hull.push(
    part(BOX, P.enemy, [0, 0.95, 0], [1.4, 0.7, 1.5]),
    part(BOX, yellow, [0, 1.55, -0.1], [1.3, 0.6, 1.2]),
    part(BOX, P.enemyMid, [0, 2.05, 0.2], [0.9, 0.55, 0.75]),
    part(BOX, stripe, [0, 1.3, 0.76], [1.3, 0.12, 0.04]),
    // Противага ззаду.
    part(BOX, P.enemyDark, [0, 1.5, -0.85], [1.1, 0.6, 0.35]),
  );
  glow.push(
    part(BOX, 0xffffff, [0, 2.1, 0.58], [0.6, 0.18, 0.02]),
    part(SPHERE, 0xffffff, [0, 2.45, 0], [0.16, 0.16, 0.16]),
  );
  return { hull: merge(hull), glow: merge(glow) };
}

// Турель: тринога, круглий корпус і довгий ствол; ззаду світиться блок живлення — слабке місце.
function turretParts(): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const hull: Part[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    hull.push(
      seg(BOX, P.enemyDark, [0, 0.6, 0], [Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65], 0.08),
    );
  }
  hull.push(
    part(CYL, P.enemyMid, [0, 0.65, 0], [0.35, 0.2, 0.35]),
    part(BOX, P.enemy, [0, 0.95, 0], [0.62, 0.42, 0.7]),
    part(CYL, P.enemyDark, [0, 1.0, 0.65], [0.13, 0.7, 0.13], [Math.PI / 2, 0, 0]),
    part(BOX, P.enemyDark, [0, 1.0, 1.0], [0.2, 0.2, 0.08]),
    part(BOX, 0xe8b020, [0, 1.2, 0], [0.64, 0.05, 0.72]),
  );
  const glow = [
    part(BOX, 0xffffff, [0, 0.98, -0.37], [0.36, 0.22, 0.04]),
    part(BOX, 0xffffff, [0, 1.06, 0.36], [0.12, 0.06, 0.02]),
  ];
  return { hull: merge(hull), glow: merge(glow) };
}

const GROUND_GEO = {
  shell: shellParts(),
  spider: spiderParts(),
  repairer: repairerParts(),
  foreman: foremanParts(),
  turret: turretParts(),
  // Ядро малює BossRenderer; запис лише для повноти таблиці.
  core: turretParts(),
};

const DRONE_GEO = {
  wasp: droneParts('wasp'),
  kamikaze: droneParts('kamikaze'),
  sniper: droneParts('sniper'),
  swarm: droneParts('swarm'),
};

/**
 * Набір вигляду ворогів за картою (DECISIONS.md, п. 65): у пустелі ті самі вороги виглядають
 * як механічні тварини — моделі public/models/<набір>/<тип>.glb. Немає моделі — звичайна.
 */
let enemySet = '';
export function setEnemySet(set: string): void {
  enemySet = set;
}

function geometryOf(type: EnemyType): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  // Статична модель з Blender (public/models) замінює примітиви, якщо завантажена.
  const model =
    (enemySet ? models.staticParts(`${enemySet}/${type}`) : null) ?? models.staticParts(type);
  if (model) return model;
  if (type === 'scout') return scoutGeo;
  if (type === 'gunner') return gunnerGeo;
  if (type === 'wasp' || type === 'kamikaze' || type === 'sniper' || type === 'swarm')
    return DRONE_GEO[type];
  return GROUND_GEO[type];
}

const shadowGeo = new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});

// Одинична довжина вздовж +Z від початку координат, масштабується на відстань до цілі.
const laserGeo = new THREE.BoxGeometry(0.09, 0.09, 1).translate(0, 0, 0.5);

const ringGeo = new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2);

/** instanced — корпус і око малює EnemyInstances (матч); false — власні меші (галерея). */
export function buildEnemyVisual(type: EnemyType, instanced = false): EnemyVisual {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.4,
    flatShading: true,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffb0a0,
    emissive: PALETTE.enemyEye,
    emissiveIntensity: EYE_GLOW,
  });
  const model = models.instantiate(type);
  if (model) {
    model.root.scale.setScalar(1 / VISUAL_SCALE[type]);
    body.add(model.root);
  } else if (!instanced) {
    const geo = geometryOf(type);
    const hull = new THREE.Mesh(geo.hull, hullMat);
    const glow = new THREE.Mesh(geo.glow, glowMat);
    hull.castShadow = true;
    body.add(hull, glow);
  }
  root.add(body);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: PALETTE.danger,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);
  // Лазер прицілювання Стрільця: тонка лінія до цілі — видно, звідки і куди прилетить.
  const laser = new THREE.Mesh(
    laserGeo,
    new THREE.MeshBasicMaterial({
      color: PALETTE.danger,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  laser.visible = false;
  root.add(laser);
  // Тінь під дроном: без неї висоту й позицію в повітрі не прочитати згори.
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.025;
  // В інстансованому режимі тінь теж малює EnemyInstances; меш лишається носієм позиції.
  shadow.visible = model !== null || !instanced;
  // Наземним — контактна пляма за розміром тіла; дронам розмір рахується щокадру від висоти.
  if (!AIR.has(type)) shadow.scale.setScalar(GROUND_SHADOW[type] ?? 1.2);
  root.add(shadow);
  body.scale.setScalar(VISUAL_SCALE[type]);
  let bubble: THREE.Mesh | null = null;
  if (type === 'shell') {
    bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.9, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0x4f8cff,
        emissive: 0x2f6cff,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    bubble.position.y = 1.4;
    bubble.visible = false;
    root.add(bubble);
  }
  if (type === 'repairer') {
    // Промінь лікування — той самий «лазер», але зелено-блакитний.
    (laser.material as THREE.MeshBasicMaterial).color.setHex(0x6af0c0);
  }
  return {
    root,
    body,
    hullMat,
    glowMat,
    ring,
    laser,
    shadow,
    bubble,
    type,
    flash: 0,
    spawnT: 0,
    walk: Math.random() * 6.28,
    walkAmp: 0,
    model,
    instanced: instanced && model === null,
  };
}

/**
 * Емісія на інстанс: атрибут instanceEmissive додається до totalEmissiveRadiance. Так спалах
 * влучання й світіння ока лишаються індивідуальними, а тип ворога малюється одним викликом.
 */
function withInstanceEmissive<M extends THREE.Material>(mat: M, legs = false): M {
  // Крок (п. 59): вершини нижче стегна зсуваються вперед-назад і трохи вгору, ліва й права
  // ноги — у протифазі. instanceAnim = (фаза, розмах, висота стегна, мін. |x| ноги).
  const walk = legs
    ? `
float legW = clamp((instanceAnim.z - position.y) / max(instanceAnim.z, 0.001), 0.0, 1.0)
  * step(instanceAnim.w, abs(position.x));
float legS = position.x >= 0.0 ? 1.0 : -1.0;
transformed.z += legS * sin(instanceAnim.x) * instanceAnim.y * legW;
transformed.y += max(0.0, legS * cos(instanceAnim.x)) * instanceAnim.y * 0.4 * legW;`
    : '';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec3 instanceEmissive;\nvarying vec3 vInstEm;${legs ? '\nattribute vec4 instanceAnim;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvInstEm = instanceEmissive;${walk}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vInstEm;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vInstEm;',
      );
  };
  mat.customProgramCacheKey = () => (legs ? 'instEmLegs' : 'instEm');
  return mat;
}

interface Batch {
  mesh: THREE.InstancedMesh;
  emissive: THREE.InstancedBufferAttribute;
  anim: THREE.InstancedBufferAttribute | null;
}

/** Хода за типом: висота стегна, розмах (м), мін. |x| ноги (Павук: лише лапи), кроків на метр. */
const WALK: Partial<Record<EnemyType, { hip: number; amp: number; xMin: number; rate: number }>> = {
  scout: { hip: 0.76, amp: 0.2, xMin: 0, rate: 2.6 },
  gunner: { hip: 0.66, amp: 0.15, xMin: 0, rate: 2.4 },
  repairer: { hip: 0.6, amp: 0.13, xMin: 0, rate: 2.4 },
  shell: { hip: 1.2, amp: 0.3, xMin: 0, rate: 1.3 },
  foreman: { hip: 1.0, amp: 0.28, xMin: 0, rate: 1.2 },
  spider: { hip: 0.78, amp: 0.13, xMin: 0.3, rate: 5 },
};

/**
 * Один InstancedMesh на тип для корпусу й один для ока, плюс спільний для тіней дронів.
 * На слабкому телевізорі сотня ворогів як окремі об'єкти (з власними матеріалами й проходом
 * тіней) з'їдала кадр на процесорі; так — ~2 виклики на тип незалежно від кількості.
 */
/** Хода пустельних тварин: Кобра повзе без кроку, у Шакала й Верблюда — чотири лапи. */
const WALK_SETS: Record<string, typeof WALK> = {
  desert: {
    scout: { hip: 0.6, amp: 0.2, xMin: 0, rate: 3 },
    repairer: { hip: 0.42, amp: 0.1, xMin: 0, rate: 2.6 },
    shell: { hip: 1.25, amp: 0.3, xMin: 0, rate: 1.3 },
    foreman: { hip: 0.95, amp: 0.26, xMin: 0.55, rate: 1.4 },
    spider: { hip: 0.78, amp: 0.13, xMin: 0.3, rate: 5 },
  },
};
function walkOf(type: EnemyType): (typeof WALK)[EnemyType] {
  const set = WALK_SETS[enemySet];
  if (set && models.staticParts(`${enemySet}/${type}`)) return set[type];
  return WALK[type];
}

class EnemyInstances {
  private readonly hulls = new Map<EnemyType, Batch>();
  private readonly glows = new Map<EnemyType, Batch>();
  private readonly shadows: THREE.InstancedMesh;
  private readonly hullMat = withInstanceEmissive(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.4,
      flatShading: true,
      emissive: 0x000000,
    }),
    true,
  );
  private readonly glowMat = withInstanceEmissive(
    new THREE.MeshStandardMaterial({ color: 0xffb0a0, emissive: 0x000000 }),
  );
  private nShadow = 0;
  private readonly counts = new Map<THREE.InstancedMesh, number>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly capacity: number,
    tint: number,
  ) {
    this.hullMat.color.setHex(tint);
    this.shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, capacity);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    scene.add(this.shadows);
  }

  private batch(map: Map<EnemyType, Batch>, type: EnemyType, glow: boolean): Batch {
    let b = map.get(type);
    if (b) return b;
    const geo = geometryOf(type);
    const mesh = new THREE.InstancedMesh(
      glow ? geo.glow : geo.hull,
      glow ? this.glowMat : this.hullMat,
      this.capacity,
    );
    const emissive = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    emissive.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('instanceEmissive', emissive);
    let anim: THREE.InstancedBufferAttribute | null = null;
    if (!glow) {
      anim = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
      anim.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute('instanceAnim', anim);
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = !glow;
    mesh.count = 0;
    this.scene.add(mesh);
    b = { mesh, emissive, anim };
    map.set(type, b);
    return b;
  }

  begin(): void {
    this.counts.clear();
    this.nShadow = 0;
  }

  private push(
    b: Batch,
    m: THREE.Matrix4,
    r: number,
    g: number,
    bl: number,
    v?: EnemyVisual,
  ): void {
    const n = this.counts.get(b.mesh) ?? 0;
    b.mesh.setMatrixAt(n, m);
    b.emissive.setXYZ(n, r, g, bl);
    if (b.anim && v) {
      const w = walkOf(v.type);
      b.anim.setXYZW(n, v.walk, w ? w.amp * v.walkAmp : 0, w?.hip ?? 0, w?.xMin ?? 0);
    }
    this.counts.set(b.mesh, n + 1);
  }

  add(v: EnemyVisual): void {
    v.body.updateWorldMatrix(true, false);
    const m = v.body.matrixWorld;
    const he = v.hullMat.emissive;
    this.push(this.batch(this.hulls, v.type, false), m, he.r, he.g, he.b, v);
    const k = v.glowMat.emissiveIntensity;
    const ge = v.glowMat.emissive;
    this.push(this.batch(this.glows, v.type, true), m, ge.r * k, ge.g * k, ge.b * k);
    {
      v.shadow.updateWorldMatrix(true, false);
      this.shadows.setMatrixAt(this.nShadow++, v.shadow.matrixWorld);
    }
  }

  end(): void {
    for (const map of [this.hulls, this.glows])
      for (const b of map.values()) {
        const n = this.counts.get(b.mesh) ?? 0;
        b.mesh.count = n;
        b.mesh.visible = n > 0;
        if (n > 0) {
          b.mesh.instanceMatrix.needsUpdate = true;
          b.emissive.needsUpdate = true;
          if (b.anim) b.anim.needsUpdate = true;
        }
      }
    this.shadows.count = this.nShadow;
    this.shadows.visible = this.nShadow > 0;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
}

/** Око світиться помірно: з bloom сильніше світіння розпливається в кулю й ховає голову. */
const EYE_GLOW = 1.4;
const windupTicks = SCOUT.windup * TICKS_PER_SEC;
const peekTicks = Math.round(GUNNER.peek * TICKS_PER_SEC);
const aimTicks = Math.round(GUNNER.aim * TICKS_PER_SEC);
const kamiWindupTicks = Math.round(KAMIKAZE.windup * TICKS_PER_SEC);
const sniperAimTicks = Math.round(SNIPER.aim * TICKS_PER_SEC);
const craneWarnTicks = Math.round(FOREMAN.strikeWarn * TICKS_PER_SEC);
const turretWindupTicks = Math.round(TURRET.windup * TICKS_PER_SEC);

export class EnemyRenderer {
  private readonly views: (EnemyVisual | null)[] = [];
  private readonly gens: number[] = [];
  // Смужки здоров'я над пораненими ворогами (як на концепті hud.jpg): фон + заливка.
  private readonly barBg: THREE.InstancedMesh;
  private readonly barFill: THREE.InstancedMesh;
  private readonly m4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly instances: EnemyInstances;

  /** tint — множник кольору корпусів: на світлому піску пустелі бліді роботи мають бути темнішими. */
  constructor(
    private readonly scene: THREE.Scene,
    capacity: number,
    tint = 0xffffff,
    set = '',
  ) {
    setEnemySet(set);
    this.instances = new EnemyInstances(scene, capacity, tint);
    for (let i = 0; i < capacity; i++) {
      this.views.push(null);
      this.gens.push(-1);
    }
    const plane = new THREE.PlaneGeometry(1, 1);
    // Заливка росте від лівого краю: зсуваємо геометрію, щоб масштаб тягнув праворуч.
    const fillGeo = plane.clone().translate(0.5, 0, 0);
    this.barBg = new THREE.InstancedMesh(
      plane,
      new THREE.MeshBasicMaterial({
        color: 0x120a0a,
        transparent: true,
        opacity: 0.75,
        depthTest: false,
      }),
      capacity,
    );
    this.barFill = new THREE.InstancedMesh(
      fillGeo,
      new THREE.MeshBasicMaterial({ color: PALETTE.enemyShot, depthTest: false }),
      capacity,
    );
    for (const b of [this.barBg, this.barFill]) {
      b.frustumCulled = false;
      b.count = 0;
      b.renderOrder = 10;
      scene.add(b);
    }
  }

  /** Окремо від update: потрібна орієнтація камери, а смужки мають бути поверх усього. */
  updateBars(enemies: Enemy[], alpha: number, camera: THREE.Camera): void {
    let n = 0;
    const q = camera.quaternion;
    const W = 0.9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      // Ядро має власну смугу в HUD.
      if (!e.alive || e.hp >= e.maxHp || e.type === 'core') continue;
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const h = e.air
        ? e.alt + 0.9
        : e.type === 'shell' || e.type === 'foreman'
          ? 3.6
          : e.type === 'scout'
            ? 2.0
            : 2.4 + e.alt;
      this.pos.set(toX(x), h, toZ(y));
      this.m4.compose(this.pos, q, this.scl.set(W + 0.06, 0.16, 1));
      this.barBg.setMatrixAt(n, this.m4);
      // Лівий край заливки = лівий край фону; зсув уздовж правого вектора камери.
      this.pos.x -= ((W / 2) * this.m4.elements[0]!) / (W + 0.06);
      this.pos.y -= ((W / 2) * this.m4.elements[1]!) / (W + 0.06);
      this.pos.z -= ((W / 2) * this.m4.elements[2]!) / (W + 0.06);
      this.m4.compose(this.pos, q, this.scl.set(W * Math.max(0, e.hp / e.maxHp), 0.1, 1));
      this.barFill.setMatrixAt(n, this.m4);
      n++;
    }
    this.barBg.count = n;
    this.barFill.count = n;
    this.barBg.instanceMatrix.needsUpdate = true;
    this.barFill.instanceMatrix.needsUpdate = true;
  }

  hit(index: number): void {
    const v = this.views[index];
    if (v) v.flash = 1;
  }

  update(enemies: Enemy[], players: Player[], alpha: number, dt: number, time: number): void {
    this.updateViews(enemies, players, alpha, dt, time);
    // Трансформи й кольори готові — переносимо в спільні InstancedMesh.
    this.instances.begin();
    for (let i = 0; i < enemies.length; i++) {
      const v = this.views[i];
      if (v && v.instanced && v.root.visible) this.instances.add(v);
    }
    this.instances.end();
  }

  private updateViews(
    enemies: Enemy[],
    players: Player[],
    alpha: number,
    dt: number,
    time: number,
  ): void {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      let v = this.views[i];
      if (!e.alive || e.type === 'core') {
        if (v) v.root.visible = false;
        continue;
      }
      if (!v || v.type !== e.type) {
        if (v) this.scene.remove(v.root);
        v = buildEnemyVisual(e.type, true);
        this.views[i] = v;
        this.scene.add(v.root);
      }
      if (this.gens[i] !== e.gen) {
        this.gens[i] = e.gen;
        v.spawnT = 0;
        v.flash = 0;
      }
      v.root.visible = true;
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      v.root.position.set(toX(x), 0, toZ(y));
      v.body.rotation.y = Math.atan2(toX(e.fx), toZ(e.fy));

      v.spawnT = Math.min(1, v.spawnT + dt * 4);
      const windup = e.type === 'scout' && e.ai === SCOUT_WINDUP;
      const prog = windup ? 1 - e.aiT / windupTicks : 0;
      // Замах: присідання, розгорання ока й червоне кільце, що стискається до моменту удару.
      // Стрілець за укриттям присідає — ритм «сховався → визирнув» читається без підказок.
      const crouch = windup
        ? 1 - prog * 0.3
        : e.type === 'gunner' && e.ai === GUNNER_HIDE
          ? 0.8
          : 1;
      const speed = Math.hypot(e.vx, e.vy);
      // Фаза кроку росте з пройденим шляхом — ноги не «ковзають»; стоїть або оглушений — завмирає.
      const wk = walkOf(v.type);
      if (wk) {
        v.walk += dt * speed * wk.rate;
        const want = e.stun > 0 ? 0 : Math.min(1, speed / 1.2);
        v.walkAmp += (want - v.walkAmp) * Math.min(1, dt * 10);
      }
      const bob = Math.abs(Math.sin(time * 18 + i)) * 0.05 * Math.min(1, speed / 3);
      const bs = VISUAL_SCALE[v.type];
      v.body.scale.set(bs, bs * crouch * v.spawnT, bs);
      if (e.air) {
        // Дрон висить на своїй висоті й злегка погойдується; заглушений лежить і смикається.
        const hover =
          e.stun > 0 ? Math.sin(time * 40 + i) * 0.03 : Math.sin(time * 3 + i * 1.7) * 0.08;
        v.body.position.y = e.alt + hover;
        v.body.rotation.z = e.stun > 0 ? 0.6 : Math.sin(time * 2 + i) * 0.08;
        const sh = Math.max(0.35, 1 - e.alt * 0.12);
        v.shadow.scale.set(sh * bs, 1, sh * bs);
      } else v.body.position.y = e.alt > 0 ? e.alt : bob;
      if (v.bubble) {
        v.bubble.visible = e.shield > 0;
        (v.bubble.material as THREE.MeshStandardMaterial).opacity =
          0.1 + 0.15 * (e.shield / 100) + Math.sin(time * 4) * 0.03;
      }
      if (e.type === 'spider') {
        // Точка приземлення на підлозі під час замаху й польоту.
        const marking = e.ai === SPIDER_WINDUP || e.ai === SPIDER_FLIGHT;
        v.ring.visible = marking;
        if (marking) {
          v.ring.position.set(toX(e.tx) - v.root.position.x, 0.03, toZ(e.ty) - v.root.position.z);
          v.ring.scale.set(SPIDER.landRadius, 1, SPIDER.landRadius);
          (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(time * 30) * 0.3;
        } else v.ring.position.set(0, 0.03, 0);
        v.glowMat.emissiveIntensity = e.ai === SPIDER_WINDUP ? 5 : EYE_GLOW;
      }
      if (e.type === 'foreman') {
        // Зона удару кранами: велике кільце, що наливається червоним до удару; стріли піднімаються.
        const strike = e.ai === FOREMAN_STRIKE;
        v.ring.visible = strike;
        if (strike) {
          const kp = Math.min(1, e.aiT / craneWarnTicks);
          v.ring.position.set(toX(e.tx) - v.root.position.x, 0.03, toZ(e.ty) - v.root.position.z);
          const rs = FOREMAN.strikeRadius * (1.25 - kp * 0.25);
          v.ring.scale.set(rs, 1, rs);
          (v.ring.material as THREE.MeshBasicMaterial).opacity =
            0.35 + kp * 0.55 * (0.7 + 0.3 * Math.sin(time * (10 + kp * 30)));
          v.body.rotation.x = -kp * 0.12;
        } else {
          v.ring.position.set(0, 0.03, 0);
          v.body.rotation.x = 0;
        }
        v.glowMat.emissiveIntensity = strike ? 3 + Math.sin(time * 30) * 1.5 : EYE_GLOW;
        continue_flash(v, e, dt, speed, strike);
        continue;
      }
      if (e.type === 'turret') {
        // Лазер уздовж ствола під час замаху; черга — спалах «ока».
        const wind = e.ai === TURRET_WINDUP;
        v.laser.visible = wind;
        v.ring.visible = false;
        if (wind) {
          const kp = e.aiT / turretWindupTicks;
          v.laser.position.set(0, 1.2, 0);
          v.laser.rotation.set(0, Math.atan2(toX(e.fx), toZ(e.fy)), 0);
          v.laser.scale.set(1, 1, TURRET.range);
          (v.laser.material as THREE.MeshBasicMaterial).opacity =
            0.25 + 0.6 * kp * (0.6 + 0.4 * Math.sin(time * 40));
        }
        v.glowMat.emissiveIntensity = wind ? 3 : e.ai === TURRET_BURST ? 6 : EYE_GLOW;
        continue_flash(v, e, dt, speed, wind);
        continue;
      }
      if (e.type === 'repairer') {
        const a = e.ally >= 0 ? enemies[e.ally] : undefined;
        const beam =
          !!a && a.alive && (a.x - e.x) ** 2 + (a.y - e.y) ** 2 <= REPAIRER.healRange ** 2;
        v.laser.visible = beam;
        if (beam) {
          v.root.updateMatrixWorld();
          v.laser.position.set(0, 0.9, 0.5);
          this.tmp.set(toX(a.x), a.type === 'shell' ? 1.8 : 1, toZ(a.y));
          v.laser.lookAt(this.tmp);
          v.laser.scale.set(
            0.7,
            0.7,
            this.tmp.distanceTo(v.root.localToWorld(this.tmp2.set(0, 0.9, 0.5))),
          );
          (v.laser.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(time * 20) * 0.15;
        }
        continue_flash(v, e, dt, speed);
        continue;
      }
      v.glowMat.emissiveIntensity = windup ? 2.5 + prog * 5 : EYE_GLOW;
      v.ring.visible = windup;
      if (windup) {
        const s = 2.2 - prog * 0.9;
        v.ring.scale.set(s, 1, s);
        (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + prog * 0.6;
      }

      if (e.type === 'wasp')
        v.glowMat.emissiveIntensity =
          e.ai === WASP_WINDUP ? 4 + Math.sin(time * 50) * 1.5 : EYE_GLOW;
      if (e.type === 'kamikaze') {
        // Телеграф: точка удару на підлозі — кільце стискається до пікірування.
        const marking = e.ai === KAMI_WINDUP || e.ai === KAMI_DIVE;
        v.ring.visible = marking;
        if (marking) {
          v.ring.position.set(toX(e.tx) - v.root.position.x, 0.03, toZ(e.ty) - v.root.position.z);
          const kp = e.ai === KAMI_WINDUP ? e.aiT / kamiWindupTicks : 1;
          const rs = KAMIKAZE.blastRadius * (1.6 - kp * 0.6);
          v.ring.scale.set(rs, 1, rs);
          (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + kp * 0.5;
        } else v.ring.position.set(0, 0.03, 0);
        v.glowMat.emissiveIntensity = marking ? 5 + Math.sin(time * 45) * 2 : 2.2;
      }
      if (e.type === 'sniper') {
        // Лазер снайпера до точки на підлозі: видно, куди прилетить, і коли зафіксувався.
        const aim = e.ai === SNIPER_AIM;
        v.laser.visible = aim;
        if (aim) {
          v.root.updateMatrixWorld();
          v.laser.position.set(0, e.alt, 0);
          this.tmp.set(toX(e.tx), 0.9, toZ(e.ty));
          v.laser.lookAt(this.tmp);
          v.laser.scale.set(
            0.8,
            0.8,
            this.tmp.distanceTo(v.root.localToWorld(this.tmp2.set(0, e.alt, 0))),
          );
          const sp = e.aiT / sniperAimTicks;
          (v.laser.material as THREE.MeshBasicMaterial).opacity =
            0.3 + 0.6 * sp * (0.6 + 0.4 * Math.sin(time * (15 + sp * 50)));
          v.glowMat.emissiveIntensity = 2 + sp * 6;
        }
        continue_flash(v, e, dt, speed);
        continue;
      }

      // Стрілець цілиться: від початку визирання до пострілу (або перед пострілом у відкритому бою).
      const aiming =
        e.type === 'gunner' &&
        ((e.ai === GUNNER_PEEK && e.aiT > peekTicks - aimTicks) ||
          (e.ai === GUNNER_OPEN && e.aiT <= aimTicks));
      const tp = aiming && e.target >= 0 ? players[e.target] : undefined;
      v.laser.visible = !!tp;
      v.laser.rotation.set(0, 0, 0);
      if (tp) {
        const dx = toX(tp.x) - v.root.position.x;
        const dz = toZ(tp.y) - v.root.position.z;
        const len = Math.hypot(dx, dz);
        v.laser.position.y = 1.15;
        v.laser.rotation.y = Math.atan2(dx, dz);
        v.laser.scale.set(1, 1, len);
        const prog = e.ai === GUNNER_PEEK ? (peekTicks - e.aiT) / aimTicks : 1 - e.aiT / aimTicks;
        // Пульсація частішає ближче до пострілу.
        (v.laser.material as THREE.MeshBasicMaterial).opacity =
          0.25 + 0.6 * prog * (0.6 + 0.4 * Math.sin(time * (20 + prog * 40)));
        v.glowMat.emissiveIntensity = 2 + prog * 5;
      }

      continue_flash(v, e, dt, speed, windup);
    }
  }
}

/** Спалах влучання й анімація моделі — спільний хвіст оновлення для всіх типів. */
function continue_flash(v: EnemyVisual, e: Enemy, dt: number, speed: number, windup = false): void {
  v.flash = Math.max(0, v.flash - dt * 12);
  // Влучання: броня спалахує червоно-білим (на блідій броні білий спалах губиться).
  v.hullMat.emissive.setRGB(0.06 + v.flash * 1.2, 0.04 + v.flash * 0.35, 0.04 + v.flash * 0.25);
  if (v.model) {
    v.model.flash(v.flash * 1.2, 1, 0.3, 0.2);
    v.model.play(
      e.air ? (windup ? 'attack' : 'hover') : windup ? 'attack' : speed > 0.5 ? 'run' : 'idle',
    );
    v.model.update(dt);
  }
}
