import QRCode from 'qrcode';
import {
  CUSTOM_MODS,
  DEFAULT_SETTINGS,
  MOD_RANGE,
  PRESETS,
  WAVES_RANGE,
  type PresetId,
  type SessionSettings,
} from '@horizon/sim';
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
.lobby .settings { margin-top: 18px; width: 474px; padding: 12px 14px; border-radius: 12px; background: rgba(10,12,18,.7);
  display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
.lobby .settings .row { display: flex; align-items: center; gap: 8px; }
.lobby .settings .lbl { width: 110px; opacity: .7; }
.lobby .settings button { font: inherit; color: inherit; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18);
  border-radius: 8px; padding: 5px 12px; cursor: pointer; }
.lobby .settings button.on { background: #ffaa22; color: #14100a; border-color: #ffaa22; font-weight: 700; }
.lobby .settings .val { min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
.lobby .settings input[type=range] { flex: 1; accent-color: #ffaa22; }
.lobby .settings .adv { display: none; flex-direction: column; gap: 6px; }
.lobby .settings.open .adv { display: flex; }
.lobby .start { font-size: 18px; font-weight: 700; color: #7dffb0; min-height: 24px; text-align: center; }
`;

const STORAGE_KEY = 'horizon-settings';

/** Налаштування сесії переживають перезавантаження екрана. */
export function loadSettings(): SessionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<SessionSettings>;
      return {
        preset: v.preset && v.preset in PRESETS ? v.preset : DEFAULT_SETTINGS.preset,
        custom: v.custom && typeof v.custom === 'object' ? v.custom : null,
        waves: typeof v.waves === 'number' ? v.waves : DEFAULT_SETTINGS.waves,
      };
    }
  } catch {
    /* приватний режим або зіпсований запис — беремо типові */
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: SessionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* не критично */
  }
}

const PRESET_ORDER: PresetId[] = ['easy', 'normal', 'hard'];

let installed = false;

/** Екран лобі: QR і код кімнати ліворуч, чотири слоти праворуч. */
export class LobbyView {
  private readonly root = document.createElement('div');
  private readonly slotsEl = document.createElement('div');
  private readonly startEl = document.createElement('div');
  private readonly codeEl = document.createElement('div');
  private readonly urlEl = document.createElement('div');
  private readonly qr = document.createElement('canvas');
  private readonly settingsEl = document.createElement('div');
  settings: SessionSettings = loadSettings();

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
    this.settingsEl.className = 'settings';
    this.settingsEl.addEventListener('click', (e) => this.onSettingsClick(e));
    this.settingsEl.addEventListener('input', (e) => this.onSlider(e));
    right.append(this.slotsEl, this.settingsEl, this.startEl);
    this.renderSettings();
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

  /** Клавіатура: D — наступний пресет, −/= — кількість хвиль. */
  cyclePreset(): void {
    const i = PRESET_ORDER.indexOf(this.settings.preset);
    this.settings.preset = PRESET_ORDER[(i + 1) % PRESET_ORDER.length]!;
    this.settings.custom = null;
    this.commit();
  }

  stepWaves(d: number): void {
    this.settings.waves = Math.min(
      WAVES_RANGE.max,
      Math.max(WAVES_RANGE.min, this.settings.waves + d),
    );
    this.commit();
  }

  private commit(): void {
    saveSettings(this.settings);
    this.renderSettings();
  }

  private onSettingsClick(e: Event): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.preset) {
      this.settings.preset = b.dataset.preset as PresetId;
      this.settings.custom = null;
      this.commit();
    } else if (b.dataset.waves) this.stepWaves(Number(b.dataset.waves));
    else if (b.dataset.adv) {
      this.settingsEl.classList.toggle('open');
    } else if (b.dataset.reset) {
      this.settings.custom = null;
      this.commit();
    }
  }

  private onSlider(e: Event): void {
    const el = e.target as HTMLInputElement;
    const k = el.dataset.mod as (typeof CUSTOM_MODS)[number] | undefined;
    if (!k) return;
    this.settings.custom = { ...(this.settings.custom ?? {}), [k]: Number(el.value) };
    saveSettings(this.settings);
    const val = el.parentElement?.querySelector('.val');
    if (val) val.textContent = `×${Number(el.value).toFixed(2)}`;
    const p = this.settingsEl.querySelector('.preset-note');
    if (p) p.textContent = t.customized;
  }

  private renderSettings(): void {
    const s = this.settings;
    const base = PRESETS[s.preset];
    const presets = PRESET_ORDER.map(
      (p) =>
        `<button data-preset="${p}" class="${p === s.preset ? 'on' : ''}">${t.preset[p]}</button>`,
    ).join('');
    const sliders = CUSTOM_MODS.map((k) => {
      const v = s.custom?.[k] ?? base[k];
      return `<div class="row"><span class="lbl">${t.modName[k]}</span><input type="range" min="${MOD_RANGE.min}" max="${MOD_RANGE.max}" step="0.05" value="${v}" data-mod="${k}"><span class="val">×${v.toFixed(2)}</span></div>`;
    }).join('');
    const open = this.settingsEl.classList.contains('open');
    this.settingsEl.innerHTML = `<div class="row"><span class="lbl">${t.difficulty}</span>${presets}<span class="preset-note" style="opacity:.6;margin-left:auto">${s.custom ? t.customized : ''}</span></div>
<div class="row"><span class="lbl">${t.wavesLabel}</span><button data-waves="-1">−</button><span class="val">${s.waves}</span><button data-waves="1">+</button><button data-adv="1" style="margin-left:auto">${t.advanced}</button></div>
<div class="adv">${sliders}<div class="row"><button data-reset="1">${t.resetCustom}</button></div></div>`;
    this.settingsEl.classList.toggle('open', open);
  }

  show(on: boolean): void {
    this.root.style.display = on ? 'flex' : 'none';
  }
}
