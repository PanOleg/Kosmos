import * as THREE from 'three';
import { ABILITIES, type Game, type GameEvent } from '@horizon/sim';
import type { Sfx } from '../audio/sfx';
import type { GameCamera } from './camera';
import type { ParticleSystem } from './particles';
import { classColor } from './palette';
import { toX, toZ } from './coords';

const ARC_POOL = 12;
const ARC_POINTS = 9;
const ARC_LIFE = 0.09;
const EMP_TIME = 0.35;

interface Arc {
  line: THREE.Line;
  life: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

interface BarrierView {
  root: THREE.Group;
  panel: THREE.MeshStandardMaterial;
  edge: THREE.MeshStandardMaterial;
  flash: number;
}

/**
 * Візуал здібностей класів. Стан (бар'єри, поле, глушіння) читається зі state щокадру,
 * миттєві ефекти (дуга, хвиля ЕМІ) — з подій. На симуляцію не впливає.
 */
export class AbilityRenderer {
  private readonly arcs: Arc[] = [];
  private nextArc = 0;
  private readonly barriers: BarrierView[] = [];
  private readonly heal: THREE.Mesh[] = [];
  private readonly emp: { mesh: THREE.Mesh; t: number }[] = [];
  private stunTick = 0;

  constructor(
    scene: THREE.Scene,
    private readonly sparks: ParticleSystem,
    private readonly sfx: Sfx,
    private readonly cam: GameCamera,
    players: number,
    barrierCapacity: number,
  ) {
    const techBlue = new THREE.Color(classColor('tech'))
      .lerp(new THREE.Color(0xffffff), 0.35)
      .multiplyScalar(3);
    for (let i = 0; i < ARC_POOL; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: techBlue,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.arcs.push({ line, life: 0, ax: 0, az: 0, bx: 0, bz: 0 });
    }
    for (let i = 0; i < barrierCapacity; i++) {
      const v = makeBarrier();
      scene.add(v.root);
      this.barriers.push(v);
    }
    const medic = new THREE.Color(classColor('medic'));
    for (let i = 0; i < players; i++) {
      const r = ABILITIES.healField.radius;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.12, r, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: medic.clone().multiplyScalar(1.6),
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: medic,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.add(fill);
      ring.position.y = 0.04;
      ring.visible = false;
      scene.add(ring);
      this.heal.push(ring);
    }
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: techBlue,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.position.y = 0.3;
      mesh.visible = false;
      scene.add(mesh);
      this.emp.push({ mesh, t: 1 });
    }
  }

  handle(e: GameEvent): void {
    const X = toX(e.x);
    const Z = toZ(e.y);
    switch (e.type) {
      case 'arc': {
        const a = this.arcs[this.nextArc]!;
        this.nextArc = (this.nextArc + 1) % ARC_POOL;
        a.ax = X;
        a.az = Z;
        a.bx = toX(e.x2);
        a.bz = toZ(e.y2);
        a.life = ARC_LIFE;
        this.sparks.burst(3, a.bx, 0.9, a.bz, 1, 0, 4, Math.PI * 2, 0.15, 0.12, 0x9fd0ff);
        if (e.b === 0) this.sfx.arc();
        break;
      }
      case 'ability':
        this.sfx.ability(e.b);
        if (e.b === 3) {
          // ЕМІ: ударна хвиля до радіуса дії.
          const w = this.emp.find((x) => x.t >= 1) ?? this.emp[0]!;
          w.t = 0;
          w.mesh.position.x = X;
          w.mesh.position.z = Z;
          w.mesh.visible = true;
          this.cam.shake(0.35);
          this.sparks.burst(30, X, 0.6, Z, 1, 0, 10, Math.PI * 2, 0.4, 0.2, 0x9fd0ff);
        } else if (e.b === 0) {
          this.sparks.burst(18, X, 1, Z, 1, 0, 6, Math.PI * 2, 0.3, 0.16, 0xffa040);
        } else if (e.b === 1) {
          // Щит-сфери: хвиля іскор до радіуса дії.
          this.sparks.burst(
            36,
            X,
            0.8,
            Z,
            1,
            0,
            e.value * 1.6,
            Math.PI * 2,
            0.45,
            0.2,
            classColor('engineer'),
          );
        } else if (e.b === 2) {
          this.sparks.burst(20, X, 0.4, Z, 1, 0, 5, Math.PI * 2, 0.5, 0.18, classColor('medic'));
        }
        break;
      case 'abilityEnd':
        if (e.b === 0) this.sfx.overheat();
        break;
      case 'barrierHit': {
        const v = this.barriers[this.barrierIndexAt(e.x, e.y)];
        if (v) v.flash = 1;
        this.sparks.burst(6, X, 1, Z, -e.y2, -e.x2, 5, 1.6, 0.18, 0.14, classColor('engineer'));
        this.sfx.barrierHit();
        break;
      }
      case 'barrierBreak':
        this.sparks.burst(24, X, 1, Z, 1, 0, 7, Math.PI * 2, 0.45, 0.18, classColor('engineer'));
        this.sfx.barrierBreak();
        break;
    }
  }

  private lastState: Game | null = null;

  private barrierIndexAt(x: number, y: number): number {
    const bs = this.lastState?.state.barriers;
    if (!bs) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  update(game: Game, dt: number, time: number): void {
    this.lastState = game;
    const s = game.state;

    for (const a of this.arcs) {
      if (a.life <= 0) {
        a.line.visible = false;
        continue;
      }
      a.life -= dt;
      a.line.visible = true;
      // Нова ламана щокадру: дуга «тріщить», а не висить статичною лінією.
      const pos = a.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const dx = a.bx - a.ax;
      const dz = a.bz - a.az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      for (let i = 0; i < ARC_POINTS; i++) {
        const t = i / (ARC_POINTS - 1);
        const jitter = i === 0 || i === ARC_POINTS - 1 ? 0 : (Math.random() - 0.5) * 0.5;
        pos.setXYZ(
          i,
          a.ax + dx * t + nx * jitter,
          0.9 + (Math.random() - 0.5) * 0.25 * Math.sin(t * Math.PI),
          a.az + dz * t + nz * jitter,
        );
      }
      pos.needsUpdate = true;
      (a.line.material as THREE.LineBasicMaterial).opacity = Math.min(1, a.life / ARC_LIFE + 0.3);
    }

    for (let i = 0; i < this.barriers.length; i++) {
      const v = this.barriers[i]!;
      const b = s.barriers[i];
      if (!b || !b.alive) {
        v.root.visible = false;
        continue;
      }
      v.root.visible = true;
      v.root.position.set(toX(b.x), 0, toZ(b.y));
      // Локальна вісь X площини — уздовж стіни (ux, uy) у координатах sim.
      v.root.rotation.y = Math.atan2(b.uy, b.ux);
      const health = b.hp / b.maxHp;
      const fading = Math.min(1, b.life / 60);
      v.flash = Math.max(0, v.flash - dt * 8);
      const flicker = health < 0.35 ? 0.7 + 0.3 * Math.sin(time * 40) : 1;
      v.panel.opacity = (0.16 + 0.22 * health + v.flash * 0.4) * fading * flicker;
      v.panel.emissiveIntensity = 0.6 + v.flash * 2;
      v.edge.emissiveIntensity = (1.4 + v.flash * 3) * fading;
    }

    for (let i = 0; i < this.heal.length; i++) {
      const ring = this.heal[i]!;
      const p = s.players[i];
      const on = !!p && p.classId === 'medic' && p.abilityT > 0 && !p.down;
      ring.visible = on;
      if (!on) continue;
      ring.position.x = toX(p.x);
      ring.position.z = toZ(p.y);
      const pulse = 1 + Math.sin(time * 6) * 0.02;
      ring.scale.set(pulse, 1, pulse);
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * ABILITIES.healField.radius;
        this.sparks.emit(
          toX(p.x) + Math.cos(a) * r,
          0.1,
          toZ(p.y) + Math.sin(a) * r,
          0,
          1.6,
          0,
          0.7,
          0.14,
          classColor('medic'),
        );
      }
    }

    for (const w of this.emp) {
      if (w.t >= 1) {
        w.mesh.visible = false;
        continue;
      }
      w.t = Math.min(1, w.t + dt / EMP_TIME);
      const r = ABILITIES.emp.radius * (0.15 + 0.85 * Math.sqrt(w.t));
      w.mesh.scale.set(r, 1, r);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - w.t;
    }

    // Заглушені: сині іскри над головою, як «зірочки» після удару.
    this.stunTick += dt;
    if (this.stunTick > 0.12) {
      this.stunTick = 0;
      for (const e of s.enemies)
        if (e.alive && e.stun > 0)
          this.sparks.emit(
            toX(e.x) + (Math.random() - 0.5) * 0.6,
            1.8,
            toZ(e.y) + (Math.random() - 0.5) * 0.6,
            0,
            1.2,
            0,
            0.3,
            0.1,
            0x9fd0ff,
          );
    }

    // Перевантаження: іскри від Штурмовика; перегрів — дим.
    for (const p of s.players) {
      if (p.classId !== 'assault' || p.down) continue;
      if (p.abilityT > 0 && Math.random() < 0.5)
        this.sparks.emit(
          toX(p.x + p.fx * 0.8),
          1.1,
          toZ(p.y + p.fy * 0.8),
          (Math.random() - 0.5) * 2,
          1.5,
          (Math.random() - 0.5) * 2,
          0.25,
          0.1,
          0xffa040,
        );
      if (p.overheatT > 0 && Math.random() < 0.4)
        this.sparks.emit(
          toX(p.x + p.fx * 0.6),
          1.2,
          toZ(p.y + p.fy * 0.6),
          0,
          1.4,
          0,
          0.6,
          0.22,
          0x3a3a3a,
        );
    }
  }
}

function makeBarrier(): BarrierView {
  const color = classColor('engineer');
  const L = ABILITIES.barrier.length;
  const H = 2;
  const root = new THREE.Group();
  const panel = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    map: honeycomb(),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, H), panel);
  wall.position.y = H / 2;
  root.add(wall);
  const edge = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 });
  for (const x of [-L / 2, L / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, H + 0.2, 0.12), edge);
    post.position.set(x, (H + 0.2) / 2, 0);
    root.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.06), edge);
  top.position.y = H;
  const bottom = top.clone();
  bottom.position.y = 0.05;
  root.add(top, bottom);
  root.visible = false;
  return { root, panel, edge, flash: 0 };
}

/** Стільники для бар'єра (як щит-соти на концепті Інженера). */
function honeycomb(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#606060';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#ffffff';
  x.lineWidth = 3;
  const r = 16;
  const h = r * Math.sqrt(3);
  for (let row = -1; row < 128 / h + 1; row++)
    for (let col = -1; col < 256 / (r * 1.5) + 1; col++) {
      const cx = col * r * 1.5;
      const cy = row * h + (col % 2 ? h / 2 : 0);
      x.beginPath();
      for (let k = 0; k < 6; k++)
        x.lineTo(cx + Math.cos((k * Math.PI) / 3) * r, cy + Math.sin((k * Math.PI) / 3) * r);
      x.closePath();
      x.stroke();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
