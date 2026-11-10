import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  spawnEnemy,
  hasLineOfSight,
  GUNNER_HIDE,
  GUNNER_PEEK,
  type Game,
  type PlayerInput,
} from '../src/index';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false });

/** Гравець без зброї: перевіряємо лише поведінку ворога. */
function unarmed(g: Game) {
  const a = g.config.classes.assault;
  g.config = {
    ...g.config,
    classes: { ...g.config.classes, assault: { ...a, weapon: { ...a.weapon, range: 0 } } },
  };
}

function setup(px: number, py: number, ex: number, ey: number) {
  const g = createGame(undefined, 3);
  unarmed(g);
  const p = g.state.players[0]!;
  p.x = p.px = px;
  p.y = p.py = py;
  const idx = spawnEnemy(g, 'gunner', ex, ey);
  return { g, p, e: g.state.enemies[idx]! };
}

describe('gunner', () => {
  test('takes cover hidden from the player, then peeks into view', () => {
    // Гравець у центрі на півночі від ядра, Стрілець з'являється в контейнерах.
    const { g, p, e } = setup(0, 6, 0, 24);
    let hidden = false;
    let peekedVisible = false;
    for (let i = 0; i < 60 * 10; i++) {
      step(g, [idle()]);
      if (e.ai === GUNNER_HIDE && !hasLineOfSight(g.world, p.x, p.y, e.x, e.y)) hidden = true;
      if (e.ai === GUNNER_PEEK && hasLineOfSight(g.world, p.x, p.y, e.x, e.y)) peekedVisible = true;
    }
    expect(hidden).toBe(true);
    expect(peekedVisible).toBe(true);
    expect(p.stats.damageTaken).toBeGreaterThan(0);
  });

  test('fires on a steady rhythm, not a burst', () => {
    const { g, p } = setup(0, 6, 6, 16);
    const hits: number[] = [];
    let prev = 0;
    for (let i = 0; i < 60 * 12; i++) {
      step(g, [idle()]);
      if (p.stats.damageTaken > prev) hits.push(i);
      prev = p.stats.damageTaken;
      p.hp = p.maxHp;
    }
    expect(hits.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < hits.length; k++)
      expect(hits[k]! - hits[k - 1]!).toBeGreaterThanOrEqual(60);
  });

  test('a dash through the shot avoids damage', () => {
    const { g, p } = setup(0, 6, 0, 24);
    let dodged = 0;
    let prevShots = 0;
    for (let i = 0; i < 60 * 12; i++) {
      const incoming = g.state.projectiles.some(
        (b) => b.alive && b.team === 1 && Math.hypot(b.x - p.x, b.y - p.y) < 3,
      );
      const dash = incoming && p.dashCd === 0;
      if (dash) dodged++;
      step(g, [{ move: { x: dash ? 1 : 0, y: 0 }, ability: false, dash }]);
      prevShots = dodged;
    }
    expect(prevShots).toBeGreaterThan(0);
    expect(p.stats.damageTaken).toBeLessThan(12 * 2);
  });

  test('flanking exposes a hiding gunner and makes it relocate', () => {
    const { g, p, e } = setup(0, 6, 6, 16);
    for (let i = 0; i < 60 * 4 && e.ai !== GUNNER_HIDE; i++) step(g, [idle()]);
    expect(e.ai).toBe(GUNNER_HIDE);
    const coverX = e.coverX;
    const coverY = e.coverY;
    // Переносимо гравця вбік, туди, звідки укриття не закриває.
    let exposed = false;
    for (const [ox, oy] of [
      [8, 0],
      [-8, 0],
      [6, 6],
      [-6, 6],
      [0, 8],
      [6, -4],
      [-6, -4],
    ] as const) {
      p.x = p.px = coverX + ox;
      p.y = p.py = coverY + oy;
      if (hasLineOfSight(g.world, p.x, p.y, e.x, e.y)) {
        exposed = true;
        break;
      }
    }
    expect(exposed).toBe(true);
    for (let i = 0; i < 60 * 3; i++) step(g, [idle()]);
    expect(e.coverX !== coverX || e.coverY !== coverY).toBe(true);
  });
});
