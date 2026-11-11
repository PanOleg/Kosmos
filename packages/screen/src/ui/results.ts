import type { MatchSummary, PlayerSummary } from '@horizon/sim/protocol';
import { classColor, hexCss } from '../render/palette';
import { t } from './i18n';
import type { MatchOutcome } from '../meta/progress';

/** Екран після матчу (DECISIONS.md, п. 46): картка на гравця, відзнаки, підсумок команди. */
export interface ResultsView {
  remove(): void;
  /** Секунди до автоповернення в лобі. */
  setCountdown(s: number): void;
}

const css = `
.res { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 22px; padding: 24px; background: radial-gradient(ellipse at 50% 30%, rgba(20,24,36,.88), rgba(4,5,9,.94));
  color: #e8ecf4; font-family: 'Inter', system-ui, sans-serif; opacity: 0; transition: opacity .6s; }
.res.on { opacity: 1; }
.res h1 { margin: 0; font-size: 60px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--rc);
  text-shadow: 0 0 34px color-mix(in srgb, var(--rc) 45%, transparent); }
.res .sub { display: flex; gap: 26px; font-size: 18px; opacity: .8; letter-spacing: .05em; }
.res .sub b { color: #fff; font-weight: 700; }
.res .cards { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; }
.res .card { width: 250px; background: rgba(16,19,28,.92); border: 1px solid rgba(255,255,255,.08); border-top: 4px solid var(--c);
  border-radius: 12px; padding: 16px 18px 14px; box-shadow: 0 10px 30px rgba(0,0,0,.4); transform: translateY(16px); opacity: 0;
  transition: transform .5s, opacity .5s; }
.res.on .card { transform: none; opacity: 1; }
.res .who { display: flex; align-items: baseline; gap: 8px; }
.res .who .n { font-size: 13px; opacity: .55; font-weight: 700; }
.res .who .cl { font-size: 20px; font-weight: 800; color: var(--c); letter-spacing: .06em; text-transform: uppercase; }
.res .big { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 8px; }
.res .big b { font-size: 46px; font-weight: 800; font-variant-numeric: tabular-nums; }
.res .big span { font-size: 13px; opacity: .6; text-transform: uppercase; letter-spacing: .08em; }
.res .row { display: flex; justify-content: space-between; font-size: 15px; padding: 4px 0; border-top: 1px solid rgba(255,255,255,.06); }
.res .row span { opacity: .65; }
.res .row b { font-variant-numeric: tabular-nums; }
.res .aw { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; margin-top: 10px; }
.res .aw i { font-style: normal; font-size: 12px; font-weight: 700; letter-spacing: .05em; padding: 4px 9px; border-radius: 99px;
  background: color-mix(in srgb, var(--c) 22%, transparent); border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); }
.res .team { display: flex; gap: 30px; font-size: 15px; opacity: .8; letter-spacing: .04em; }
.res .team b { font-size: 20px; color: #fff; margin-left: 6px; font-variant-numeric: tabular-nums; }
.res .meta { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.res .meta div { font-size: 16px; padding: 6px 14px; border-radius: 99px; background: rgba(255,170,34,.14);
  border: 1px solid rgba(255,170,34,.45); }
.res .meta b { color: #ffcf6a; }
.res .foot { font-size: 15px; opacity: .65; letter-spacing: .04em; }
`;
let styleInstalled = false;

function card(p: PlayerSummary, i: number): string {
  const c = hexCss(classColor(p.classId));
  const row = (label: string, v: number) =>
    `<div class="row"><span>${label}</span><b data-n="${v}">0</b></div>`;
  const aw = p.awards.map((k) => `<i>${t.award[k] ?? k}</i>`).join('');
  return `<div class="card" style="--c:${c};transition-delay:${0.15 + i * 0.12}s">
    <div class="who"><span class="n">P${i + 1}</span><span class="cl">${t.className[p.classId]}</span></div>
    <div class="big"><b data-n="${p.kills}">0</b><span>${t.colKills}</span></div>
    ${row(t.colParts, p.parts)}${row(t.colRevives, p.revives)}${row(t.colDowns, p.downs)}
    ${row(t.colDamage, p.damageDealt)}${row(t.colTaken, p.damageTaken)}
    <div class="aw">${aw}</div></div>`;
}

function metaBlock(o: MatchOutcome | undefined): string {
  if (!o) return '';
  const lines: string[] = [];
  for (const id of o.newAchievements) {
    const [name] = t.achievement[id] ?? [id];
    lines.push(`${t.newAchievement}: <b>${name}</b>`);
  }
  const recName: Record<string, string> = {
    bestWave: t.recBestWave,
    fastestWin: t.recFastest,
    bestKills: t.recBestKills,
    endlessBest: t.recEndless,
  };
  for (const r of o.newRecords) lines.push(`${t.newRecord}: <b>${recName[r] ?? r}</b>`);
  if (o.contractDone) lines.push(`<b>${t.contractCompleted(o.streak)}</b>`);
  if (o.boardPlace > 0) lines.push(`<b>${t.boardPlace(o.boardPlace)}</b>`);
  return lines.length
    ? `<div class="meta">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`
    : '';
}

export function showResults(
  sum: MatchSummary,
  presetName: string,
  outcome?: MatchOutcome,
): ResultsView {
  if (!styleInstalled) {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    styleInstalled = true;
  }
  const el = document.createElement('div');
  el.className = 'res';
  // «Без кінця» завжди закінчується падінням екіпажу — підсумок там не поразка, а досягнута хвиля.
  el.style.setProperty('--rc', sum.endless ? '#ffaa22' : sum.won ? '#7dffb0' : '#ff5a3a');
  const total = (f: (p: PlayerSummary) => number) => sum.players.reduce((a, p) => a + f(p), 0);
  const mm = `${Math.floor(sum.seconds / 60)}:${String(sum.seconds % 60).padStart(2, '0')}`;
  el.innerHTML = `
    <h1>${sum.endless ? `${t.resWave} ${sum.wave}` : sum.won ? t.victory : t.defeat}</h1>
    <div class="sub"><span>${sum.endless ? `∞ ${t.endless}` : `${t.resWave} <b>${sum.wave} / ${sum.waves}</b>`}</span><span>${t.resTime} <b>${mm}</b></span><span>${t.resDifficulty} <b>${presetName}</b></span></div>
    <div class="cards">${sum.players.map(card).join('')}</div>
    ${
      sum.players.length > 1
        ? `<div class="team"><span>${t.teamKills}<b data-n="${total((p) => p.kills)}">0</b></span><span>${t.teamParts}<b data-n="${total((p) => p.parts)}">0</b></span><span>${t.teamRevives}<b data-n="${total((p) => p.revives)}">0</b></span></div>`
        : ''
    }
    ${metaBlock(outcome)}
    <div class="foot"></div>`;
  document.body.appendChild(el);
  const foot = el.querySelector<HTMLElement>('.foot')!;
  // Цифри «набігають» за ~1.2 с — підсумок читається як подія, а не таблиця.
  const nums = [...el.querySelectorAll<HTMLElement>('[data-n]')];
  const t0 = performance.now() + 350;
  let raf = 0;
  const tick = (now: number) => {
    const k = Math.min(1, Math.max(0, (now - t0) / 1200));
    const e = 1 - (1 - k) ** 3;
    for (const n of nums) n.textContent = String(Math.round(Number(n.dataset.n) * e));
    if (k < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  requestAnimationFrame(() => el.classList.add('on'));
  return {
    remove() {
      cancelAnimationFrame(raf);
      el.remove();
    },
    setCountdown(s: number) {
      foot.textContent = t.resFoot(s);
    },
  };
}
