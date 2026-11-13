import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  spawnEnemy,
  abilityReadiness,
  type ClassId,
  type Game,
  type PlayerInput,
} from '../src/index';
import { damagePlayer } from '../src/systems/damage';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 });
const press = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: true, dash: false, buy: 0 });

/** Матч без хвиль: лише те, що ставить тест. */
function setup(classId: ClassId, x = -18, y = 0): Game {
  const g = createGame(undefined, 5, [{ classId }]);
  g.config = { ...g.config, waves: [] };
  g.state.wave.phase = 'done';
  const p = g.state.players[0]!;
  p.x = p.px = x;
  p.y = p.py = y;
  return g;
}

function run(g: Game, ticks: number, input = idle) {
  for (let i = 0; i < ticks; i++) step(g, [input()]);
}

describe('abilities', () => {
  test('ability fires on the press edge and goes on cooldown', () => {
    const g = setup('assault');
    const p = g.state.players[0]!;
    expect(abilityReadiness(g, p)).toBe(1);
    step(g, [press()]);
    expect(p.abilityT).toBeGreaterThan(0);
    // Утримання кнопки не перезапускає здібність.
    const t = p.abilityT;
    step(g, [press()]);
    expect(p.abilityT).toBe(t - 1);
    expect(abilityReadiness(g, p)).toBe(0);
  });

  test('assault overload doubles fire rate, then overheats', () => {
    const shotsIn = (g: Game, ticks: number) => {
      let n = 0;
      for (let i = 0; i < ticks; i++) {
        step(g, [idle()]);
        for (let k = 0; k < g.events.count; k++) if (g.events.list[k]!.type === 'shot') n++;
        // Ціль безсмертна: міряємо лише темп.
        for (const e of g.state.enemies) if (e.alive) e.hp = e.maxHp;
      }
      return n;
    };
    const normal = setup('assault');
    spawnEnemy(normal, 'gunner', -10, 0);
    const base = shotsIn(normal, 120);

    const over = setup('assault');
    spawnEnemy(over, 'gunner', -10, 0);
    step(over, [press()]);
    const boosted = shotsIn(over, 120);
    expect(boosted).toBeGreaterThanOrEqual(base * 2 - 1);

    // Після 5 с — 2 с перегріву без жодного пострілу.
    shotsIn(over, 60 * 3 + 5);
    expect(over.state.players[0]!.overheatT).toBeGreaterThan(0);
    expect(shotsIn(over, 100)).toBe(0);
  });

  test('engineer shields everyone nearby: the sphere absorbs 80 damage, then fades', () => {
    const g = createGame(undefined, 5, [
      { classId: 'engineer' },
      { classId: 'assault' },
      { classId: 'medic' },
    ]);
    g.config = { ...g.config, waves: [] };
    g.state.wave.phase = 'done';
    const [e, near, far] = g.state.players;
    e!.x = e!.px = -18;
    near!.x = near!.px = -15;
    far!.x = far!.px = -8;
    e!.y = near!.y = far!.y = 0;
    step(g, [press(), idle(), idle()]);
    expect(e!.shield).toBe(80);
    expect(near!.shield).toBe(80);
    expect(far!.shield).toBe(0);
    damagePlayer(g, near!, 50, 0, 0);
    expect(near!.hp).toBe(near!.maxHp);
    expect(near!.shield).toBe(30);
    // Залишок шкоди понад щит проходить у здоров'я.
    damagePlayer(g, near!, 50, 0, 0);
    expect(near!.shield).toBe(0);
    expect(near!.hp).toBe(near!.maxHp - 20);
    for (let i = 0; i < 60 * 8 + 2; i++) step(g, [idle(), idle(), idle()]);
    expect(e!.shield).toBe(0);
  });

  test('medic field heals allies in radius', () => {
    const g = createGame(undefined, 5, [{ classId: 'medic' }, { classId: 'assault' }]);
    g.config = { ...g.config, waves: [] };
    g.state.wave.phase = 'done';
    const [m, a] = g.state.players;
    m!.x = m!.px = -18;
    a!.x = a!.px = -16;
    m!.y = a!.y = 0;
    a!.hp = 50;
    step(g, [press(), idle()]);
    for (let i = 0; i < 60 * 2; i++) step(g, [idle(), idle()]);
    // ~15 HP/с за 2 с.
    expect(a!.hp).toBeGreaterThan(75);
    expect(a!.hp).toBeLessThan(85);
  });

  test('tech EMP stuns enemies in radius and cancels a windup', () => {
    const g = setup('tech');
    const near = g.state.enemies[spawnEnemy(g, 'scout', -14, 0)]!;
    const far = g.state.enemies[spawnEnemy(g, 'scout', 0, 20)]!;
    step(g, [press()]);
    expect(near.stun).toBeGreaterThan(0);
    expect(far.stun).toBe(0);
    const x = near.x;
    run(g, 60);
    expect(Math.abs(near.x - x)).toBeLessThan(0.5);
  });

  test('tech arc chains to up to three enemies with falloff', () => {
    const g = setup('tech');
    for (const [x, y] of [
      [-12, 0],
      [-10, 1],
      [-8, 0],
    ] as const)
      spawnEnemy(g, 'gunner', x, y);
    let arcs = 0;
    for (let i = 0; i < 40; i++) {
      step(g, [idle()]);
      for (let k = 0; k < g.events.count; k++) if (g.events.list[k]!.type === 'arc') arcs++;
      if (arcs > 0) break;
    }
    expect(arcs).toBe(3);
    const hp = g.state.enemies
      .filter((e) => e.alive)
      .map((e) => e.maxHp - e.hp)
      .sort((a, b) => b - a);
    expect(hp[0]).toBeCloseTo(15, 5);
    expect(hp[1]).toBeCloseTo(10.5, 5);
    expect(hp[2]).toBeCloseTo(7.35, 5);
  });
});
