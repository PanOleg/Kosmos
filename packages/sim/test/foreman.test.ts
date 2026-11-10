import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  spawnEnemy,
  buildWaves,
  TEAM_PLAYER,
  type Game,
  type PlayerInput,
} from '../src/index';
import { spawnProjectile } from '../src/systems/combat';
import { raycast } from '../src/collision/world';
import { placeProp, clearProps } from '../src/systems/props';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 });

function setup(x: number, y: number): Game {
  const g = createGame(undefined, 9, [{ classId: 'assault' }]);
  g.config = { ...g.config, waves: [] };
  g.state.wave.phase = 'done';
  const c = g.config.classes.assault;
  g.config = {
    ...g.config,
    classes: { ...g.config.classes, assault: { ...c, weapon: { ...c.weapon, range: 0 } } },
  };
  const p = g.state.players[0]!;
  p.x = p.px = x;
  p.y = p.py = y;
  p.hp = p.maxHp = 1e6;
  return g;
}
const run = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) step(g, [idle()]);
};

describe('foreman & turret', () => {
  test('foreman builds cover and turrets, summons scouts, strikes a telegraphed zone', () => {
    const g = setup(-20, 0);
    spawnEnemy(g, 'foreman', -20, 12);
    let warns = 0;
    let hits = 0;
    let props = 0;
    for (let i = 0; i < 60 * 26; i++) {
      step(g, [idle()]);
      for (let k = 0; k < g.events.count; k++) {
        const t = g.events.list[k]!.type;
        if (t === 'craneWarn') warns++;
        if (t === 'craneHit') hits++;
        if (t === 'propPlaced') props++;
      }
    }
    const alive = g.state.enemies.filter((e) => e.alive);
    expect(warns).toBeGreaterThan(0);
    expect(hits).toBe(
      warns - (g.state.enemies.find((e) => e.type === 'foreman' && e.ai === 1) ? 1 : 0),
    );
    expect(props).toBeGreaterThan(0);
    expect(alive.filter((e) => e.type === 'turret').length).toBeGreaterThan(0);
    expect(alive.filter((e) => e.type === 'scout').length).toBeGreaterThanOrEqual(3);
  });

  test('placed cover blocks shots and walking, and is removed after the wave', () => {
    const g = createGame(undefined, 3, [{ classId: 'assault' }]);
    const p = g.state.props;
    // Ставимо стіну через систему, як це робить Прораб.
    // (імпорт нижче)
    placeProp(g, -20, 0, Math.PI / 2);
    expect(p[0]!.alive).toBe(true);
    expect(raycast(g.world, -23, 0, -17, 0)).toBeLessThan(1);
    clearProps(g);
    expect(p[0]!.alive).toBe(false);
    expect(raycast(g.world, -23, 0, -17, 0)).toBe(1);
  });

  test('killing the foreman cancels the rest of the wave reinforcements', () => {
    const g = createGame(undefined, 3, [{ classId: 'assault' }]);
    g.config = { ...g.config, waves: buildWaves(9) };
    const fw = g.config.waves.findIndex((w) => w.boss === 'foreman');
    expect(fw).toBe(5);
    g.state.wave.index = fw;
    g.state.wave.phase = 'active';
    g.state.wave.timer = 0;
    g.state.wave.nextGroup = 0;
    step(g, [idle()]);
    const f = g.state.enemies.findIndex((e) => e.alive && e.type === 'foreman');
    expect(f).toBeGreaterThanOrEqual(0);
    const fe = g.state.enemies[f]!;
    fe.hp = 1;
    spawnProjectile(g, TEAM_PLAYER, 0, fe.x - 3, fe.y, 1, 0, 45, 10, 50, 0, 0.12);
    run(g, 6);
    expect(fe.alive).toBe(false);
    expect(g.state.wave.nextGroup).toBe(g.config.waves[fw]!.groups.length);
  });

  test('turret is weak from behind', () => {
    const g = setup(-25, 0);
    const t = g.state.enemies[spawnEnemy(g, 'turret', -10, 0)]!;
    t.fx = -1;
    t.fy = 0;
    spawnProjectile(g, TEAM_PLAYER, 0, t.x + 3, t.y, -1, 0, 45, 10, 10, 0, 0.12);
    run(g, 6);
    expect(t.maxHp - t.hp).toBeCloseTo(30, 5);
  });
});

describe('wave table', () => {
  test('9 waves match BALANCE, foreman after the 5th, breather has double parts', () => {
    const w = buildWaves(9);
    expect(w.length).toBe(10);
    expect(w[5]!.boss).toBe('foreman');
    const count = (i: number, type: string) =>
      w[i]!.groups.filter((g) => g.type === type).reduce((a, g) => a + g.count, 0);
    expect(count(0, 'scout')).toBe(8);
    expect([count(1, 'scout'), count(1, 'gunner')]).toEqual([12, 3]);
    expect([count(2, 'scout'), count(2, 'gunner'), count(2, 'wasp')]).toEqual([8, 3, 4]);
    expect([count(3, 'scout'), count(3, 'gunner'), count(3, 'wasp'), count(3, 'spider')]).toEqual([
      10, 4, 4, 2,
    ]);
    expect([
      count(4, 'scout'),
      count(4, 'gunner'),
      count(4, 'wasp'),
      count(4, 'spider'),
      count(4, 'repairer'),
    ]).toEqual([6, 5, 6, 3, 1]);
    expect(count(6, 'scout')).toBe(15);
    expect(w[6]!.partsMul).toBe(2);
    expect([count(7, 'shell'), count(7, 'gunner'), count(7, 'repairer'), count(7, 'wasp')]).toEqual(
      [2, 4, 2, 4],
    );
    expect([
      count(8, 'kamikaze'),
      count(8, 'sniper'),
      count(8, 'scout'),
      count(8, 'swarm'),
    ]).toEqual([6, 2, 8, 1]);
    expect([
      count(9, 'shell'),
      count(9, 'kamikaze'),
      count(9, 'sniper'),
      count(9, 'swarm'),
      count(9, 'spider'),
      count(9, 'gunner'),
      count(9, 'repairer'),
    ]).toEqual([2, 4, 2, 2, 4, 6, 2]);
  });

  test('wave count slider: 5 keeps order and the last wave, 15 adds harder repeats', () => {
    const five = buildWaves(5).filter((w) => !w.boss);
    expect(five.length).toBe(5);
    expect(five[4]!.groups).toEqual(buildWaves(9).filter((w) => !w.boss)[8]!.groups);
    const fifteen = buildWaves(15);
    expect(fifteen.filter((w) => !w.boss).length).toBe(15);
    expect(fifteen.findIndex((w) => w.boss)).toBe(Math.ceil(0.55 * 15));
    const total = (w: (typeof fifteen)[number]) => w.groups.reduce((a, g) => a + g.count, 0);
    expect(total(fifteen[fifteen.length - 1]!)).toBeGreaterThan(total(buildWaves(9)[9]!));
  });
});
