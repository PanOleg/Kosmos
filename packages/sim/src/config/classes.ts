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

export interface ClassDef {
  hp: number;
  weapon: WeaponDef;
}

const deg = Math.PI / 180;

export const CLASSES: Record<ClassId, ClassDef> = {
  assault: {
    hp: 120,
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
};

export const AUTOAIM = {
  /** Утримання поточної цілі, щоб приціл не смикався між рівними кандидатами. */
  stickiness: 6,
  /** Вага близькості: ближча ціль отримує до стільки балів. */
  proximity: 12,
  /** Як часто перевибирається ціль, тики. */
  retargetEvery: 6,
};
