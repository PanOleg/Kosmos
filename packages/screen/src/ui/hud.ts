import * as THREE from 'three';
import {
  TICKS_PER_SEC,
  UPGRADES,
  REVIVE,
  abilityReadiness,
  shopOpen,
  upgradePrice,
  wholeParts,
  type Game,
} from '@horizon/sim';
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
.hud-top .boss { margin: 4px 0 2px; font-size: 12px; font-weight: 800; letter-spacing: .2em; color: #ffcc40; }
.hud-top .boss .ph { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
.hud-top .boss .pb { height: 9px; border: 1px solid rgba(255,204,64,.5); }
.hud-top .boss .pb > i { background: linear-gradient(90deg, #ffb020, #ffdc60); box-shadow: 0 0 10px #ffb020; }
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
.hud-card .ab { height: 3px; margin-top: 4px; background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden; }
.hud-card .ab > i { display: block; height: 100%; opacity: .55; }
.hud-card .ab.ready > i { opacity: 1; animation: abpulse 1s ease-in-out infinite; }
@keyframes abpulse { 50% { opacity: .5; } }
.shop { position: absolute; left: 50%; bottom: 44px; transform: translateX(-50%); display: none; gap: 12px; padding: 12px 14px 10px;
  background: rgba(8,10,16,.82); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; }
.shop.on { display: flex; flex-direction: column; }
.shop .ttl { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; opacity: .7; text-align: center; }
.shop .cols { display: flex; gap: 12px; }
.shop .col { width: 170px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,.05); border-top: 3px solid; font-size: 13px; display: grid; gap: 4px; }
.shop .col.flash { animation: shopflash .5s ease-out; }
@keyframes shopflash { 0% { background: rgba(255,255,255,.35); } 100% { background: rgba(255,255,255,.05); } }
.shop .nm { display: flex; justify-content: space-between; font-weight: 700; }
.shop .ln { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; opacity: .9; }
.shop .pp { display: inline-flex; gap: 3px; }
.shop .pp i { width: 8px; height: 8px; border-radius: 2px; border: 1.5px solid currentColor; }
.shop .pp i.on { background: currentColor; }
.shop .pr { font-variant-numeric: tabular-nums; color: #9ff4ff; min-width: 32px; text-align: right; }
.shop .hint { font-size: 11px; opacity: .5; text-align: center; }
.hud-card .st { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: #ff6a5a; margin-top: 3px; min-height: 0; }
.hud-card .st:empty { display: none; }
.downmark { position: absolute; transform: translate(-50%, -100%); text-align: center; pointer-events: none; }
.downmark b { display: block; font-size: 16px; font-weight: 800; color: #ff5a4a; text-shadow: 0 0 8px rgba(255,40,20,.8); animation: downpulse .8s ease-in-out infinite; }
.downmark span { display: block; width: 56px; height: 5px; margin: 3px auto 0; background: rgba(0,0,0,.6); border-radius: 3px; overflow: hidden; }
.downmark i { display: block; height: 100%; width: 0; background: #6aff8a; }
.downmark.rescuing b { color: #6aff8a; text-shadow: 0 0 8px rgba(60,255,120,.8); animation: none; }
@keyframes downpulse { 50% { opacity: .5; } }
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
  ab: HTMLElement;
  abWrap: HTMLElement;
  parts: HTMLElement;
  status: HTMLElement;
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
  private readonly downs: { el: HTMLDivElement; text: HTMLElement; bar: HTMLElement }[] = [];
  private readonly arrows: HTMLDivElement[] = [];
  private announceT = 0;
  private readonly shop = document.createElement('div');
  private shopSig = '';
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
    this.shop.className = 'shop';
    this.root.append(this.top, this.announceEl, this.hint, this.shop);
    for (const p of game.state.players) {
      const color = hexCss(classColor(p.classId));
      const el = document.createElement('div');
      el.className = 'hud-card';
      Object.assign(el.style, CORNERS[p.slot % 4], { borderColor: color });
      el.innerHTML = `${portrait(color)}<div class="row"><span class="cls"><span style="opacity:.6">P${p.slot + 1}</span> <span style="color:${color}">${t.className[p.classId]}</span></span><span class="parts">⚙ 0</span></div><div class="bar"><i style="background:${color};width:100%"></i></div><div class="ab"><i style="background:${color}"></i></div><div class="st"></div>`;
      this.root.appendChild(el);
      this.cards.push({
        el,
        hp: el.querySelector('.bar > i')!,
        ab: el.querySelector('.ab > i')!,
        abWrap: el.querySelector('.ab')!,
        status: el.querySelector('.st')!,
        parts: el.querySelector('.parts')!,
        lastParts: 0,
      });
      const over = document.createElement('div');
      over.className = 'over';
      over.innerHTML = `<i style="background:${color}"></i>`;
      this.root.appendChild(over);
      this.overs.push({ el: over, fill: over.querySelector('i')! });
      const down = document.createElement('div');
      down.className = 'downmark';
      down.innerHTML = '<b></b><span><i></i></span>';
      down.style.display = 'none';
      this.root.appendChild(down);
      this.downs.push({ el: down, text: down.querySelector('b')!, bar: down.querySelector('i')! });
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

  /** Гравець щось купив — його колонка в панелі коротко блимає. */
  purchased(slot: number): void {
    const col = this.shop.querySelector<HTMLElement>(`.col[data-slot="${slot}"]`);
    if (!col) return;
    col.classList.remove('flash');
    void col.offsetWidth;
    col.classList.add('flash');
  }

  private renderShop(game: Game): void {
    const open = shopOpen(game);
    this.shop.classList.toggle('on', open);
    // Підказка керування внизу заважала б панелі.
    if (open) this.hint.style.opacity = '0';
    if (!open) {
      this.shopSig = '';
      return;
    }
    const s = game.state;
    // Перемальовуємо лише при зміні рівнів, деталей чи секунд.
    const sig =
      s.players
        .map(
          (p) => `${p.upg.weapon}${p.upg.armor}${p.upg.ability}${wholeParts(p)}${p.medkitBought}`,
        )
        .join('|') + Math.ceil(s.wave.timer / TICKS_PER_SEC);
    if (sig === this.shopSig) return;
    this.shopSig = sig;
    const pips = (n: number) =>
      `<span class="pp">${[0, 1, 2].map((k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
    const price = (v: number | null) => (v === null ? 'макс.' : `⚙${v}`);
    const cols = s.players
      .map((p) => {
        const color = hexCss(classColor(p.classId));
        const rows = (['weapon', 'armor', 'ability'] as const)
          .map(
            (id, i) =>
              `<div class="ln"><span>${i + 1} · ${t.upgradeName[id]}</span>${pips(p.upg[id])}<span class="pr">${price(upgradePrice(p, id))}</span></div>`,
          )
          .join('');
        return `<div class="col" data-slot="${p.slot}" style="border-color:${color}"><div class="nm"><span style="color:${color}">P${p.slot + 1} ${t.className[p.classId]}</span><span class="pr">⚙ ${wholeParts(p)}</span></div>${rows}<div class="ln"><span>4 · ${t.medkit}</span><span></span><span class="pr">${p.medkitBought ? '✓' : price(UPGRADES.medkit.price)}</span></div>${s.players.length === 1 ? `<div class="ln"><span>5 · ${t.extraLife}</span><span></span><span class="pr">${p.lifeBought ? '✓' : price(REVIVE.soloLifePrice)}</span></div>` : ''}</div>`;
      })
      .join('');
    const flashing = [...this.shop.querySelectorAll('.col.flash')].map(
      (c) => (c as HTMLElement).dataset.slot,
    );
    this.shop.innerHTML = `<div class="ttl">${t.shopTitle(Math.ceil(s.wave.timer / TICKS_PER_SEC))}</div><div class="cols">${cols}</div><div class="hint">${t.shopHint}</div>`;
    for (const slot of flashing)
      this.shop.querySelector(`.col[data-slot="${slot}"]`)?.classList.add('flash');
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
      // Міні-бос: окрема жовта смуга здоров'я під лічильником.
      if (def.boss && w.phase === 'active') {
        const b = s.enemies.find((e) => e.alive && e.type === def.boss);
        const phase =
          def.boss === 'core' && s.boss.phase > 0
            ? `<div class="ph">${t.bossPhase(s.boss.phase)}${s.boss.transition > 0 ? ` · ${t.bossShift}` : ''}</div>`
            : '';
        if (b)
          topText += `<div class="boss">${phase}<div class="pb"><i style="width:${Math.ceil((b.hp / b.maxHp) * 100)}%"></i></div></div>`;
      }
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
      // Готовність здібності: заповнюється під час перезарядки, пульсує, коли можна тиснути.
      const ready = abilityReadiness(game, p);
      c.ab.style.width = `${ready * 100}%`;
      c.abWrap.classList.toggle('ready', ready >= 1);
      const parts = Math.floor(p.parts + 1e-6);
      if (parts !== c.lastParts) {
        c.parts.textContent = `⚙ ${parts}`;
        // Перезапуск CSS-анімації: зняти клас, змусити reflow, повернути.
        c.parts.classList.remove('pop');
        void c.parts.offsetWidth;
        c.parts.classList.add('pop');
        c.lastParts = parts;
      }
      c.el.style.opacity = p.out ? '0.35' : p.down ? '0.6' : '1';
      // Статус у картці: скільки лишилось до вибування або що вибув.
      const status = p.out
        ? t.outUntilWave
        : p.down
          ? t.downFor(Math.ceil(p.bleedT / TICKS_PER_SEC))
          : '';
      if (c.status.textContent !== status) c.status.textContent = status;
      const o = this.overs[p.slot]!;
      this.v.set(toX(p.x), 2.4, toZ(p.y)).project(camera);
      o.el.style.left = `${((this.v.x + 1) / 2) * W}px`;
      o.el.style.top = `${((1 - this.v.y) / 2) * H}px`;
      o.fill.style.width = `${(p.hp / p.maxHp) * 100}%`;
      o.el.style.display = p.down ? 'none' : 'block';
      // Над упалим: відлік і прогрес підйому, якщо хтось піднімає.
      const dn = this.downs[p.slot]!;
      const showDown = p.down && !p.out;
      dn.el.style.display = showDown ? 'block' : 'none';
      if (showDown) {
        this.v.set(toX(p.x), 1.6, toZ(p.y)).project(camera);
        dn.el.style.left = `${((this.v.x + 1) / 2) * W}px`;
        dn.el.style.top = `${((1 - this.v.y) / 2) * H}px`;
        const rescuer = s.players.find((q) => q.reviving === p.slot);
        const prog = rescuer ? rescuer.reviveT / (REVIVE.hold * TICKS_PER_SEC) : 0;
        dn.text.textContent = `✚ ${Math.ceil(p.bleedT / TICKS_PER_SEC)}`;
        dn.bar.style.width = `${prog * 100}%`;
        dn.el.classList.toggle('rescuing', !!rescuer);
      }
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
    this.renderShop(game);
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
