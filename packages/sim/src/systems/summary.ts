import { TICKS_PER_SEC } from '../math';
import type { MatchSummary, PlayerSummary } from '../protocol';
import type { Game } from '../state';

/**
 * Відзнаки (DECISIONS.md, п. 46): лідер кожної категорії, якщо він помітно виділився.
 * Без відзнак за нуль: «Рятівник» лише з воскресіннями, «Без падінь» — тільки разом з
 * перемогою: у поразці впали всі.
 */
const CATEGORIES: { key: string; score: (p: PlayerSummary) => number; min: number }[] = [
  { key: 'kills', score: (p) => p.kills, min: 1 },
  { key: 'revives', score: (p) => p.revives, min: 1 },
  { key: 'parts', score: (p) => p.parts, min: 1 },
  { key: 'tank', score: (p) => p.damageTaken, min: 1 },
];

export function matchSummary(game: Game): MatchSummary {
  const s = game.state;
  const players: PlayerSummary[] = s.players.map((p) => ({
    classId: p.classId,
    kills: p.stats.kills,
    parts: Math.floor(p.stats.partsCollected),
    revives: p.stats.revives,
    downs: p.stats.downs,
    damageDealt: Math.round(p.stats.damageDealt),
    damageTaken: Math.round(p.stats.damageTaken),
    awards: [],
  }));
  const won = s.phase === 'won';
  // Відзнаки мають сенс, коли є з ким порівнювати; одинак отримує лише «Без падінь».
  if (players.length > 1)
    for (const c of CATEGORIES) {
      let best = -1;
      for (let i = 0; i < players.length; i++) {
        const v = c.score(players[i]!);
        if (v >= c.min && (best < 0 || v > c.score(players[best]!))) best = i;
      }
      if (best >= 0) players[best]!.awards.push(c.key);
    }
  if (won) for (const p of players) if (p.downs === 0) p.awards.push('untouched');
  const firstCore = game.config.waves.findIndex((w) => w.boss === 'core');
  return {
    beatCore: won || (game.config.endless && firstCore >= 0 && s.wave.index > firstCore),
    endless: game.config.endless,
    map: game.config.map.id,
    modifiers: [...game.config.modifiers],
    won,
    wave: Math.min(s.wave.index + 1, game.config.waves.length),
    waves: game.config.waves.length,
    seconds: Math.floor(s.tick / TICKS_PER_SEC),
    players,
  };
}
