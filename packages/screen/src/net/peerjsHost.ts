import Peer, { type DataConnection } from 'peerjs';
import type { ControllerMessage, ScreenMessage } from '@horizon/sim/protocol';
import { RoomTakenError, type HostTransport, type Link } from './transport';
import { iceServers } from './ice';
import { logErr, logNet, viaRelay, watchPeer } from '../diag';

export const PEER_PREFIX = 'horizon-room-';
/** Узгоджений канал вводу: той самий id на обох кінцях, без нового обміну SDP. */
export const INPUT_CHANNEL_ID = 100;

/**
 * Сигналінг через публічний PeerServer. PeerJS дає надійний JSON-канал; ненадійний канал
 * вводу створюємо самі поверх його RTCPeerConnection — сам PeerJS уміє лише «невпорядкований,
 * але з повторами», а запізнілий пакет вводу гірший за втрачений.
 */
export class PeerJsHost implements HostTransport {
  private peer: Peer | null = null;
  onLink: (link: Link) => void = () => {};

  async start(roomCode: string): Promise<void> {
    const ice = await iceServers();
    return new Promise((resolve, reject) => {
      const peer = new Peer(PEER_PREFIX + roomCode, { config: { iceServers: ice } });
      this.peer = peer;
      let opened = false;
      peer.on('open', () => {
        opened = true;
        logNet(`кімнату ${roomCode} зареєстровано на сервері сигналінгу`);
        resolve();
      });
      peer.on('error', (err) => {
        logErr(opened ? 'сигналінг' : `реєстрація кімнати ${roomCode}`, err);
        if (!opened) {
          peer.destroy();
          reject(
            (err as { type?: string }).type === 'unavailable-id'
              ? new RoomTakenError(roomCode)
              : err,
          );
        }
      });
      // Втрата сигналінг-сервера не рве вже встановлені з'єднання; лише нові не прийдуть.
      peer.on('disconnected', () => {
        logNet('сервер сигналінгу від’єднався: нові пульти не зайдуть, поки не повернеться');
        setTimeout(() => peer.disconnected && !peer.destroyed && peer.reconnect(), 1000);
      });
      // Після обриву мережі сокет сигналінгу буває мертвим ще з пів хвилини, поки PeerJS
      // це помітить, — і всі дзвінки пультів за цей час губляться. Мережа повернулась —
      // перевідкриваємо його одразу; ігрові лінії це не зачіпає.
      window.addEventListener('online', () => {
        if (peer !== this.peer || peer.destroyed || !opened) return;
        logNet('мережа повернулась — перевідкриваю сигналінг');
        // Обробник disconnected вище сам підключить його заново.
        if (!peer.disconnected) peer.disconnect();
      });
      peer.on('connection', (conn) => this.accept(conn));
    });
  }

  private accept(conn: DataConnection): void {
    const who = `пульт ${conn.peer.slice(0, 6)}`;
    logNet(`${who}: вхідне з'єднання`);
    if (conn.peerConnection) watchPeer(conn.peerConnection, who);
    exposeLanCandidates(conn.peerConnection);
    let unreliable: RTCDataChannel | null = null;
    let closed = false;
    const link: Link = {
      id: conn.peer,
      get open() {
        return conn.open && !closed;
      },
      sendReliable(msg: ScreenMessage) {
        if (conn.open) void conn.send(msg);
      },
      sendUnreliable(buf: ArrayBuffer) {
        if (unreliable?.readyState === 'open') unreliable.send(buf);
      },
      onReliable: () => {},
      onUnreliable: () => {},
      onClose: () => {},
      close() {
        conn.close();
      },
    };
    const finish = (why: string) => {
      if (closed) return;
      closed = true;
      logNet(`${who}: лінію закрито — ${why}`);
      unreliable?.close();
      link.onClose();
    };
    conn.on('open', () => {
      logNet(`${who}: канал відкрито`);
      window.setTimeout(
        () => void viaRelay(conn.peerConnection).then((r) => (link.relay = r)),
        1500,
      );
      unreliable = conn.peerConnection.createDataChannel('input', {
        negotiated: true,
        id: INPUT_CHANNEL_ID,
        ordered: false,
        maxRetransmits: 0,
      });
      unreliable.binaryType = 'arraybuffer';
      unreliable.onmessage = (e) => link.onUnreliable(new DataView(e.data as ArrayBuffer));
      unreliable.onopen = () => logNet(`${who}: канал вводу відкрито`);
      unreliable.onerror = (e) => {
        // Власне закриття лінії теж приходить сюди — це не збій.
        if (!closed) logErr(`${who}: канал вводу`, (e as RTCErrorEvent).error);
      };
      // Телефон, що заснув, не закриває канал — ICE падає в disconnected/failed.
      // disconnected буває хвилинами без переходу у failed (через ретранслятор) — тоді слот
      // у лобі висів би «на зв'язку» й займав місце. Чекаємо 5 с на відновлення й закриваємо.
      const pc = conn.peerConnection;
      let limbo = 0;
      pc.addEventListener('iceconnectionstatechange', () => {
        const s = pc.iceConnectionState;
        window.clearTimeout(limbo);
        if (s === 'failed' || s === 'closed') finish(`ICE ${s}`);
        else if (s === 'disconnected')
          limbo = window.setTimeout(() => {
            finish('ICE disconnected довше 5 с');
            conn.close();
          }, 5000);
      });
      this.onLink(link);
    });
    conn.on('data', (d) => link.onReliable(d as ControllerMessage));
    conn.on('close', () => finish('канал закрився'));
    conn.on('error', (err) => {
      logErr(who, err);
      finish('помилка каналу');
    });
  }

  stop(): void {
    this.peer?.destroy();
    this.peer = null;
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** IPv4 цього комп'ютера в домашній мережі: з адреси сторінки або від dev-сервера. */
function lanIp(): string {
  if (IPV4.test(location.hostname) && location.hostname !== '127.0.0.1') return location.hostname;
  return __LAN_IP__;
}

/**
 * Браузери ховають локальну адресу за випадковим `*.local` (mDNS). Якщо mDNS у мережі не
 * працює (роутер ріже multicast, macOS не дав Chrome доступу до локальної мережі), телефон
 * не може розв'язати це ім'я, а зовнішня адреса з STUN усередині мережі зазвичай не
 * досяжна (немає NAT hairpin) — ICE висить у checking. Тож до кожного mDNS-кандидата екрана
 * додаємо копію з реальною LAN-адресою: телефон шле перевірки на неї, а свою адресу екран
 * дізнається з них самих (peer-reflexive). Пульт нічого не змінює.
 */
function exposeLanCandidates(pc: RTCPeerConnection | undefined): void {
  const ip = lanIp();
  if (!pc || !ip) return;
  const send = pc.onicecandidate;
  if (!send) return;
  pc.onicecandidate = (evt) => {
    send.call(pc, evt);
    const c = evt.candidate;
    if (!c || !/ [0-9a-f-]+\.local /i.test(c.candidate)) return;
    const candidate = new RTCIceCandidate({
      candidate: c.candidate.replace(/ [0-9a-f-]+\.local /i, ` ${ip} `),
      sdpMid: c.sdpMid,
      sdpMLineIndex: c.sdpMLineIndex,
    });
    send.call(pc, { candidate } as RTCPeerConnectionIceEvent);
  };
}
