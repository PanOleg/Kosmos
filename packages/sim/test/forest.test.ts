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

describe('forest map', () => {
  test('mirrored desert skeleton with its own obstacle kinds', () => {
    const f = MAPS.forest;
    expect(buildConfig({ ...DEFAULT_SETTINGS, map: 'forest' }).map.id).toBe('forest');
    expect(f.obstacles.length).toBe(MAPS.desert.obstacles.length);
    const tags = new Set(f.obstacles.map((o) => o.tag));
    for (const t of ['boulder', 'roots', 'mushroom', 'tree', 'log', 'stump'])
      expect(tags.has(t as never)).toBe(true);
    for (const t of ['rock', 'tent', 'palm', 'sandbag']) expect(tags.has(t as never)).toBe(false);
    // Дзеркало північ↔південь: гай дерев тепер на півночі.
    const grove = f.obstacles.filter((o) => o.tag === 'tree' && o.kind === 'circle' && o.r > 1);
    expect(grove.every((o) => o.y > 0)).toBe(true);
    expect(f.scatterSpawns).toBe(true);
    expect(f.storm).toBeUndefined();
  });

  test('gates, drone vents, player spawns and bogs are clear of obstacles', () => {
    const f = MAPS.forest;
    // Лише лісові перешкоди: обвід і барикади — спільний скелет, перевірений на станції.
    const own = new Set(['boulder', 'mushroom', 'tree', 'log', 'stump']);
    const solid = f.obstacles.filter((o) => own.has(o.tag));
    for (const p of f.playerSpawns)
      for (const o of solid) expect(clearance(o, p.x, p.y)).toBeGreaterThan(0.5);
    // Точки скидання дронів — у повітрі: досить, щоб не були всередині перешкоди.
    for (const p of f.vents)
      for (const o of solid) expect(clearance(o, p.x, p.y)).toBeGreaterThan(0);
    for (const a of f.airlocks)
      for (const o of solid.filter((o) => o.tag === 'tree'))
        expect(clearance(o, a.x, a.y)).toBeGreaterThan(5);
    for (const z of f.slowZones ?? [])
      for (const o of solid.filter((o) => o.tag === 'tree' && o.kind === 'circle' && o.r < 1))
        expect(clearance(o, z.x, z.y)).toBeGreaterThan(z.r + 1);
  });

  test('immortal bots finish the whole match incl. both bosses', () => {
    const classes: ClassId[] = ['assault', 'engineer', 'medic'];
    const g = createGame(
      buildConfig({ ...DEFAULT_SETTINGS, map: 'forest' }),
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
  }, 120000);
});
