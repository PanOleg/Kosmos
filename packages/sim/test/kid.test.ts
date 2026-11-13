import { describe, expect, test } from 'vitest';
import { createGame, fighterCount, spawnEnemy, step, type PlayerInput } from '../src/index';
import { damagePlayer, knockDown } from '../src/systems/damage';
import { dropParts } from '../src/systems/pickups';
import { allLost } from '../src/systems/revive';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 });

describe('kid (armored class)', () => {
  test('takes no damage and cannot be knocked down', () => {
    const g = createGame(undefined, 1, [{ classId: 'assault' }, { classId: 'kid' }]);
    const kid = g.state.players[1]!;
    damagePlayer(g, kid, 9999, 0, 0);
    knockDown(g, kid);
    expect(kid.hp).toBe(kid.maxHp);
    expect(kid.down).toBe(false);
    expect(g.events.list.slice(0, g.events.count).some((e) => e.type === 'armorBlock')).toBe(true);
  });

  test('does not count for enemy numbers; a lone fighter beside a kid keeps solo rules', () => {
    const g = createGame(undefined, 1, [{ classId: 'assault' }, { classId: 'kid' }]);
    expect(fighterCount(g.state.players)).toBe(1);
    expect(g.state.players[0]!.autoRevives).toBeGreaterThan(0);
    expect(g.state.players[1]!.autoRevives).toBe(0);
    const solo = createGame(undefined, 1, [{ classId: 'kid' }]);
    expect(fighterCount(solo.state.players)).toBe(1);
  });

  test('enemies hunt the fighters, and the match is lost when all fighters are down', () => {
    const g = createGame(undefined, 1, [{ classId: 'assault' }, { classId: 'kid' }]);
    g.config = { ...g.config, waves: [] };
    g.state.wave.phase = 'done';
    const [a, kid] = g.state.players;
    a!.x = a!.px = 15;
    kid!.x = kid!.px = -15;
    a!.y = kid!.y = 0;
    // Ворог поруч із Малюком усе одно йде на бійця.
    const i = spawnEnemy(g, 'scout', -13, 0);
    step(g, [idle(), idle()]);
    expect(g.state.enemies[i]!.target).toBe(0);
    a!.autoRevives = 0;
    expect(allLost(g)).toBe(false);
    damagePlayer(g, a!, 9999, 0, 0);
    expect(allLost(g)).toBe(true);
    // Самі Малюки програти не можуть.
    const solo = createGame(undefined, 1, [{ classId: 'kid' }]);
    expect(allLost(solo)).toBe(false);
  });

  test('does not collect parts: they fly past the kid to a fighter', () => {
    const g = createGame(undefined, 1, [{ classId: 'assault' }, { classId: 'kid' }]);
    g.config = { ...g.config, waves: [] };
    g.state.wave.phase = 'done';
    const [a, kid] = g.state.players;
    a!.x = a!.px = 10;
    kid!.x = kid!.px = -10;
    a!.y = kid!.y = 0;
    dropParts(g, -10, 0, 5);
    for (let i = 0; i < 120; i++) step(g, [idle(), idle()]);
    expect(kid!.parts).toBe(0);
    expect(g.state.pickups.some((p) => p.alive)).toBe(true);
    a!.x = a!.px = -10.5;
    for (let i = 0; i < 120; i++) step(g, [idle(), idle()]);
    expect(a!.parts).toBeGreaterThan(0);
    expect(kid!.parts).toBe(0);
  });
});
