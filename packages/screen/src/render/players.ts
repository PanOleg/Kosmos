import * as THREE from 'three';
import type { ClassId, Player } from '@horizon/sim';
import { PALETTE, classColor } from './palette';
import { BOX, CYL, SPHERE, merge, part, type Part } from './mesh';
import { models, type ModelInstance } from './models';
import { toX, toZ } from './coords';

/**
 * Силуети класів за концептами: темна броня, пластини й візор кольору класу.
 * Штурмовик — масивні наплічники й довга гвинтівка; Інженер — великий рюкзак-генератор;
 * Медик — стрункий, світлі пластини, пістолет; Технік — антена й довга дугова гармата.
 * Вороги натомість бліді з червоними очима: гравця видно за формою й кольором одночасно.
 */
function buildClass(classId: ClassId): {
  hull: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  muzzleZ: number;
} {
  const c = classColor(classId);
  const A = PALETTE.playerArmor;
  const L = PALETTE.playerArmorLight;
  const W = 0xdfe3ea;
  const slim = classId === 'medic' ? 0.85 : 1;
  const hull: Part[] = [
    // Ноги й таз.
    part(BOX, L, [0.14, 0.32, 0], [0.18 * slim, 0.62, 0.22]),
    part(BOX, L, [-0.14, 0.32, 0], [0.18 * slim, 0.62, 0.22]),
    part(BOX, c, [0.14, 0.42, 0.1], [0.16, 0.14, 0.06]),
    part(BOX, c, [-0.14, 0.42, 0.1], [0.16, 0.14, 0.06]),
    part(BOX, L, [0, 0.66, 0], [0.42 * slim, 0.16, 0.26]),
    // Торс у колір класу, як на концептах; темні лише суглоби й зброя.
    part(BOX, classId === 'medic' ? W : c, [0, 0.92, 0], [0.5 * slim, 0.42, 0.3]),
    part(BOX, classId === 'medic' ? c : A, [0, 0.95, 0.13], [0.3 * slim, 0.22, 0.06]),
    // Шолом.
    part(SPHERE, classId === 'medic' ? W : c, [0, 1.3, 0], [0.36, 0.34, 0.38]),
  ];
  const glow: Part[] = [part(BOX, 0xffffff, [0, 1.3, 0.17], [0.26, 0.08, 0.06])];
  let muzzleZ = 0.85;

  switch (classId) {
    case 'assault':
      hull.push(
        part(BOX, c, [0.36, 1.08, 0], [0.3, 0.22, 0.38], [0, 0, -0.25]),
        part(BOX, c, [-0.36, 1.08, 0], [0.3, 0.22, 0.38], [0, 0, 0.25]),
        part(BOX, A, [0.22, 0.86, 0.38], [0.14, 0.16, 0.95]),
        part(BOX, L, [0.22, 0.76, 0.2], [0.08, 0.14, 0.18]),
      );
      glow.push(part(BOX, 0xffffff, [0.29, 0.88, 0.5], [0.02, 0.04, 0.5]));
      muzzleZ = 0.9;
      break;
    case 'engineer':
      hull.push(
        part(BOX, c, [0.3, 1.06, 0], [0.22, 0.18, 0.32]),
        part(BOX, c, [-0.3, 1.06, 0], [0.22, 0.18, 0.32]),
        // Рюкзак-генератор щита.
        part(BOX, A, [0, 1.0, -0.32], [0.56, 0.62, 0.3]),
        part(CYL, c, [0, 1.05, -0.5], [0.5, 0.06, 0.5], [Math.PI / 2, 0, 0]),
        part(BOX, A, [0.22, 0.84, 0.3], [0.18, 0.18, 0.6]),
      );
      glow.push(part(CYL, 0xffffff, [0, 1.05, -0.54], [0.22, 0.04, 0.22], [Math.PI / 2, 0, 0]));
      muzzleZ = 0.62;
      break;
    case 'medic':
      hull.push(
        part(BOX, W, [0.24, 1.04, 0], [0.14, 0.14, 0.24]),
        part(BOX, W, [-0.24, 1.04, 0], [0.14, 0.14, 0.24]),
        part(BOX, A, [0.22, 0.88, 0.24], [0.08, 0.12, 0.3]),
        part(BOX, A, [0, 0.9, -0.22], [0.3, 0.34, 0.14]),
      );
      // Хрест на грудях.
      glow.push(
        part(BOX, 0xffffff, [0, 0.96, 0.18], [0.16, 0.05, 0.02]),
        part(BOX, 0xffffff, [0, 0.96, 0.18], [0.05, 0.16, 0.02]),
      );
      muzzleZ = 0.42;
      break;
    case 'tech':
      hull.push(
        part(BOX, c, [0.3, 1.06, 0], [0.22, 0.18, 0.32], [0, 0, -0.2]),
        part(BOX, c, [-0.3, 1.06, 0], [0.22, 0.18, 0.32], [0, 0, 0.2]),
        part(BOX, A, [0, 0.98, -0.26], [0.36, 0.44, 0.2]),
        part(CYL, L, [0.12, 1.5, -0.3], [0.03, 0.7, 0.03]),
        part(BOX, A, [0.22, 0.86, 0.4], [0.12, 0.14, 1.0]),
      );
      // Котушки дугової гармати.
      for (let i = 0; i < 3; i++)
        glow.push(part(BOX, 0xffffff, [0.22, 0.86, 0.3 + i * 0.22], [0.17, 0.17, 0.05]));
      muzzleZ = 0.95;
      break;
  }
  return { hull: merge(hull), glow: merge(glow), muzzleZ };
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
  private muzzleT = 0;
  private recoil = 0;
  private ringPulse = 0;
  private readonly muzzle: THREE.Mesh;
  private readonly model: ModelInstance | null;

  constructor(
    readonly slot: number,
    readonly classId: ClassId,
  ) {
    const color = classColor(classId);
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
    if (this.model) {
      // root масштабується на VISUAL_SCALE нижче, а висота з маніфесту — уже кінцева.
      this.model.root.scale.setScalar(1 / VISUAL_SCALE);
      this.body.add(this.model.root);
    } else {
      const hull = new THREE.Mesh(model.hull, this.suitMat);
      const glow = new THREE.Mesh(model.glow, this.visorMat);
      hull.castShadow = true;
      this.body.add(hull, glow);
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
    this.muzzle.position.set(0.22, 0.86, model.muzzleZ);
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
    (this.ring.material as THREE.MeshBasicMaterial).opacity = p.dashCd > 0 ? 0.35 : 0.85;
    // Підбір деталі: кільце коротко розширюється.
    this.ringPulse = Math.max(0, this.ringPulse - dt * 5);
    const rs = 1 + this.ringPulse * 0.6;
    this.ring.scale.set(rs, 1, rs);
    this.body.rotation.x = p.down ? -1.45 : 0;
    this.root.visible = true;
  }
}
