import { CORE, SWARM, TURRET } from '../config/enemies';
import { PLAYER_COUNT_MUL } from '../config/waves';
import { resolveCircle } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import { TEAM_ENEMY } from '../entities/projectile';
import { emit } from '../events';
import { DT, secToTicks } from '../math';
import { randInt, randRange } from '../rng';
import type { Game } from '../state';
import { spawnProjectile } from '../systems/combat';
import { damagePlayer, knockDown, killEnemy } from '../systems/damage';
import { SWARM_GROUPS } from './swarm';
import { spawnEnemy, steer } from '../systems/enemies';
import { launchRocket } from './shell';

/** Атаки третьої фази по колу (BALANCE.md): ракета → лазер → Рій → кран. */
export const CORE_ROCKETS = 0;
export const CORE_LASER = 1;
export const CORE_SWARM = 2;
export const CORE_CRANE = 3;

/**
 * Ядро станції (DECISIONS.md, п. 41): нерухоме тіло на реакторі, три фази по CORE.hp.
 * Фаза 1 — темрява, турелі зі стін, лазерна сітка. Фаза 2 — шлюзи тягнуть гравців у космос,
 * ракети й Скаути. Фаза 3 — робот чергує атаки попередніх ворогів з паузою 2 с.
 */
export function initCore(game: Game, index: number): void {
  const b = game.state.boss;
  const e = game.state.enemies[index]!;
  e.fx = 0;
  e.fy = -1;
  b.index = index;
  enterPhase(game, 1);
}

function aliveTargets(game: Game): Player[] {
  return game.state.players.filter((p) => !p.down);
}

function pick(game: Game): Player | undefined {
  const ps = aliveTargets(game);
  return ps.length ? ps[randInt(game.state.rng, 0, ps.length - 1)] : undefined;
}

function enterPhase(game: Game, phase: number): void {
  const b = game.state.boss;
  b.phase = phase;
  b.grid = 0;
  b.gridT = 0;
  b.airlock = -1;
  b.airlockState = 0;
  b.airlockT = 0;
  b.rocketT = 0;
  b.scoutT = 0;
  b.attack = 0;
  b.attackState = 0;
  b.attackT = 0;
  const e = game.state.enemies[b.index]!;
  if (phase === 1) spawnWallTurrets(game);
  emit(game.events, 'bossPhase', e.x, e.y, 0, 0, b.index, phase);
}

/** Турелі «виїжджають зі стін»: рівномірно по колу біля зовнішньої стіни, на вільних місцях. */
function spawnWallTurrets(game: Game): void {
  const n = CORE.wallTurrets;
  for (let k = 0; k < n; k++) {
    const base = (k / n) * Math.PI * 2 + Math.PI / n;
    for (let tryN = 0; tryN < 8; tryN++) {
      const a = base + (tryN % 2 ? 1 : -1) * Math.ceil(tryN / 2) * 0.08;
      const r = CORE.wallTurretR - Math.floor(tryN / 4) * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const c = resolveCircle(game.world, x, y, TURRET.radius + 0.3);
      if ((c.x - x) ** 2 + (c.y - y) ** 2 > 0.01) continue;
      const i = spawnEnemy(game, 'turret', x, y);
      if (i >= 0) {
        const t = game.state.enemies[i]!;
        t.fx = -Math.cos(a);
        t.fy = -Math.sin(a);
      }
      break;
    }
  }
}

/**
 * Удар, що мав би вбити Ядро: на 1–2 фазі воно переходить у наступну з повним запасом.
 * true — шкоду поглинуто переходом.
 */
export function corePhaseDown(game: Game, e: Enemy, index: number): boolean {
  const b = game.state.boss;
  if (b.phase >= 3) return false;
  e.hp = e.maxHp;
  b.transition = secToTicks(CORE.transition);
  // Турелі першої фази вибухають разом зі світлом, що повертається (деталі за них — гравцям).
  if (b.phase === 1)
    for (let i = 0; i < game.state.enemies.length; i++) {
      const t = game.state.enemies[i]!;
      if (t.alive && t.type === 'turret') killEnemy(game, t, i, -1);
    }
  enterPhase(game, b.phase + 1);
  void index;
  return true;
}

/** Смерть Ядра: станція затихає — решта ворогів падає без деталей. */
export function onCoreKilled(game: Game): void {
  const s = game.state;
  s.boss.phase = 0;
  s.boss.index = -1;
  s.boss.airlock = -1;
  s.boss.airlockState = 0;
  s.boss.grid = 0;
  for (let i = 0; i < s.enemies.length; i++) {
    const o = s.enemies[i]!;
    if (!o.alive) continue;
    o.alive = false;
    o.hp = 0;
    s.enemiesAlive--;
    emit(game.events, 'kill', o.x, o.y, 0, 0, i, -1, 0);
  }
  for (const p of s.players) p.target = -1;
}

export function updateCore(game: Game, e: Enemy, index: number): void {
  const b = game.state.boss;
  steer.x = 0;
  steer.y = 0;
  e.vx = 0;
  e.vy = 0;
  e.stun = 0;
  const tp = e.target >= 0 ? game.state.players[e.target] : undefined;
  if (tp && !tp.down) {
    const d = Math.hypot(tp.x - e.x, tp.y - e.y) || 1;
    e.fx = (tp.x - e.x) / d;
    e.fy = (tp.y - e.y) / d;
  }
  if (b.transition > 0) {
    b.transition--;
    return;
  }
  if (b.phase === 1) phase1(game, e, index);
  else if (b.phase === 2) phase2(game, e, index);
  else if (b.phase === 3) phase3(game, e, index);
}

/** Відстань від точки до найближчого променя сітки. */
export function gridDistance(b: Game['state']['boss'], x: number, y: number): number {
  const d = x * Math.cos(b.gridAngle) + y * Math.sin(b.gridAngle) - b.gridOffset;
  const sp = CORE.gridSpacing;
  const m = ((d % sp) + sp) % sp;
  return Math.min(m, sp - m);
}

function phase1(game: Game, e: Enemy, index: number): void {
  const b = game.state.boss;
  const aggr = game.config.mods.aggression;
  b.gridT++;
  if (b.grid === 0 && b.gridT >= secToTicks(CORE.gridEvery / aggr)) {
    b.grid = 1;
    b.gridT = 0;
    const angles = [0, Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4];
    b.gridAngle = angles[randInt(game.state.rng, 0, angles.length - 1)]!;
    b.gridOffset = randRange(game.state.rng, 0, CORE.gridSpacing);
    emit(game.events, 'gridWarn', e.x, e.y, 0, 0, index, 0, CORE.gridWarn);
  } else if (b.grid === 1 && b.gridT >= secToTicks(CORE.gridWarn)) {
    b.grid = 2;
    b.gridT = 0;
    for (const p of game.state.players)
      if (!p.down && gridDistance(b, p.x, p.y) <= CORE.gridHalfWidth)
        damagePlayer(game, p, CORE.gridDamage * game.config.mods.enemyDamage, p.x, p.y);
    emit(game.events, 'gridFire', e.x, e.y, 0, 0, index);
  } else if (b.grid === 2 && b.gridT >= secToTicks(CORE.gridFire)) {
    b.grid = 0;
    b.gridT = 0;
  }
}

function phase2(game: Game, e: Enemy, index: number): void {
  const b = game.state.boss;
  const s = game.state;
  const aggr = game.config.mods.aggression;
  const locks = game.config.map.airlocks;

  // Шлюз: закритий → попередження → відкритий (тягне) → закритий.
  b.airlockT++;
  const closed = CORE.airlockEvery - CORE.airlockOpen - CORE.airlockWarn;
  if (b.airlockState === 0 && b.airlockT >= secToTicks(closed)) {
    const prev = b.airlock;
    let next = randInt(s.rng, 0, locks.length - 1);
    if (next === prev) next = (next + 1) % locks.length;
    b.airlock = next;
    b.airlockState = 1;
    b.airlockT = 0;
    const a = locks[next]!;
    emit(game.events, 'airlockWarn', a.x, a.y, 0, 0, next, 0, CORE.airlockWarn);
  } else if (b.airlockState === 1 && b.airlockT >= secToTicks(CORE.airlockWarn)) {
    b.airlockState = 2;
    b.airlockT = 0;
    const a = locks[b.airlock]!;
    emit(game.events, 'airlockOpen', a.x, a.y, 0, 0, b.airlock);
  } else if (b.airlockState === 2) {
    const a = locks[b.airlock]!;
    pullPlayers(game, a.x, a.y);
    if (b.airlockT >= secToTicks(CORE.airlockOpen)) {
      b.airlockState = 0;
      b.airlockT = 0;
      emit(game.events, 'airlockClose', a.x, a.y, 0, 0, b.airlock);
    }
  }

  if (++b.rocketT >= secToTicks(CORE.rocketEvery / aggr)) {
    b.rocketT = 0;
    const n = Math.max(1, Math.ceil(aliveTargets(game).length / 2));
    for (let k = 0; k < n; k++) {
      const p = pick(game);
      if (p) launchRocket(game, e.x, e.y, p.x, p.y, e.damage);
    }
    emit(game.events, 'enemyShot', e.x, e.y, e.fx, e.fy, index, 3);
  }

  if (++b.scoutT >= secToTicks(CORE.scoutEvery / aggr)) {
    b.scoutT = 0;
    // З шлюзу навпроти відкритого (або будь-якого, якщо всі закриті).
    const li =
      b.airlock >= 0 ? (b.airlock + 2) % locks.length : randInt(s.rng, 0, locks.length - 1);
    const a = locks[li]!;
    const l = Math.hypot(a.x, a.y) || 1;
    const mul = PLAYER_COUNT_MUL[Math.min(s.players.length, PLAYER_COUNT_MUL.length - 1)]!;
    const count = Math.max(1, Math.round(CORE.scoutCount * mul * game.config.mods.enemyCount));
    for (let k = 0; k < count; k++)
      spawnEnemy(
        game,
        'scout',
        a.x - (a.x / l) * (1.5 + Math.floor(k / 3) * 1.2) + (-a.y / l) * ((k % 3) - 1) * 1.2,
        a.y - (a.y / l) * (1.5 + Math.floor(k / 3) * 1.2) + (a.x / l) * ((k % 3) - 1) * 1.2,
      );
  }
}

/** Відкритий шлюз тягне всіх, хто стоїть; хто дотягся до нього — падає біля шлюзу (п. 14). */
function pullPlayers(game: Game, ax: number, ay: number): void {
  const r = game.config.player.radius;
  for (const p of game.state.players) {
    if (p.down) continue;
    const dx = ax - p.x;
    const dy = ay - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d <= CORE.suckRadius) {
      knockDown(game, p);
      // Лежить біля шлюзу, усередині арени — напарник може підняти.
      const l = Math.hypot(ax, ay) || 1;
      const c = resolveCircle(game.world, ax - (ax / l) * 3, ay - (ay / l) * 3, r);
      p.x = p.px = c.x;
      p.y = p.py = c.y;
      emit(game.events, 'sucked', p.x, p.y, ax, ay, p.slot);
      continue;
    }
    const c = resolveCircle(
      game.world,
      p.x + (dx / d) * CORE.pull * DT,
      p.y + (dy / d) * CORE.pull * DT,
      r,
    );
    p.x = c.x;
    p.y = c.y;
  }
}

function phase3(game: Game, e: Enemy, index: number): void {
  const b = game.state.boss;
  const s = game.state;
  const aggr = game.config.mods.aggression;
  b.attackT++;
  if (b.attackState === 0) {
    if (b.attackT < secToTicks(CORE.attackPause / aggr)) return;
    b.attackT = 0;
    const p = pick(game);
    if (!p) return;
    switch (b.attack) {
      case CORE_ROCKETS:
        for (let k = 0; k < CORE.volley; k++) {
          const t = k === 0 ? p : (pick(game) ?? p);
          const a = randRange(s.rng, 0, Math.PI * 2);
          const off = k === 0 ? 0 : randRange(s.rng, 1.5, 3);
          launchRocket(game, e.x, e.y, t.x + Math.cos(a) * off, t.y + Math.sin(a) * off, e.damage);
        }
        emit(game.events, 'enemyShot', e.x, e.y, e.fx, e.fy, index, 3);
        b.attack = (b.attack + 1) % 4;
        return;
      case CORE_LASER:
        b.attackState = 1;
        e.target = p.slot;
        b.tx = p.x;
        b.ty = p.y;
        emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 5, CORE.laserAim);
        return;
      case CORE_SWARM: {
        let small = 0;
        for (const o of s.enemies) if (o.alive && o.type === 'swarm') small++;
        if (small < CORE.swarmCap) {
          const v = game.config.map.vents[randInt(s.rng, 0, game.config.map.vents.length - 1)]!;
          const group = s.wave.groupSeq++ % SWARM_GROUPS;
          for (let i = 0; i < SWARM.count; i++) {
            const ang = (i / SWARM.count) * Math.PI * 2;
            spawnEnemy(game, 'swarm', v.x + Math.cos(ang) * 1.2, v.y + Math.sin(ang) * 1.2, group);
          }
          emit(game.events, 'enemyWindup', e.x, e.y, v.x, v.y, index, 9, 0);
        }
        b.attack = (b.attack + 1) % 4;
        return;
      }
      case CORE_CRANE:
        b.attackState = 1;
        b.tx = p.x;
        b.ty = p.y;
        emit(game.events, 'craneWarn', p.x, p.y, 0, 0, index, 1, CORE.craneWarn);
        return;
    }
    return;
  }

  // Замах триває: лазер стежить за ціллю до останніх 0.3 с, кран уже зафіксований.
  if (b.attack === CORE_LASER) {
    const p = s.players[e.target];
    const total = secToTicks(CORE.laserAim);
    if (p && !p.down && b.attackT < total - secToTicks(0.3)) {
      b.tx = p.x;
      b.ty = p.y;
    }
    if (b.attackT >= total) {
      const dx = b.tx - e.x;
      const dy = b.ty - e.y;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      spawnProjectile(
        game,
        TEAM_ENEMY,
        index,
        e.x + (dx / l) * (e.radius + 0.3),
        e.y + (dy / l) * (e.radius + 0.3),
        dx / l,
        dy / l,
        CORE.laserSpeed,
        60,
        CORE.laserDamage * game.config.mods.enemyDamage,
        0,
        0.3,
      );
      emit(game.events, 'enemyShot', e.x, e.y, dx / l, dy / l, index, 2);
      finish(b);
    }
    return;
  }
  if (b.attack === CORE_CRANE && b.attackT >= secToTicks(CORE.craneWarn)) {
    const r2 = CORE.craneRadius * CORE.craneRadius;
    for (const o of s.players)
      if (!o.down && (o.x - b.tx) ** 2 + (o.y - b.ty) ** 2 <= r2)
        damagePlayer(game, o, CORE.craneDamage * game.config.mods.enemyDamage, b.tx, b.ty);
    emit(game.events, 'craneHit', b.tx, b.ty, 0, 0, index, 1, CORE.craneRadius);
    finish(b);
  }
}

function finish(b: Game['state']['boss']): void {
  b.attackState = 0;
  b.attackT = 0;
  b.attack = (b.attack + 1) % 4;
}
