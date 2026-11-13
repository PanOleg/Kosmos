import type { ClassId } from './balance';

export interface WeaponDef {
  damage: number;
  /** Пострілів за секунду. */
  rate: number;
  range: number;
  pellets: number;
  /** Повний кут розкиду, радіани. */
  spread: number;
  projectileSpeed: number;
  /** Відкидання ворога за влучання, м/с імпульсу. */
  knockback: number;
}

/** Електродуга Техніка: миттєве влучання з перескоком на сусідні цілі. */
export interface ArcDef {
  /** Скільки додаткових цілей після першої. */
  jumps: number;
  /** Множник шкоди за кожен стрибок (−30% → 0.7). */
  falloff: number;
  /** Максимальна відстань стрибка, м. */
  jumpRange: number;
}

export interface ClassDef {
  hp: number;
  weapon: WeaponDef;
  arc?: ArcDef;
  /** Перезарядка здібності, с (BALANCE.md). */
  abilityCooldown: number;
  /** Броню не пробити: шкода й падіння не діють, вороги на нього не полюють (Малюк). */
  armored?: boolean;
}

/** Параметри здібностей з BALANCE.md. */
export const ABILITIES = {
  /** Штурмовик: ×2 скорострільність на 5 с, потім 2 с перегріву без стрільби. */
  overload: { duration: 5, rateMul: 2, overheat: 2 },
  /** Інженер: стіна 4 м, 300 HP, 10 с; ставиться перед собою, поперек погляду. */
  barrier: { length: 4, thickness: 0.35, hp: 300, duration: 10, distance: 2 },
  /** Медик: поле радіусом 4 м навколо себе, +15 HP/с союзникам 5 с. */
  healField: { radius: 4, perSecond: 15, duration: 5 },
  /** Технік: ЕМІ радіусом 7 м, глушить ворогів на 3 с. */
  emp: { radius: 7, stun: 3 },
};

const deg = Math.PI / 180;

export const CLASSES: Record<ClassId, ClassDef> = {
  assault: {
    hp: 120,
    abilityCooldown: 15,
    weapon: {
      damage: 12,
      rate: 5,
      range: 12,
      pellets: 1,
      spread: 3 * deg,
      projectileSpeed: 45,
      knockback: 0.6,
    },
  },
  engineer: {
    hp: 150,
    abilityCooldown: 20,
    weapon: {
      damage: 8,
      rate: 1.2,
      range: 6,
      pellets: 6,
      spread: 40 * deg,
      projectileSpeed: 38,
      knockback: 0.5,
    },
  },
  medic: {
    hp: 100,
    abilityCooldown: 18,
    weapon: {
      damage: 20,
      rate: 3,
      range: 16,
      pellets: 1,
      spread: 1 * deg,
      projectileSpeed: 55,
      knockback: 0.4,
    },
  },
  tech: {
    hp: 110,
    abilityCooldown: 16,
    arc: { jumps: 2, falloff: 0.7, jumpRange: 4.5 },
    weapon: {
      damage: 15,
      rate: 4,
      range: 10,
      pellets: 1,
      spread: 0,
      projectileSpeed: 60,
      knockback: 0.2,
    },
  },
  // Малюк — для найменших: тільки бігати. Не падає, здібності не має, стріляє сам і слабко.
  kid: {
    hp: 100,
    abilityCooldown: 0,
    armored: true,
    weapon: {
      damage: 8,
      rate: 3,
      range: 10,
      pellets: 1,
      spread: 4 * deg,
      projectileSpeed: 40,
      knockback: 0.3,
    },
  },
};

/** Клас із непробивною бронею (Малюк). */
export function isArmored(classId: ClassId): boolean {
  return CLASSES[classId].armored === true;
}

/**
 * Скільки гравців воюють по-справжньому: за ними рахуються кількість ворогів, здоров'я босів
 * і правила одинака. Малюк не рахується; якщо грають самі Малюки — рахуються всі.
 */
export function fighterCount(players: readonly { classId: ClassId }[]): number {
  let n = 0;
  for (const p of players) if (!isArmored(p.classId)) n++;
  return n > 0 ? n : players.length;
}

export const AUTOAIM = {
  /** Утримання поточної цілі, щоб приціл не смикався між рівними кандидатами. */
  stickiness: 6,
  /** Вага близькості: ближча ціль отримує до стільки балів. */
  proximity: 12,
  /** Як часто перевибирається ціль, тики. */
  retargetEvery: 6,
};
