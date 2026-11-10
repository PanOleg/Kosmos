import { FOREMAN } from '../config/enemies';
import { clearDynamic, setDynamic } from '../collision/world';
import { emit } from '../events';
import type { Game } from '../state';
import { refreshNavArea } from './navigation';

/** Ставить укриття Прораба: стіна поперек напрямку (rot), реєструється у світі й у навігації. */
export function placeProp(game: Game, x: number, y: number, rot: number): boolean {
  const props = game.state.props;
  const slot = props.findIndex((p) => !p.alive);
  if (slot < 0) return false;
  const p = props[slot]!;
  p.alive = true;
  p.x = x;
  p.y = y;
  p.rot = rot;
  p.len = FOREMAN.wallLength;
  p.thick = FOREMAN.wallThick;
  p.height = FOREMAN.wallHeight;
  const o = setDynamic(game.world, slot, x, y, p.len, p.thick, rot, p.height);
  refreshNavArea(game.nav, game.world, 0.45, o.minX, o.minY, o.maxX, o.maxY);
  emit(game.events, 'propPlaced', x, y, Math.cos(rot), Math.sin(rot), slot);
  return true;
}

/** Наприкінці хвилі з Прорабом укриття розсипаються (DECISIONS.md, п. 36). */
export function clearProps(game: Game): void {
  const props = game.state.props;
  for (let slot = 0; slot < props.length; slot++) {
    const p = props[slot]!;
    if (!p.alive) continue;
    const o = game.world.obstacles[game.world.dynamicBase + slot]!;
    const box = [o.minX, o.minY, o.maxX, o.maxY] as const;
    clearDynamic(game.world, slot);
    refreshNavArea(game.nav, game.world, 0.45, ...box);
    p.alive = false;
    emit(game.events, 'propGone', p.x, p.y, 0, 0, slot);
  }
}
