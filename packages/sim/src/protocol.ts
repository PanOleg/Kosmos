/** Ввід одного гравця за крок. Однаковий для клавіатури, бота й телефона: повний стан, не події. */
export interface PlayerInput {
  move: { x: number; y: number };
  ability: boolean;
  dash: boolean;
}

export function emptyInput(): PlayerInput {
  return { move: { x: 0, y: 0 }, ability: false, dash: false };
}
