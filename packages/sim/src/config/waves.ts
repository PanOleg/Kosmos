import type { EnemyType } from './enemies';

/**
 * Хвиля = послідовність груп. Група з'являється, коли настав її час від старту хвилі
 * або коли живих ворогів лишилося менше за pressureBelow — тиск не спадає, якщо гравець швидкий.
 */
export interface SpawnGroup {
  type: EnemyType;
  /** Кількість для одного гравця; множиться на PLAYER_COUNT_MUL і складність. */
  count: number;
  /** Секунди від старту хвилі. */
  at: number;
  /** Індекс шлюзу 0..3 (пн, сх, пд, зх) або 'any' — наступний за колом. */
  airlock: number | 'any';
}

export interface WaveDef {
  name: string;
  /** Пауза перед хвилею (сигнал станції + час на покращення). */
  pause: number;
  groups: SpawnGroup[];
  /** Множник швидкості ворогів у навчальних хвилях (DECISIONS.md, п. 2). */
  speedMul: number;
  /** Множник деталей (хвиля-передих). */
  partsMul: number;
  pressureBelow: number;
}

/** BALANCE.md: 1 → ×1, 2 → ×1.6, 3 → ×2.3, 4 → ×3. */
export const PLAYER_COUNT_MUL = [1, 1, 1.6, 2.3, 3];

/**
 * Вертикальний зріз: одна хвиля, Стрільці — розумний ворог, Скаути — масовка (DECISIONS.md, п. 17).
 * Повна таблиця з BALANCE.md з'явиться разом з рештою ворогів.
 */
export const SLICE_WAVES: WaveDef[] = [
  {
    name: 'Хвиля 1',
    pause: 5,
    speedMul: 0.75,
    partsMul: 1,
    pressureBelow: 3,
    groups: [
      { type: 'scout', count: 4, at: 0, airlock: 0 },
      { type: 'gunner', count: 1, at: 3, airlock: 0 },
      { type: 'scout', count: 3, at: 9, airlock: 1 },
      { type: 'gunner', count: 1, at: 13, airlock: 2 },
      { type: 'scout', count: 4, at: 18, airlock: 2 },
      { type: 'gunner', count: 1, at: 22, airlock: 1 },
      { type: 'scout', count: 4, at: 26, airlock: 'any' },
      { type: 'gunner', count: 1, at: 30, airlock: 3 },
      { type: 'scout', count: 5, at: 33, airlock: 'any' },
    ],
  },
];

export const PICKUPS = {
  /** Деталь лежить стільки, потім зникає (останні 3 с блимає). */
  life: 25,
  /** Розліт деталей при вбивстві, м/с. */
  scatter: 3.5,
  /** Частка кожного підбору, що ділиться між усіма живими (DECISIONS.md, п. 10). */
  sharedFraction: 0.25,
  /** Після зачистки хвилі всі деталі злітаються до гравців стільки секунд. */
  vacuum: 2.5,
};
