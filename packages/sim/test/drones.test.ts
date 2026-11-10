import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  spawnEnemy,
  TEAM_PLAYER,
  type ClassId,
  type Game,
  type PlayerInput,
} from '../src/index';
import { spawnProjectile } from '../src/systems/combat';
import { updateAutoaim } from '../src/systems/autoaim';
import { clearHash, insertHash } from '../src/collision/spatial';
import { KAMI_DIVE } from '../src/ai/kamikaze';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 });

/** Без хвиль і (за потреби) без зброї: перевіряємо поведінку дронів. */
function setup(x: number, y: number, opts: { unarmed?: boolean; classId?: ClassId } = {}): Game {
  const g = createGame(undefined, 9, [{ classId: opts.classId ?? 'assault' }]);
  g.config = { ...g.config, waves: [] };
  g.state.wave.phase = 'done';
  if (opts.unarmed) {
    const c = g.config.classes[opts.classId ?? 'assault'];
    g.config = {
      ...g.config,
      classes: {
        ...g.config.classes,
        [opts.classId ?? 'assault']: { ...c, weapon: { ...c.weapon, range: 0 } },
      },
    };
  }
  const p = g.state.players[0]!;
  p.x = p.px = x;
  p.y = p.py = y;
  return g;
}

const run = (g: Game, ticks: number, input = idle) => {
  for (let i = 0; i < ticks; i++) step(g, [input()]);
};

describe('drones', () => {
  test('wasp orbits at ~8 m and shoots in bursts of 6', () => {
    const g = setup(-20, 0, { unarmed: true });
    const p = g.state.players[0]!;
    const w = g.state.enemies[spawnEnemy(g, 'wasp', -20, 12)]!;
    run(g, 60 * 3);
    expect(Math.hypot(w.x - p.x, w.y - p.y)).toBeGreaterThan(6);
    expect(Math.hypot(w.x - p.x, w.y - p.y)).toBeLessThan(10);
    run(g, 60 * 6);
    expect(p.stats.damageTaken).toBeGreaterThan(0);
    expect(p.stats.damageTaken % 6).toBe(0);
  });

  test('drones fly over low obstacles; only high cover blocks their shots', () => {
    // Гравець за столом лабораторії (0.9 м) — оса його дістає.
    const g = setup(16, -0.2, { unarmed: true });
    spawnEnemy(g, 'wasp', 16, 9);
    run(g, 60 * 8);
    expect(g.state.players[0]!.stats.damageTaken).toBeGreaterThan(0);
  });

  test('kamikaze is armored in front, vulnerable from the side', () => {
    const g = setup(-25, 0, { unarmed: true });
    const k = g.state.enemies[spawnEnemy(g, 'kamikaze', -10, 0)]!;
    k.alt = 2.5;
    k.fx = -1;
    k.fy = 0;
    // Назустріч носу — броня.
    spawnProjectile(g, TEAM_PLAYER, 0, -14, 0, 1, 0, 45, 10, 20, 0, 0.12, true);
    run(g, 6);
    expect(k.hp).toBe(k.maxHp);
    // Збоку — шкода.
    k.fx = -1;
    k.fy = 0;
    spawnProjectile(g, TEAM_PLAYER, 0, k.x, k.y - 4, 0, 1, 45, 10, 20, 0, 0.12, true);
    run(g, 6);
    expect(k.hp).toBeLessThan(k.maxHp);
  });

  test('kamikaze dive explodes on a passive player; a dash dodges it', () => {
    const hitGame = setup(-20, 0, { unarmed: true });
    spawnEnemy(hitGame, 'kamikaze', -20, 15);
    run(hitGame, 60 * 6);
    expect(hitGame.state.players[0]!.stats.damageTaken).toBe(50);

    const dodge = setup(-20, 0, { unarmed: true });
    const k = dodge.state.enemies[spawnEnemy(dodge, 'kamikaze', -20, 15)]!;
    let dashed = false;
    for (let i = 0; i < 60 * 6; i++) {
      const go = !dashed && k.alive && k.ai === KAMI_DIVE;
      if (go) dashed = true;
      step(dodge, [{ move: { x: go ? 1 : 0, y: 0 }, ability: false, dash: go, buy: 0 }]);
    }
    expect(dashed).toBe(true);
    expect(dodge.state.players[0]!.stats.damageTaken).toBe(0);
  });

  test('EMP grounds drones and strips kamikaze armor', () => {
    const g = setup(-20, 0, { unarmed: true, classId: 'tech' });
    const k = g.state.enemies[spawnEnemy(g, 'kamikaze', -20, 5)]!;
    run(g, 30);
    step(g, [{ ...idle(), ability: true }]);
    run(g, 40);
    expect(k.stun).toBeGreaterThan(0);
    expect(k.alt).toBeLessThan(1);
    // Тепер і в лоб пробивається.
    const dx = g.state.players[0]!.x - k.x;
    const dy = g.state.players[0]!.y - k.y;
    k.fx = dx / Math.hypot(dx, dy);
    k.fy = dy / Math.hypot(dx, dy);
    spawnProjectile(
      g,
      TEAM_PLAYER,
      0,
      k.x + k.fx * 3,
      k.y + k.fy * 3,
      -k.fx,
      -k.fy,
      45,
      10,
      20,
      0,
      0.12,
      false,
    );
    run(g, 6);
    expect(k.hp).toBeLessThan(k.maxHp);
  });

  test('sniper holds 15–17 m, outside autoaim, and its shot is blocked by high cover', () => {
    const g = setup(-25, 0, { unarmed: true });
    const p = g.state.players[0]!;
    const sn = g.state.enemies[spawnEnemy(g, 'sniper', -20, 5)]!;
    run(g, 60 * 4);
    const d = Math.hypot(sn.x - p.x, sn.y - p.y);
    expect(d).toBeGreaterThan(13.5);
    expect(d).toBeLessThan(18.5);
    run(g, 60 * 10);
    expect(p.stats.damageTaken).toBeGreaterThan(0);
    expect(p.stats.damageTaken % 40).toBe(0);

    // За контейнером (2.2 м) снайпер не влучає.
    const c = setup(0, 11.2, { unarmed: true });
    const cs = c.state.enemies[spawnEnemy(c, 'sniper', 0, 26)]!;
    for (let i = 0; i < 60 * 12; i++) {
      c.state.players[0]!.x = 0;
      c.state.players[0]!.y = 11.2;
      cs.x = 0;
      cs.y = 26.5;
      step(c, [idle()]);
    }
    expect(c.state.players[0]!.stats.damageTaken).toBe(0);
  });

  test('a swarm spawns as a cloud and bites', () => {
    const g = setup(-20, 0, { unarmed: true });
    for (let i = 0; i < 12; i++)
      spawnEnemy(g, 'swarm', -12 + (i % 4) * 0.5, Math.floor(i / 4) * 0.5, 0);
    run(g, 60 * 4);
    expect(g.state.players[0]!.stats.damageTaken).toBeGreaterThan(0);
  });

  test('autoaim prefers a kamikaze seen from the side and ignores one facing the player', () => {
    const g = setup(-20, 0);
    const p = g.state.players[0]!;
    const k = spawnEnemy(g, 'kamikaze', -14, 0);
    const scout = spawnEnemy(g, 'scout', -17, 0);
    const ke = g.state.enemies[k]!;
    ke.alt = 2.5;
    const rehash = () => {
      clearHash(g.hash);
      g.state.enemies.forEach((e, i) => e.alive && insertHash(g.hash, i, e.x, e.y));
    };
    // Дивиться на гравця — броня до нього, ціль не він.
    ke.fx = -1;
    ke.fy = 0;
    rehash();
    updateAutoaim(g);
    expect(p.target).toBe(scout);
    // Розвернувся боком — пріоритет.
    ke.fx = 0;
    ke.fy = 1;
    p.target = -1;
    updateAutoaim(g);
    expect(p.target).toBe(k);
  });
});
