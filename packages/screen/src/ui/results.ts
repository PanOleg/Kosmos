import type { Game } from '@horizon/sim';
import { classColor, hexCss } from '../render/palette';
import { t } from './i18n';

/** Екран після матчу: підсумок по кожному гравцю. */
export function showResults(game: Game, won: boolean): HTMLDivElement {
  const s = game.state;
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(5,6,10,.78)',
    color: '#e8ecf4',
    fontFamily: "'Inter', system-ui, sans-serif",
    zIndex: '20',
    opacity: '0',
    transition: 'opacity .6s',
  });
  const color = won ? '#7dffb0' : '#ff5a3a';
  const cell = 'padding:8px 16px';
  const rows = s.players
    .map((p) => {
      const c = hexCss(classColor(p.classId));
      const st = p.stats;
      return `<tr><td style="${cell};color:${c};font-weight:700">${t.className[p.classId]}</td><td style="${cell}">${st.kills}</td><td style="${cell}">${st.partsCollected}</td><td style="${cell}">${st.revives}</td><td style="${cell}">${Math.round(st.damageDealt)}</td><td style="${cell}">${Math.round(st.damageTaken)}</td></tr>`;
    })
    .join('');
  const th = (s: string) => `<th style="padding:6px 16px">${s}</th>`;
  el.innerHTML = `
    <div style="font-size:52px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${color};text-shadow:0 0 30px ${color}55">${won ? t.victory : t.defeat}</div>
    <div style="opacity:.7;margin:8px 0 26px">${t.time(s.tick / 60)}</div>
    <table style="border-collapse:collapse;font-size:18px;text-align:center;font-variant-numeric:tabular-nums">
      <thead><tr style="opacity:.6;font-size:13px;text-transform:uppercase;letter-spacing:.08em">
        ${th(t.colPlayer)}${th(t.colKills)}${th(t.colParts)}${th(t.colRevives)}${th(t.colDamage)}${th(t.colTaken)}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:30px;opacity:.75;font-size:16px">${t.restartHint}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = '1'));
  return el;
}
