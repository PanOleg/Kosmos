import * as THREE from 'three';
import type { Rocket } from '@horizon/sim';
import { PALETTE } from './palette';
import { toX, toZ } from './coords';

interface RocketView {
  zone: THREE.Mesh;
  fill: THREE.Mesh;
  missile: THREE.Mesh;
}

/**
 * Ракети Панцира: зона удару на підлозі (контур + заливка, що росте до моменту удару)
 * і ракета по дузі від Панцира до цілі. «Зона удару підсвічується до атаки» (PROMPT).
 */
export class RocketRenderer {
  private readonly views: RocketView[] = [];

  constructor(scene: THREE.Scene, capacity: number) {
    const edgeGeo = new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
    const fillGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    const missileGeo = new THREE.ConeGeometry(0.14, 0.6, 6).rotateX(Math.PI / 2);
    const missileMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.enemyShot).multiplyScalar(2.5),
    });
    for (let i = 0; i < capacity; i++) {
      const zone = new THREE.Mesh(
        edgeGeo,
        new THREE.MeshBasicMaterial({
          color: PALETTE.danger,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const fill = new THREE.Mesh(
        fillGeo,
        new THREE.MeshBasicMaterial({
          color: PALETTE.danger,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const missile = new THREE.Mesh(missileGeo, missileMat);
      zone.position.y = 0.035;
      fill.position.y = 0.03;
      for (const m of [zone, fill, missile]) {
        m.visible = false;
        scene.add(m);
      }
      this.views.push({ zone, fill, missile });
    }
  }

  update(rockets: Rocket[], time: number): void {
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i]!;
      const r = rockets[i];
      const on = !!r && r.alive;
      v.zone.visible = v.fill.visible = v.missile.visible = on;
      if (!r || !on) continue;
      const prog = 1 - r.t / r.total;
      const X = toX(r.x);
      const Z = toZ(r.y);
      v.zone.position.x = v.fill.position.x = X;
      v.zone.position.z = v.fill.position.z = Z;
      v.zone.scale.set(r.radius, 1, r.radius);
      // Заливка росте від центру: коли дійде до краю — удар.
      const f = Math.max(0.05, prog) * r.radius;
      v.fill.scale.set(f, 1, f);
      (v.zone.material as THREE.MeshBasicMaterial).opacity =
        0.6 + 0.4 * Math.sin(time * (10 + prog * 30));
      // Ракета: дуга від Панцира до цілі, вище посередині.
      const fx = toX(r.fromX);
      const fz = toZ(r.fromY);
      const x = fx + (X - fx) * prog;
      const z = fz + (Z - fz) * prog;
      const y = 2.4 + Math.sin(prog * Math.PI) * 5 - prog * 2.2;
      const nx = fx + (X - fx) * Math.min(1, prog + 0.02);
      const nz = fz + (Z - fz) * Math.min(1, prog + 0.02);
      const ny =
        2.4 + Math.sin(Math.min(1, prog + 0.02) * Math.PI) * 5 - Math.min(1, prog + 0.02) * 2.2;
      v.missile.position.set(x, y, z);
      v.missile.lookAt(nx, ny, nz);
    }
  }
}
