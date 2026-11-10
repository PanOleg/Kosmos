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
import { blip, hurt, lockPage, onUserGesture, setPlayerColor } from './feedback';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SEND_HZ = 30;

lockPage();
document.addEventListener('pointerdown', () => void onUserGesture(), { capture: true });

type View = 'join' | 'connecting' | 'lobby' | 'match' | 'results' | 'full';
function show(v: View): void {
  for (const el of document.querySelectorAll('.view'))
    el.classList.toggle('on', el.id === `v-${v}`);
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

  const classSelect = new ClassSelect($('classes'), (c) => {
    blip(660, 0.06);
    net.send({ t: 'class', classId: c });
  });
  $('ready').addEventListener('click', () => {
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

  const renderShop = (shop: ShopInfo | null, parts: number, fullHp: boolean) => {
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
    medkitBtn.disabled = shop.medkit === null || parts < shop.medkit || fullHp;
    $('medkit-price').textContent = shop.medkit === null ? '✓' : String(shop.medkit);
  };

  const stick = new Joystick($('left'), $('base'), $('knob'), () => blip(520, 0.05, 0.08));
  const ability = $('ability');
  const right = $('right');
  right.addEventListener('pointerdown', () => {
    // У паузі права половина — магазин, здібність не тиснеться.
    if (!shopEl.hidden) return;
    abilityPressed = true;
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
    if (s === 'connecting') show('connecting');
    if (s === 'open') {
      window.clearTimeout(slowHint);
      $('conn-hint').hidden = true;
    }
  };

  net.onMessage = (m: ScreenMessage) => {
    switch (m.t) {
      case 'welcome':
        slot = m.slot;
        sessionStorage.setItem(tokenKey, m.token);
        break;
      case 'full':
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
        $('lobby-title').textContent = `Гравець ${slot + 1} · оберіть клас`;
        break;
      }
      case 'status': {
        if (m.phase !== phase) applyPhase(m.phase);
        applyClass(m.classId);
        $<HTMLElement>('hp').style.width = `${m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0}%`;
        $('parts').textContent = String(m.parts);
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
          : '';
        const ring = rv ? rv.progress : m.ability;
        $('ring').setAttribute('stroke-dasharray', `${Math.round(ring * 100)} 100`);
        renderShop(m.shop, m.parts, m.hp >= m.maxHp);
        break;
      }
      case 'hurt':
        hurt(m.amount);
        break;
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
  window.setInterval(() => {
    if (net.state !== 'open' || phase !== 'match') return;
    inp.move.x = stick.x;
    inp.move.y = stick.y;
    inp.ability = abilityPressed;
    inp.dash = performance.now() < stick.dashUntil;
    inp.buy = performance.now() < buyUntil ? buyItem : 0;
    encodeInput(packet, seq++, inp);
    net.sendPacket(packet.buffer.slice(0) as ArrayBuffer);
  }, 1000 / SEND_HZ);
}
