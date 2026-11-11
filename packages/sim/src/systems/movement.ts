import { slowAt } from '../config/map';
import { resolveCircle } from '../collision/world';
import { DT, secToTicks } from '../math';
import type { PlayerInput } from '../protocol';
import type { Game } from '../state';
import { emit } from '../events';

export function updatePlayers(game: Game, inputs: readonly PlayerInput[]): void {
  const cfg = game.config.player;
  const dashTicks = secToTicks(cfg.dash.duration);
  const dashSpeed = cfg.dash.distance / cfg.dash.duration;
  const maxDv = cfg.accel * DT;

  for (const p of game.state.players) {
    p.px = p.x;
    p.py = p.y;
    const inp = inputs[p.slot];
    if (p.down || !inp) {
      p.vx = 0;
      p.vy = 0;
      p.abilityPressed = false;
      p.buyPressed = 0;
      if (inp) {
        p.prevDash = inp.dash;
        p.prevAbility = inp.ability;
        // Упалий теж може купувати між хвилями — зручно, поки чекає на підйом.
        const buy = inp.buy | 0;
        p.buyPressed = buy !== 0 && buy !== p.prevBuy ? buy : 0;
        p.prevBuy = buy;
      }
      continue;
    }

    let mx = inp.move.x;
    let my = inp.move.y;
    const ml = Math.sqrt(mx * mx + my * my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }

    if (p.dashCd > 0) p.dashCd--;
    if (p.invuln > 0) p.invuln--;

    // Ривок за переднім фронтом кнопки: пакет несе стан, а не подію.
    if (inp.dash && !p.prevDash && p.dashCd === 0 && p.dashT === 0) {
      let dx = mx;
      let dy = my;
      if (ml < 0.1) {
        dx = p.fx;
        dy = p.fy;
      } else {
        const l = Math.sqrt(dx * dx + dy * dy);
        dx /= l;
        dy /= l;
      }
      p.dashDx = dx;
      p.dashDy = dy;
      p.dashT = dashTicks;
      p.dashCd = secToTicks(cfg.dash.cooldown) + dashTicks;
      if (cfg.dash.invulnerable) p.invuln = Math.max(p.invuln, dashTicks);
      emit(game.events, 'dash', p.x, p.y, dx, dy, p.slot);
    }
    p.prevDash = inp.dash;
    p.abilityPressed = inp.ability && !p.prevAbility;
    p.prevAbility = inp.ability;
    const buy = inp.buy | 0;
    p.buyPressed = buy !== 0 && buy !== p.prevBuy ? buy : 0;
    p.prevBuy = buy;

    if (p.dashT > 0) {
      p.dashT--;
      p.vx = p.dashDx * dashSpeed;
      p.vy = p.dashDy * dashSpeed;
      // Після ривка лишаємо звичайну швидкість, щоб не було «гальмування в стіну».
      if (p.dashT === 0) {
        p.vx = p.dashDx * cfg.speed;
        p.vy = p.dashDy * cfg.speed;
      }
    } else {
      // Зибучі піски й замети сповільнюють крок; ривок їх перетинає.
      const slow = slowAt(game.config.map, p.x, p.y);
      const tx = mx * cfg.speed * slow;
      const ty = my * cfg.speed * slow;
      let dvx = tx - p.vx;
      let dvy = ty - p.vy;
      const dl = Math.sqrt(dvx * dvx + dvy * dvy);
      if (dl > maxDv) {
        dvx = (dvx / dl) * maxDv;
        dvy = (dvy / dl) * maxDv;
      }
      p.vx += dvx;
      p.vy += dvy;
      // Без цілі персонаж дивиться, куди біжить.
      if (p.target < 0 && ml > 0.1) {
        p.fx = mx / ml;
        p.fy = my / ml;
      }
    }

    const r = resolveCircle(game.world, p.x + p.vx * DT, p.y + p.vy * DT, cfg.radius);
    p.x = r.x;
    p.y = r.y;
  }
}
