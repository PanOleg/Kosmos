import { describe, expect, test } from 'vitest';
import {
  buildConfig,
  createGame,
  step,
  botInput,
  emptyInput,
  shopOpen,
  slowAt,
  stormPhase,
  DEFAULT_SETTINGS,
  MAPS,
  type ClassId,
  type GameConfig,
} from '../src/index';
import { AIR_TYPES } from '../src/config/enemies';
import { ENDLESS_EXTRA } from '../src/config/waves';
import { dropParts } from '../src/systems/pickups';
import { damageEnemy } from '../src/systems/damage';
import { spawnEnemy } from '../src/systems/enemies';

const CL: ClassId[] = ['assault', 'engineer', 'medic', 'tech'];
function run(cfg: GameConfig, n: number, seed: number, maxMin: number, immortal = true) {
  const g = createGame(
    cfg,
    seed,
    CL.slice(0, n).map((c) => ({ classId: c })),
  );
  if (immortal) for (const p of g.state.players) p.hp = p.maxHp = 1e9;
  const inputs = g.state.players.map(() => emptyInput());
  const events: Record<string, number> = {};
  let ticks = 0;
  while (g.state.phase === 'playing' && ticks < 60 * 60 * maxMin) {
    for (let i = 0; i < n; i++) botInput(g, i, inputs[i]!);
    step(g, inputs);
    for (let i = 0; i < g.events.count; i++) {
      const t = g.events.list[i]!.type;
      events[t] = (events[t] ?? 0) + 1;
    }
    ticks++;
  }
  return { g, events };
}

describe('match modifiers', () => {
  test('rules follow the chosen modifiers; unknown ones are ignored', () => {
    const c = buildConfig({
      ...DEFAULT_SETTINGS,
      modifiers: ['rich', 'glass', 'noShop', 'rush', 'bogus' as 'rich'],
    });
    expect(c.rules).toEqual({ partsMul: 2, playerDamageMul: 2, pauseMul: 0.5, shop: false });
    expect(c.mods.enemySpeed).toBeCloseTo(1.2);
    expect(c.mods.enemyDamage).toBe(2);
    expect(buildConfig(DEFAULT_SETTINGS).rules.shop).toBe(true);
  });

  test('rich doubles parts, glass doubles player damage, noShop closes the shop', () => {
    const g = createGame(
      buildConfig({ ...DEFAULT_SETTINGS, modifiers: ['rich', 'glass', 'noShop'] }),
      1,
      [{ classId: 'assault' }],
    );
    expect(shopOpen(g)).toBe(false);
    dropParts(g, 0, 5, 3);
    expect(g.state.pickups.filter((p) => p.alive).length).toBe(6);
    const i = spawnEnemy(g, 'shell', 5, 5);
    const e = g.state.enemies[i]!;
    const hp = e.hp;
    damageEnemy(g, e, i, 10, 1, 0, 0, 0);
    expect(hp - e.hp).toBe(20);
  });

  test('drones-only waves have no ground enemies but keep the bosses', () => {
    const c = buildConfig({ ...DEFAULT_SETTINGS, modifiers: ['drones'] });
    for (const w of c.waves)
      if (!w.boss) for (const gr of w.groups) expect(AIR_TYPES.has(gr.type)).toBe(true);
    expect(c.waves.filter((w) => w.boss).length).toBe(2);
    expect(run(c, 2, 3, 25).g.state.phase).toBe('won');
  }, 120000);
});

describe('endless mode', () => {
  test('waves go on after the core, tougher each time', () => {
    const normal = buildConfig(DEFAULT_SETTINGS).waves;
    const c = buildConfig({ ...DEFAULT_SETTINGS, endless: true });
    expect(c.waves.length).toBe(normal.length + ENDLESS_EXTRA);
    const extra = c.waves.slice(normal.length);
    expect(extra[4]!.boss).toBe('foreman');
    expect(extra[9]!.boss).toBe('core');
    expect(extra[10]!.hpMul!).toBeGreaterThan(extra[0]!.hpMul!);
  });

  test('immortal bots pass the first core and a second one', () => {
    const c = buildConfig({ ...DEFAULT_SETTINGS, endless: true });
    const first = buildConfig(DEFAULT_SETTINGS).waves.length;
    const { g } = run(c, 2, 5, 45);
    // За 45 хв гри безсмертні боти мають зайти далеко за перше Ядро й пройти друге.
    expect(g.state.wave.index).toBeGreaterThan(first + 10);
  }, 240000);
});

describe('map hazards', () => {
  test('quicksand slows walking but not the dash', () => {
    const z = MAPS.desert.slowZones![0]!;
    expect(slowAt(MAPS.desert, z.x, z.y)).toBe(z.mul);
    expect(slowAt(MAPS.desert, 0, -5)).toBe(1);
    expect(slowAt(MAPS.station, z.x, z.y)).toBe(1);
    const walk = (map: 'desert' | 'station') => {
      const g = createGame(buildConfig({ ...DEFAULT_SETTINGS, map }), 1, [{ classId: 'assault' }]);
      const p = g.state.players[0]!;
      p.x = p.px = z.x - 1;
      p.y = p.py = z.y;
      const inp = [{ ...emptyInput(), move: { x: 1, y: 0 } }];
      for (let i = 0; i < 20; i++) step(g, inp);
      return p.x - (z.x - 1);
    };
    expect(walk('desert')).toBeLessThan(walk('station') * 0.7);
  });

  test('the desert storm comes with a warning and shortens auto-aim', () => {
    const c = buildConfig({ ...DEFAULT_SETTINGS, map: 'desert' });
    const { events } = run(c, 2, 2, 6);
    expect(events.stormWarn).toBeGreaterThan(0);
    expect(events.storm).toBeGreaterThan(0);
    const g = createGame(c, 1, [{ classId: 'medic' }]);
    expect(stormPhase(g)).toBe(0);
    g.state.wave.phase = 'active';
    g.state.wave.timer = 60 * 45;
    expect(stormPhase(g)).toBe(2);
    g.state.wave.timer = 60 * 39;
    expect(stormPhase(g)).toBe(1);
  }, 60000);

  test.each([[2, 4]])(
    'ice base: immortal bots finish the match (%i players)',
    (n, seed) => {
      const c = buildConfig({ ...DEFAULT_SETTINGS, map: 'ice' });
      expect(c.map.id).toBe('ice');
      expect(run(c, n, seed, 25).g.state.phase).toBe('won');
    },
    120000,
  );
});
