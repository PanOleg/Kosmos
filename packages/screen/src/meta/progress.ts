import type { MatchSummary } from '@horizon/sim/protocol';

/**
 * Мета-прогрес екіпажу (DECISIONS.md, п. 48): рекорди, досягнення, щоденний контракт.
 * Зберігається на пристрої з екраном (localStorage): пульти анонімні, тож прогрес — спільний
 * для всіх, хто грає на цьому екрані. Нагороди лише косметичні (забарвлення броні),
 * баланс матчу не змінюється. Без DOM: сховище й дата передаються — логіка тестується.
 */

export interface Records {
  matches: number;
  wins: number;
  kills: number;
  revives: number;
  parts: number;
  bestWave: number;
  /** Найшвидша перемога, с; 0 — ще не було. */
  fastestWin: number;
  /** Найбільше вбивств одного гравця за матч. */
  bestKills: number;
  /** Нескінченний режим: найдальша хвиля. */
  endlessBest: number;
  /** Сумарно за класами — для класових досягнень. */
  classKills: Record<string, number>;
  classRevives: Record<string, number>;
  classWins: Record<string, number>;
}

/** Рядок таблиці рекордів нескінченного режиму. */
export interface BoardEntry {
  wave: number;
  players: number;
  map: string;
  day: number;
}

export interface Progress {
  v: 1;
  records: Records;
  /** id досягнення → день (номер дня від епохи), коли отримано. */
  achievements: Record<string, number>;
  /** Останній день виконаного контракту та серія днів поспіль. */
  contractDay: number;
  streak: number;
  /** Топ-5 нескінченного режиму на цьому екрані. */
  board: BoardEntry[];
}

/** Що змінилось після матчу — для екрана результатів. */
export interface MatchOutcome {
  newAchievements: string[];
  /** Ключі побитих рекордів: 'bestWave', 'fastestWin', 'bestKills'. */
  newRecords: string[];
  contractDone: boolean;
  streak: number;
  /** Місце в таблиці нескінченного режиму (1..5) або 0. */
  boardPlace: number;
}

/** Контекст матчу, якого немає в підсумку. */
export interface MatchContext {
  preset: string;
  /** Номер хвилі Прораба (1-based); 0 — немає. */
  foremanWave: number;
  day: number;
}

export const SKINS = [
  'standard',
  'graphite',
  'desert',
  'arctic',
  'chrome',
  'gold',
  'crimson',
  'amber',
  'jade',
  'cobalt',
  'dune',
  'frost',
  'neon',
  'void',
] as const;
export type SkinId = (typeof SKINS)[number];

interface Achievement {
  id: string;
  /** Забарвлення, яке відкриває. */
  skin?: SkinId;
  test: (s: MatchSummary, ctx: MatchContext, p: Progress) => boolean;
}

const total = (s: MatchSummary, f: (p: MatchSummary['players'][number]) => number) =>
  s.players.reduce((a, p) => a + f(p), 0);
const passedForeman = (s: MatchSummary, ctx: MatchContext) =>
  ctx.foremanWave > 0 && (s.beatCore || s.wave > ctx.foremanWave);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', test: () => true },
  { id: 'wave5', test: (s) => s.wave >= 5 },
  { id: 'foreman', test: (s, c) => passedForeman(s, c) },
  { id: 'victory', skin: 'desert', test: (s) => s.beatCore },
  { id: 'hardWin', skin: 'gold', test: (s, c) => s.beatCore && c.preset === 'hard' },
  { id: 'untouched', skin: 'chrome', test: (s) => s.won && s.players.every((p) => p.downs === 0) },
  { id: 'angel', skin: 'arctic', test: (s) => s.players.some((p) => p.revives >= 5) },
  { id: 'hundred', skin: 'graphite', test: (s) => s.players.some((p) => p.kills >= 100) },
  { id: 'fullCrew', test: (s) => s.players.length === 4 },
  { id: 'veteran', test: (_s, _c, p) => p.records.kills >= 1000 },
  { id: 'regular', test: (_s, _c, p) => p.records.matches >= 10 },
  { id: 'streak3', test: (_s, _c, p) => p.streak >= 3 },
  // Класові (сумарно за всі матчі) — кожне відкриває забарвлення.
  {
    id: 'assault500',
    skin: 'crimson',
    test: (_s, _c, p) => (p.records.classKills.assault ?? 0) >= 500,
  },
  { id: 'engineer3', skin: 'amber', test: (_s, _c, p) => (p.records.classWins.engineer ?? 0) >= 3 },
  { id: 'medic30', skin: 'jade', test: (_s, _c, p) => (p.records.classRevives.medic ?? 0) >= 30 },
  { id: 'tech500', skin: 'cobalt', test: (_s, _c, p) => (p.records.classKills.tech ?? 0) >= 500 },
  // Карти й режими.
  { id: 'desertWin', skin: 'dune', test: (s) => s.beatCore && s.map === 'desert' },
  { id: 'iceWin', skin: 'frost', test: (s) => s.beatCore && s.map === 'ice' },
  { id: 'modWin', skin: 'neon', test: (s) => s.beatCore && s.modifiers.length > 0 },
  { id: 'endless20', skin: 'void', test: (s) => s.endless && s.wave >= 20 },
];

/** Щоденні контракти: один на день, однаковий для всіх на цю дату. */
export const CONTRACTS: {
  id: string;
  goal: number;
  test: (s: MatchSummary, c: MatchContext) => boolean;
}[] = [
  { id: 'wave', goal: 6, test: (s) => s.wave >= 6 },
  { id: 'parts', goal: 300, test: (s) => total(s, (p) => p.parts) >= 300 },
  { id: 'kills', goal: 150, test: (s) => total(s, (p) => p.kills) >= 150 },
  { id: 'revives', goal: 3, test: (s) => total(s, (p) => p.revives) >= 3 },
  { id: 'foreman', goal: 1, test: (s, c) => passedForeman(s, c) },
  { id: 'win', goal: 1, test: (s) => s.beatCore },
];

export function contractOf(day: number): (typeof CONTRACTS)[number] {
  // Перемішування дня, щоб сусідні дні не йшли по колу в тому самому порядку.
  const h = Math.imul(day ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return CONTRACTS[h % CONTRACTS.length]!;
}

/** Номер дня в місцевому часі: контракт змінюється опівночі гравця, а не за UTC. */
export function dayNumber(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

export function emptyProgress(): Progress {
  return {
    v: 1,
    records: {
      matches: 0,
      wins: 0,
      kills: 0,
      revives: 0,
      parts: 0,
      bestWave: 0,
      fastestWin: 0,
      bestKills: 0,
      endlessBest: 0,
      classKills: {},
      classRevives: {},
      classWins: {},
    },
    achievements: {},
    contractDay: -1,
    streak: 0,
    board: [],
  };
}

export function unlockedSkins(p: Progress): SkinId[] {
  const out: SkinId[] = ['standard'];
  for (const a of ACHIEVEMENTS) if (a.skin && p.achievements[a.id] !== undefined) out.push(a.skin);
  return SKINS.filter((s) => out.includes(s));
}

/** Серія «живе», якщо контракт виконано сьогодні або вчора. */
export function liveStreak(p: Progress, day: number): number {
  return p.contractDay >= day - 1 ? p.streak : 0;
}

/** Зараховує матч: рекорди, контракт, досягнення. Змінює p на місці. */
export function recordMatch(p: Progress, s: MatchSummary, ctx: MatchContext): MatchOutcome {
  const r = p.records;
  const newRecords: string[] = [];
  const bestKills = Math.max(0, ...s.players.map((q) => q.kills));
  r.matches++;
  if (s.beatCore) r.wins++;
  for (const q of s.players) {
    r.classKills[q.classId] = (r.classKills[q.classId] ?? 0) + q.kills;
    r.classRevives[q.classId] = (r.classRevives[q.classId] ?? 0) + q.revives;
    if (s.beatCore) r.classWins[q.classId] = (r.classWins[q.classId] ?? 0) + 1;
  }
  // Нескінченний режим: власний рекорд і таблиця топ-5 (звичайні рекорди хвилі не чіпає).
  let boardPlace = 0;
  if (s.endless) {
    if (s.wave > r.endlessBest) {
      if (r.endlessBest > 0) newRecords.push('endlessBest');
      r.endlessBest = s.wave;
    }
    const entry: BoardEntry = { wave: s.wave, players: s.players.length, map: s.map, day: ctx.day };
    p.board.push(entry);
    p.board.sort((a, b) => b.wave - a.wave || a.day - b.day);
    p.board.length = Math.min(p.board.length, 5);
    boardPlace = p.board.indexOf(entry) + 1;
  }
  r.kills += total(s, (q) => q.kills);
  r.revives += total(s, (q) => q.revives);
  r.parts += total(s, (q) => q.parts);
  if (!s.endless && s.wave > r.bestWave) {
    if (r.bestWave > 0) newRecords.push('bestWave');
    r.bestWave = s.wave;
  }
  if (!s.endless && s.won && (r.fastestWin === 0 || s.seconds < r.fastestWin)) {
    if (r.fastestWin > 0) newRecords.push('fastestWin');
    r.fastestWin = s.seconds;
  }
  if (bestKills > r.bestKills) {
    if (r.bestKills > 0) newRecords.push('bestKills');
    r.bestKills = bestKills;
  }

  let contractDone = false;
  if (p.contractDay !== ctx.day && contractOf(ctx.day).test(s, ctx)) {
    p.streak = p.contractDay === ctx.day - 1 ? p.streak + 1 : 1;
    p.contractDay = ctx.day;
    contractDone = true;
  }

  const newAchievements: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id] !== undefined || !a.test(s, ctx, p)) continue;
    p.achievements[a.id] = ctx.day;
    newAchievements.push(a.id);
  }
  return {
    newAchievements,
    newRecords,
    contractDone,
    streak: liveStreak(p, ctx.day),
    boardPlace,
  };
}

/** Мінімальний інтерфейс localStorage: у тестах — Map. */
export interface KeyValue {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const KEY = 'horizon-progress';

export function loadProgress(store: KeyValue | null): Progress {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Progress;
    if (p.v !== 1) return emptyProgress();
    // Нові поля рекордів у старих збереженнях.
    p.records = { ...emptyProgress().records, ...p.records };
    p.board ??= [];
    return p;
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(store: KeyValue | null, p: Progress): void {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    // Приватний режим або переповнене сховище: прогрес просто не збережеться.
  }
}
