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
  /** Індекс шлюзу 0..3 (пн, сх, пд, зх), 'any' — наступний за колом, 'center' — реакторна зала. */
  airlock: number | 'any' | 'center';
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
  /** Хвиля з босом: смуга здоров'я на екрані й скасування підкріплень з його смертю. */
  boss?: 'foreman' | 'core';
  /** Множник здоров'я ворогів хвилі (нескінченний режим). */
  hpMul?: number;
}

/** BALANCE.md: 1 → ×1, 2 → ×1.6, 3 → ×2.3, 4 → ×3. */
export const PLAYER_COUNT_MUL = [1, 1, 1.6, 2.3, 3];

type G = SpawnGroup;
const g = (type: G['type'], count: number, at: number, airlock: G['airlock']): G => ({
  type,
  count,
  at,
  airlock,
});

/**
 * Дев'ять хвиль BALANCE.md (кількості — для одного гравця). Групи розкладені в часі, щоб тиск
 * наростав; для дронів airlock — номер вентиляційного люка. Рахунок за типами збігається з таблицею.
 */
export const BALANCE_WAVES: WaveDef[] = [
  {
    name: '',
    pause: 10,
    speedMul: 0.75,
    partsMul: 1,
    pressureBelow: 2,
    groups: [g('scout', 4, 0, 0), g('scout', 4, 8, 0)],
  },
  {
    name: '',
    pause: 8,
    speedMul: 0.75,
    partsMul: 1,
    pressureBelow: 3,
    groups: [
      g('scout', 4, 0, 0),
      g('gunner', 1, 3, 0),
      g('scout', 4, 9, 0),
      g('gunner', 1, 13, 0),
      g('scout', 4, 18, 0),
      g('gunner', 1, 22, 0),
    ],
  },
  {
    name: '',
    pause: 8,
    speedMul: 1,
    partsMul: 1,
    pressureBelow: 3,
    groups: [
      g('scout', 4, 0, 0),
      g('gunner', 1, 2, 1),
      g('wasp', 2, 6, 3),
      g('scout', 4, 12, 1),
      g('gunner', 2, 16, 0),
      g('wasp', 2, 20, 1),
    ],
  },
  {
    name: '',
    pause: 8,
    speedMul: 1,
    partsMul: 1,
    pressureBelow: 4,
    groups: [
      g('scout', 5, 0, 0),
      g('gunner', 2, 3, 1),
      g('wasp', 2, 7, 0),
      g('spider', 1, 10, 1),
      g('scout', 5, 14, 1),
      g('gunner', 2, 18, 0),
      g('wasp', 2, 21, 1),
      g('spider', 1, 25, 0),
    ],
  },
  {
    name: '',
    pause: 8,
    speedMul: 1,
    partsMul: 1,
    pressureBelow: 4,
    groups: [
      g('gunner', 3, 0, 0),
      g('repairer', 1, 2, 0),
      g('scout', 3, 4, 2),
      g('wasp', 3, 8, 2),
      g('spider', 2, 12, 0),
      g('gunner', 2, 16, 2),
      g('scout', 3, 19, 0),
      g('wasp', 3, 22, 0),
      g('spider', 1, 26, 2),
    ],
  },
  // 6 — передих: лише Скаути, деталі ×2, довша пауза.
  {
    name: '',
    pause: 15,
    speedMul: 1,
    partsMul: 2,
    pressureBelow: 3,
    groups: [g('scout', 5, 0, 0), g('scout', 5, 6, 1), g('scout', 5, 12, 2)],
  },
  {
    name: '',
    pause: 8,
    speedMul: 1,
    partsMul: 1,
    pressureBelow: 3,
    groups: [
      g('shell', 1, 0, 0),
      g('repairer', 1, 1, 0),
      g('gunner', 2, 4, 1),
      g('wasp', 2, 8, 3),
      g('shell', 1, 14, 2),
      g('repairer', 1, 15, 2),
      g('gunner', 2, 18, 1),
      g('wasp', 2, 22, 1),
    ],
  },
  {
    name: '',
    pause: 8,
    speedMul: 1,
    partsMul: 1,
    pressureBelow: 4,
    groups: [
      g('scout', 4, 0, 0),
      g('kamikaze', 2, 4, 0),
      g('sniper', 1, 8, 3),
      g('kamikaze', 2, 12, 2),
      g('swarm', 1, 16, 1),
      g('scout', 4, 20, 2),
      g('sniper', 1, 24, 1),
      g('kamikaze', 2, 28, 'any'),
    ],
  },
  {
    name: '',
    pause: 10,
    speedMul: 1,
    partsMul: 1,
    pressureBelow: 5,
    groups: [
      g('gunner', 2, 0, 0),
      g('shell', 1, 2, 1),
      g('repairer', 1, 3, 1),
      g('spider', 2, 6, 2),
      g('kamikaze', 2, 8, 0),
      g('gunner', 2, 11, 3),
      g('sniper', 1, 13, 2),
      g('swarm', 1, 16, 1),
      g('shell', 1, 19, 2),
      g('repairer', 1, 20, 2),
      g('kamikaze', 2, 23, 3),
      g('spider', 2, 26, 3),
      g('gunner', 2, 28, 0),
      g('sniper', 1, 30, 1),
      g('swarm', 1, 33, 3),
    ],
  },
];

/** Міні-бос: Прораб + 4 Скаути з центру (BALANCE.md). */
export const FOREMAN_WAVE: WaveDef = {
  name: 'Прораб',
  pause: 12,
  speedMul: 1,
  partsMul: 1,
  pressureBelow: 0,
  groups: [g('foreman', 1, 0, 'center'), g('scout', 4, 2, 'any')],
  boss: 'foreman',
};

/** Фінал: Ядро станції в реакторній залі (BALANCE.md). */
export const CORE_WAVE: WaveDef = {
  name: 'Ядро станції',
  pause: 15,
  speedMul: 1,
  partsMul: 1,
  pressureBelow: 0,
  groups: [g('core', 1, 0, 'center')],
  boss: 'core',
};

/**
 * Таблиця під повзунок «кількість хвиль» (DECISIONS.md, п. 38): менше 9 — рівномірна вибірка
 * зі збереженням порядку й останньої; більше — повтор трьох останніх із +15% ворогів за коло.
 * Прораб — після хвилі ⌈0.55·N⌉.
 */
/** Скільки хвиль дописується після Ядра в нескінченному режимі (на практиці — «без кінця»). */
export const ENDLESS_EXTRA = 60;

/** Модифікатор «Лише дрони»: наземні групи замінюються повітряними. */
const TO_DRONE: Partial<Record<SpawnGroup['type'], SpawnGroup['type']>> = {
  scout: 'wasp',
  gunner: 'sniper',
  shell: 'kamikaze',
  spider: 'kamikaze',
  repairer: 'swarm',
};

export function dronesOnly(waves: WaveDef[]): WaveDef[] {
  return waves.map((w) =>
    w.boss
      ? w
      : {
          ...w,
          groups: w.groups.map((gr) =>
            TO_DRONE[gr.type]
              ? {
                  ...gr,
                  type: TO_DRONE[gr.type]!,
                  airlock: gr.airlock === 'center' ? 'any' : gr.airlock,
                }
              : gr,
          ),
        },
  );
}

export function buildWaves(count = 9, endless = false): WaveDef[] {
  const n = Math.max(1, Math.round(count));
  const base = BALANCE_WAVES;
  const picked: WaveDef[] = [];
  if (n <= base.length) {
    let last = -1;
    for (let k = 0; k < n; k++) {
      let idx = n === 1 ? base.length - 1 : Math.round((k * (base.length - 1)) / (n - 1));
      if (idx <= last) idx = last + 1;
      last = idx;
      picked.push(base[idx]!);
    }
  } else {
    picked.push(...base);
    for (let k = 1; k <= n - base.length; k++) {
      const src = base[base.length - 3 + ((k - 1) % 3)]!;
      const mul = 1 + 0.15 * Math.ceil(k / 3);
      picked.push({
        ...src,
        groups: src.groups.map((gr) => ({ ...gr, count: Math.max(1, Math.round(gr.count * mul)) })),
      });
    }
  }
  const out: WaveDef[] = picked.map((w, i) => ({ ...w, name: `Хвиля ${i + 1}` }));
  const after = Math.min(out.length, Math.ceil(0.55 * out.length));
  out.splice(after, 0, { ...FOREMAN_WAVE });
  out.push({ ...CORE_WAVE });
  if (endless) {
    // Після Ядра: найважчі хвилі по колу, щоразу більші й міцніші; кожна п'ята — Прораб,
    // кожна десята — Ядро (теж міцніші). DECISIONS.md, п. 60.
    for (let k = 1; k <= ENDLESS_EXTRA; k++) {
      const hpMul = 1 + 0.07 * k;
      if (k % 10 === 0) out.push({ ...CORE_WAVE, hpMul });
      else if (k % 5 === 0) out.push({ ...FOREMAN_WAVE, hpMul });
      else {
        const src = base[base.length - 3 + (k % 3)]!;
        const mul = 1.15 + 0.1 * k;
        out.push({
          ...src,
          name: `Хвиля ${out.length + 1}`,
          hpMul,
          groups: src.groups.map((gr) => ({
            ...gr,
            count: Math.max(1, Math.round(gr.count * mul)),
          })),
        });
      }
    }
  }
  return out;
}

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
