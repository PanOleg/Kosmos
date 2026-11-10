/** Числа з docs/BALANCE.md + docs/DECISIONS.md. Секунди й метри; у тики переводять системи. */
export const PLAYER = {
  radius: 0.5,
  speed: 6,
  /** Як швидко швидкість доганяє ціль, м/с². Високе значення = чуйно, але без ривків у кадрі. */
  accel: 70,
  dash: { distance: 4, duration: 0.2, cooldown: 1.5, invulnerable: true },
  autoaimRadius: 12,
  pickupRadius: 1.5,
  pickupMagnetRadius: 3.5,
  pickupMagnetSpeed: 14,
};

export type ClassId = 'assault' | 'engineer' | 'medic' | 'tech';
