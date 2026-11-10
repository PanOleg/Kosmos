import * as THREE from 'three';
import {
  GUNNER,
  GUNNER_PEEK,
  GUNNER_OPEN,
  SCOUT,
  SCOUT_WINDUP,
  TICKS_PER_SEC,
  type Enemy,
  type EnemyType,
  type Player,
} from '@horizon/sim';
import { PALETTE } from './palette';
import { BOX, CONE4, SPHERE, merge, part } from './mesh';
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
  type: EnemyType;
  flash: number;
  spawnT: number;
}

const P = PALETTE;

// Скаут: двоногий, тонкий, з гострою головою й довгими лезами замість рук — біжить і ріже.
const scoutHull = merge([
  part(BOX, P.enemyDark, [0.16, 0.28, -0.04], [0.08, 0.5, 0.08], [0.35, 0, 0]),
  part(BOX, P.enemyDark, [-0.16, 0.28, -0.04], [0.08, 0.5, 0.08], [0.35, 0, 0]),
  part(BOX, P.enemy, [0.16, 0.5, 0.06], [0.12, 0.12, 0.18]),
  part(BOX, P.enemy, [-0.16, 0.5, 0.06], [0.12, 0.12, 0.18]),
  part(BOX, P.enemyMid, [0, 0.66, 0], [0.34, 0.2, 0.28]),
  part(CONE4, P.enemy, [0, 0.86, 0.05], [0.42, 0.34, 0.42], [0.3, Math.PI / 4, 0]),
  part(CONE4, P.enemy, [0, 1.12, 0.08], [0.2, 0.36, 0.22], [0.35, Math.PI / 4, 0]),
  part(BOX, P.enemyDark, [0.24, 0.84, 0.05], [0.07, 0.07, 0.3], [0.6, 0, 0]),
  part(BOX, P.enemyDark, [-0.24, 0.84, 0.05], [0.07, 0.07, 0.3], [0.6, 0, 0]),
  // Леза — світлі й довгі: саме їх видно в силуеті.
  part(BOX, P.enemy, [0.3, 0.62, 0.42], [0.04, 0.06, 0.75], [-0.35, 0.12, 0]),
  part(BOX, P.enemy, [-0.3, 0.62, 0.42], [0.04, 0.06, 0.75], [-0.35, -0.12, 0]),
]);
const scoutGlow = merge([
  part(BOX, 0xffffff, [0, 1.06, 0.2], [0.12, 0.05, 0.05]),
  part(BOX, 0xffffff, [0, 0.78, 0.18], [0.08, 0.08, 0.05]),
]);

// Стрілець: гуманоїд у світлій броні з бластером; присідає за укриттям.
const gunnerHull = merge([
  part(BOX, P.enemyDark, [0.14, 0.3, 0], [0.16, 0.6, 0.2]),
  part(BOX, P.enemyDark, [-0.14, 0.3, 0], [0.16, 0.6, 0.2]),
  part(BOX, P.enemy, [0.14, 0.42, 0.08], [0.17, 0.2, 0.08]),
  part(BOX, P.enemy, [-0.14, 0.42, 0.08], [0.17, 0.2, 0.08]),
  part(BOX, P.enemyMid, [0, 0.66, 0], [0.38, 0.14, 0.24]),
  part(BOX, P.enemy, [0, 0.92, 0], [0.48, 0.4, 0.3]),
  part(BOX, P.enemy, [0.32, 1.06, 0], [0.2, 0.16, 0.3]),
  part(BOX, P.enemy, [-0.32, 1.06, 0], [0.2, 0.16, 0.3]),
  part(SPHERE, P.enemy, [0, 1.28, 0.02], [0.3, 0.28, 0.3]),
  part(BOX, P.enemyDark, [0.2, 0.92, 0.36], [0.12, 0.16, 0.7]),
  part(BOX, P.enemyMid, [0.2, 1.0, 0.2], [0.08, 0.06, 0.3]),
]);
const gunnerGlow = merge([
  part(BOX, 0xffffff, [0, 1.28, 0.16], [0.1, 0.08, 0.04]),
  part(BOX, 0xffffff, [0.2, 0.92, 0.72], [0.09, 0.09, 0.03]),
]);

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
    emissiveIntensity: 2.5,
  });
  const hull = new THREE.Mesh(type === 'scout' ? scoutHull : gunnerHull, hullMat);
  const glow = new THREE.Mesh(type === 'scout' ? scoutGlow : gunnerGlow, glowMat);
  hull.castShadow = true;
  body.add(hull, glow);
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
  // Візуально більші за хітбокс, як і гравці: на телевізорі здалеку інакше губляться.
  body.scale.setScalar(type === 'scout' ? 1.35 : 1.45);
  return { root, body, hullMat, glowMat, ring, laser, type, flash: 0, spawnT: 0 };
}

const windupTicks = SCOUT.windup * TICKS_PER_SEC;
const peekTicks = Math.round(GUNNER.peek * TICKS_PER_SEC);
const aimTicks = Math.round(GUNNER.aim * TICKS_PER_SEC);

export class EnemyRenderer {
  private readonly views: (EnemyVisual | null)[] = [];
  private readonly gens: number[] = [];
  // Смужки здоров'я над пораненими ворогами (як на концепті hud.jpg): фон + заливка.
  private readonly barBg: THREE.InstancedMesh;
  private readonly barFill: THREE.InstancedMesh;
  private readonly m4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();

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
      const h = e.type === 'scout' ? 2.0 : 2.4;
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
      const crouch = windup ? 1 - prog * 0.3 : 1;
      const speed = Math.hypot(e.vx, e.vy);
      const bob = Math.abs(Math.sin(time * 18 + i)) * 0.05 * Math.min(1, speed / 3);
      const bs = v.type === 'scout' ? 1.35 : 1.45;
      v.body.scale.set(bs, bs * crouch * v.spawnT, bs);
      v.body.position.y = bob;
      v.glowMat.emissiveIntensity = windup ? 4 + prog * 8 : 2.5;
      v.ring.visible = windup;
      if (windup) {
        const s = 2.2 - prog * 0.9;
        v.ring.scale.set(s, 1, s);
        (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + prog * 0.6;
      }

      // Стрілець цілиться: від початку визирання до пострілу (або перед пострілом у відкритому бою).
      const aiming =
        e.type === 'gunner' &&
        ((e.ai === GUNNER_PEEK && e.aiT > peekTicks - aimTicks) ||
          (e.ai === GUNNER_OPEN && e.aiT <= aimTicks));
      const tp = aiming && e.target >= 0 ? players[e.target] : undefined;
      v.laser.visible = !!tp;
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
        v.glowMat.emissiveIntensity = 3 + prog * 8;
      }

      v.flash = Math.max(0, v.flash - dt * 12);
      // Влучання: броня спалахує червоно-білим (на блідій броні білий спалах губиться).
      v.hullMat.emissive.setRGB(0.06 + v.flash * 1.2, 0.04 + v.flash * 0.35, 0.04 + v.flash * 0.25);
    }
  }
}
