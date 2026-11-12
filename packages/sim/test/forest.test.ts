import { describe, expect, test } from 'vitest';
import {
  buildConfig,
  createGame,
  step,
  botInput,
  emptyInput,
  DEFAULT_SETTINGS,
  MAPS,
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
