import {
  CLASS_COLOR,
  INPUT_PACKET_SIZE,
  PING_PACKET_SIZE,
  PKT_PING,
  PKT_PONG,
  PROTOCOL_VERSION,
  encodeInput,
  encodePing,
  type ClassId,
  type PlayerInput,
  type ScreenMessage,
  type ScreenPhase,
  type ShopInfo,
  BUY_MEDKIT,
  BUY_LIFE,
} from '@horizon/sim/protocol';
import { ControllerNet } from './net';
import { LocalNet } from './localNet';
import type { ClientTransport } from './transport';
import { Joystick } from './joystick';
import { ClassSelect, CLASS_META } from './classSelect';
import { diag, onDiag, startUpload, watchPage } from './diag';
import { blip, hurt, lockPage, onUserGesture, setPlayerColor } from './feedback';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SEND_HZ = 30;
const AWARD: Record<string, string> = {
  kills: 'Винищувач',
  revives: 'Рятівник',
  parts: 'Збирач',
  tank: 'Щит команди',
  untouched: 'Без падінь',
};

lockPage();
document.addEventListener('pointerdown', () => void onUserGesture(), { capture: true });

type View = 'join' | 'connecting' | 'lobby' | 'match' | 'results' | 'full';
let view: View | '' = '';
function show(v: View): void {
  if (v !== view) diag.add('пульт', `екран пульта: ${v}`);
  view = v;
  for (const el of document.querySelectorAll('.view'))
    el.classList.toggle('on', el.id === `v-${v}`);
  syncDiagButton();
}

// Журнал зв'язку (DECISIONS.md, п. 69): кнопка — там, де гравець застряг, і в паузі.
watchPage('пульт');
startUpload('controller', () =>
  (new URLSearchParams(location.search).get('room') ?? '').toUpperCase(),
);
function syncDiagButton(): void {
  const stuck =
    view === 'join' ||
    view === 'connecting' ||
    view === 'full' ||
    view === 'lobby' ||
    $('reconnect').classList.contains('on') ||
    $('paused').classList.contains('on');
  document.body.classList.toggle('diag-btn', stuck);
}
{
  const pre = $('diag-text');
  const render = () => {
    pre.textContent = diag.text();
    pre.scrollTop = pre.scrollHeight;
  };
  $('diag-open').addEventListener('click', () => {
    $('diag').classList.add('on');
    render();
  });
  $('diag-close').addEventListener('click', () => $('diag').classList.remove('on'));
  $('diag-copy').addEventListener('click', () => {
    const done = (ok: boolean) =>
      ($('diag-copy').textContent = ok ? 'Скопійовано ✓' : 'Виділіть текст вручну');
    if (navigator.clipboard)
      navigator.clipboard.writeText(diag.text()).then(
        () => done(true),
        () => done(false),
      );
    else done(false);
  });
  onDiag(() => $('diag').classList.contains('on') && render());
}

const params = new URLSearchParams(location.search);
const room = (params.get('room') ?? '').toUpperCase();

if (!room) {
  show('join');
  const input = $<HTMLInputElement>('code');
  const go = () => {
    const c = input.value.trim().toUpperCase();
    if (c.length !== 4) {
      $('join-err').textContent = 'Код має 4 символи';
      return;
    }
    location.search = `?room=${c}${params.get('net') === 'local' ? '&net=local' : ''}`;
  };
  $('join').addEventListener('click', go);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
} else {
  run(room);
}

function run(room: string): void {
  show('connecting');
  $('conn-msg').textContent = `Кімната ${room}`;
  // Токен повернення в слот — у sessionStorage: переживає оновлення сторінки й відновлення
  // вкладки після сну, але не ділиться між вкладками (інакше друга вкладка вкрала б слот).
  const tokenKey = `horizon-token-${room}`;
  // ?net=local — без мережі, через BroadcastChannel з екраном на тому ж origin.
  const net: ClientTransport =
    params.get('net') === 'local' ? new LocalNet(room) : new ControllerNet(room);
  let slot = -1;
  let phase: ScreenPhase = 'lobby';
  let ready = false;
  let classId: ClassId | null = null;
  let abilityPressed = false;
  let ghostUsed = false;

  const classSelect = new ClassSelect($('classes'), (c) => {
    // Дотик по своїй картці знімає роль: клас звільняється для іншого гравця.
    const drop = c === classId;
    blip(drop ? 440 : 660, 0.06);
    diag.add('пульт', drop ? `знімаю роль ${c}` : `прошу роль ${c}`);
    net.send({ t: 'class', classId: drop ? null : c });
  });
  $('again').addEventListener('click', () => {
    blip(880, 0.08);
    net.send({ t: 'again' });
  });
  $('ready').addEventListener('click', () => {
    // Повний екран, де браузер дозволяє (Android): адресний рядок не забирає місце в пальців.
    if (!document.fullscreenElement)
      void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    blip(ready ? 440 : 880, 0.08);
    net.send({ t: 'ready', ready: !ready });
  });

  // Магазин: кнопка «тримається» 200 мс — кілька пакетів ненадійного каналу, симуляція бере фронт.
  let buyItem = 0;
  let buyUntil = 0;
  const shopEl = $('shop');
  const medkitBtn = $<HTMLButtonElement>('medkit');
  const pressBuy = (item: number, el: HTMLElement) => {
    if ((el as HTMLButtonElement).disabled) return;
    buyItem = item;
    buyUntil = performance.now() + 200;
    el.classList.add('press');
    setTimeout(() => el.classList.remove('press'), 120);
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>('.buy'))
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      pressBuy(Number(b.dataset.item), b);
    });
  medkitBtn.addEventListener('pointerdown', () => pressBuy(BUY_MEDKIT, medkitBtn));
  const lifeBtn = $<HTMLButtonElement>('life');
  lifeBtn.addEventListener('pointerdown', () => pressBuy(BUY_LIFE, lifeBtn));

  // Пауза: утримати кнопку 0.5 с, щоб не поставити випадково долонею.
  // «Сюди!»: мітка над своїм персонажем на екрані. Екран приймає не частіше ніж раз на 2 с.
  let pingAt = 0;
  let pingedTimer = 0;
  $('ping').addEventListener('click', () => {
    if (performance.now() - pingAt < 2000) return;
    pingAt = performance.now();
    blip(990, 0.08);
    navigator.vibrate?.(30);
    net.send({ t: 'ping' });
  });
  const pauseBtn = $('pause');
  let holdTimer = 0;
  const holdEnd = () => {
    window.clearTimeout(holdTimer);
    pauseBtn.classList.remove('hold');
  };
  pauseBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    pauseBtn.setPointerCapture(e.pointerId);
    pauseBtn.classList.add('hold');
    holdTimer = window.setTimeout(() => {
      holdEnd();
      navigator.vibrate?.(30);
      blip(520, 0.08);
      net.send({ t: 'pause', on: true });
    }, 500);
  });
  pauseBtn.addEventListener('pointerup', holdEnd);
  pauseBtn.addEventListener('pointercancel', holdEnd);
  // Звук на екрані: музика / звуки / озвучка окремо — з будь-якого пульта на паузі.
  $('audio').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-audio]');
    if (!b) return;
    blip(620, 0.05);
    net.send({ t: 'audio', what: b.dataset.audio as 'music' | 'sfx' | 'voice' });
  });
  // Режим для лівші: зони руху й здібності міняються місцями; вибір живе на цьому телефоні.
  const LEFTY_KEY = 'horizon-lefty';
  const setLefty = (on: boolean) => {
    document.body.classList.toggle('lefty', on);
    $('lefty').classList.toggle('on', on);
  };
  try {
    setLefty(localStorage.getItem(LEFTY_KEY) === '1');
  } catch {
    // Приватний режим: просто без збереження.
  }
  $('lefty').addEventListener('click', () => {
    const on = !document.body.classList.contains('lefty');
    setLefty(on);
    blip(620, 0.05);
    try {
      localStorage.setItem(LEFTY_KEY, on ? '1' : '0');
    } catch {
      // Не критично.
    }
  });
  $('resume').addEventListener('click', () => {
    blip(880, 0.08);
    net.send({ t: 'pause', on: false });
  });
  // «Чекати»: відключеного напарника не віддаємо боту — матч стає на паузу до його повернення.
  $('drops').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-slot]');
    if (!b) return;
    blip(660, 0.06);
    net.send({ t: 'wait', slot: Number(b.dataset.slot) });
  });
  let pauseSig = '';
  const renderPause = (m: Extract<ScreenMessage, { t: 'status' }>) => {
    const inMatch = m.phase === 'match';
    const sig = JSON.stringify([inMatch, m.pause, m.resumeIn, m.dropped, m.audio]);
    if (sig === pauseSig) return;
    pauseSig = sig;
    const p = inMatch ? m.pause : null;
    const counting = inMatch && !p && m.resumeIn > 0;
    const el = $('paused');
    el.classList.toggle('on', !!p || counting);
    el.classList.toggle('count', counting);
    syncDiagButton();
    $('resume').hidden = !p;
    $('audio').hidden = !p;
    for (const b of document.querySelectorAll<HTMLElement>('#audio button'))
      b.classList.toggle('on', !!m.audio?.[b.dataset.audio as 'music' | 'sfx' | 'voice']);
    if (p) {
      const who = (n: number[]) => n.map((i) => `P${i + 1}`).join(', ');
      $('paused-title').textContent = 'Пауза';
      $('paused-sub').textContent = p.waiting.length
        ? `Чекаємо ${who(p.waiting)} — немає зв'язку`
        : p.by >= 0
          ? p.by === slot
            ? 'Ви поставили паузу'
            : `Паузу поставив P${p.by + 1}`
          : '';
      $('resume').textContent = p.waiting.length ? 'Продовжити з ботом' : 'Продовжити';
    } else if (counting) {
      $('paused-title').textContent = String(m.resumeIn);
      $('paused-sub').textContent = '';
    }
    $('drops').innerHTML = inMatch
      ? m.dropped
          .map(
            (d) =>
              `<div>P${d.slot + 1} без зв'язку · ${d.botIn > 0 ? `бот через ${d.botIn} с` : 'керує бот'}<button data-slot="${d.slot}">Чекати</button></div>`,
          )
          .join('')
      : '';
  };

  const renderShop = (shop: ShopInfo | null, parts: number, hp: number, maxHp: number) => {
    const fullHp = hp >= maxHp;
    const open = shop !== null;
    shopEl.hidden = !open;
    ability.style.display = open ? 'none' : '';
    medkitBtn.hidden = !open;
    lifeBtn.hidden = !shop || shop.life === null;
    if (!shop) return;
    if (shop.life !== null) {
      lifeBtn.disabled = parts < shop.life;
      $('life-price').textContent = String(shop.life);
    }
    $('shop-time').textContent = String(shop.secondsLeft);
    document.querySelectorAll<HTMLButtonElement>('.buy').forEach((b, i) => {
      const lvl = shop.levels[i]!;
      const price = shop.prices[i] ?? null;
      b.querySelector('.pips')!.innerHTML = [0, 1, 2]
        .map((k) => `<i class="${k < lvl ? 'on' : ''}"></i>`)
        .join('');
      b.querySelector('.bp')!.textContent = price === null ? 'макс.' : `⚙ ${price}`;
      b.disabled = price === null || parts < price;
    });
    // Аптечка при повному здоров'ї не потрібна — симуляція її однаково відхилить.
    const used = shop.medkit === null;
    const poor = !used && parts < shop.medkit!;
    medkitBtn.disabled = used || poor || fullHp;
    // Зрозуміло, що буде й чому не можна: скільки поверне, або причина відмови.
    const gain = Math.min(shop.medkitHeal ?? 50, Math.max(0, maxHp - hp));
    $('medkit-note').textContent = used
      ? 'вже використано в цій паузі'
      : fullHp
        ? 'здоров’я повне'
        : poor
          ? `+${gain} ❤ · бракує деталей`
          : `+${gain} ❤ · зараз ${hp} із ${maxHp}`;
    $('medkit-price').textContent = used ? '✓' : `⚙ ${shop.medkit}`;
    medkitBtn.classList.toggle('want', !medkitBtn.disabled && hp < maxHp * 0.6);
  };

  // Навчання (DECISIONS.md, п. 56): підказки по одній у першому матчі на цьому телефоні;
  // кожна зникає, щойно гравець зробив описане, і більше не з'являється.
  const TIPS_KEY = 'horizon-tips';
  const tipsSeen = new Set<string>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
  );
  if (tipsSeen.has('move')) {
    // Досвідчений гравець: зона руху одразу лише тьмяний орієнтир.
    ghostUsed = true;
    $('ghost').classList.add('used');
  }
  const tipShownAt = new Map<string, number>();
  const learn = (id: string) => {
    if (tipsSeen.has(id)) return;
    tipsSeen.add(id);
    try {
      localStorage.setItem(TIPS_KEY, JSON.stringify([...tipsSeen]));
    } catch {
      /* не критично */
    }
  };
  const renderTip = (m: Extract<ScreenMessage, { t: 'status' }>) => {
    const now = performance.now();
    const shownFor = (id: string) => {
      if (!tipShownAt.has(id)) tipShownAt.set(id, now);
      return now - tipShownAt.get(id)!;
    };
    let text = '';
    if (m.phase !== 'match' || m.down || m.pause) text = '';
    else if (!tipsSeen.has('move')) text = '';
    else if (m.revive && !tipsSeen.has('revive'))
      text = 'Напарник упав поруч: тримайте праву кнопку, щоб підняти';
    else if (m.shop && !tipsSeen.has('shop'))
      text = 'Пауза між хвилями: зелена кнопка лікує, решта — покращення за ⚙';
    else if (!tipsSeen.has('aim')) {
      text = 'Зброя стріляє сама в найближчого ворога — ви рухаєтесь і ховаєтесь';
      if (shownFor('aim') > 7000) learn('aim');
    } else if (!tipsSeen.has('dash')) {
      text = 'Різко смикніть пальцем — ривок крізь небезпеку';
      if (shownFor('dash') > 12000) learn('dash');
    } else if (!m.shop && !m.revive && m.ability >= 1 && !tipsSeen.has('ability') && m.classId)
      text = `Кільце праворуч повне — тисніть: ${CLASS_META[m.classId].ability}`;
    // Підказка відіграла, щойно її привід зник.
    if (!m.revive && tipShownAt.has('revive')) learn('revive');
    if (!m.shop && tipShownAt.has('shop')) learn('shop');
    if (m.revive && !tipsSeen.has('revive')) shownFor('revive');
    if (m.shop && !tipsSeen.has('shop')) shownFor('shop');
    const el = $('tip');
    el.hidden = text === '';
    if (text && el.textContent !== text) el.textContent = text;
  };

  // Вібрація на події, які легко пропустити, дивлячись на телевізор (де браузер її вміє —
  // Android; iPhone Safari вібрації не дає): здібність готова, підбір деталей, напарник упав
  // поруч, початок хвилі.
  const hp = { ability: 1, parts: 0, revive: false, shop: false, partsAt: 0 };
  const haptics = (m: Extract<ScreenMessage, { t: 'status' }>) => {
    if (m.phase !== 'match' || m.down) return;
    const now = performance.now();
    if (m.ability >= 1 && hp.ability < 1) navigator.vibrate?.(25);
    if (m.parts > hp.parts && !m.shop && now - hp.partsAt > 250) {
      navigator.vibrate?.(8);
      hp.partsAt = now;
    }
    if (m.revive && !hp.revive) navigator.vibrate?.([40, 50, 40]);
    if (!m.shop && hp.shop) navigator.vibrate?.(70);
    hp.ability = m.ability;
    hp.parts = m.parts;
    hp.revive = !!m.revive;
    hp.shop = !!m.shop;
  };

  const stick = new Joystick($('left'), $('base'), $('knob'), () => {
    blip(520, 0.05, 0.08);
    navigator.vibrate?.(12);
    if (tipsSeen.has('aim')) learn('dash');
  });
  const ability = $('ability');
  const right = $('right');
  right.addEventListener('pointerdown', () => {
    // У паузі права половина — магазин, здібність не тиснеться.
    if (!shopEl.hidden) return;
    abilityPressed = true;
    if (ability.classList.contains('ready')) learn('ability');
    ability.classList.add('press');
    blip(330, 0.08);
  });
  const release = () => {
    abilityPressed = false;
    ability.classList.remove('press');
  };
  right.addEventListener('pointerup', release);
  right.addEventListener('pointercancel', release);
  right.addEventListener('pointerleave', release);

  const applyClass = (c: ClassId | null) => {
    if (c === classId) return;
    classId = c;
    setPlayerColor(c ? CLASS_COLOR[c] : null);
    $('cls').textContent = c ? CLASS_META[c].name : '';
    $('ability-icon').textContent = c ? CLASS_META[c].icon : '';
  };

  const applyPhase = (p: ScreenPhase) => {
    phase = p;
    if (p === 'lobby') show('lobby');
    else if (p === 'match') show('match');
    else show('results');
  };

  // Якщо за 8 с з'єднання немає — підказати типові причини замість вічного «Під'єднання…».
  const slowHint = window.setTimeout(() => {
    if (net.state !== 'open') $('conn-hint').hidden = false;
  }, 8000);
  net.onState = (s) => {
    $('reconnect').classList.toggle('on', s === 'lost');
    syncDiagButton();
    if (s === 'connecting') show('connecting');
    if (s === 'open') {
      window.clearTimeout(slowHint);
      $('conn-hint').hidden = true;
    }
  };

  net.onMessage = (m: ScreenMessage) => {
    switch (m.t) {
      case 'welcome':
        diag.add('пульт', `екран прийняв: гравець ${m.slot + 1}`);
        flushLog();
        slot = m.slot;
        sessionStorage.setItem(tokenKey, m.token);
        break;
      case 'full':
        diag.add('пульт', `екран відмовив: ${m.reason}`);
        show('full');
        $('full-msg').textContent =
          m.reason === 'inMatch'
            ? 'Матч уже йде — дочекайтеся наступного'
            : m.reason === 'version'
              ? 'Оновіть сторінку: версії екрана й пульта різні'
              : 'Усі чотири місця зайняті';
        break;
      case 'lobby': {
        if (m.phase !== phase || !document.querySelector('.view.on')) applyPhase(m.phase);
        if (phase === 'lobby') show('lobby');
        const me = m.slots.find((s) => s.slot === slot);
        if (me) {
          applyClass(me.classId);
          ready = me.ready;
          $('ready').classList.toggle('on', ready);
          $('ready').textContent = ready ? 'Готовий ✓' : 'Готовий';
        }
        classSelect.render(slot, m.slots);
        $('lobby-title').textContent = me?.classId
          ? `Гравець ${slot + 1} · ${CLASS_META[me.classId].name} — торкніться ще раз, щоб зняти роль`
          : `Гравець ${slot + 1} · оберіть клас`;
        $<HTMLButtonElement>('ready').disabled = !me?.classId;
        break;
      }
      case 'status': {
        if (m.phase !== phase) applyPhase(m.phase);
        applyClass(m.classId);
        $<HTMLElement>('hp').style.width = `${m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0}%`;
        $('parts').textContent = String(m.parts);
        {
          // Мало здоров'я (< 30%): рамка пульсує, а на вході в небезпечну зону — подвійна вібрація.
          const low = m.phase === 'match' && !m.down && m.maxHp > 0 && m.hp < m.maxHp * 0.3;
          if (low && !document.body.classList.contains('lowhp')) navigator.vibrate?.([60, 60, 60]);
          document.body.classList.toggle('lowhp', low);
        }
        $('down').style.display = m.down ? 'block' : 'none';
        if (m.down)
          $('down').innerHTML =
            m.bleed < 0
              ? 'Вибули<small>Повернетесь на початку наступної хвилі</small>'
              : `Ви впали · ${m.bleed} с<small>Напарник може підняти вас, стоячи поруч</small>`;
        // Поруч упалий напарник: кнопка здібності — «підняти» з ціною й кільцем утримання.
        const rv = m.revive;
        ability.classList.toggle('revive', !!rv && rv.affordable);
        ability.classList.toggle('poor', !!rv && !rv.affordable);
        ability.classList.toggle('ready', !rv && m.ability >= 1);
        $('ability-icon').textContent = rv ? '✚' : m.classId ? CLASS_META[m.classId].icon : '';
        $('ability-label').textContent = rv
          ? rv.affordable
            ? `ПІДНЯТИ · ⚙${rv.cost}`
            : `ПОТРІБНО ⚙${rv.cost}`
          : m.classId
            ? CLASS_META[m.classId].ability.toUpperCase()
            : '';
        const ring = rv ? rv.progress : m.ability;
        $('ring').setAttribute('stroke-dasharray', `${Math.round(ring * 100)} 100`);
        renderShop(m.shop, m.parts, m.hp, m.maxHp);
        $('hp-num').textContent = m.maxHp > 0 ? `${m.hp}/${m.maxHp}` : '';
        renderPause(m);
        renderTip(m);
        haptics(m);
        break;
      }
      case 'hurt':
        hurt(m.amount);
        break;
      case 'pinged': {
        // Напарник кличе: коротка потрійна вібрація й напис на 2,5 с.
        navigator.vibrate?.([30, 40, 30, 40, 30]);
        const el = $('pinged');
        el.textContent = `📣 Гравець ${m.slot + 1} кличе: сюди!`;
        el.classList.add('on');
        window.clearTimeout(pingedTimer);
        pingedTimer = window.setTimeout(() => el.classList.remove('on'), 2500);
        break;
      }
      case 'results': {
        // Власна картка гравця; спільна таблиця — на великому екрані.
        const sum = m.summary;
        const me = sum.players[m.slot];
        $('res-title').textContent = sum.won ? 'Станцію утримано' : 'Екіпаж упав';
        $('res-sub').textContent =
          `Хвиля ${sum.wave} / ${sum.waves} · ${Math.floor(sum.seconds / 60)}:${String(sum.seconds % 60).padStart(2, '0')}`;
        $('res-stats').innerHTML = me
          ? [
              ['Вбивства', me.kills],
              ['Деталі', me.parts],
              ['Воскресіння', me.revives],
              ['Падіння', me.downs],
            ]
              .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`)
              .join('')
          : '';
        $('res-awards').innerHTML = (me?.awards ?? [])
          .map((k) => `<i>${AWARD[k] ?? k}</i>`)
          .join('');
        navigator.vibrate?.(sum.won ? [60, 60, 120] : 200);
        break;
      }
      case 'bought': {
        const btn =
          m.item === BUY_MEDKIT
            ? $('medkit')
            : m.item === BUY_LIFE
              ? $('life')
              : document.querySelector<HTMLElement>(`.buy[data-item="${m.item}"]`);
        if (m.ok) {
          navigator.vibrate?.(40);
          blip(880, 0.1, 0.12);
          btn?.classList.remove('flash');
          void btn?.offsetWidth;
          btn?.classList.add('flash');
        } else {
          navigator.vibrate?.([30, 40, 30]);
          blip(160, 0.15, 0.12);
        }
        break;
      }
    }
  };

  // Свій журнал — екрану: там видно обидва боки одним списком. Після кожного повернення
  // зв'язку й далі раз на 5 с, якщо назбиралося нове.
  const flushLog = () => {
    if (net.state !== 'open') return;
    const lines = diag.drain();
    if (lines.length) net.send({ t: 'log', lines });
  };
  window.setInterval(flushLog, 5000);

  const pong = new DataView(new ArrayBuffer(PING_PACKET_SIZE));
  net.onPacket = (v) => {
    // Екран міряє затримку: віддзеркалюємо пінг одразу.
    if (v.getUint8(0) === PKT_PING) {
      encodePing(pong, PKT_PONG, v.getUint32(1));
      net.sendPacket(pong.buffer.slice(0) as ArrayBuffer);
    }
  };

  net.start(() => ({
    t: 'hello',
    v: PROTOCOL_VERSION,
    token: sessionStorage.getItem(tokenKey) ?? '',
  }));

  // Ввід — повний стан пульта з фіксованою частотою, ненадійним каналом.
  const inp: PlayerInput = { move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 };
  const packet = new DataView(new ArrayBuffer(INPUT_PACKET_SIZE));
  let seq = 0;
  let lastSig = NaN;
  let repeats = 0;
  let idleTicks = 0;
  window.setInterval(() => {
    if (net.state !== 'open' || phase !== 'match') return;
    inp.move.x = stick.x;
    inp.move.y = stick.y;
    // Гравець уже рухався — підказка зони руху тьмяніє до ледь помітного орієнтира.
    if (!ghostUsed && (stick.x !== 0 || stick.y !== 0)) {
      ghostUsed = true;
      learn('move');
      window.setTimeout(() => $('ghost').classList.add('used'), 1500);
    }
    inp.ability = abilityPressed;
    inp.dash = performance.now() < stick.dashUntil;
    inp.buy = performance.now() < buyUntil ? buyItem : 0;
    // Трафік (п. 74): незмінний ввід (палець стоїть або відпущений) — 10 разів на секунду
    // замість 30; будь-яка зміна йде одразу й ще двічі поспіль на випадок втрати пакета.
    const sig =
      Math.round(inp.move.x * 40) * 4096 +
      Math.round(inp.move.y * 40) * 32 +
      (inp.ability ? 1 : 0) +
      (inp.dash ? 2 : 0) +
      inp.buy * 4;
    if (sig !== lastSig) {
      lastSig = sig;
      repeats = 2;
    } else if (repeats > 0) repeats--;
    else if (++idleTicks < 3) return;
    idleTicks = 0;
    encodeInput(packet, seq++, inp);
    net.sendPacket(packet.buffer.slice(0) as ArrayBuffer);
  }, 1000 / SEND_HZ);
}
