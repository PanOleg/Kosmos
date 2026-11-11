import { describe, expect, test } from 'vitest';
import type { MatchSummary, PlayerSummary } from '@horizon/sim/protocol';
import {
  contractOf,
  dayNumber,
  emptyProgress,
  liveStreak,
  loadProgress,
  recordMatch,
  saveProgress,
  unlockedSkins,
  CONTRACTS,
} from '../src/meta/progress';
import { nextHint } from '../src/meta/hint';

function pl(o: Partial<PlayerSummary> = {}): PlayerSummary {
  return {
    classId: 'assault',
    kills: 10,
    parts: 50,
    revives: 0,
    downs: 1,
    damageDealt: 0,
    damageTaken: 0,
    awards: [],
    ...o,
  };
}
function sum(o: Partial<MatchSummary> = {}): MatchSummary {
  return {
    won: false,
    wave: 3,
    waves: 11,
    seconds: 300,
    players: [pl()],
    beatCore: o.won ?? false,
    endless: false,
    map: 'station',
    modifiers: [],
    ...o,
  };
}
const ctx = (day = 100, preset = 'normal') => ({ preset, foremanWave: 6, day });

describe('next-step hint', () => {
  test('one fitting suggestion per outcome', () => {
    const win = (o: Partial<MatchSummary> = {}) => sum({ won: true, wave: 11, ...o });
    expect(nextHint(win({ players: [pl({ downs: 0 })] }), 'normal')).toBe('harder');
    expect(nextHint(win({ players: [pl({ downs: 0 })] }), 'hard')).toBe('tryMods');
    expect(nextHint(win({ modifiers: ['rush'] }), 'normal')).toBe('tryMap');
    expect(nextHint(win({ modifiers: ['rush'], map: 'ice' }), 'normal')).toBe('tryEndless');
    expect(nextHint(sum({ wave: 11 }), 'normal')).toBe('core');
    expect(nextHint(sum({ wave: 2 }), 'normal')).toBe('easier');
    expect(nextHint(sum({ wave: 2 }), 'easy')).toBe('together');
    expect(nextHint(sum({ wave: 7 }), 'normal')).toBe('shop');
    expect(nextHint(sum({ wave: 7, players: [pl(), pl()] }), 'normal')).toBe('revive');
    expect(nextHint(sum({ endless: true, wave: 14 }), 'normal')).toBeNull();
  });
});

describe('meta progress', () => {
  test('first match unlocks «first», records start without «broken» noise', () => {
    const p = emptyProgress();
    const out = recordMatch(p, sum(), ctx());
    expect(out.newAchievements).toContain('first');
    expect(out.newRecords).toEqual([]);
    expect(p.records).toMatchObject({ matches: 1, kills: 10, bestWave: 3 });
  });

  test('records are reported only when beaten', () => {
    const p = emptyProgress();
    recordMatch(p, sum({ wave: 4 }), ctx());
    expect(recordMatch(p, sum({ wave: 3 }), ctx()).newRecords).toEqual([]);
    expect(recordMatch(p, sum({ wave: 7 }), ctx()).newRecords).toEqual(['bestWave']);
    recordMatch(p, sum({ won: true, wave: 11, seconds: 900 }), ctx());
    expect(recordMatch(p, sum({ won: true, wave: 11, seconds: 800 }), ctx()).newRecords).toContain(
      'fastestWin',
    );
  });

  test('cosmetic skins unlock from achievements, nothing else changes', () => {
    const p = emptyProgress();
    expect(unlockedSkins(p)).toEqual(['standard']);
    recordMatch(
      p,
      sum({ won: true, wave: 11, players: [pl({ downs: 0, kills: 120, revives: 5 })] }),
      ctx(100, 'hard'),
    );
    expect(unlockedSkins(p)).toEqual([
      'standard',
      'graphite',
      'desert',
      'arctic',
      'chrome',
      'gold',
    ]);
  });

  test('endless: own record and a top-5 board; class totals unlock class skins', () => {
    const p = emptyProgress();
    const e = (wave: number) =>
      sum({
        endless: true,
        wave,
        beatCore: wave > 11,
        players: [pl({ classId: 'tech', kills: 260 })],
      });
    expect(recordMatch(p, e(14), ctx()).boardPlace).toBe(1);
    const out = recordMatch(p, e(22), ctx());
    expect(out.newRecords).toContain('endlessBest');
    expect(out.newAchievements).toEqual(expect.arrayContaining(['endless20', 'tech500']));
    for (const w of [5, 6, 7, 8, 9]) recordMatch(p, e(w), ctx());
    expect(p.board.map((b) => b.wave)).toEqual([22, 14, 9, 8, 7]);
    expect(recordMatch(p, e(3), ctx()).boardPlace).toBe(0);
    // Звичайний рекорд хвилі нескінченний режим не чіпає.
    expect(p.records.bestWave).toBe(0);
    expect(unlockedSkins(p)).toEqual(expect.arrayContaining(['void', 'cobalt']));
  });

  test('map wins are counted; all three maps unlock «explorer»; three modifiers — «daredevil»', () => {
    const p = emptyProgress();
    const win = (map: string, modifiers: string[] = []) =>
      recordMatch(p, sum({ won: true, wave: 11, map, modifiers }), ctx());
    expect(win('station').newAchievements).not.toContain('explorer');
    win('desert');
    expect(win('ice', ['rush', 'glass', 'ambush']).newAchievements).toEqual(
      expect.arrayContaining(['explorer', 'daredevil']),
    );
    expect(p.records.mapWins).toEqual({ station: 1, desert: 1, ice: 1 });
  });

  test('foreman achievement needs the foreman wave behind', () => {
    const p = emptyProgress();
    expect(recordMatch(p, sum({ wave: 6 }), ctx()).newAchievements).not.toContain('foreman');
    expect(recordMatch(p, sum({ wave: 7 }), ctx()).newAchievements).toContain('foreman');
  });

  test('daily contract: once a day, streak grows on consecutive days and breaks on a gap', () => {
    // Знаходимо дні, де контракт — «перемогти», щоб перевірити його явно.
    const winDays: number[] = [];
    for (let d = 0; winDays.length < 1 && d < 500; d++)
      if (contractOf(d).id === 'win') winDays.push(d);
    expect(winDays.length).toBe(1);
    const p = emptyProgress();
    const day = winDays[0]!;
    expect(recordMatch(p, sum({ won: false }), ctx(day)).contractDone).toBe(false);
    expect(recordMatch(p, sum({ won: true, wave: 11 }), ctx(day)).contractDone).toBe(true);
    expect(recordMatch(p, sum({ won: true, wave: 11 }), ctx(day)).contractDone).toBe(false);
    expect(p.streak).toBe(1);
    // Наступний день — інший контракт; виконуємо його «вручну» через стан.
    p.contractDay = day + 1;
    p.streak = 2;
    expect(liveStreak(p, day + 2)).toBe(2);
    expect(liveStreak(p, day + 3)).toBe(0);
  });

  test('every contract is reachable by a good match', () => {
    const great = sum({
      won: true,
      wave: 11,
      modifiers: ['rush'],
      players: [pl({ kills: 200, parts: 400, revives: 4, downs: 0 })],
    });
    for (const c of CONTRACTS) expect(c.test(great, ctx())).toBe(true);
  });

  test('local day boundary and storage round-trip; garbage resets', () => {
    expect(dayNumber(new Date(2026, 10, 11, 0, 1))).toBe(dayNumber(new Date(2026, 10, 11, 23, 59)));
    const m = new Map<string, string>();
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    const p = emptyProgress();
    recordMatch(p, sum(), ctx());
    saveProgress(store, p);
    expect(loadProgress(store).records.matches).toBe(1);
    m.set('horizon-progress', '{oops');
    expect(loadProgress(store).records.matches).toBe(0);
  });
});
