import { describe, expect, test } from 'vitest';
import { createGame, matchSummary } from '../src/index';
import { knockDown } from '../src/systems/damage';

function duo() {
  return createGame(undefined, 3, [{ classId: 'assault' }, { classId: 'medic' }]);
}

describe('match summary', () => {
  test('leaders get awards; zero never earns one', () => {
    const g = duo();
    const [a, m] = g.state.players;
    a!.stats.kills = 30;
    m!.stats.kills = 12;
    m!.stats.partsCollected = 80.7;
    a!.stats.partsCollected = 40;
    a!.stats.damageTaken = 220;
    const s = matchSummary(g);
    expect(s.players[0]!.awards).toEqual(['kills', 'tank']);
    expect(s.players[1]!.awards).toEqual(['parts']);
    expect(s.players[1]!.parts).toBe(80);
  });

  test('downs are counted and untouched is only for a win', () => {
    const g = duo();
    knockDown(g, g.state.players[0]!);
    expect(g.state.players[0]!.stats.downs).toBe(1);
    expect(matchSummary(g).players[1]!.awards).not.toContain('untouched');
    g.state.phase = 'won';
    const s = matchSummary(g);
    expect(s.won).toBe(true);
    expect(s.players[1]!.awards).toContain('untouched');
    expect(s.players[0]!.awards).not.toContain('untouched');
  });

  test('wave number is 1-based and bounded', () => {
    const g = duo();
    expect(matchSummary(g).wave).toBe(1);
    g.state.wave.index = 99;
    expect(matchSummary(g).wave).toBe(g.config.waves.length);
  });

  test('a solo player gets no leader awards', () => {
    const g = createGame(undefined, 1, [{ classId: 'tech' }]);
    g.state.players[0]!.stats.kills = 50;
    expect(matchSummary(g).players[0]!.awards).toEqual([]);
  });
});
