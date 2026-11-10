import { SHELL } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { DT, angleDiff, secToTicks } from '../math';
import type { Game } from '../state';
import { steer, steerTo } from '../systems/enemies';

/**
 * Панцир: повільно підходить на дистанцію й раз на 4 с пускає ракету в місце, де ціль
 * стоїть зараз; зона 3 м підсвічена 1.2 с — є час вийти. Корпус розвертається повільно,
 * тож обхід до спини (×3 шкоди) реальний.
 */
export function updateShell(game: Game, e: Enemy, index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  if (!p || p.down) return;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;

  // Поворот корпусу з обмеженою швидкістю.
  const want = Math.atan2(dy, dx);
  const cur = Math.atan2(e.fy, e.fx);
  const diff = angleDiff(cur, want);
  const max = SHELL.turnRate * DT;
  const a = cur + Math.max(-max, Math.min(max, diff));
  e.fx = Math.cos(a);
  e.fy = Math.sin(a);

  if (d > SHELL.holdRange) steerTo(game, e, p.x, p.y);
  else {
    steer.x = 0;
    steer.y = 0;
  }

  // Пуск — лише коли ціль приблизно попереду: обхід збоку збиває йому приціл.
  if (
    ++e.aiT >= secToTicks(SHELL.rocketEvery / game.config.mods.aggression) &&
    d < SHELL.rocketRange &&
    Math.abs(diff) < 0.5 &&
    hasLineOfSight(game.world, e.x, e.y, p.x, p.y)
  ) {
    e.aiT = 0;
    launchRocket(game, e.x, e.y, p.x, p.y, e.damage);
    emit(game.events, 'enemyShot', e.x, e.y, e.fx, e.fy, index, 3);
  }
}

export function launchRocket(
  game: Game,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
  damage: number,
): void {
  const r = game.state.rockets.find((k) => !k.alive);
  if (!r) return;
  r.alive = true;
  r.fromX = fromX;
  r.fromY = fromY;
  r.x = x;
  r.y = y;
  r.total = r.t = secToTicks(SHELL.rocketWarn);
  r.radius = SHELL.rocketRadius;
  r.damage = damage;
  emit(game.events, 'rocket', fromX, fromY, x, y, 0, 0, SHELL.rocketWarn);
}
