/**
 * Події кроку для рендеру й звуку (постріл, влучання, вбивство...). Симуляція їх лише записує;
 * пул фіксований, об'єкти перевикористовуються, лічильник обнуляється на початку кожного step.
 */
export type GameEventType =
  | 'dash'
  | 'shot'
  | 'hit'
  | 'weakHit'
  | 'kill'
  | 'spawn'
  | 'enemyWindup'
  | 'enemyAttack'
  | 'enemyShot'
  | 'impact'
  | 'armor'
  | 'explosion'
  | 'rocket'
  | 'rocketHit'
  | 'spiderJump'
  | 'shieldUp'
  | 'shieldBreak'
  | 'playerHit'
  | 'pickup'
  | 'purchase'
  | 'purchaseFail'
  | 'ability'
  | 'abilityEnd'
  | 'arc'
  | 'barrierHit'
  | 'barrierBreak'
  | 'heal'
  | 'wavePause'
  | 'waveStart'
  | 'waveCleared'
  | 'playerDown'
  | 'reviveStart'
  | 'reviveCancel'
  | 'revived'
  | 'bleedOut'
  | 'playerReturn';

export interface GameEvent {
  type: GameEventType;
  x: number;
  y: number;
  /** Напрямок або друга точка (кінець пострілу). */
  x2: number;
  y2: number;
  /** Ід сутності-джерела, слот гравця, тип ворога тощо — залежить від type. */
  a: number;
  b: number;
  value: number;
}

export interface EventBuffer {
  list: GameEvent[];
  count: number;
}

export function createEventBuffer(capacity = 512): EventBuffer {
  const list: GameEvent[] = [];
  for (let i = 0; i < capacity; i++)
    list.push({ type: 'hit', x: 0, y: 0, x2: 0, y2: 0, a: 0, b: 0, value: 0 });
  return { list, count: 0 };
}

export function emit(
  buf: EventBuffer,
  type: GameEventType,
  x: number,
  y: number,
  x2 = 0,
  y2 = 0,
  a = 0,
  b = 0,
  value = 0,
): void {
  // Переповнення лише втрачає косметику, на симуляцію не впливає.
  if (buf.count >= buf.list.length) return;
  const e = buf.list[buf.count++]!;
  e.type = type;
  e.x = x;
  e.y = y;
  e.x2 = x2;
  e.y2 = y2;
  e.a = a;
  e.b = b;
  e.value = value;
}
