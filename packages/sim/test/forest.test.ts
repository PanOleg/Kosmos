import { describe, expect, test } from 'vitest';
import {
  buildConfig,
  createGame,
  step,
  botInput,
  emptyInput,
  DEFAULT_SETTINGS,
  MAPS,
  spawnEnemy,
  FOREMAN_LEAP,
  type ClassId,
  type Obstacle,
  type PlayerInput,
} from '../src/index';

function clearance(o: Obstacle, x: number, y: number): number {
  if (o.kind === 'circle') return Math.hypot(x - o.x, y - o.y) - o.r;
  const dx = x - o.x;
  const dy = y - o.y;
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  const u = Math.abs(dx * c + dy * s) - o.hw;
  const v = Math.abs(-dx * s + dy * c) - o.hh;
  return Math.max(u, v);
}

const OWN: Record<string, string[]> = {
  forest: ['boulder', 'mushroom', 'tree', 'log', 'stump', 'roots'],
  ice: ['ice', 'module', 'pine', 'sled', 'crate', 'snowbank'],
};

describe.each(['forest', 'ice'] as const)('%s map: own layout', (id) => {
  const f = MAPS[id];
  const solid = f.obstacles.filter((o) => OWN[id]!.includes(o.tag));

  test('picked by the session setting; no shared rim or diagonal walls', () => {
    expect(buildConfig({ ...DEFAULT_SETTINGS, map: id }).map.id).toBe(id);
    const tags = new Set(f.obstacles.map((o) => o.tag));
    for (const t of OWN[id]!) expect(tags.has(t as never)).toBe(true);
    for (const t of ['rim', 'divider', 'rock', 'tent', 'palm', 'sandbag'])
      expect(tags.has(t as never)).toBe(false);
    expect(f.obstacles[0]).toMatchObject({ kind: 'circle', x: 0, y: 0, tag: 'core' });
    expect(f.airlocks).toEqual(MAPS.station.airlocks);
    // Розкладка не збігається з пустелею.
    expect(f.obstacles.length).not.toBe(MAPS.desert.obstacles.length);
  });

  test('gates, vents, player spawns stay clear; everything is inside the arena', () => {
    for (const p of f.playerSpawns)
      for (const o of solid) expect(clearance(o, p.x, p.y)).toBeGreaterThan(1.5);
    for (const a of f.airlocks)
      for (const o of solid) expect(clearance(o, a.x, a.y)).toBeGreaterThan(4);
    for (const v of f.vents)
      for (const o of solid) expect(clearance(o, v.x, v.y)).toBeGreaterThan(1);
    // Місце для Прораба (північ від центру) й кола довкола ядра.
    for (const o of solid) expect(clearance(o, 0, 6.5)).toBeGreaterThan(1.5);
    for (const o of solid)
      expect(
        Math.hypot(o.x, o.y) + (o.kind === 'circle' ? o.r : Math.hypot(o.hw, o.hh)),
      ).toBeLessThan(f.radius - 2);
    // Перешкоди не налізають одна на одну (крім сегментів однієї дуги).
    for (let i = 0; i < solid.length; i++)
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!;
        const b = solid[j]!;
        if (a.tag === b.tag && (a.tag === 'roots' || a.tag === 'snowbank')) continue;
        const ra = a.kind === 'circle' ? a.r : Math.min(a.hw, a.hh);
        expect(clearance(b, a.x, a.y)).toBeGreaterThan(ra + 0.4);
      }
  });

  test('every gate is reachable on foot from the player start', () => {
    // Заливка по сітці 0,5 м із запасом на радіус найбільшого наземного ворога (1 м).
    const R = f.radius;
    const n = Math.ceil((R * 2) / 0.5);
    const idx = (x: number, y: number) => Math.floor((y + R) / 0.5) * n + Math.floor((x + R) / 0.5);
    const free = (x: number, y: number) =>
      Math.hypot(x, y) < R - 0.5 && f.obstacles.every((o) => clearance(o, x, y) > 1);
    const seen = new Uint8Array(n * n);
    const q: [number, number][] = [[f.playerSpawns[0]!.x, f.playerSpawns[0]!.y]];
    seen[idx(q[0]![0], q[0]![1])] = 1;
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [
        [0.5, 0],
        [-0.5, 0],
        [0, 0.5],
        [0, -0.5],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (Math.abs(nx) >= R || Math.abs(ny) >= R || seen[idx(nx, ny)] || !free(nx, ny)) continue;
        seen[idx(nx, ny)] = 1;
        q.push([nx, ny]);
      }
    }
    // Ворота — на r = 28,5; сходимо на метр усередину, де вже не заважає край арени.
    for (const a of f.airlocks) {
      const k = (R - 2.5) / Math.hypot(a.x, a.y);
      expect(seen[idx(a.x * k, a.y * k)]).toBe(1);
    }
  });
});

describe('forest map', () => {
  test('bogs instead of storms; enemies come from every side', () => {
    expect(MAPS.forest.scatterSpawns).toBe(true);
    expect(MAPS.forest.storm).toBeUndefined();
    expect(MAPS.forest.slowZones!.length).toBeGreaterThanOrEqual(4);
  });

  test.each(['forest', 'ice'] as const)(
    'immortal bots finish the whole match on %s',
    (id) => {
      const classes: ClassId[] = ['assault', 'engineer', 'medic'];
      const g = createGame(
        buildConfig({ ...DEFAULT_SETTINGS, map: id }),
        7,
        classes.map((c) => ({ classId: c })),
      );
      for (const p of g.state.players) p.hp = p.maxHp = 1e9;
      const inputs: PlayerInput[] = g.state.players.map(() => emptyInput());
      let ticks = 0;
      while (g.state.phase === 'playing' && ticks < 60 * 60 * 25) {
        for (let i = 0; i < inputs.length; i++) botInput(g, i, inputs[i]!);
        step(g, inputs);
        ticks++;
      }
      expect(g.state.phase).toBe('won');
    },
    120000,
  );
});

describe('forest bosses behave like beasts', () => {
  const idle = (): PlayerInput => emptyInput();
  function arena(px: number, py: number) {
    const g = createGame(buildConfig({ ...DEFAULT_SETTINGS, map: 'forest' }), 9, [
      { classId: 'assault' },
    ]);
    g.config = { ...g.config, waves: [] };
    g.state.wave.phase = 'done';
    const c = g.config.classes.assault;
    g.config = {
      ...g.config,
      classes: { ...g.config.classes, assault: { ...c, weapon: { ...c.weapon, range: 0 } } },
    };
    const p = g.state.players[0]!;
    p.x = p.px = px;
    p.y = p.py = py;
    p.hp = p.maxHp = 1e6;
    return g;
  }

  test('the wolf leaps onto a distant player, calls a pack from the gates and never builds', () => {
    const g = arena(-20, 0);
    const wolf = spawnEnemy(g, 'foreman', 3, 6.5);
    let leaped = false;
    let landedNear = 0;
    let howls = 0;
    let pack = 0;
    let farthest = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const e = g.state.enemies[wolf]!;
      const was = e.ai;
      step(g, [idle()]);
      for (const ev of g.events.list.slice(0, g.events.count)) {
        if (ev.type === 'enemyWindup' && ev.b === 7) howls++;
        if (ev.type === 'spawn' && g.state.enemies[ev.a]?.type === 'scout') {
          pack++;
          farthest = Math.max(farthest, Math.hypot(ev.x, ev.y));
        }
      }
      if (was === FOREMAN_LEAP && e.ai !== FOREMAN_LEAP) {
        leaped = true;
        landedNear = Math.hypot(e.x - e.tx, e.y - e.ty);
      }
    }
    expect(leaped).toBe(true);
    expect(landedNear).toBeLessThan(2);
    expect(howls).toBeGreaterThanOrEqual(2);
    expect(pack).toBeGreaterThanOrEqual(8);
    // Зграя вибігає від воріт, а не з'являється біля Вовка.
    expect(farthest).toBeGreaterThan(20);
    expect(g.state.enemies.some((e) => e.alive && e.type === 'turret')).toBe(false);
    expect(g.state.props.some((p) => p.alive)).toBe(false);
  });

  test('the bear slams paws in phase 1 instead of the laser grid; the station core keeps the grid', () => {
    const run = (map: 'forest' | 'station') => {
      const g = createGame(buildConfig({ ...DEFAULT_SETTINGS, map }), 4, [{ classId: 'assault' }]);
      g.state.wave.index = g.config.waves.length - 1;
      g.state.wave.phase = 'pause';
      g.state.wave.timer = 1;
      g.state.players[0]!.hp = g.state.players[0]!.maxHp = 1e9;
      const seen = { paw: 0, grid: 0, hurt: 0 };
      for (let i = 0; i < 60 * 25 && g.state.boss.phase <= 1; i++) {
        step(g, [idle()]);
        for (const e of g.events.list.slice(0, g.events.count)) {
          if (e.type === 'craneWarn') seen.paw++;
          if (e.type === 'gridWarn') seen.grid++;
          if (e.type === 'craneHit') seen.hurt++;
        }
      }
      return seen;
    };
    const forest = run('forest');
    expect(forest.grid).toBe(0);
    expect(forest.paw).toBeGreaterThanOrEqual(4);
    expect(forest.hurt).toBeGreaterThanOrEqual(3);
    const station = run('station');
    expect(station.grid).toBeGreaterThan(0);
    expect(station.paw).toBe(0);
  });
});

describe('forest fairy rings', () => {
  test('standing inside heals slowly; outside or on other maps nothing changes', () => {
    const at = (map: 'forest' | 'desert', x: number, y: number) => {
      const g = createGame(buildConfig({ ...DEFAULT_SETTINGS, map }), 2, [{ classId: 'assault' }]);
      g.config = { ...g.config, waves: [] };
      g.state.wave.phase = 'done';
      const p = g.state.players[0]!;
      p.x = p.px = x;
      p.y = p.py = y;
      p.hp = p.maxHp / 2;
      for (let i = 0; i < 60 * 5; i++) step(g, [emptyInput()]);
      return p.hp - p.maxHp / 2;
    };
    const z = MAPS.forest.healZones![0]!;
    expect(at('forest', z.x, z.y)).toBeCloseTo(z.rate * 5, 0);
    expect(at('forest', z.x + z.r + 1, z.y)).toBe(0);
    expect(at('desert', z.x, z.y)).toBe(0);
    // Кола не стоять у перешкодах.
    for (const h of MAPS.forest.healZones!)
      for (const o of MAPS.forest.obstacles)
        expect(clearance(o, h.x, h.y)).toBeGreaterThan(h.r * 0.6);
  });
});
