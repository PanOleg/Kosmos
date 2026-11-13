import { isArmored } from '../config/classes';
import { ENEMIES } from '../config/enemies';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import { emit } from '../events';
import type { Game } from '../state';
import { dropParts } from './pickups';
import { onPlayerDown } from './revive';
import { corePhaseDown, onCoreKilled } from '../ai/core';

export function damagePlayer(
  game: Game,
  p: Player,
  amount: number,
  fromX: number,
  fromY: number,
): void {
  if (p.down || p.invuln > 0 || amount <= 0) return;
  if (isArmored(p.classId)) {
    emit(game.events, 'armorBlock', p.x, p.y, fromX, fromY, p.slot);
    return;
  }
  p.hp -= amount;
  p.stats.damageTaken += amount;
  emit(game.events, 'playerHit', p.x, p.y, fromX, fromY, p.slot, 0, amount);
  if (p.hp <= 0) knockDown(game, p);
}

/** Гравець падає незалежно від здоров'я й невразливості (затягнуло в шлюз). */
export function knockDown(game: Game, p: Player): void {
  if (p.down || isArmored(p.classId)) return;
  p.hp = 0;
  p.down = true;
  p.target = -1;
  onPlayerDown(p);
  emit(game.events, 'playerDown', p.x, p.y, 0, 0, p.slot);
}

/** kx, ky — напрям відкидання (одиничний), knock — його сила в м/с. */
export function damageEnemy(
  game: Game,
  e: Enemy,
  index: number,
  amount: number,
  kx: number,
  ky: number,
  knock: number,
  bySlot: number,
  /** Влучання в слабке місце (спина Панцира, Павук у польоті) — рендер показує крит. */
  weak = false,
): void {
  if (!e.alive) return;
  // Модифікатор «Скляна гармата»: гравці б'ють сильніше (вороги — теж, через mods).
  if (bySlot >= 0) amount *= game.config.rules.playerDamageMul;
  // Ядро між фазами невразливе: удар видно, але шкоди немає.
  if (e.type === 'core' && game.state.boss.transition > 0) {
    emit(game.events, 'armor', e.x, e.y, -kx, -ky, index);
    return;
  }
  // Щит від Ремонтника поглинає шкоду першим.
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, amount);
    e.shield -= absorbed;
    amount -= absorbed;
    if (e.shield <= 0) emit(game.events, 'shieldBreak', e.x, e.y, 0, 0, index);
    if (amount <= 0) {
      emit(game.events, 'hit', e.x, e.y, kx, ky, index, bySlot, 0);
      return;
    }
  }
  e.hp -= amount;
  const p = game.state.players[bySlot];
  if (p) p.stats.damageDealt += amount;
  if (knock > 0) {
    e.vx += kx * knock;
    e.vy += ky * knock;
    e.stagger = Math.max(e.stagger, 3);
  }
  emit(game.events, weak ? 'weakHit' : 'hit', e.x, e.y, kx, ky, index, bySlot, amount);
  if (e.hp <= 0) {
    if (e.type === 'core' && corePhaseDown(game, e, index)) return;
    killEnemy(game, e, index, bySlot);
  }
}

export function killEnemy(game: Game, e: Enemy, index: number, bySlot: number): void {
  e.alive = false;
  e.hp = 0;
  game.state.enemiesAlive--;
  const p = game.state.players[bySlot];
  if (p) p.stats.kills++;
  emit(game.events, 'kill', e.x, e.y, e.vx, e.vy, index, bySlot, ENEMIES[e.type].parts);
  dropParts(game, e.x, e.y, ENEMIES[e.type].parts);
  // Смерть Прораба позбавляє хвилю підкріплення: решта груп не з'явиться (п. 36).
  if (e.type === 'core') {
    const w = game.state.wave;
    const def = game.config.waves[w.index];
    if (def) w.nextGroup = def.groups.length;
    emit(game.events, 'bossDown', e.x, e.y, 0, 0, index, 1);
    onCoreKilled(game);
  }
  if (e.type === 'foreman') {
    const w = game.state.wave;
    const def = game.config.waves[w.index];
    if (def) w.nextGroup = def.groups.length;
    emit(game.events, 'bossDown', e.x, e.y, 0, 0, index);
  }
  for (const pl of game.state.players) if (pl.target === index) pl.target = -1;
}
