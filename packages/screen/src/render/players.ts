import * as THREE from 'three';
import type { ClassId, Player } from '@horizon/sim';
import { PALETTE, classColor } from './palette';
import { BOX, CYL, SPHERE, merge, part, seg, type Part } from './mesh';
import { models, type ModelInstance } from './models';
import { toX, toZ } from './coords';

/**
 * Силуети класів за концептами: темна броня, пластини й візор кольору класу.
 * Штурмовик — масивні наплічники й довга гвинтівка; Інженер — великий рюкзак-генератор;
 * Медик — стрункий, світлі пластини, пістолет; Технік — антена й довга дугова гармата.
 * Вороги натомість бліді з червоними очима: гравця видно за формою й кольором одночасно.
 */
type V3 = [number, number, number];

function buildClass(classId: ClassId): {
  hull: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  muzzle: V3;
} {
  // Пластини глибшого тону, ніж колір класу в інтерфейсі: на концептах броня насичена, але темна,
  // а більшу частину силуету займає чорний комбінезон.
  const c = new THREE.Color(classColor(classId)).multiplyScalar(0.6).getHex();
  const A = PALETTE.playerArmor;
  const L = PALETTE.playerArmorLight;
  const W = 0xdfe3ea;
  const medic = classId === 'medic';
  const plate = medic ? W : c;
  // Медик стрункіший, Інженер кремезніший.
  const k = medic ? 0.86 : classId === 'engineer' ? 1.12 : 1;
  const hull: Part[] = [];
  const glow: Part[] = [];

  // Ноги: стегно, гомілка зі щитком кольору класу, черевик.
  for (const sx of [1, -1]) {
    hull.push(
      seg(BOX, A, [0.13 * sx * k, 0.64, 0], [0.14 * sx * k, 0.35, 0.05], 0.17 * k, 0.2),
      seg(BOX, plate, [0.14 * sx * k, 0.36, 0.06], [0.14 * sx * k, 0.08, 0], 0.15 * k, 0.17),
      part(BOX, A, [0.14 * sx * k, 0.05, 0.05], [0.17 * k, 0.1, 0.28]),
      part(BOX, L, [0.14 * sx * k, 0.38, 0.13], [0.13, 0.1, 0.05]),
    );
  }
  // Таз, звужена талія, широкі груди (трапеція з двох брусків), шия, шолом.
  hull.push(
    part(BOX, A, [0, 0.67, 0], [0.38 * k, 0.16, 0.24]),
    part(BOX, A, [0, 0.83, 0], [0.34 * k, 0.2, 0.24]),
    part(BOX, A, [0, 1.01, 0.0], [0.52 * k, 0.28, 0.3]),
    part(BOX, plate, [0, 1.03, 0.14], [0.44 * k, 0.22, 0.06]),
    part(BOX, plate, [0, 1.03, -0.14], [0.4 * k, 0.2, 0.05]),
    part(BOX, A, [0, 1.17, 0], [0.14, 0.08, 0.14]),
    part(SPHERE, medic ? c : plate, [0, 1.31, 0.01], [0.32, 0.31, 0.34]),
    part(BOX, A, [0, 1.3, 0.12], [0.26, 0.12, 0.12]),
  );
  // Вузька щілина візора: з bloom широкий візор розпливається в кулю.
  glow.push(part(BOX, 0xffffff, [0, 1.31, 0.185], [0.2, 0.045, 0.02]));

  let muzzle: V3 = [0.1, 0.9, 0.95];
  const shoulderR: V3 = [0.33 * k, 1.07, 0];
  const shoulderL: V3 = [-0.33 * k, 1.07, 0];

  const twoHanded = (gripZ: number, foreZ: number) => {
    // Права рука на руків'ї, ліва — під цівкою: зброя перед грудьми, як на концептах.
    const elbowR: V3 = [0.34 * k, 0.86, 0.1];
    const elbowL: V3 = [-0.22 * k, 0.86, 0.2];
    hull.push(
      seg(BOX, A, shoulderR, elbowR, 0.13 * k),
      seg(BOX, plate, elbowR, [0.12, 0.88, gripZ], 0.12 * k),
      seg(BOX, A, shoulderL, elbowL, 0.13 * k),
      seg(BOX, plate, elbowL, [0.08, 0.86, foreZ], 0.12 * k),
    );
  };

  switch (classId) {
    case 'assault':
      hull.push(
        part(BOX, c, [0.38, 1.13, 0], [0.28, 0.2, 0.36], [0, 0, -0.32]),
        part(BOX, c, [-0.38, 1.13, 0], [0.28, 0.2, 0.36], [0, 0, 0.32]),
        part(BOX, A, [0.38, 1.2, 0.18], [0.16, 0.05, 0.02], [0, 0, -0.32]),
        // Імпульсна гвинтівка: довга, з магазином і стволом.
        part(BOX, A, [0.1, 0.9, 0.5], [0.11, 0.15, 0.8]),
        part(BOX, L, [0.1, 0.93, 0.98], [0.06, 0.06, 0.24]),
        part(BOX, A, [0.1, 0.78, 0.42], [0.07, 0.15, 0.1], [0.25, 0, 0]),
        part(BOX, A, [0.1, 0.92, 0.1], [0.09, 0.13, 0.22]),
      );
      glow.push(part(BOX, 0xffffff, [0.16, 0.92, 0.55], [0.012, 0.03, 0.6]));
      twoHanded(0.28, 0.6);
      muzzle = [0.1, 0.93, 1.12];
      break;
    case 'engineer':
      hull.push(
        part(BOX, c, [0.36, 1.1, 0], [0.24, 0.2, 0.34]),
        part(BOX, c, [-0.36, 1.1, 0], [0.24, 0.2, 0.34]),
        // Рюкзак-генератор вищий за плечі, з емблемою-шестернею.
        part(BOX, A, [0, 1.08, -0.32], [0.62, 0.78, 0.34]),
        part(BOX, c, [0, 1.45, -0.3], [0.5, 0.06, 0.28]),
        part(CYL, c, [0, 1.12, -0.5], [0.34, 0.05, 0.34], [Math.PI / 2, 0, 0]),
        // Короткий важкий дробовик.
        part(BOX, A, [0.1, 0.88, 0.42], [0.15, 0.17, 0.58]),
        part(BOX, L, [0.1, 0.9, 0.74], [0.11, 0.11, 0.1]),
      );
      glow.push(
        part(CYL, 0xffffff, [0, 1.12, -0.53], [0.16, 0.03, 0.16], [Math.PI / 2, 0, 0]),
        part(BOX, 0xffffff, [0.18, 0.92, 0.42], [0.012, 0.03, 0.4]),
      );
      twoHanded(0.22, 0.5);
      muzzle = [0.1, 0.9, 0.82];
      break;
    case 'medic': {
      hull.push(
        part(BOX, W, [0.27, 1.08, 0], [0.16, 0.14, 0.26]),
        part(BOX, W, [-0.27, 1.08, 0], [0.16, 0.14, 0.26]),
        part(BOX, A, [0, 0.98, -0.22], [0.32, 0.36, 0.14]),
        // Права рука витягнута вперед із пістолетом, ліва — вздовж тіла.
        seg(BOX, A, [0.28, 1.06, 0], [0.28, 1.02, 0.28], 0.11),
        seg(BOX, c, [0.28, 1.02, 0.28], [0.26, 1.0, 0.5], 0.1),
        part(BOX, A, [0.26, 1.02, 0.6], [0.07, 0.11, 0.22]),
        seg(BOX, A, [-0.28, 1.06, 0], [-0.3, 0.84, 0.04], 0.11),
        seg(BOX, c, [-0.3, 0.84, 0.04], [-0.3, 0.64, 0.08], 0.1),
      );
      glow.push(
        part(BOX, 0xffffff, [0, 1.03, 0.175], [0.09, 0.026, 0.01]),
        part(BOX, 0xffffff, [0, 1.03, 0.175], [0.026, 0.09, 0.01]),
      );
      muzzle = [0.26, 1.03, 0.74];
      break;
    }
    case 'tech':
      hull.push(
        part(BOX, c, [0.34, 1.1, 0], [0.22, 0.18, 0.32], [0, 0, -0.2]),
        part(BOX, c, [-0.34, 1.1, 0], [0.22, 0.18, 0.32], [0, 0, 0.2]),
        part(BOX, A, [0, 1.0, -0.26], [0.38, 0.46, 0.2]),
        seg(CYL, L, [0.12, 1.2, -0.3], [0.16, 1.95, -0.36], 0.035),
        part(SPHERE, L, [0.16, 1.96, -0.36], [0.07, 0.07, 0.07]),
        // Довга дугова гармата.
        part(BOX, A, [0.1, 0.9, 0.58], [0.11, 0.14, 1.05]),
        part(BOX, L, [0.1, 0.9, 1.14], [0.05, 0.05, 0.12]),
      );
      // Три котушки світяться кольором класу.
      for (let i = 0; i < 3; i++)
        glow.push(part(BOX, 0xffffff, [0.1, 0.9, 0.5 + i * 0.2], [0.17, 0.2, 0.05]));
      twoHanded(0.25, 0.72);
      muzzle = [0.1, 0.9, 1.22];
      break;
  }
  return { hull: merge(hull), glow: merge(glow), muzzle };
}

/** Візуально більший за хітбокс (0.5 м): з дивана на телевізорі інакше губиться. */
const VISUAL_SCALE = 1.35;

const modelCache = new Map<ClassId, ReturnType<typeof buildClass>>();

export class PlayerView {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly visorMat: THREE.MeshStandardMaterial;
  private readonly suitMat: THREE.MeshStandardMaterial;
  private flash = 0;
  private readonly ringColor: number;
  private muzzleT = 0;
  private recoil = 0;
  private ringPulse = 0;
  private readonly muzzle: THREE.Mesh;
  private readonly model: ModelInstance | null;
  /** Лікувальний дрон Медика: кружляє біля плеча (концепт classes.jpg). */
  private drone: THREE.Object3D | null = null;
  /** Ноги статичної моделі на шарнірі в стегні: код крокує ними на бігу. */
  private readonly legs: THREE.Object3D[] = [];
  private stride = 0;

  constructor(
    readonly slot: number,
    readonly classId: ClassId,
  ) {
    const color = classColor(classId);
    this.ringColor = color;
    let model = modelCache.get(classId);
    if (!model) {
      model = buildClass(classId);
      modelCache.set(classId, model);
    }
    this.suitMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.35,
      flatShading: true,
    });
    this.visorMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      // Помірно: з bloom яскравіший візор розпливається в кулю й ховає шолом.
      emissiveIntensity: 1.2,
    });
    // Готова glTF-модель класу, якщо є (docs/models/README.md); інакше — примітиви.
    this.model = models.instantiate(classId);
    const parts = models.staticParts(classId);
    let muzzle: V3 = model.muzzle;
    if (parts) {
      // Статична модель з Blender (docs/models/players.py): тіло, візор, дві ноги окремо.
      for (const m of parts.meshes) {
        const mesh = new THREE.Mesh(m.geometry, m.glow ? this.visorMat : this.suitMat);
        mesh.castShadow = !m.glow;
        if (/leg/i.test(m.name)) {
          // Шарнір — верх ноги (стегно): геометрію зсуваємо так, щоб він був у початку координат.
          m.geometry.computeBoundingBox();
          const b = m.geometry.boundingBox!;
          const pivot = new THREE.Group();
          pivot.position.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
          mesh.position.copy(pivot.position).negate();
          pivot.add(mesh);
          this.legs.push(pivot);
          this.body.add(pivot);
        } else this.body.add(mesh);
      }
      if (parts.entry.muzzle) muzzle = parts.entry.muzzle;
      if (classId === 'engineer') this.body.add(hexShield(color));
      if (classId === 'medic') {
        this.drone = medicDrone(color);
        this.drone.position.set(0.55, 1.45, -0.1);
        this.body.add(this.drone);
      }
    } else if (this.model) {
      // root масштабується на VISUAL_SCALE нижче, а висота з маніфесту — уже кінцева.
      this.model.root.scale.setScalar(1 / VISUAL_SCALE);
      this.body.add(this.model.root);
    } else {
      const hull = new THREE.Mesh(model.hull, this.suitMat);
      const glow = new THREE.Mesh(model.glow, this.visorMat);
      hull.castShadow = true;
      this.body.add(hull, glow);
      if (classId === 'engineer') this.body.add(hexShield(color));
      if (classId === 'medic') {
        this.drone = medicDrone(color);
        this.drone.position.set(0.55, 1.45, -0.1);
        this.body.add(this.drone);
      }
    }

    // Спалах пострілу: два схрещені квадрати, видно з будь-якого кута камери.
    const mGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const mMat = new THREE.MeshBasicMaterial({
      color: PALETTE.playerShot,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.muzzle = new THREE.Mesh(mGeo, mMat);
    const m2 = new THREE.Mesh(mGeo, mMat);
    m2.rotation.y = Math.PI / 2;
    this.muzzle.add(m2);
    this.muzzle.position.set(...muzzle);
    this.muzzle.visible = false;
    this.body.add(this.muzzle);
    this.root.add(this.body);
    // Візуально більший за хітбокс (0.5 м): з дивана на телевізорі інакше губиться.
    this.root.scale.setScalar(VISUAL_SCALE);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    this.ring.position.y = 0.02;
    this.root.add(this.ring);
  }

  hitFlash(): void {
    this.flash = 1;
  }

  pickupFlash(): void {
    this.ringPulse = 1;
  }

  fire(): void {
    this.muzzleT = 0.05;
    this.recoil = 1;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.6;
    this.muzzle.scale.set(s, s, s);
  }

  update(p: Player, alpha: number, dt: number, time: number): void {
    const x = p.px + (p.x - p.px) * alpha;
    const y = p.py + (p.y - p.py) * alpha;
    this.root.position.set(toX(x), 0, toZ(y));
    // У three обертання навколо Y: кут 0 = дивиться на +Z, тож переводимо напрям sim.
    const targetYaw = Math.atan2(toX(p.fx), toZ(p.fy));
    let d = targetYaw - this.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.body.rotation.y += d * Math.min(1, dt * 20);

    const speed = Math.hypot(p.vx, p.vy);
    const dashing = p.dashT > 0;
    // Нахил у бік руху й легке підстрибування кроку.
    this.body.position.set(
      0,
      speed > 0.5 && !dashing ? Math.abs(Math.sin(time * 14)) * 0.06 : 0,
      0,
    );
    this.body.scale.set(dashing ? 0.85 : 1, dashing ? 0.8 : 1, dashing ? 1.25 : 1);

    this.muzzleT -= dt;
    this.muzzle.visible = this.muzzleT > 0;
    this.recoil = Math.max(0, this.recoil - dt * 14);
    // Віддача: корпус на мить відсувається назад від напрямку стрільби.
    this.body.position.z = 0;
    this.body.translateZ(-this.recoil * 0.12);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.suitMat.emissive.setRGB(this.flash, this.flash, this.flash);
    if (this.model) {
      this.model.flash(this.flash);
      this.model.play(
        p.down
          ? 'down'
          : dashing
            ? 'dash'
            : speed > 0.5
              ? 'run'
              : this.muzzleT > -0.3
                ? 'shoot'
                : 'idle',
      );
      this.model.update(dt);
    }
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    // Упалий: кільце червоне й пульсує — «підійди й підніми».
    if (p.down) {
      ringMat.color.setHex(0xff3a2a);
      ringMat.opacity = 0.5 + 0.4 * Math.sin(time * 8);
    } else {
      ringMat.color.setHex(this.ringColor);
      ringMat.opacity = p.dashCd > 0 ? 0.35 : 0.85;
    }
    // Підбір деталі: кільце коротко розширюється.
    this.ringPulse = Math.max(0, this.ringPulse - dt * 5);
    const rs = 1 + this.ringPulse * 0.6;
    this.ring.scale.set(rs, 1, rs);
    this.body.rotation.x = p.down ? -1.45 : 0;
    // Крок: ноги розгойдуються в протифазі, частота й розмах ростуть зі швидкістю.
    if (this.legs.length) {
      const run = !p.down && !dashing ? Math.min(1, speed / 5) : 0;
      this.stride += dt * (6 + speed * 1.6) * (run > 0.05 ? 1 : 0);
      const swing = Math.sin(this.stride) * 0.6 * run;
      for (let i = 0; i < this.legs.length; i++)
        this.legs[i]!.rotation.x = i % 2 === 0 ? swing : -swing;
    }
    // Вибулий до наступної хвилі зникає з арени.
    this.root.visible = !p.out;
    if (this.drone) {
      const a = time * 1.6;
      this.drone.position.set(
        0.55 + Math.cos(a) * 0.12,
        1.45 + Math.sin(time * 3) * 0.06,
        -0.1 + Math.sin(a) * 0.12,
      );
      this.drone.rotation.y = time * 2;
    }
  }
}

/** Напівпрозорий шестикутний щит-соти за спиною Інженера; та сама форма згодом стане бар'єром. */
function hexShield(color: number): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edge = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
  const hex = new THREE.CircleGeometry(0.16, 6);
  // Стільники: центральна комірка й кільце з шести навколо.
  const cells: [number, number][] = [[0, 0]];
  for (let i = 0; i < 6; i++)
    cells.push([
      Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 0.3,
      Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 0.3,
    ]);
  for (const [x, y] of cells) {
    const m = new THREE.Mesh(hex, mat);
    m.position.set(x, y, 0);
    m.rotation.z = Math.PI / 6;
    const e = new THREE.LineLoop(new THREE.EdgesGeometry(hex), edge);
    e.position.copy(m.position);
    e.rotation.z = Math.PI / 6;
    g.add(m, e);
  }
  g.position.set(0, 1.15, -0.55);
  return g;
}

function medicDrone(color: number): THREE.Object3D {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.03, 6, 16).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2b2f37, metalness: 0.6, roughness: 0.4 }),
    ),
  );
  const glowMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.6,
  });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), glowMat));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), glowMat));
  return g;
}
