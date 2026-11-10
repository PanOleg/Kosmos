import * as THREE from 'three';
import { TEAM_PLAYER, type ClassId, type Projectile } from '@horizon/sim';
import { PALETTE } from './palette';

/** Трасери за класом (концепт hud.jpg). Червоний — лише ворожий. */
const TRACER: Record<ClassId, number> = {
  assault: 0xffb050,
  engineer: 0xff9030,
  medic: 0xfff07a,
  tech: 0x7ab8ff,
};

/** Кулі двома InstancedMesh: свої й ворожі — різні кольори й форма, один draw call на команду. */
export class ProjectileRenderer {
  private readonly player: THREE.InstancedMesh;
  private readonly enemy: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 0, 1);
  private readonly dir = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene, capacity: number) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.player = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      capacity,
    );
    this.player.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    );
    // Ворожі — круглі «краплі», товстіші й повільніші: видно здалеку.
    this.enemy = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      // Ворожі кулі теж світяться в bloom: колір понад 1.
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.enemyShot).multiplyScalar(2) }),
      capacity,
    );
    for (const im of [this.player, this.enemy]) {
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
  }

  /** classes[slot] — клас власника кулі: трасер у тоні класу (усі теплі або сині — не червоні). */
  update(list: Projectile[], alpha: number, classes: readonly ClassId[]): void {
    let np = 0;
    let ne = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!;
      if (!b.alive) continue;
      const x = b.px + (b.x - b.px) * alpha;
      const y = b.py + (b.y - b.py) * alpha;
      // Кулі дронів і по дронах летять вище — на висоті польоту.
      this.p.set(x, b.air ? 2.2 : 0.9, -y);
      this.dir.set(b.vx, 0, -b.vy).normalize();
      this.q.setFromUnitVectors(this.up, this.dir);
      if (b.team === TEAM_PLAYER) {
        // Довгий трасер: довжина ~ відстань за кадр, щоб швидка куля не «мигала».
        this.s.set(0.13, 0.13, 1.4);
        this.m.compose(this.p, this.q, this.s);
        this.c.setHex(TRACER[classes[b.owner] ?? 'assault'] ?? PALETTE.playerShot);
        // Понад 1: трасер потрапляє в bloom і світиться, як на макеті.
        this.c.multiplyScalar(2.2);
        this.player.setColorAt(np, this.c);
        this.player.setMatrixAt(np++, this.m);
      } else {
        this.s.set(0.35, 0.35, 0.5);
        this.m.compose(this.p, this.q, this.s);
        this.enemy.setMatrixAt(ne++, this.m);
      }
    }
    this.player.count = np;
    this.enemy.count = ne;
    this.player.instanceMatrix.needsUpdate = true;
    if (this.player.instanceColor) this.player.instanceColor.needsUpdate = true;
    this.enemy.instanceMatrix.needsUpdate = true;
  }
}
