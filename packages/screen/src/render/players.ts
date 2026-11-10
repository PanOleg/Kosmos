import * as THREE from 'three';
import type { Player } from '@horizon/sim';
import { PALETTE } from './palette';
import { toX, toZ } from './coords';

/**
 * Силует гравця: широкі плечі, шолом з візором, рюкзак і кільце-маркер під ногами.
 * Вороги будуть кутастими й теплими — гравця впізнають за формою, а не лише кольором.
 */
export class PlayerView {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly visorMat: THREE.MeshStandardMaterial;
  private readonly suitMat: THREE.MeshStandardMaterial;
  private flash = 0;

  constructor(readonly slot: number) {
    const color = PALETTE.players[slot % PALETTE.players.length]!;
    this.suitMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde6,
      roughness: 0.5,
      metalness: 0.2,
    });
    const accent = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      emissive: color,
      emissiveIntensity: 0.35,
    });
    this.visorMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.6,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 4, 10), this.suitMat);
    torso.position.y = 0.75;
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.42), accent);
    shoulders.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), this.suitMat);
    head.position.y = 1.35;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), this.visorMat);
    visor.position.set(0, 1.37, 0.19);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.25), accent);
    pack.position.set(0, 0.85, -0.3);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x30343c, metalness: 0.7, roughness: 0.3 }),
    );
    gun.position.set(0.32, 0.85, 0.35);
    for (const m of [torso, shoulders, head, visor, pack, gun]) {
      m.castShadow = true;
      this.body.add(m);
    }
    this.root.add(this.body);
    // Візуально більший за хітбокс (0.5 м): з дивана на телевізорі інакше губиться.
    this.root.scale.setScalar(1.3);

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
    this.body.position.y = speed > 0.5 && !dashing ? Math.abs(Math.sin(time * 14)) * 0.06 : 0;
    this.body.scale.set(dashing ? 0.85 : 1, dashing ? 0.8 : 1, dashing ? 1.25 : 1);

    this.flash = Math.max(0, this.flash - dt * 6);
    this.suitMat.emissive.setRGB(this.flash, this.flash * 0.2, this.flash * 0.1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = p.dashCd > 0 ? 0.35 : 0.85;
    this.root.visible = true;
  }
}
