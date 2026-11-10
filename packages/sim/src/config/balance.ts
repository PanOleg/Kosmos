/** Числа з docs/BALANCE.md + docs/DECISIONS.md. Секунди й метри; у тики переводять системи. */
export const PLAYER = {
  radius: 0.5,
  speed: 6,
  /** Як швидко швидкість доганяє ціль, м/с². Високе значення = чуйно, але без ривків у кадрі. */
  accel: 70,
  dash: { distance: 4, duration: 0.2, cooldown: 1.5, invulnerable: true },
  autoaimRadius: 12,
  /** З цієї відстані деталь летить до гравця (BALANCE: радіус підбору). */
  pickupRadius: 1.5,
  /** Зараховується при торканні: так підбір видно, а не «зникло за метр». */
  pickupTouch: 0.6,
  pickupMagnetSpeed: 14,
  /** Захоплену деталь не перехоплює інший гравець, поки вона в межах цього множника радіуса. */
  pickupLockMul: 2,
};

export type ClassId = 'assault' | 'engineer' | 'medic' | 'tech';
