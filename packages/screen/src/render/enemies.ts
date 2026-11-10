import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SCOUT, SCOUT_WINDUP, TICKS_PER_SEC, type Enemy, type EnemyType } from '@horizon/sim';
import { PALETTE } from './palette';
import { toX, toZ } from './coords';

/**
 * Вороги кутасті, теплих кольорів, з яскравим «оком» — протилежність округлим світлим гравцям.
 * Корпус кожного типу злито в одну геометрію з вершинними кольорами: 2 draw call на ворога
 * (корпус + світні частини) замість десятка. Заміна на glTF — у build*().
 */
interface EnemyVisual {
  root: THREE.Group;
  body: THREE.Group;
  hullMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  type: EnemyType;
  flash: number;
  spawnT: number;
}

type Part = { geo: THREE.BufferGeometry; color: number; m: THREE.Matrix4 };

function part(
  geo: THREE.BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): Part {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return { geo, color, m };
}

function merge(parts: Part[]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const geos = parts.map((p) => {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m);
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    c.setHex(p.color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos)!;
}

const box = new THREE.BoxGeometry(1, 1, 1);
const cone4 = new THREE.ConeGeometry(0.5, 1, 4);

const scoutHull = merge([
  // Пригнутий клин: гострий ніс уперед — читається напрям атаки.
  part(cone4, PALETTE.enemy, 0, 0.6, 0, Math.PI / 2, Math.PI / 4, 0, 0.84, 1, 0.84),
  part(box, PALETTE.enemyDark, 0, 0.82, 0.25, 0, 0, 0, 0.34, 0.22, 0.3),
  part(box, PALETTE.enemyDark, 0.25, 0.3, 0.15, 0, 0, -0.35, 0.08, 0.6, 0.08),
  part(box, PALETTE.enemyDark, -0.25, 0.3, 0.15, 0, 0, 0.35, 0.08, 0.6, 0.08),
  part(box, PALETTE.enemyDark, 0.25, 0.3, -0.25, 0, 0, -0.35, 0.08, 0.6, 0.08),
  part(box, PALETTE.enemyDark, -0.25, 0.3, -0.25, 0, 0, 0.35, 0.08, 0.6, 0.08),
]);
const scoutGlow = merge([
  part(box, 0xffffff, 0, 0.84, 0.41, 0, 0, 0, 0.22, 0.06, 0.05),
  part(box, 0xffffff, 0.3, 0.65, 0.35, 0, 0, 0, 0.06, 0.06, 0.55),
  part(box, 0xffffff, -0.3, 0.65, 0.35, 0, 0, 0, 0.06, 0.06, 0.55),
]);

// Стрілець: ширший, з «гарматою»-плечем і щитком — заготовка до коміту 6.
const gunnerHull = merge([
  part(box, PALETTE.enemy, 0, 0.75, 0, 0, 0, 0, 0.8, 0.7, 0.55),
  part(box, PALETTE.enemyDark, 0, 1.22, 0.05, 0, 0, 0, 0.42, 0.3, 0.4),
  part(box, PALETTE.enemyDark, 0.48, 0.95, 0.25, 0, 0, 0, 0.18, 0.18, 0.9),
  part(box, PALETTE.enemyDark, 0.22, 0.25, 0, 0, 0, 0, 0.18, 0.5, 0.22),
  part(box, PALETTE.enemyDark, -0.22, 0.25, 0, 0, 0, 0, 0.18, 0.5, 0.22),
]);
const gunnerGlow = merge([
  part(box, 0xffffff, 0, 1.24, 0.26, 0, 0, 0, 0.3, 0.07, 0.04),
  part(box, 0xffffff, 0.48, 0.95, 0.71, 0, 0, 0, 0.12, 0.12, 0.04),
]);

const ringGeo = new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2);

function build(type: EnemyType): EnemyVisual {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.4,
    flatShading: true,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffd0a0,
    emissive: 0xff5a1a,
    emissiveIntensity: 2,
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
  return { root, body, hullMat, glowMat, ring, type, flash: 0, spawnT: 0 };
}

const windupTicks = SCOUT.windup * TICKS_PER_SEC;

export class EnemyRenderer {
  private readonly views: (EnemyVisual | null)[] = [];
  private readonly gens: number[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    capacity: number,
  ) {
    for (let i = 0; i < capacity; i++) {
      this.views.push(null);
      this.gens.push(-1);
    }
  }

  hit(index: number): void {
    const v = this.views[index];
    if (v) v.flash = 1;
  }

  update(enemies: Enemy[], alpha: number, dt: number, time: number): void {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      let v = this.views[i];
      if (!e.alive) {
        if (v) v.root.visible = false;
        continue;
      }
      if (!v || v.type !== e.type) {
        if (v) this.scene.remove(v.root);
        v = build(e.type);
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
      v.body.scale.set(1, crouch * v.spawnT, 1);
      v.body.position.y = bob;
      v.glowMat.emissiveIntensity = windup ? 4 + prog * 8 : 2;
      v.ring.visible = windup;
      if (windup) {
        const s = 2.2 - prog * 0.9;
        v.ring.scale.set(s, 1, s);
        (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + prog * 0.6;
      }

      v.flash = Math.max(0, v.flash - dt * 12);
      v.hullMat.emissive.setRGB(v.flash, v.flash * 0.9, v.flash * 0.8);
    }
  }
}
