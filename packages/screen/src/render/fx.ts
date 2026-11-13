import * as THREE from 'three';
import type { Game, GameEvent } from '@horizon/sim';
import type { Sfx } from '../audio/sfx';
import type { GameCamera } from './camera';
import type { EnemyRenderer } from './enemies';
import { ParticleSystem } from './particles';
import { PALETTE, classColor } from './palette';
import type { PlayerView } from './players';
import { toX, toZ } from './coords';

/** Сила ефектів в одному місці — найшвидший спосіб крутити відчуття. */
const FEEL = {
  shotShake: 0.025,
  hitShake: 0.03,
  killShake: 0.16,
  playerHitShake: 0.45,
  killHitStop: 0.055,
  maxHitStop: 0.1,
  playerHitStop: 0.08,
};

/**
 * Переводить події симуляції у зворотний зв'язок: частинки, спалахи, звук, тремтіння, хіт-стоп.
 * Логіка гри від цього не залежить: усе тут косметика й може відставати чи пропускати.
 */
export class FxDirector {
  readonly sparks: ParticleSystem;
  readonly debris: ParticleSystem;
  /** Секунди, протягом яких симуляція стоїть (рендер і частинки йдуть далі). */
  hitStop = 0;
  private readonly vignette: HTMLDivElement;
  private vignetteA = 0;
  private readonly dashTrail: number[] = [0, 0, 0, 0];
  private readonly flashLight: THREE.PointLight;
  private flashT = 0;
  private pickupCombo = 0;
  private lastPickup = 0;

  constructor(
    scene: THREE.Scene,
    private readonly cam: GameCamera,
    private readonly sfx: Sfx,
    private readonly players: PlayerView[],
    private readonly enemies: EnemyRenderer,
  ) {
    this.sparks = new ParticleSystem(scene, 1200, {
      additive: true,
      gravity: 6,
      drag: 3,
      bounce: false,
    });
    this.debris = new ParticleSystem(scene, 600, {
      additive: false,
      gravity: 22,
      drag: 0.6,
      bounce: true,
    });
    this.vignette = document.createElement('div');
    Object.assign(this.vignette.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      background:
        'radial-gradient(ellipse at center, rgba(255,0,0,0) 45%, rgba(255,20,10,0.75) 100%)',
      opacity: '0',
      zIndex: '5',
    });
    document.body.appendChild(this.vignette);
    // Одне спільне джерело світла для вибухів: дешевше за світло на кожен спалах.
    this.flashLight = new THREE.PointLight(0xffaa66, 0, 10, 2);
    this.flashLight.position.y = 1.5;
    scene.add(this.flashLight);
  }

  private pan(x: number): number {
    // Грубе панорамування за X світу відносно камери.
    return Math.max(-0.8, Math.min(0.8, (toX(x) - this.cam.camera.position.x) / 25));
  }

  handle(e: GameEvent): void {
    const X = toX(e.x);
    const Z = toZ(e.y);
    switch (e.type) {
      case 'shot': {
        this.players[e.a]?.fire();
        this.sfx.shot(e.a, this.pan(e.x));
        this.cam.shake(FEEL.shotShake);
        // Гільза-іскра вбік.
        this.sparks.burst(2, X, 0.9, Z, e.x2, -e.y2, 6, 0.8, 0.08, 0.12, PALETTE.playerShot);
        break;
      }
      case 'hit': {
        this.enemies.hit(e.a);
        this.sfx.hit(this.pan(e.x));
        this.cam.shake(FEEL.hitShake);
        // Іскри летять далі за напрямком кулі.
        this.sparks.burst(6, X, 0.8, Z, e.x2, -e.y2, 9, 1.4, 0.18, 0.14, 0xfff2c0);
        break;
      }
      case 'kill': {
        this.sfx.kill(this.pan(e.x));
        this.cam.shake(FEEL.killShake);
        this.hitStop = Math.min(FEEL.maxHitStop, this.hitStop + FEEL.killHitStop);
        this.sparks.burst(22, X, 0.7, Z, 1, 0, 12, Math.PI * 2, 0.35, 0.22, PALETTE.enemyEye);
        this.sparks.burst(10, X, 0.7, Z, 1, 0, 5, Math.PI * 2, 0.5, 0.35, PALETTE.workLight);
        this.debris.burst(
          9,
          X,
          0.7,
          Z,
          e.x2 || 1,
          -(e.y2 || 0),
          7,
          Math.PI * 1.6,
          1.6,
          0.18,
          PALETTE.enemy,
        );
        this.debris.burst(5, X, 0.7, Z, 1, 0, 6, Math.PI * 2, 1.4, 0.12, PALETTE.enemyDark);
        this.flashLight.position.x = X;
        this.flashLight.position.z = Z;
        this.flashT = 0.12;
        break;
      }
      case 'impact': {
        this.sparks.burst(
          4,
          X,
          0.9,
          Z,
          -e.x2,
          e.y2,
          5,
          1.6,
          0.12,
          0.1,
          e.a === 0 ? PALETTE.playerShot : PALETTE.enemyShot,
        );
        if (Math.random() < 0.3) this.sfx.wallImpact(this.pan(e.x));
        break;
      }
      case 'enemyWindup':
        // b: 0 Скаут, 2 Стрілець, 3 Камікадзе, 4 Оса, 5 Снайпер.
        if (e.b === 3) this.sfx.kamikazeArm(this.pan(e.x));
        else if (e.b === 5) this.sfx.sniperCharge(this.pan(e.x));
        else this.sfx.windup(this.pan(e.x));
        break;
      case 'explosion': {
        this.sfx.explosion(this.pan(e.x));
        this.cam.shake(0.55);
        this.hitStop = Math.max(this.hitStop, 0.05);
        this.sparks.burst(40, X, 1, Z, 1, 0, 14, Math.PI * 2, 0.45, 0.3, 0xffb050);
        this.sparks.burst(20, X, 0.6, Z, 1, 0, 6, Math.PI * 2, 0.8, 0.5, 0xff3a1a);
        this.debris.burst(10, X, 1.2, Z, 1, 0, 8, Math.PI * 2, 1.4, 0.16, PALETTE.enemyDark);
        this.flashLight.position.x = X;
        this.flashLight.position.z = Z;
        this.flashT = 0.2;
        break;
      }
      case 'rocketHit': {
        this.sfx.explosion(this.pan(e.x));
        this.cam.shake(0.4);
        this.sparks.burst(30, X, 0.6, Z, 1, 0, 11, Math.PI * 2, 0.4, 0.3, 0xffb050);
        this.sparks.burst(16, X, 0.3, Z, 1, 0, 5, Math.PI * 2, 0.7, 0.45, 0xff3a1a);
        this.flashLight.position.x = X;
        this.flashLight.position.z = Z;
        this.flashT = 0.18;
        break;
      }
      case 'rocket':
        this.sfx.rocketLaunch(this.pan(e.x));
        break;
      case 'weakHit': {
        // Слабке місце: великий помаранчевий спалах і окремий звук — «саме так і треба».
        this.enemies.hit(e.a);
        this.sfx.weakHit(this.pan(e.x));
        this.cam.shake(0.06);
        this.sparks.burst(12, X, 1.2, Z, e.x2, -e.y2, 11, 1.2, 0.25, 0.2, 0xffa030);
        break;
      }
      case 'craneWarn':
        this.sfx.craneWarn(this.pan(e.x));
        break;
      case 'craneHit': {
        this.sfx.craneHit(this.pan(e.x));
        this.cam.shake(0.7);
        this.hitStop = Math.max(this.hitStop, 0.06);
        this.debris.burst(16, X, 0.3, Z, 1, 0, 7, Math.PI * 2, 1.2, 0.2, 0x6a6058);
        this.sparks.burst(24, X, 0.3, Z, 1, 0, 9, Math.PI * 2, 0.35, 0.25, 0xffb050);
        this.flashLight.position.x = X;
        this.flashLight.position.z = Z;
        this.flashT = 0.15;
        break;
      }
      case 'bossPhase':
        this.sfx.bossPhase();
        this.cam.shake(0.9);
        this.hitStop = Math.max(this.hitStop, 0.12);
        this.sparks.burst(50, X, 4, Z, 1, 0, 12, Math.PI * 2, 0.7, 0.35, 0xff5a3a);
        this.flashLight.position.x = X;
        this.flashLight.position.z = Z;
        this.flashT = 0.3;
        break;
      case 'gridWarn':
        this.sfx.gridWarn();
        break;
      case 'gridFire':
        this.sfx.gridFire();
        this.cam.shake(0.35);
        break;
      case 'airlockWarn':
        this.sfx.airlockWarn(this.pan(e.x));
        break;
      case 'airlockOpen':
        this.sfx.airlockOpen(this.pan(e.x));
        this.cam.shake(0.3);
        break;
      case 'airlockClose':
        this.sfx.airlockClose(this.pan(e.x));
        break;
      case 'sucked':
        this.sfx.sucked(this.pan(e.x));
        this.sparks.burst(16, X, 1, Z, toX(e.x2) - X, toZ(e.y2) - Z, 9, 0.8, 0.4, 0.2, 0xcfe6ff);
        break;
      case 'propPlaced':
        this.sfx.propPlaced(this.pan(e.x));
        this.sparks.burst(14, X, 0.2, Z, 1, 0, 5, Math.PI * 2, 0.3, 0.15, 0xffd070);
        break;
      case 'propGone':
        this.debris.burst(8, X, 0.6, Z, 1, 0, 4, Math.PI * 2, 1, 0.16, 0x8a7a68);
        break;
      case 'bossDown': {
        this.sfx.bossDown();
        this.cam.shake(1);
        this.hitStop = Math.max(this.hitStop, 0.15);
        this.sparks.burst(60, X, 1.5, Z, 1, 0, 16, Math.PI * 2, 0.6, 0.35, 0xffb050);
        this.debris.burst(20, X, 1.5, Z, 1, 0, 9, Math.PI * 2, 1.8, 0.25, 0xe8b020);
        this.flashLight.position.x = X;
        this.flashLight.position.z = Z;
        this.flashT = 0.3;
        break;
      }
      case 'spiderJump':
        this.sfx.spiderJump(this.pan(e.x));
        break;
      case 'shieldUp':
        this.sfx.shieldUp(this.pan(e.x));
        this.sparks.burst(14, X, 1.6, Z, 1, 0, 4, Math.PI * 2, 0.4, 0.16, 0x6aa0ff);
        break;
      case 'shieldBreak':
        this.sfx.barrierBreak();
        this.sparks.burst(20, X, 1.6, Z, 1, 0, 7, Math.PI * 2, 0.4, 0.16, 0x6aa0ff);
        break;
      case 'armor':
        // Куля відскочила від лобової броні: біла іскра й дзвін — «стріляй збоку».
        this.sparks.burst(5, X, 1.8, Z, e.x2, -e.y2, 8, 1.2, 0.15, 0.12, 0xffffff);
        this.sfx.ricochet(this.pan(e.x));
        break;
      case 'enemyShot':
        if (e.b === 2) this.sfx.sniperShot(this.pan(e.x));
        else this.sfx.enemyShot(this.pan(e.x));
        this.sparks.burst(
          6,
          X + e.x2 * 0.7,
          1.1,
          Z - e.y2 * 0.7,
          e.x2,
          -e.y2,
          7,
          0.7,
          0.12,
          0.2,
          PALETTE.enemyShot,
        );
        break;
      case 'enemyAttack':
        this.sfx.enemyAttack(this.pan(e.x));
        this.sparks.burst(
          5,
          X + e.x2 * 0.8,
          0.7,
          Z - e.y2 * 0.8,
          e.x2,
          -e.y2,
          6,
          1,
          0.12,
          0.15,
          PALETTE.danger,
        );
        break;
      case 'playerHit': {
        this.players[e.a]?.hitFlash();
        this.sfx.playerHit();
        this.cam.shake(FEEL.playerHitShake);
        this.hitStop = Math.max(this.hitStop, FEEL.playerHitStop);
        this.vignetteA = Math.min(1, this.vignetteA + 0.6);
        this.sparks.burst(10, X, 1, Z, X - toX(e.x2), Z - toZ(e.y2), 7, 1.5, 0.25, 0.15, 0xff3020);
        break;
      }
      case 'armorBlock':
        // Броня Малюка або щит-сфера Інженера: сфера спалахує, іскри її кольору;
        // без тряски й червоного екрана.
        this.players[e.a]?.hitFlash();
        this.sparks.burst(
          8,
          X,
          1,
          Z,
          X - toX(e.x2),
          Z - toZ(e.y2),
          5,
          1.5,
          0.25,
          0.12,
          e.b === 1 ? 0xffb060 : 0xd9a6ff,
        );
        if (e.b === 1) this.sfx.barrierHit();
        break;
      case 'revived':
        this.sfx.revive();
        this.sparks.burst(30, X, 0.5, Z, 1, 0, 6, Math.PI * 2, 0.7, 0.2, 0x6aff8a);
        this.players[e.a]?.hitFlash();
        break;
      case 'reviveStart':
        this.sfx.reviveStart();
        break;
      case 'bleedOut':
        this.sfx.playerDown();
        this.sparks.burst(16, X, 0.6, Z, 1, 0, 3, Math.PI * 2, 0.8, 0.2, 0x5a5a5a);
        break;
      case 'playerReturn':
        this.sparks.burst(24, X, 0.4, Z, 1, 0, 5, Math.PI * 2, 0.6, 0.22, PALETTE.workLight);
        break;
      case 'playerDown':
        this.sfx.playerDown();
        this.cam.shake(0.6);
        this.vignetteA = 1;
        break;
      case 'dash':
        this.sfx.dash();
        this.dashTrail[e.a] = 0.22;
        break;
      case 'pickup': {
        // Комбо: швидкі підбори підіймають тон.
        const now = performance.now();
        this.pickupCombo = now - this.lastPickup < 600 ? this.pickupCombo + 1 : 0;
        this.lastPickup = now;
        this.sfx.pickup(this.pan(e.x), this.pickupCombo);
        this.sparks.burst(8, X, 0.7, Z, 1, 0, 4, Math.PI * 2, 0.3, 0.16, PALETTE.part);
        this.players[e.a]?.pickupFlash();
        break;
      }
      case 'spawn':
        this.sparks.burst(8, X, 0.3, Z, 1, 0, 3, Math.PI * 2, 0.4, 0.2, PALETTE.emergencyAmber);
        break;
      default:
        break;
    }
  }

  destroy(): void {
    this.vignette.remove();
  }

  update(game: Game, dt: number): void {
    this.sparks.update(dt);
    this.debris.update(dt);
    this.vignetteA = Math.max(0, this.vignetteA - dt * 2.2);
    this.vignette.style.opacity = this.vignetteA.toFixed(3);
    this.flashT = Math.max(0, this.flashT - dt);
    this.flashLight.intensity = this.flashT > 0 ? 60 * (this.flashT / 0.12) : 0;
    // Шлейф ривка: «привиди» кольору гравця вздовж шляху.
    for (let s = 0; s < this.dashTrail.length; s++) {
      if (this.dashTrail[s]! <= 0) continue;
      this.dashTrail[s]! -= dt;
      const p = game.state.players[s];
      if (!p) continue;
      const color = classColor(p.classId);
      for (let k = 0; k < 3; k++)
        this.sparks.emit(
          toX(p.x) + (Math.random() - 0.5) * 0.5,
          0.3 + Math.random() * 1.1,
          toZ(p.y) + (Math.random() - 0.5) * 0.5,
          0,
          0.5,
          0,
          0.3,
          0.25,
          color,
        );
    }
  }
}
