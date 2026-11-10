import QRCode from 'qrcode';
import type { LobbyHost } from '../net/lobby';
import { classColor, hexCss } from '../render/palette';
import { t } from './i18n';

const css = `
.lobby { position: fixed; inset: 0; z-index: 8; display: flex; align-items: center; justify-content: center; gap: 6vw;
  background: radial-gradient(ellipse at center, rgba(5,6,10,.35), rgba(5,6,10,.85)); color: #e8ecf4; font-family: 'Inter', system-ui, sans-serif; }
.lobby .join { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.lobby .title { font-size: 44px; font-weight: 800; letter-spacing: .22em; color: #ffaa22; text-shadow: 0 0 30px rgba(255,90,20,.5); }
.lobby .sub { opacity: .65; letter-spacing: .08em; margin-top: -6px; }
.lobby canvas { border-radius: 12px; background: #fff; padding: 10px; }
.lobby .code { font-size: 54px; font-weight: 800; letter-spacing: .35em; margin-left: .35em; font-variant-numeric: tabular-nums; }
.lobby .url { opacity: .55; font-size: 13px; }
.lobby .slots { display: grid; grid-template-columns: repeat(2, 230px); gap: 14px; }
.lobby .slot { height: 120px; border-radius: 12px; background: rgba(255,255,255,.05); border: 2px dashed rgba(255,255,255,.15);
  display: flex; flex-direction: column; justify-content: center; padding: 14px 16px; gap: 6px; }
.lobby .slot.on { border-style: solid; background: rgba(10,12,18,.75); }
.lobby .slot .n { font-size: 12px; opacity: .55; letter-spacing: .1em; text-transform: uppercase; }
.lobby .slot .c { font-size: 22px; font-weight: 800; }
.lobby .slot .s { font-size: 13px; opacity: .8; }
.lobby .hint { position: absolute; bottom: 22px; left: 0; right: 0; text-align: center; opacity: .55; font-size: 13px; }
.lobby .start { font-size: 18px; font-weight: 700; color: #7dffb0; min-height: 24px; text-align: center; }
`;

let installed = false;

/** Екран лобі: QR і код кімнати ліворуч, чотири слоти праворуч. */
export class LobbyView {
  private readonly root = document.createElement('div');
  private readonly slotsEl = document.createElement('div');
  private readonly startEl = document.createElement('div');
  private readonly codeEl = document.createElement('div');
  private readonly urlEl = document.createElement('div');
  private readonly qr = document.createElement('canvas');

  constructor(private readonly lobby: LobbyHost) {
    if (!installed) {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
      installed = true;
    }
    this.root.className = 'lobby';
    const join = document.createElement('div');
    join.className = 'join';
    join.innerHTML = `<div class="title">${t.title}</div><div class="sub">${t.scanToJoin}</div>`;
    this.codeEl.className = 'code';
    this.urlEl.className = 'url';
    join.append(this.qr, this.codeEl, this.urlEl);
    const right = document.createElement('div');
    this.slotsEl.className = 'slots';
    this.startEl.className = 'start';
    right.append(this.slotsEl, this.startEl);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = t.lobbyKeysHint;
    this.root.append(join, right, hint);
    document.body.appendChild(this.root);
  }

  setRoom(query: string, code: string | null, controllerUrl: string, error = ''): void {
    if (!code) {
      this.codeEl.textContent = '····';
      this.urlEl.textContent = error || t.connectingServer;
      return;
    }
    const url = `${controllerUrl}${query}`;
    this.codeEl.textContent = code;
    this.urlEl.textContent = url;
    void QRCode.toCanvas(this.qr, url, {
      width: 220,
      margin: 0,
      color: { dark: '#0b1020', light: '#ffffff' },
    });
  }

  render(countdown: number | null): void {
    const parts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = this.lobby.slots[i];
      if (!s) {
        parts.push(
          `<div class="slot"><div class="n">P${i + 1}</div><div class="s">${t.slotFree}</div></div>`,
        );
        continue;
      }
      const color = s.classId ? hexCss(classColor(s.classId)) : '#888';
      const kind = s.kind === 'phone' ? '📱' : s.kind === 'keyboard' ? '⌨' : '🤖';
      const conn =
        s.kind === 'phone' && !s.link ? t.slotLost : s.ready ? t.slotReady : t.slotChoosing;
      const ping = s.kind === 'phone' && !Number.isNaN(s.rtt) ? ` · ${Math.round(s.rtt)} мс` : '';
      parts.push(
        `<div class="slot on" style="border-color:${color}"><div class="n">P${i + 1} ${kind}</div><div class="c" style="color:${color}">${s.classId ? t.className[s.classId] : '—'}</div><div class="s">${conn}${ping}</div></div>`,
      );
    }
    this.slotsEl.innerHTML = parts.join('');
    this.startEl.textContent =
      countdown !== null
        ? t.startingIn(Math.ceil(countdown))
        : this.lobby.canStart()
          ? t.pressStart
          : this.lobby.slots.some((s) => s)
            ? t.waitingReady
            : '';
  }

  show(on: boolean): void {
    this.root.style.display = on ? 'flex' : 'none';
  }
}
