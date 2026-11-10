import * as THREE from 'three';
import { TICKS_PER_SEC, type Game } from '@horizon/sim';
import { classColor, hexCss } from '../render/palette';
import { toX, toZ } from '../render/coords';
import { t } from './i18n';

const css = `
.hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Inter', system-ui, sans-serif; color: #e8ecf4; z-index: 6; }
.hud-top { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 360px; text-align: center;
  padding: 8px 18px 6px; background: linear-gradient(rgba(10,12,18,.88), rgba(10,12,18,.7)); border: 1px solid rgba(255,255,255,.12);
  border-top: none; border-radius: 0 0 12px 12px; letter-spacing: .08em; }
.hud-top .wv { font-size: 14px; font-weight: 700; text-transform: uppercase; opacity: .9; }
.hud-top .pb { height: 6px; margin: 6px 0 4px; background: rgba(255,255,255,.12); border-radius: 3px; overflow: hidden; }
.hud-top .pb > i { display: block; height: 100%; background: #e8323a; box-shadow: 0 0 8px #e8323a; transition: width .2s; }
.hud-top .big { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.hud-top .big small { font-size: 12px; font-weight: 600; opacity: .6; margin-left: 6px; letter-spacing: .06em; }
.hud-card { position: absolute; width: 250px; padding: 8px 10px 8px 64px; min-height: 58px; background: rgba(8,10,16,.72); border-radius: 10px; border-left: 4px solid; font-size: 13px; }
.hud-card .pt { position: absolute; left: 8px; top: 8px; width: 46px; height: 46px; border-radius: 8px; background: rgba(255,255,255,.06); }
.hud-card .cls { text-transform: uppercase; }
.hud-card .row { display: flex; justify-content: space-between; align-items: center; }
.hud-card .cls { font-weight: 700; letter-spacing: .03em; }
.hud-card .parts { color: #9ff4ff; font-weight: 700; font-variant-numeric: tabular-nums; display: inline-block; }
.hud-card .parts.pop { animation: hudpop .25s ease-out; }
@keyframes hudpop { 0% { transform: scale(1.6); } 100% { transform: scale(1); } }
.bar { height: 7px; background: rgba(255,255,255,.12); border-radius: 4px; overflow: hidden; margin-top: 6px; }
.bar > i { display: block; height: 100%; transition: width .12s; }
.over { position: absolute; width: 46px; height: 5px; margin-left: -23px; background: rgba(0,0,0,.55); border-radius: 3px; overflow: hidden; }
.over > i { display: block; height: 100%; }
.announce { position: absolute; top: 22%; left: 0; right: 0; text-align: center; font-size: 46px; font-weight: 800; letter-spacing: .12em;
  text-transform: uppercase; color: #ffaa22; text-shadow: 0 0 24px rgba(255,90,20,.6); opacity: 0; transition: opacity .25s; }
.announce small { display: block; font-size: 18px; letter-spacing: .1em; color: #e8ecf4; opacity: .8; margin-top: 6px; }
.arrow { position: absolute; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 14px solid #ff2a3a;
  margin: -7px 0 0 -7px; opacity: .85; filter: drop-shadow(0 0 4px rgba(255,80,20,.8)); }
.hint { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; font-size: 13px; opacity: .55; transition: opacity 1s; }
`;

const CORNERS: Partial<CSSStyleDeclaration>[] = [
  { left: '14px', top: '14px' },
  { right: '14px', top: '14px' },
  { left: '14px', bottom: '14px' },
  { right: '14px', bottom: '14px' },
];
const MAX_ARROWS = 10;
let styleInstalled = false;

interface Card {
  el: HTMLDivElement;
  hp: HTMLElement;
  parts: HTMLElement;
  lastParts: number;
}

/** DOM-шар поверх канви: оновлюється щокадру, але textContent/innerHTML — лише при зміні. */
export class Hud {
  private readonly root = document.createElement('div');
  private readonly top = document.createElement('div');
  private readonly announceEl = document.createElement('div');
  private readonly hint = document.createElement('div');
  private readonly cards: Card[] = [];
  private readonly overs: { el: HTMLDivElement; fill: HTMLElement }[] = [];
  private readonly arrows: HTMLDivElement[] = [];
  private announceT = 0;
  private readonly v = new THREE.Vector3();
  private lastTop = '';

  constructor(game: Game) {
    if (!styleInstalled) {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      styleInstalled = true;
    }
    this.root.className = 'hud';
    this.top.className = 'hud-top';
    this.announceEl.className = 'announce';
    this.hint.className = 'hint';
    this.hint.textContent = t.controlsHint;
    this.root.append(this.top, this.announceEl, this.hint);
    for (const p of game.state.players) {
      const color = hexCss(classColor(p.classId));
      const el = document.createElement('div');
      el.className = 'hud-card';
      Object.assign(el.style, CORNERS[p.slot % 4], { borderColor: color });
      el.innerHTML = `${portrait(color)}<div class="row"><span class="cls"><span style="opacity:.6">P${p.slot + 1}</span> <span style="color:${color}">${t.className[p.classId]}</span></span><span class="parts">⚙ 0</span></div><div class="bar"><i style="background:${color};width:100%"></i></div>`;
      this.root.appendChild(el);
      this.cards.push({
        el,
        hp: el.querySelector('.bar > i')!,
        parts: el.querySelector('.parts')!,
        lastParts: 0,
      });
      const over = document.createElement('div');
      over.className = 'over';
      over.innerHTML = `<i style="background:${color}"></i>`;
      this.root.appendChild(over);
      this.overs.push({ el: over, fill: over.querySelector('i')! });
    }
    for (let i = 0; i < MAX_ARROWS; i++) {
      const a = document.createElement('div');
      a.className = 'arrow';
      a.style.display = 'none';
      this.root.appendChild(a);
      this.arrows.push(a);
    }
    document.body.appendChild(this.root);
  }

  announce(title: string, sub = '', seconds = 2.2): void {
    this.announceEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.announceT = seconds;
  }

  update(game: Game, camera: THREE.Camera, dt: number): void {
    const s = game.state;
    const w = s.wave;
    const def = game.config.waves[w.index];
    let topText = '';
    if (def) {
      const left = Math.max(0, w.plannedTotal - w.spawnedTotal) + s.enemiesAlive;
      // Смужка: у паузі — відлік, у бою — частка знищених.
      const prog =
        w.phase === 'pause'
          ? 1 - w.timer / (def.pause * TICKS_PER_SEC)
          : w.plannedTotal > 0
            ? 1 - left / w.plannedTotal
            : 1;
      const big =
        w.phase === 'pause'
          ? `${Math.ceil(w.timer / TICKS_PER_SEC)} с<small>${t.untilWave}</small>`
          : `${left}<small>${t.enemiesWord}</small>`;
      topText = `<div class="wv">${def.name}</div><div class="pb"><i style="width:${Math.round(prog * 100)}%"></i></div><div class="big">${big}</div>`;
    }
    if (topText !== this.lastTop) {
      this.top.innerHTML = topText;
      this.lastTop = topText;
    }

    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const p of s.players) {
      const c = this.cards[p.slot]!;
      c.hp.style.width = `${(p.hp / p.maxHp) * 100}%`;
      const parts = Math.floor(p.parts + 1e-6);
      if (parts !== c.lastParts) {
        c.parts.textContent = `⚙ ${parts}`;
        // Перезапуск CSS-анімації: зняти клас, змусити reflow, повернути.
        c.parts.classList.remove('pop');
        void c.parts.offsetWidth;
        c.parts.classList.add('pop');
        c.lastParts = parts;
      }
      c.el.style.opacity = p.down ? '0.45' : '1';
      const o = this.overs[p.slot]!;
      this.v.set(toX(p.x), 2.4, toZ(p.y)).project(camera);
      o.el.style.left = `${((this.v.x + 1) / 2) * W}px`;
      o.el.style.top = `${((1 - this.v.y) / 2) * H}px`;
      o.fill.style.width = `${(p.hp / p.maxHp) * 100}%`;
      o.el.style.display = p.down ? 'none' : 'block';
    }

    // Стрілки на краях екрана до ворогів поза кадром.
    let n = 0;
    const margin = 28;
    for (const e of s.enemies) {
      if (!e.alive || n >= MAX_ARROWS) continue;
      this.v.set(toX(e.x), 0.8, toZ(e.y)).project(camera);
      let sx = this.v.x;
      let sy = this.v.y;
      if (this.v.z <= 1 && Math.abs(sx) <= 1 && Math.abs(sy) <= 1) continue;
      if (this.v.z > 1) {
        sx = -sx;
        sy = -sy;
      }
      const m = Math.max(Math.abs(sx), Math.abs(sy)) || 1;
      sx /= m;
      sy /= m;
      const px = Math.min(W - margin, Math.max(margin, ((sx + 1) / 2) * W));
      const py = Math.min(H - margin, Math.max(margin, ((1 - sy) / 2) * H));
      const a = this.arrows[n++]!;
      a.style.display = 'block';
      a.style.left = `${px}px`;
      a.style.top = `${py}px`;
      a.style.transform = `rotate(${Math.atan2(sx, sy)}rad)`;
    }
    for (let i = n; i < MAX_ARROWS; i++) this.arrows[i]!.style.display = 'none';

    if (this.announceT > 0) {
      this.announceT -= dt;
      this.announceEl.style.opacity = this.announceT > 0 ? '1' : '0';
    }
    if (s.tick > 8 * TICKS_PER_SEC) this.hint.style.opacity = '0';
  }

  destroy(): void {
    this.root.remove();
  }
}

/** Портрет класу: шолом із візором кольору класу (SVG, як іконки на концепті hud.jpg). */
function portrait(color: string): string {
  return `<svg class="pt" viewBox="0 0 46 46"><rect width="46" height="46" rx="8" fill="rgba(255,255,255,.05)"/>
    <path d="M9 40 Q9 30 23 30 Q37 30 37 40 Z" fill="#2b2f37"/>
    <ellipse cx="23" cy="19" rx="12" ry="12.5" fill="${color}"/>
    <rect x="13" y="16" width="20" height="6" rx="3" fill="#dff6ff" opacity=".9"/>
    <rect x="13" y="16" width="20" height="6" rx="3" fill="${color}" opacity=".35"/></svg>`;
}
