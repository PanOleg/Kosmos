import type { GameState } from './state';

/**
 * Поки що JSON зі стабільним порядком ключів: достатньо для тестів детермінізму й налагодження.
 * Бінарний компактний формат з'явиться разом із мережевою синхронізацією стану.
 */
export function serializeState(s: GameState): string {
  return JSON.stringify(s);
}

/** FNV-1a над серіалізованим станом — швидке порівняння прогонів. */
export function hashState(s: GameState): number {
  const str = serializeState(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
