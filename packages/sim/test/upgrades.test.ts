import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  spawnEnemy,
  abilityReadiness,
  shopOpen,
  BUY_ABILITY,
  BUY_ARMOR,
  BUY_MEDKIT,
  BUY_WEAPON,
  type ClassId,
  type Game,
  type PlayerInput,
} from '../src/index';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 });
const buy = (item: number): PlayerInput => ({
  move: { x: 0, y: 0 },
  ability: false,
  dash: false,
  buy: item,
});

/** Матч у паузі перед першою хвилею: магазин відкритий. */
function shop(classId: ClassId = 'assault', parts = 200): Game {
  const g = createGame(undefined, 3, [{ classId }]);
  g.state.players[0]!.parts = parts;
  return g;
}

/** Натиснути й відпустити товар (передній фронт). */
function purchase(g: Game, item: number) {
  step(g, [buy(item)]);
  step(g, [idle()]);
}

describe('upgrades', () => {
  test('shop is open only during the pause before a wave', () => {
    const g = shop();
    expect(shopOpen(g)).toBe(true);
    while (g.state.wave.phase === 'pause') step(g, [idle()]);
    expect(shopOpen(g)).toBe(false);
    const parts = g.state.players[0]!.parts;
    purchase(g, BUY_WEAPON);
    expect(g.state.players[0]!.upg.weapon).toBe(0);
    expect(g.state.players[0]!.parts).toBe(parts);
  });

  test('prices follow BALANCE and cap at level 3', () => {
    const g = shop('assault', 200);
    const p = g.state.players[0]!;
    for (let i = 0; i < 4; i++) purchase(g, BUY_WEAPON);
    expect(p.upg.weapon).toBe(3);
    expect(p.parts).toBe(200 - 10 - 20 - 35);
    expect(p.stats.partsSpent).toBe(65);
  });

  test('holding the button buys once', () => {
    const g = shop();
    for (let i = 0; i < 30; i++) step(g, [buy(BUY_ARMOR)]);
    expect(g.state.players[0]!.upg.armor).toBe(1);
  });

  test('not enough parts — nothing happens', () => {
    const g = shop('assault', 9);
    purchase(g, BUY_WEAPON);
    expect(g.state.players[0]!.upg.weapon).toBe(0);
    expect(g.state.players[0]!.parts).toBe(9);
  });

  test('armor raises max and current HP', () => {
    const g = shop();
    const p = g.state.players[0]!;
    purchase(g, BUY_ARMOR);
    expect(p.maxHp).toBe(145);
    expect(p.hp).toBe(145);
  });

  test('weapon level adds 20% damage per level', () => {
    const g = shop();
    purchase(g, BUY_WEAPON);
    purchase(g, BUY_WEAPON);
    while (g.state.wave.phase === 'pause') step(g, [idle()]);
    for (const e of g.state.enemies) e.alive = false;
    g.state.enemiesAlive = 0;
    const p = g.state.players[0]!;
    const e = g.state.enemies[spawnEnemy(g, 'gunner', p.x + 5, p.y)]!;
    for (let i = 0; i < 30 && e.hp === e.maxHp; i++) step(g, [idle()]);
    expect(e.maxHp - e.hp).toBeCloseTo(12 * 1.4, 5);
  });

  test('ability level shortens cooldown by 20% per level', () => {
    const g = shop('tech');
    const p = g.state.players[0]!;
    purchase(g, BUY_ABILITY);
    step(g, [{ ...idle(), ability: true }]);
    // 16 с × 0.8 = 12.8 с.
    expect(p.abilityCd).toBe(Math.round(12.8 * 60));
    expect(abilityReadiness(g, p)).toBeCloseTo(0, 2);
  });

  test('level 3 ability boosts EMP radius', () => {
    const g = shop('tech');
    const p = g.state.players[0]!;
    for (let i = 0; i < 3; i++) purchase(g, BUY_ABILITY);
    expect(p.upg.ability).toBe(3);
    const e = g.state.enemies[spawnEnemy(g, 'scout', p.x + 8, p.y)]!;
    step(g, [{ ...idle(), ability: true }]);
    expect(e.stun).toBeGreaterThan(0);
  });

  test('medkit heals 50, once per pause, and needs missing HP', () => {
    const g = shop();
    const p = g.state.players[0]!;
    purchase(g, BUY_MEDKIT);
    expect(p.parts).toBe(200);
    p.hp = 40;
    purchase(g, BUY_MEDKIT);
    expect(p.hp).toBe(90);
    expect(p.parts).toBe(192);
    p.hp = 40;
    purchase(g, BUY_MEDKIT);
    expect(p.hp).toBe(40);
  });
});
