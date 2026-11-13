import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  buildWaves,
  emptyInput,
  gridDistance,
  CORE,
  TEAM_PLAYER,
  type Game,
} from '../src/index';
import { spawnProjectile } from '../src/systems/combat';

/** Матч, що одразу починається з хвилі боса. */
function bossFight(players = 1): Game {
  const g = createGame(
    undefined,
    7,
    Array.from({ length: players }, () => ({ classId: 'assault' as const })),
  );
  g.config = { ...g.config, waves: buildWaves(9) };
  const w = g.state.wave;
  w.index = g.config.waves.length - 1;
  w.phase = 'active';
  w.timer = 0;
  w.nextGroup = 0;
  step(g, g.state.players.map(emptyInput));
  return g;
}
const run = (g: Game, n: number, fn?: (g: Game) => void) => {
  for (let i = 0; i < n; i++) {
    fn?.(g);
    step(g, g.state.players.map(emptyInput));
  }
};
const core = (g: Game) => g.state.enemies[g.state.boss.index]!;
const hitCore = (g: Game, amount: number) => {
  const c = core(g);
  spawnProjectile(g, TEAM_PLAYER, 0, c.x - 5, c.y, 1, 0, 45, 10, amount, 0, 0.12);
  run(g, 10);
};

describe('station core', () => {
  test('spawns on the reactor in phase 1 with six wall turrets', () => {
    const g = bossFight();
    expect(g.state.boss.phase).toBe(1);
    expect(core(g).x).toBe(0);
    expect(core(g).maxHp).toBe(1500);
    expect(g.state.enemies.filter((e) => e.alive && e.type === 'turret').length).toBe(6);
  });

  test('hp scales with the crew, not the count', () => {
    const g = bossFight(4);
    expect(g.state.enemies.filter((e) => e.alive && e.type === 'core').length).toBe(1);
    expect(core(g).maxHp).toBe(4500);
  });

  test('three phases: overkill refills, transition is invulnerable, turrets go with the dark', () => {
    const g = bossFight();
    hitCore(g, 1e6);
    expect(g.state.boss.phase).toBe(2);
    expect(core(g).alive).toBe(true);
    expect(core(g).hp).toBe(core(g).maxHp);
    expect(g.state.enemies.filter((e) => e.alive && e.type === 'turret').length).toBe(0);
    // Під час переходу шкоди немає.
    hitCore(g, 500);
    expect(core(g).hp).toBe(core(g).maxHp);
    run(g, CORE.transition * 60);
    hitCore(g, 1e6);
    expect(g.state.boss.phase).toBe(3);
    run(g, CORE.transition * 60);
    const idx = g.state.boss.index;
    hitCore(g, 1e6);
    expect(g.state.enemies[idx]!.alive).toBe(false);
    expect(g.state.enemiesAlive).toBe(0);
    run(g, 60 * 4);
    expect(g.state.phase).toBe('won');
  });

  test('laser grid: telegraphed beams hurt only players standing on them', () => {
    const g = bossFight(2);
    const [a, b] = g.state.players;
    a!.hp = b!.hp = a!.maxHp = b!.maxHp = 1000;
    let onBeam = 0;
    let inGap = 0;
    // Рівно одна сітка: наступна вмикається через gridEvery після пострілу.
    run(g, 60 * 10, (g) => {
      const bs = g.state.boss;
      // Поки сітка підсвічена, один стоїть на промені, інший — посередині проміжку.
      if (bs.grid === 1) {
        const nx = Math.cos(bs.gridAngle);
        const ny = Math.sin(bs.gridAngle);
        [a!, b!].forEach((p, k) => {
          const base = bs.gridOffset + CORE.gridSpacing * (3 + k * 0.5);
          p.x = p.px = nx * base - ny * 4;
          p.y = p.py = ny * base + nx * 4;
          p.invuln = 0;
        });
      }
      if (bs.grid === 1 && bs.gridT === CORE.gridWarn * 60 - 1) {
        // Наступний крок — удар: запам'ятовуємо, хто де стоїть, і порівнюємо зі шкодою.
        for (const p of [a!, b!]) {
          const before = p.hp;
          const d = gridDistance(bs, p.x, p.y);
          step(g, g.state.players.map(emptyInput));
          if (d <= CORE.gridHalfWidth) {
            expect(p.hp).toBeLessThan(before);
            onBeam++;
          } else {
            expect(p.hp).toBe(before);
            inGap++;
          }
          break;
        }
      }
    });
    expect(onBeam).toBeGreaterThan(0);
    expect(a!.hp).toBeLessThan(1000);
    expect(b!.hp).toBe(1000);
    void inGap;
  });

  test('phase 2: an open airlock pulls players and a sucked-in one goes down by the door', () => {
    const g = bossFight(2);
    g.state.boss.transition = 0;
    hitCore(g, 1e6);
    g.state.boss.transition = 0;
    const [a, b] = g.state.players;
    a!.hp = b!.hp = a!.maxHp = b!.maxHp = 1e6;
    let sucked = false;
    let pulled = 0;
    let doorX = 0;
    let doorY = 0;
    run(g, 60 * 12, (g) => {
      const bs = g.state.boss;
      if (bs.airlockState === 2 && !pulled) {
        const al = g.config.map.airlocks[bs.airlock]!;
        doorX = al.x;
        doorY = al.y;
        const l = Math.hypot(al.x, al.y);
        // Один стоїть під самими дверима, інший — ближче до центру.
        a!.x = a!.px = al.x - (al.x / l) * 2.2;
        a!.y = a!.py = al.y - (al.y / l) * 2.2;
        b!.x = b!.px = al.x * 0.6;
        b!.y = b!.py = al.y * 0.6;
        pulled = Math.hypot(al.x - b!.x, al.y - b!.y);
      }
      for (let i = 0; i < g.events.count; i++)
        if (g.events.list[i]!.type === 'sucked') sucked = true;
    });
    expect(pulled).toBeGreaterThan(0);
    expect(sucked).toBe(true);
    expect(a!.down).toBe(true);
    expect(Math.hypot(a!.x - doorX, a!.y - doorY)).toBeLessThan(5);
    expect(Math.hypot(doorX - b!.x, doorY - b!.y)).toBeLessThan(pulled);
  });

  test('phase 3 cycles rockets, sniper laser, swarm and crane with pauses', () => {
    const g = bossFight();
    g.state.players[0]!.hp = g.state.players[0]!.maxHp = 1e6;
    hitCore(g, 1e6);
    g.state.boss.transition = 0;
    hitCore(g, 1e6);
    g.state.boss.transition = 0;
    expect(g.state.boss.phase).toBe(3);
    const seen = new Set<string>();
    run(g, 60 * 16, (g) => {
      for (let i = 0; i < g.events.count; i++) {
        const e = g.events.list[i]!;
        if (e.type === 'rocket') seen.add('rocket');
        if (e.type === 'enemyShot' && e.b === 2) seen.add('laser');
        if (e.type === 'spawn' && g.state.enemies[e.a]!.type === 'swarm') seen.add('swarm');
        if (e.type === 'craneHit') seen.add('crane');
      }
    });
    expect([...seen].sort()).toEqual(['crane', 'laser', 'rocket', 'swarm']);
  });
});
