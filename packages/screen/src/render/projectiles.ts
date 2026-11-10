import * as THREE from 'three';
import { TEAM_PLAYER, type Projectile } from '@horizon/sim';
import { PALETTE } from './palette';

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

  constructor(scene: THREE.Scene, capacity: number) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.player = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: PALETTE.playerShot }),
      capacity,
    );
    // Ворожі — круглі «краплі», товстіші й повільніші: видно здалеку.
    this.enemy = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.enemyShot }),
      capacity,
    );
    for (const im of [this.player, this.enemy]) {
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
  }

  update(list: Projectile[], alpha: number): void {
    let np = 0;
    let ne = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!;
      if (!b.alive) continue;
      const x = b.px + (b.x - b.px) * alpha;
      const y = b.py + (b.y - b.py) * alpha;
      this.p.set(x, 0.9, -y);
      this.dir.set(b.vx, 0, -b.vy).normalize();
      this.q.setFromUnitVectors(this.up, this.dir);
      if (b.team === TEAM_PLAYER) {
        // Довгий трасер: довжина ~ відстань за кадр, щоб швидка куля не «мигала».
        this.s.set(0.13, 0.13, 1.4);
        this.m.compose(this.p, this.q, this.s);
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
    this.enemy.instanceMatrix.needsUpdate = true;
  }
}
