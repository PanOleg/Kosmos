import type { MatchSummary } from '@horizon/sim/protocol';

/**
 * Порада «що далі» на екрані результатів (DECISIONS.md, п. 67): одна фраза за підсумком матчу.
 * Повертає ключ тексту (i18n.nextHint) — логіка без DOM, тестується.
 */
export type HintId =
  | 'harder'
  | 'tryMods'
  | 'tryEndless'
  | 'tryMap'
  | 'easier'
  | 'revive'
  | 'core'
  | 'together'
  | 'shop';

export function nextHint(s: MatchSummary, preset: string): HintId | null {
  if (s.endless) return null;
  const downs = s.players.reduce((a, p) => a + p.downs, 0);
  const revives = s.players.reduce((a, p) => a + p.revives, 0);
  if (s.won) {
    // Легка перемога — пропонуємо складніше; далі — режими, «Без кінця», інша карта.
    if (downs === 0 && preset !== 'hard') return 'harder';
    if (s.modifiers.length === 0) return 'tryMods';
    if (s.map === 'station') return 'tryMap';
    return 'tryEndless';
  }
  if (s.wave >= s.waves) return 'core';
  if (s.players.length > 1 && revives === 0 && downs >= s.players.length) return 'revive';
  if (s.wave <= 3) return preset === 'easy' ? 'together' : 'easier';
  return 'shop';
}
