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

  const stick = new Joystick($('left'), $('base'), $('knob'), () => blip(520, 0.05, 0.08));
  const ability = $('ability');
  const right = $('right');
  right.addEventListener('pointerdown', () => {
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

  net.onState = (s) => {
    $('reconnect').classList.toggle('on', s === 'lost');
    if (s === 'connecting') show('connecting');
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
        ability.classList.toggle('ready', m.ability >= 1);
        $('ring').setAttribute('stroke-dasharray', `${Math.round(m.ability * 100)} 100`);
        break;
      }
      case 'hurt':
        hurt(m.amount);
        break;
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
  const inp: PlayerInput = { move: { x: 0, y: 0 }, ability: false, dash: false };
  const packet = new DataView(new ArrayBuffer(INPUT_PACKET_SIZE));
  let seq = 0;
  window.setInterval(() => {
    if (net.state !== 'open' || phase !== 'match') return;
    inp.move.x = stick.x;
    inp.move.y = stick.y;
    inp.ability = abilityPressed;
    inp.dash = performance.now() < stick.dashUntil;
    encodeInput(packet, seq++, inp);
    net.sendPacket(packet.buffer.slice(0) as ArrayBuffer);
  }, 1000 / SEND_HZ);
}
