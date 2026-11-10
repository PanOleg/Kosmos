/** Усі рядки інтерфейсу. Англійська додається другим словником з тими самими ключами. */
const uk = {
  waveStartsIn: (s: number) => `до хвилі ${s} с`,
  enemiesLeft: (n: number) => `ворогів: ${n}`,
  stationSignal: 'Сигнал станції',
  waveCleared: 'Хвилю відбито',
  victory: 'Станцію утримано',
  defeat: 'Екіпаж упав',
  restartHint: 'R — ще раз',
  colPlayer: 'Гравець',
  colKills: 'Вбивства',
  colParts: 'Деталі',
  colRevives: 'Воскресіння',
  colDamage: 'Шкода',
  colTaken: 'Отримано',
  time: (s: number) => `Час: ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
  className: {
    assault: 'Штурмовик',
    engineer: 'Інженер',
    medic: 'Медик',
    tech: 'Технік',
  } as Record<string, string>,
  controlsHint: 'WASD — рух · Пробіл — ривок · стрільба автоматична',
};

export type Strings = typeof uk;
export const t: Strings = uk;
