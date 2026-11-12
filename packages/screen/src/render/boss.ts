import * as THREE from 'three';
import {
  CORE,
  CORE_CRANE,
  CORE_LASER,
  coreZone,
  type BossState,
  type Enemy,
  type MapDef,
  type Player,
} from '@horizon/sim';
import { PALETTE } from './palette';
import { BOX, CONE4, CYL, SPHERE, merge, part, seg, type Part } from './mesh';
import { toX, toZ } from './coords';

const P = PALETTE;
const RUST = 0x5a3a30;
const YELLOW = 0xe8b020;

type Geo = { hull: THREE.BufferGeometry; glow: THREE.BufferGeometry };

// Ядро (concept enemies.jpg, STATION CORE): масивний броньований диск-рама з сегментами,
// усередині — концентричні кільця й велике червоне око. Стоїть на барабані над реактором,
// диском до камери (на південь): з висоти камери око читається одразу.
function shellGeo(): Geo {
  const hull: Part[] = [
    // Барабан-основа навколо реактора.
    part(CYL, P.enemyDark, [0, 0.55, 0], [6, 1.1, 6]),
    part(CYL, RUST, [0, 1.25, 0], [5.2, 0.3, 5.2]),
    // Задня плита диска.
    part(CYL, P.enemyDark, [0, 4.2, -0.35], [5.2, 0.5, 5.2], [Math.PI / 2, 0, 0]),
    part(CYL, P.enemyMid, [0, 4.2, 0], [3.6, 0.3, 3.6], [Math.PI / 2, 0, 0]),
    part(CYL, P.enemyDark, [0, 4.2, 0.12], [2.4, 0.3, 2.4], [Math.PI / 2, 0, 0]),
    // Опори диска.
    seg(BOX, P.enemyDark, [-1.6, 1.3, -0.3], [-1.4, 2.6, -0.3], 0.5),
    seg(BOX, P.enemyDark, [1.6, 1.3, -0.3], [1.4, 2.6, -0.3], 0.5),
  ];
  // Сегменти броні по колу — «частини станції».
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const r = 2.75;
    hull.push(
      part(
        BOX,
        k % 3 === 0 ? RUST : k % 2 ? P.enemy : P.enemyMid,
        [Math.cos(a) * r, 4.2 + Math.sin(a) * r, 0.05],
        [1.25, 0.7, 0.8],
        [0, 0, a + Math.PI / 2],
      ),
    );
  }
  const glow: Part[] = [
    part(SPHERE, 0xffffff, [0, 4.2, 0.35], [1.3, 1.3, 0.8]),
    // Тонкі світні кільця навколо ока.
    ...[1.45, 1.95].flatMap((r) =>
      Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        return part(
          BOX,
          0xffffff,
          [Math.cos(a) * r, 4.2 + Math.sin(a) * r, 0.3],
          [0.32, 0.06, 0.04],
          [0, 0, a + Math.PI / 2],
        );
      }),
    ),
    // Червоні вогні на барабані.
    ...Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      return part(BOX, 0xffffff, [Math.cos(a) * 3.02, 0.75, Math.sin(a) * 3.02], [0.3, 0.12, 0.3]);
    }),
  ];
  return { hull: merge(hull), glow: merge(glow) };
}

// Фаза 3: Ядро встає велетенським роботом — ноги-колони, корпус з оком у грудях,
// ліва рука — ракетний блок Панцира, права — жовта стріла крана, на плечі ствол снайпера.
function robotGeo(): Geo {
  const hull: Part[] = [];
  for (const sx of [1, -1]) {
    hull.push(
      seg(BOX, P.enemyDark, [1.1 * sx, 3.2, 0], [1.4 * sx, 1.6, 0.3], 0.9),
      seg(BOX, P.enemy, [1.4 * sx, 1.6, 0.3], [1.5 * sx, 0.2, -0.1], 0.8, 1),
      part(BOX, P.enemyDark, [1.5 * sx, 0.15, 0.2], [1.2, 0.3, 1.8]),
    );
  }
  hull.push(
    part(BOX, P.enemyDark, [0, 3.4, 0], [2.6, 0.8, 1.6]),
    part(BOX, P.enemy, [0, 4.7, 0], [3.6, 1.9, 2.2]),
    part(BOX, RUST, [0, 5.9, -0.1], [2.8, 0.6, 1.8]),
    part(BOX, P.enemyMid, [0, 6.5, 0.2], [1.2, 0.7, 1.0]),
    part(CYL, P.enemyDark, [0, 4.75, 1.12], [1.7, 0.2, 1.7], [Math.PI / 2, 0, 0]),
    // Ліва рука: ракетний блок.
    seg(BOX, P.enemyDark, [-2.0, 5.4, 0], [-2.6, 4.1, 0.4], 0.6),
    part(BOX, P.enemyMid, [-2.7, 3.6, 0.6], [1.2, 1.2, 1.4]),
    part(BOX, P.enemyDark, [-2.7, 3.6, 1.32], [1.0, 1.0, 0.06]),
    // Права рука: стріла крана з гаком.
    seg(BOX, YELLOW, [2.0, 5.6, 0], [3.0, 6.8, 1.2], 0.45),
    seg(BOX, YELLOW, [3.0, 6.8, 1.2], [3.1, 5.6, 2.8], 0.38),
    seg(BOX, 0x2a2420, [3.1, 5.6, 2.8], [3.1, 3.8, 2.85], 0.08),
    part(BOX, P.enemyDark, [3.1, 3.5, 2.85], [0.6, 0.5, 0.4]),
    // Ствол снайпера на лівому плечі.
    part(CYL, P.enemyDark, [-1.4, 6.3, 1.0], [0.22, 2.6, 0.22], [Math.PI / 2, 0, 0]),
  );
  for (let k = 0; k < 3; k++)
    hull.push(
      part(BOX, 0x2a2420, [2.2 + k * 0.33, 5.85 + k * 0.4, 0.3 + k * 0.4], [0.5, 0.1, 0.5]),
    );
  const glow: Part[] = [
    part(SPHERE, 0xffffff, [0, 4.75, 1.25], [1.1, 1.1, 0.6]),
    part(BOX, 0xffffff, [0, 6.55, 0.72], [0.8, 0.14, 0.04]),
    part(CYL, 0xffffff, [-1.4, 6.3, 2.32], [0.14, 0.04, 0.14], [Math.PI / 2, 0, 0]),
  ];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++)
      glow.push(part(BOX, 0xffffff, [-2.95 + c * 0.5, 3.35 + r * 0.5, 1.36], [0.22, 0.22, 0.03]));
  return { hull: merge(hull), glow: merge(glow) };
}

// Чарівний ліс (DECISIONS.md, п. 73): Ядро — велетенський ведмідь-дух. Фази 1–2 — сидить на
// кам'яному колі, у грудях світиться «серце» (на місці ока Ядра); фаза 3 — встає на задні лапи.
// Світні частини різнокольорові: колір вершини стає кольором світіння (lumGlow).
const FUR = 0x2c3266;
const FUR_DARK = 0x1b1e42;
const FUR_LIGHT = 0x4a5a94;
const MOSS = 0x2f6a58;
const STONE = 0x45555c;
const CYAN = 0x30f0ff;
const PINK = 0xff40d0;
const LIME = 0x90ff40;
const VIOLET = 0xa060ff;

/** Голова ведмедя з центром у (0, y, z): морда, ніс, вуха; очі й руна на лобі — у glow. */
function bearHead(hull: Part[], glow: Part[], y: number, z: number, k = 1): void {
  hull.push(
    part(SPHERE, FUR, [0, y, z], [2.8 * k, 2.4 * k, 2.6 * k]),
    part(BOX, FUR_LIGHT, [0, y - 0.4 * k, z + 1.3 * k], [1.2 * k, 0.9 * k, 1.0 * k]),
    part(BOX, FUR_DARK, [0, y - 0.15 * k, z + 1.8 * k], [0.5 * k, 0.35 * k, 0.22 * k]),
  );
  for (const sx of [1, -1]) {
    hull.push(
      part(
        SPHERE,
        FUR_DARK,
        [1.1 * sx * k, y + 1.1 * k, z - 0.2 * k],
        [0.95 * k, 0.95 * k, 0.5 * k],
      ),
    );
    glow.push(
      part(SPHERE, PINK, [1.1 * sx * k, y + 1.1 * k, z + 0.02 * k], [0.5 * k, 0.5 * k, 0.2 * k]),
      part(
        SPHERE,
        CYAN,
        [0.62 * sx * k, y + 0.25 * k, z + 1.14 * k],
        [0.36 * k, 0.3 * k, 0.24 * k],
      ),
      // Смуги на щоках.
      part(
        BOX,
        LIME,
        [1.2 * sx * k, y - 0.25 * k, z + 0.75 * k],
        [0.12 * k, 0.6 * k, 0.5 * k],
        [0, 0, 0.5 * sx],
      ),
    );
  }
  glow.push(
    part(BOX, VIOLET, [0, y + 0.95 * k, z + 0.82 * k], [0.22 * k, 0.6 * k, 0.3 * k], [0.5, 0, 0]),
  );
}

function bearSitGeo(): Geo {
  const hull: Part[] = [
    part(CYL, STONE, [0, 0.55, 0], [6, 1.1, 6]),
    part(CYL, MOSS, [0, 1.13, 0], [5.4, 0.1, 5.4]),
    part(SPHERE, FUR, [0, 3.4, -0.3], [4.8, 4.8, 3.8]),
    part(SPHERE, FUR_LIGHT, [0, 3.2, 0.85], [3.3, 3.5, 2.2]),
  ];
  const glow: Part[] = [
    // «Серце» в грудях — туди й треба стріляти.
    part(SPHERE, PINK, [0, 4.0, 1.8], [1.4, 1.4, 0.7]),
  ];
  for (const sx of [1, -1]) {
    hull.push(
      part(SPHERE, FUR, [1.9 * sx, 1.9, 0.5], [2.4, 2.2, 3.0]),
      part(SPHERE, FUR_DARK, [1.7 * sx, 1.45, 2.1], [1.4, 1.1, 1.8]),
      seg(BOX, FUR, [2.0 * sx, 4.9, 0.1], [2.5 * sx, 2.9, 1.3], 1.3),
      part(SPHERE, FUR_DARK, [2.5 * sx, 2.6, 1.6], [1.5, 1.1, 1.6]),
    );
    for (let k = 0; k < 3; k++) {
      glow.push(
        part(CONE4, CYAN, [(2.1 + k * 0.4) * sx, 2.35, 2.35], [0.22, 0.5, 0.22], [1.9, 0, 0]),
        // Смуги на плечах і стегнах.
        part(
          BOX,
          LIME,
          [2.55 * sx, 4.4 - k * 0.55, 0.55 + k * 0.3],
          [0.14, 0.34, 1.0],
          [0.5, 0, 0.25 * sx],
        ),
        part(BOX, VIOLET, [(2.75 - k * 0.05) * sx, 2.1, -0.3 + k * 0.5], [0.14, 1.1, 0.3]),
      );
    }
  }
  // Візерунок на спині й світні плями на животі.
  for (let k = 0; k < 5; k++)
    glow.push(
      part(
        BOX,
        CYAN,
        [0, 5.6 - k * 0.55, -1.85 - Math.sin(k * 0.6) * 0.25],
        [0.9 - k * 0.1, 0.22, 0.2],
      ),
    );
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    glow.push(
      part(
        SPHERE,
        k % 2 ? CYAN : LIME,
        [Math.cos(a) * 1.05, 4.0 + Math.sin(a) * 1.05, 1.72],
        [0.22, 0.22, 0.16],
      ),
    );
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    glow.push(
      part(
        CONE4,
        [CYAN, PINK, LIME, VIOLET][k % 4]!,
        [Math.cos(a) * 2.95, 1.0, Math.sin(a) * 2.95],
        [0.36, 0.9, 0.36],
      ),
    );
  }
  bearHead(hull, glow, 6.1, 0.7);
  return { hull: merge(hull), glow: merge(glow) };
}

function bearStandGeo(): Geo {
  const hull: Part[] = [
    part(SPHERE, FUR, [0, 4.7, 0], [4.3, 4.6, 3.1]),
    part(SPHERE, FUR_LIGHT, [0, 4.4, 0.85], [2.9, 3.2, 1.7]),
    // Ліва лапа занесена для удару, права простягнута вперед.
    seg(BOX, FUR, [-2.0, 5.9, 0], [-3.2, 7.1, 1.0], 1.15),
    part(SPHERE, FUR_DARK, [-3.4, 7.5, 1.3], [1.5, 1.3, 1.5]),
    seg(BOX, FUR, [2.0, 5.7, 0], [3.0, 4.5, 1.8], 1.15),
    part(SPHERE, FUR_DARK, [3.1, 4.2, 2.2], [1.5, 1.2, 1.6]),
  ];
  const glow: Part[] = [part(SPHERE, PINK, [0, 4.75, 1.42], [1.2, 1.2, 0.6])];
  for (const sx of [1, -1]) {
    hull.push(
      seg(BOX, FUR, [1.1 * sx, 3.3, 0], [1.45 * sx, 0.5, 0.2], 1.4),
      part(SPHERE, FUR_DARK, [1.5 * sx, 0.35, 0.5], [1.6, 0.7, 2.1]),
    );
    for (let k = 0; k < 3; k++)
      glow.push(
        part(BOX, LIME, [2.25 * sx, 5.3 - k * 0.6, 0.4], [0.14, 0.34, 1.2], [0, 0, 0.3 * sx]),
        part(BOX, VIOLET, [1.9 * sx, 2.6 - k * 0.6, 0.55], [0.5, 0.2, 0.3]),
        part(CONE4, CYAN, [(1.15 + k * 0.35) * sx, 0.3, 1.6], [0.22, 0.5, 0.22], [1.6, 0, 0]),
      );
  }
  for (let k = 0; k < 3; k++)
    glow.push(
      part(CONE4, CYAN, [-3.8 + k * 0.4, 8.1, 1.6], [0.24, 0.7, 0.24], [0.5, 0, 0]),
      part(CONE4, CYAN, [2.7 + k * 0.4, 3.9, 3.0], [0.24, 0.7, 0.24], [1.6, 0, 0]),
    );
  for (let k = 0; k < 5; k++)
    glow.push(
      part(
        BOX,
        CYAN,
        [0, 6.6 - k * 0.6, -1.5 - Math.sin(k * 0.6) * 0.2],
        [0.9 - k * 0.1, 0.22, 0.2],
      ),
    );
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    glow.push(
      part(
        SPHERE,
        k % 2 ? CYAN : LIME,
        [Math.cos(a) * 0.95, 4.75 + Math.sin(a) * 0.95, 1.4],
        [0.2, 0.2, 0.16],
      ),
    );
  }
  bearHead(hull, glow, 7.6, 0.5, 0.9);
  return { hull: merge(hull), glow: merge(glow) };
}

/** Світіння кольором вершини: сила — як у звичайного ока, колір — з моделі. */
function lumGlow(mat: THREE.MeshStandardMaterial): void {
  mat.vertexColors = true;
  mat.color.setHex(0xffffff);
  mat.emissive.setHex(0xffffff);
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb * 0.28;',
    );
  };
  mat.customProgramCacheKey = () => 'lumGlow';
}

const GRID_POOL = 18;
const STREAKS = 60;

/**
 * Фінальний бос на екрані: тіло Ядра (диск або робот), лазерна сітка, шлюзи з потоком повітря,
 * зона крана й лазер прицілу, темрява з ліхтарями гравців. Решта ворогів — у EnemyRenderer.
 */
export class BossRenderer {
  private readonly root = new THREE.Group();
  private readonly disc = new THREE.Group();
  private readonly robot = new THREE.Group();
  private readonly hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.45,
    flatShading: true,
  });
  private readonly glowMat = new THREE.MeshStandardMaterial({
    color: 0xffb0a0,
    emissive: P.enemyEye,
    emissiveIntensity: 3,
  });
  private readonly eyeLight = new THREE.PointLight(P.core, 0, 18, 1.6);
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamMat = new THREE.MeshBasicMaterial({
    color: P.danger,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly zone: THREE.Mesh;
  private readonly zoneFill: THREE.Mesh;
  private readonly laser: THREE.Mesh;
  private readonly lockLight = new THREE.PointLight(0xff5020, 0, 14, 1.5);
  private readonly lockBeacon: THREE.Mesh;
  private readonly streaks: THREE.InstancedMesh;
  private readonly streakT = new Float32Array(STREAKS);
  private readonly torches: THREE.PointLight[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private dark = 0;
  private flash = 0;
  private lastHp = -1;
  private rise = 1;
  private lastPhase = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly map: MapDef,
  ) {
    const bear = map.id === 'forest';
    const d = bear ? bearSitGeo() : shellGeo();
    const r = bear ? bearStandGeo() : robotGeo();
    if (bear) {
      lumGlow(this.glowMat);
      this.hullMat.metalness = 0.05;
      this.hullMat.roughness = 0.85;
      this.eyeLight.color.setHex(PINK);
    }
    const mk = (g: Geo, group: THREE.Group) => {
      const h = new THREE.Mesh(g.hull, this.hullMat);
      h.castShadow = true;
      group.add(h, new THREE.Mesh(g.glow, this.glowMat));
    };
    mk(d, this.disc);
    mk(r, this.robot);
    this.robot.visible = false;
    this.eyeLight.position.set(0, 4.5, 1.5);
    this.root.add(this.disc, this.robot, this.eyeLight);
    this.root.visible = false;
    scene.add(this.root);

    // Промені сітки: довгі пласкі бруски над підлогою, масштабуються під довжину хорди арени.
    const beamGeo = new THREE.BoxGeometry(1, 0.12, 1);
    for (let i = 0; i < GRID_POOL; i++) {
      const b = new THREE.Mesh(beamGeo, this.beamMat);
      b.visible = false;
      b.renderOrder = 3;
      scene.add(b);
      this.beams.push(b);
    }

    const zoneMat = () =>
      new THREE.MeshBasicMaterial({
        color: P.danger,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    this.zone = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2),
      zoneMat(),
    );
    this.zoneFill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      zoneMat(),
    );
    this.zone.position.y = 0.04;
    this.zoneFill.position.y = 0.035;
    this.zone.visible = this.zoneFill.visible = false;
    scene.add(this.zone, this.zoneFill);

    this.laser = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 1).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({
        color: P.danger,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.laser.visible = false;
    scene.add(this.laser);

    // Шлюз: маячок-сирена над дверима й потік «повітря» до них.
    this.lockBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6020).multiplyScalar(3) }),
    );
    this.lockBeacon.visible = false;
    scene.add(this.lockBeacon, this.lockLight);
    this.streaks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 0.06, 1.2),
      new THREE.MeshBasicMaterial({
        color: 0xcfe6ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      STREAKS,
    );
    this.streaks.frustumCulled = false;
    this.streaks.count = 0;
    scene.add(this.streaks);
    for (let i = 0; i < STREAKS; i++) this.streakT[i] = i / STREAKS;

    // Ліхтарі гравців: завжди в сцені (без перекомпіляції шейдерів), світять лише в темряві.
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xfff0dd, 0, CORE.darkRadius + 2, 1.6);
      l.position.y = 3;
      scene.add(l);
      this.torches.push(l);
    }
  }

  /** Наскільки темно (0..1) — арена гасить своє світло на цей коефіцієнт. */
  get darkness(): number {
    return this.dark;
  }

  /** Ядро на арені (реактор під ним ховається). */
  get present(): boolean {
    return this.root.visible;
  }

  update(boss: BossState, enemies: Enemy[], players: Player[], dt: number, time: number): void {
    const e = boss.index >= 0 ? enemies[boss.index] : undefined;
    const on = !!e && e.alive && e.type === 'core';
    this.root.visible = on;

    // Темрява наростає й спадає плавно: вимикання світла — подія, а не блимання.
    const wantDark = on && boss.phase === 1 ? 1 : 0;
    this.dark += (wantDark - this.dark) * Math.min(1, dt * (wantDark ? 1.2 : 2.5));
    for (let i = 0; i < this.torches.length; i++) {
      const p = players[i];
      const l = this.torches[i]!;
      if (!p || p.out) {
        l.intensity = 0;
        continue;
      }
      l.position.x = toX(p.x);
      l.position.z = toZ(p.y);
      l.intensity = 38 * this.dark;
    }

    if (!on) {
      this.hideAll();
      this.lastHp = -1;
      this.lastPhase = 0;
      return;
    }

    // Тіло: диск у фазах 1–2, робот у 3-й (виростає з підлоги за перехід).
    if (boss.phase !== this.lastPhase) {
      if (boss.phase === 3) this.rise = 0;
      this.lastPhase = boss.phase;
    }
    const robot = boss.phase === 3;
    this.disc.visible = !robot;
    this.robot.visible = robot;
    this.rise = Math.min(1, this.rise + dt / CORE.transition);
    const ease = 1 - (1 - this.rise) ** 3;
    this.robot.scale.set(1, 0.05 + 0.95 * ease, 1);
    this.root.position.set(toX(e.x), 0, toZ(e.y));
    // Повертається до цілі повільно — велике тіло.
    const want = Math.atan2(toX(e.fx), toZ(e.fy));
    const cur = this.root.rotation.y;
    let d = want - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // Диск — частина станції й дивиться в камеру; робот повертається до цілі.
    this.root.rotation.y = robot ? cur + d * Math.min(1, dt * 2) : 0;

    // По Ядру стріляють безперервно: спалах слабкий, інакше корпус постійно білий.
    if (this.lastHp >= 0 && e.hp < this.lastHp) this.flash = Math.min(1, this.flash + 0.35);
    this.lastHp = e.hp;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.hullMat.emissive.setRGB(
      0.04 + this.flash * 0.22,
      0.02 + this.flash * 0.06,
      0.02 + this.flash * 0.04,
    );
    // Перехід між фазами: тремтить, око б'ється.
    const trans = boss.transition > 0;
    this.root.position.x += trans ? Math.sin(time * 70) * 0.08 : 0;
    const charging = boss.attackState === 1 || boss.grid === 1 || boss.airlockState === 1 || trans;
    const pulse = 0.5 + 0.5 * Math.sin(time * (charging ? 22 : 3));
    this.glowMat.emissiveIntensity = (charging ? 5 : 2.5) + pulse * (charging ? 4 : 1.2);
    this.eyeLight.intensity = 10 + pulse * (charging ? 30 : 8);
    this.eyeLight.position.set(0, robot ? 4.75 * ease : 4.2, robot ? 3.5 : 3);

    this.updateGrid(boss, time);
    this.updateAirlock(boss, players, dt, time);
    this.updateAttack(boss, e, time);
  }

  private hideAll(): void {
    for (const b of this.beams) b.visible = false;
    this.zone.visible = this.zoneFill.visible = this.laser.visible = false;
    this.lockBeacon.visible = false;
    this.lockLight.intensity = 0;
    this.streaks.count = 0;
  }

  private updateGrid(boss: BossState, time: number): void {
    const R = this.map.radius;
    const show = boss.phase === 1 && boss.grid > 0;
    if (!show) {
      for (const b of this.beams) b.visible = false;
      return;
    }
    const nx = Math.cos(boss.gridAngle);
    const ny = Math.sin(boss.gridAngle);
    const sp = CORE.gridSpacing;
    const fire = boss.grid === 2;
    const warnP = fire ? 1 : boss.gridT / (CORE.gridWarn * 60);
    // Підсвічування: тонка лінія, що пульсує частіше ближче до удару; удар — повна ширина.
    const width = fire ? CORE.gridHalfWidth * 2 : 0.12 + warnP * 0.25;
    this.beamMat.opacity = fire
      ? 0.75
      : 0.35 + 0.45 * warnP * (0.6 + 0.4 * Math.sin(time * (12 + warnP * 40)));
    this.beamMat.color.setHex(fire ? 0xff7050 : P.danger);
    let n = 0;
    const k0 = Math.ceil((-R - boss.gridOffset) / sp);
    for (let k = k0; n < this.beams.length; k++) {
      const c = boss.gridOffset + k * sp;
      if (c > R) break;
      const half = Math.sqrt(Math.max(0, R * R - c * c));
      if (half < 1) continue;
      const b = this.beams[n++]!;
      b.visible = true;
      b.position.set(toX(nx * c), fire ? 0.3 : 0.06, toZ(ny * c));
      // Довга вісь бруска — уздовж променя (перпендикуляр до нормалі сітки).
      b.rotation.set(0, boss.gridAngle + Math.PI / 2, 0);
      b.scale.set(half * 2, fire ? 2.5 : 1, width);
    }
    for (; n < this.beams.length; n++) this.beams[n]!.visible = false;
  }

  private updateAirlock(boss: BossState, players: Player[], dt: number, time: number): void {
    const active = boss.phase === 2 && boss.airlock >= 0 && boss.airlockState > 0;
    this.lockBeacon.visible = active;
    if (!active) {
      this.lockLight.intensity = 0;
      this.streaks.count = 0;
      return;
    }
    const a = this.map.airlocks[boss.airlock]!;
    const l = Math.hypot(a.x, a.y) || 1;
    const ix = -a.x / l;
    const iy = -a.y / l;
    this.lockBeacon.position.set(toX(a.x + ix * 0.5), 3.4, toZ(a.y + iy * 0.5));
    this.lockLight.position.copy(this.lockBeacon.position);
    const strobe = Math.sin(time * (boss.airlockState === 1 ? 18 : 9)) > 0 ? 1 : 0.15;
    this.lockLight.intensity = 90 * strobe;
    this.lockBeacon.scale.setScalar(0.6 + strobe * 0.6);
    if (boss.airlockState !== 2) {
      this.streaks.count = 0;
      return;
    }
    // Потік: смужки летять від середини арени в шлюз, прискорюючись біля дверей.
    const len = 22;
    for (let i = 0; i < STREAKS; i++) {
      let t = this.streakT[i]! + dt * 0.7;
      if (t > 1) t -= 1;
      this.streakT[i] = t;
      const side = ((i * 7919) % 100) / 100 - 0.5;
      const along = len * (1 - t * t);
      const spread = side * (2 + along * 0.45);
      const x = a.x + ix * along - iy * spread;
      const y = a.y + iy * along + ix * spread;
      this.v.set(toX(x), 0.3 + (((i * 31) % 10) / 10) * 1.8, toZ(y));
      this.q.setFromAxisAngle(this.s.set(0, 1, 0), Math.atan2(toX(-ix), toZ(-iy)));
      this.m4.compose(this.v, this.q, this.s.set(1, 1, 0.6 + t * 2.2));
      this.streaks.setMatrixAt(i, this.m4);
    }
    this.s.set(1, 1, 1);
    this.streaks.count = STREAKS;
    this.streaks.instanceMatrix.needsUpdate = true;
    void players;
  }

  private updateAttack(boss: BossState, e: Enemy, time: number): void {
    // Зона удару: кран третьої фази або лапа Ведмедя в першій (ліс) — той самий стан.
    const winding = boss.phase > 0 && boss.attackState === 1;
    const crane = winding && boss.attack === CORE_CRANE;
    this.zone.visible = this.zoneFill.visible = crane;
    if (crane) {
      const z = coreZone(boss);
      const k = Math.min(1, boss.attackT / (z.warn * 60));
      const r = z.radius;
      this.zone.position.set(toX(boss.tx), 0.04, toZ(boss.ty));
      this.zoneFill.position.set(toX(boss.tx), 0.035, toZ(boss.ty));
      this.zone.scale.set(r, 1, r);
      this.zoneFill.scale.set(r * k, 1, r * k);
      (this.zone.material as THREE.MeshBasicMaterial).opacity =
        0.6 + 0.4 * Math.sin(time * (10 + k * 30));
      (this.zoneFill.material as THREE.MeshBasicMaterial).opacity = 0.18 + k * 0.3;
    }
    const laser = winding && boss.attack === CORE_LASER;
    this.laser.visible = laser;
    if (laser) {
      const k = Math.min(1, boss.attackT / (CORE.laserAim * 60));
      this.v.set(toX(e.x), 6.3, toZ(e.y));
      this.laser.position.copy(this.v);
      const tgt = new THREE.Vector3(toX(boss.tx), 0.9, toZ(boss.ty));
      this.laser.lookAt(tgt);
      this.laser.scale.set(1 + k, 1 + k, this.v.distanceTo(tgt));
      (this.laser.material as THREE.MeshBasicMaterial).opacity =
        0.3 + 0.6 * k * (0.6 + 0.4 * Math.sin(time * (15 + k * 50)));
    }
  }

  dispose(): void {
    this.scene.remove(this.root, this.zone, this.zoneFill, this.laser, this.lockBeacon);
    this.scene.remove(this.lockLight, this.streaks, ...this.beams, ...this.torches);
  }
}
