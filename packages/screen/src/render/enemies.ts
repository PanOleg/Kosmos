import * as THREE from 'three';
import { SCOUT_WINDUP, type Enemy, type EnemyType } from '@horizon/sim';
import { PALETTE } from './palette';
import { toX, toZ } from './coords';

/**
 * Вороги кутасті, теплих кольорів, з одним яскравим «оком» — протилежність округлим
 * світлим гравцям. Кожен вигляд — Group, яку легко замінити на glTF-модель.
 */
interface EnemyVisual {
  root: THREE.Group;
  body: THREE.Group;
  eye: THREE.MeshStandardMaterial;
  shell: THREE.MeshStandardMaterial;
  type: EnemyType;
  flash: number;
  spawnT: number;
}

const shellBase = new THREE.Color(PALETTE.enemy);

function buildScout(): EnemyVisual {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: PALETTE.enemy,
    roughness: 0.5,
    metalness: 0.4,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: PALETTE.enemyDark,
    roughness: 0.7,
    metalness: 0.5,
  });
  const eye = new THREE.MeshStandardMaterial({
    color: 0xffd0a0,
    emissive: 0xff5a1a,
    emissiveIntensity: 2,
  });

  // Пригнутий клин: гострий ніс уперед — читається напрям атаки.
  const torso = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 4), shell);
  torso.rotation.x = Math.PI / 2;
  torso.rotation.y = Math.PI / 4;
  torso.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.3), dark);
  head.position.set(0, 0.82, 0.25);
  const eyeM = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), eye);
  eyeM.position.set(0, 0.84, 0.41);
  const legGeo = new THREE.BoxGeometry(0.08, 0.6, 0.08);
  for (const [x, z] of [
    [0.25, 0.15],
    [-0.25, 0.15],
    [0.25, -0.25],
    [-0.25, -0.25],
  ] as const) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(x, 0.3, z);
    leg.rotation.z = x > 0 ? -0.35 : 0.35;
    body.add(leg);
  }
  const bladeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.55);
  const bl = new THREE.Mesh(bladeGeo, eye);
  bl.position.set(0.3, 0.65, 0.35);
  const br = bl.clone();
  br.position.x = -0.3;
  body.add(torso, head, eyeM, bl, br);
  body.traverse((o) => (o.castShadow = true));
  root.add(body);
  return { root, body, eye, shell, type: 'scout', flash: 0, spawnT: 0 };
}

function buildGunner(): EnemyVisual {
  const v = buildScout();
  v.type = 'gunner';
  v.root.scale.setScalar(1.25);
  return v;
}

export class EnemyRenderer {
  private readonly views: (EnemyVisual | null)[] = [];
  private readonly gens: number[] = [];
  private readonly windupRing: THREE.Mesh[] = [];

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
        v = e.type === 'scout' ? buildScout() : buildGunner();
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
      v.root.rotation.y = Math.atan2(toX(e.fx), toZ(e.fy));

      v.spawnT = Math.min(1, v.spawnT + dt * 4);
      const windup = e.type === 'scout' && e.ai === SCOUT_WINDUP;
      // Замах: присідання й розгорання ока — телеграф удару.
      const crouch = windup ? 0.75 : 1;
      const bob =
        Math.abs(Math.sin(time * 18 + i)) * 0.05 * Math.min(1, Math.hypot(e.vx, e.vy) / 3);
      v.body.scale.set(1, crouch * v.spawnT, 1);
      v.body.position.y = bob;
      v.eye.emissiveIntensity = windup ? 6 + Math.sin(time * 60) * 2 : 2;

      v.flash = Math.max(0, v.flash - dt * 10);
      v.shell.color.copy(shellBase).lerp(WHITE, v.flash);
      v.shell.emissive.setRGB(v.flash, v.flash, v.flash);
    }
  }
}

const WHITE = new THREE.Color(0xffffff);
