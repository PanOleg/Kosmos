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
  /** Готова glTF-модель замість примітивів, якщо є. */
  model: ModelInstance | null;
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
};
const AIR = new Set<EnemyType>(['wasp', 'kamikaze', 'sniper', 'swarm']);

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

const GROUND_GEO = { shell: shellParts(), spider: spiderParts(), repairer: repairerParts() };

const DRONE_GEO = {
  wasp: droneParts('wasp'),
  kamikaze: droneParts('kamikaze'),
  sniper: droneParts('sniper'),
  swarm: droneParts('swarm'),
};

function geometryOf(type: EnemyType): { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  if (type === 'scout') return scoutGeo;
  if (type === 'gunner') return gunnerGeo;
  if (type === 'shell' || type === 'spider' || type === 'repairer') return GROUND_GEO[type];
  return DRONE_GEO[type];
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

export function buildEnemyVisual(type: EnemyType): EnemyVisual {
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
  } else {
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
  shadow.visible = AIR.has(type);
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
    model,
  };
}

/** Око світиться помірно: з bloom сильніше світіння розпливається в кулю й ховає голову. */
const EYE_GLOW = 1.4;
const windupTicks = SCOUT.windup * TICKS_PER_SEC;
const peekTicks = Math.round(GUNNER.peek * TICKS_PER_SEC);
const aimTicks = Math.round(GUNNER.aim * TICKS_PER_SEC);
const kamiWindupTicks = Math.round(KAMIKAZE.windup * TICKS_PER_SEC);
const sniperAimTicks = Math.round(SNIPER.aim * TICKS_PER_SEC);

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

  constructor(
    private readonly scene: THREE.Scene,
    capacity: number,
  ) {
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
      if (!e.alive || e.hp >= e.maxHp) continue;
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const h = e.air
        ? e.alt + 0.9
        : e.type === 'shell'
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
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      let v = this.views[i];
      if (!e.alive) {
        if (v) v.root.visible = false;
        continue;
      }
      if (!v || v.type !== e.type) {
        if (v) this.scene.remove(v.root);
        v = buildEnemyVisual(e.type);
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
