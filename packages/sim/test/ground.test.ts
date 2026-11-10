import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  spawnEnemy,
  TEAM_PLAYER,
  SPIDER_FLIGHT,
  type Game,
  type PlayerInput,
} from '../src/index';
import { spawnProjectile } from '../src/systems/combat';
import { updateAutoaim } from '../src/systems/autoaim';
import { clearHash, insertHash } from '../src/collision/spatial';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 });

function setup(x: number, y: number, unarmed = true): Game {
  const g = createGame(undefined, 9, [{ classId: 'assault' }]);
  g.config = { ...g.config, waves: [] };
  g.state.wave.phase = 'done';
  if (unarmed) {
    const c = g.config.classes.assault;
    g.config = {
      ...g.config,
      classes: { ...g.config.classes, assault: { ...c, weapon: { ...c.weapon, range: 0 } } },
    };
  }
  const p = g.state.players[0]!;
  p.x = p.px = x;
  p.y = p.py = y;
  return g;
}
const run = (g: Game, n: number, input = idle) => {
  for (let i = 0; i < n; i++) step(g, [input()]);
};
const rehash = (g: Game) => {
  clearHash(g.hash);
  g.state.enemies.forEach((e, i) => e.alive && insertHash(g.hash, i, e.x, e.y));
};

describe('ground enemies', () => {
  test('shell takes ×3 damage in the back', () => {
    const g = setup(-25, 0);
    const sh = g.state.enemies[spawnEnemy(g, 'shell', -10, 0)]!;
    sh.fx = -1;
    sh.fy = 0;
    // У лоб: куля летить назустріч погляду.
    spawnProjectile(g, TEAM_PLAYER, 0, -14, 0, 1, 0, 45, 10, 10, 0, 0.12);
    run(g, 6);
    const front = sh.maxHp - sh.hp;
    sh.hp = sh.maxHp;
    sh.fx = -1;
    sh.fy = 0;
    // У спину: куля летить туди ж, куди він дивиться.
    spawnProjectile(g, TEAM_PLAYER, 0, sh.x + 4, sh.y, -1, 0, 45, 10, 10, 0, 0.12);
    run(g, 6);
    expect(front).toBeCloseTo(10, 5);
    expect(sh.maxHp - sh.hp).toBeCloseTo(30, 5);
  });

  test('shell rocket zone hits a standing player and misses one who walks out', () => {
    const stand = setup(-20, 0);
    spawnEnemy(stand, 'shell', -20, 9);
    run(stand, 60 * 8);
    expect(stand.state.players[0]!.stats.damageTaken).toBeGreaterThan(0);
    expect(stand.state.players[0]!.stats.damageTaken % 35).toBe(0);

    const move = setup(-20, 0);
    spawnEnemy(move, 'shell', -20, 9);
    let fled = false;
    for (let i = 0; i < 60 * 8; i++) {
      const r = move.state.rockets.find((k) => k.alive);
      const p = move.state.players[0]!;
      const inZone = !!r && Math.hypot(p.x - r.x, p.y - r.y) < r.radius + 0.6;
      if (inZone) fled = true;
      step(move, [{ ...idle(), move: { x: inZone ? 1 : 0, y: 0 } }]);
    }
    expect(fled).toBe(true);
    expect(move.state.players[0]!.stats.damageTaken).toBe(0);
  });

  test('repairer heals a damaged robot and shields a shell', () => {
    const g = setup(-26, 0);
    const sh = g.state.enemies[spawnEnemy(g, 'shell', -5, 10)]!;
    const rp = g.state.enemies[spawnEnemy(g, 'repairer', -3, 12)]!;
    sh.hp = 200;
    run(g, 60 * 3);
    expect(sh.hp).toBeGreaterThan(220);
    expect(sh.shield).toBe(100);
    // Щит поглинає шкоду першим.
    spawnProjectile(g, TEAM_PLAYER, 0, sh.x - 3, sh.y, 1, 0, 45, 10, 40, 0, 0.12);
    const hp = sh.hp;
    run(g, 6);
    expect(sh.hp).toBeGreaterThanOrEqual(hp);
    expect(sh.shield).toBeLessThan(100);
    expect(rp.alive).toBe(true);
  });

  test('repairer keeps its distance from players', () => {
    const g = setup(0, 0);
    spawnEnemy(g, 'scout', 0, 18);
    const rp = g.state.enemies[spawnEnemy(g, 'repairer', 0, 6)]!;
    run(g, 60 * 4);
    expect(Math.hypot(rp.x, rp.y)).toBeGreaterThan(8);
  });

  test('spider on a perch is out of autoaim reach; in flight it is the priority', () => {
    const g = setup(-20, 0, false);
    const sp = g.state.enemies[spawnEnemy(g, 'spider', -15, 0)]!;
    spawnEnemy(g, 'scout', -14, 3);
    sp.alt = 2.3;
    sp.ai = 1;
    rehash(g);
    updateAutoaim(g);
    const p = g.state.players[0]!;
    expect(g.state.enemies[p.target]?.type).toBe('scout');
    sp.ai = SPIDER_FLIGHT;
    sp.alt = 1;
    p.target = -1;
    updateAutoaim(g);
    expect(g.state.enemies[p.target]?.type).toBe('spider');
  });

  test('spider climbs, jumps and lands on a passive player', () => {
    const g = setup(-24, 4);
    spawnEnemy(g, 'spider', -20, 15);
    let jumped = false;
    for (let i = 0; i < 60 * 15; i++) {
      step(g, [idle()]);
      for (let k = 0; k < g.events.count; k++)
        if (g.events.list[k]!.type === 'spiderJump') jumped = true;
    }
    expect(jumped).toBe(true);
    expect(g.state.players[0]!.stats.damageTaken).toBeGreaterThan(0);
    expect(g.state.players[0]!.stats.damageTaken % 20).toBe(0);
  });
});
