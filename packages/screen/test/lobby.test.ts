import { describe, expect, test } from 'vitest';
import { createGame } from '@horizon/sim';
import {
  INPUT_PACKET_SIZE,
  PROTOCOL_VERSION,
  encodeInput,
  type ControllerMessage,
  type ScreenMessage,
} from '@horizon/sim/protocol';
import { LobbyHost } from '../src/net/lobby';
import type { Link } from '../src/net/transport';

class FakeLink implements Link {
  open = true;
  sent: ScreenMessage[] = [];
  onReliable: (m: ControllerMessage) => void = () => {};
  onUnreliable: (v: DataView) => void = () => {};
  onClose: () => void = () => {};
  constructor(readonly id: string) {}
  sendReliable(m: ScreenMessage) {
    this.sent.push(m);
  }
  sendUnreliable() {}
  close() {
    this.open = false;
    this.onClose();
  }
  last<T extends ScreenMessage['t']>(t: T) {
    return [...this.sent].reverse().find((m) => m.t === t) as
      Extract<ScreenMessage, { t: T }> | undefined;
  }
}

function setup() {
  let clock = 0;
  let tok = 0;
  const host = new LobbyHost(
    () => clock,
    () => `tok${++tok}`,
  );
  const join = (id: string, token = '') => {
    const l = new FakeLink(id);
    host.attach(l);
    l.onReliable({ t: 'hello', v: PROTOCOL_VERSION, token });
    return l;
  };
  return { host, join, advance: (ms: number) => (clock += ms) };
}

describe('lobby', () => {
  test('phones get slots and distinct classes', () => {
    const { host, join } = setup();
    const a = join('a');
    const b = join('b');
    expect(a.last('welcome')?.slot).toBe(0);
    expect(b.last('welcome')?.slot).toBe(1);
    expect(host.slots[0]!.classId).toBe('assault');
    expect(host.slots[1]!.classId).toBe('engineer');
  });

  test('a taken class cannot be picked', () => {
    const { host, join } = setup();
    join('a');
    const b = join('b');
    b.onReliable({ t: 'class', classId: 'assault' });
    expect(host.slots[1]!.classId).toBe('engineer');
    b.onReliable({ t: 'class', classId: 'medic' });
    expect(host.slots[1]!.classId).toBe('medic');
  });

  test('fifth player is rejected', () => {
    const { join } = setup();
    for (const id of ['a', 'b', 'c', 'd']) join(id);
    expect(join('e').last('full')?.reason).toBe('full');
  });

  test('match starts only when everyone is ready', () => {
    const { host, join } = setup();
    const a = join('a');
    host.addLocal('keyboard');
    expect(host.canStart()).toBe(false);
    a.onReliable({ t: 'ready', ready: true });
    expect(host.canStart()).toBe(true);
  });

  test('reconnect with token returns to the same slot mid-match', () => {
    const { host, join, advance } = setup();
    join('x');
    const a = join('a');
    const token = a.last('welcome')!.token;
    for (const s of host.slots) if (s) s.ready = true;
    const order = host.slots.filter((s) => s !== null);
    host.beginMatch(
      createGame(
        undefined,
        1,
        order.map((s) => ({ classId: s.classId! })),
      ),
      order,
    );
    a.close();
    advance(6000);
    expect(host.botControlled(host.slots[1]!)).toBe(true);
    // Новий незнайомий пульт під час матчу не впускаємо.
    expect(join('stranger').last('full')?.reason).toBe('inMatch');
    const back = join('a2', token);
    expect(back.last('welcome')?.slot).toBe(1);
    expect(host.slots[1]!.classId).toBe('engineer');
    expect(host.botControlled(host.slots[1]!)).toBe(false);
  });

  test('stale unordered input packets are dropped', () => {
    const { host, join } = setup();
    const a = join('a');
    const v = new DataView(new ArrayBuffer(INPUT_PACKET_SIZE));
    encodeInput(v, 10, { move: { x: 1, y: 0 }, ability: false, dash: false });
    a.onUnreliable(v);
    encodeInput(v, 9, { move: { x: -1, y: 0 }, ability: false, dash: false });
    a.onUnreliable(v);
    expect(host.slots[0]!.input.move.x).toBe(1);
  });

  /** Два пульти в матчі; повертає їхні лінки й токени. */
  function inMatch() {
    const env = setup();
    const a = env.join('a');
    const b = env.join('b');
    const order = env.host.slots.filter((s) => s !== null);
    env.host.beginMatch(
      createGame(
        undefined,
        1,
        order.map((s) => ({ classId: s.classId! })),
      ),
      order,
    );
    return { ...env, a, b, tokenB: b.last('welcome')!.token };
  }

  test('any controller pauses; resume counts down before the match runs', () => {
    const { host, a, b, advance } = inMatch();
    expect(host.running()).toBe(true);
    b.onReliable({ t: 'pause', on: true });
    expect(host.running()).toBe(false);
    expect(host.pause?.by).toBe(1);
    host.update();
    expect(a.last('status')?.pause?.by).toBe(1);
    a.onReliable({ t: 'pause', on: false });
    expect(host.pause).toBeNull();
    expect(host.running()).toBe(false);
    expect(host.resumeIn()).toBe(3);
    advance(3000);
    expect(host.running()).toBe(true);
  });

  test('disconnect: bot after 5 s by default, or wait on pause if someone asks', () => {
    const { host, join, a, b, tokenB, advance } = inMatch();
    b.close();
    advance(1000);
    expect(host.dropped()).toEqual([{ slot: 1, botIn: 4 }]);
    expect(host.running()).toBe(true);
    a.onReliable({ t: 'wait', slot: 1 });
    expect(host.running()).toBe(false);
    expect(host.pause?.waiting).toEqual([1]);
    expect(host.dropped()).toEqual([]);
    // Повернувся — пауза була лише через очікування, тож продовжуємо з відліком.
    join('b2', tokenB);
    expect(host.pause).toBeNull();
    expect(host.resumeIn()).toBe(3);
  });

  test('continuing without the awaited player hands them to the bot at once', () => {
    const { host, a, b, advance } = inMatch();
    b.close();
    a.onReliable({ t: 'wait', slot: 1 });
    advance(500);
    a.onReliable({ t: 'pause', on: false });
    expect(host.botControlled(host.slots[1]!)).toBe(true);
    expect(host.dropped()).toEqual([{ slot: 1, botIn: 0 }]);
  });

  test('manual pause stays on when the awaited player returns', () => {
    const { host, join, a, b, tokenB } = inMatch();
    b.close();
    a.onReliable({ t: 'pause', on: true });
    a.onReliable({ t: 'wait', slot: 1 });
    join('b2', tokenB);
    expect(host.pause).toEqual({ by: 0, waiting: [] });
  });

  test('when every human is gone the match waits instead of playing itself', () => {
    const { host, a, b } = inMatch();
    a.close();
    b.close();
    host.update();
    expect(host.running()).toBe(false);
    expect(host.pause?.waiting.sort()).toEqual([0, 1]);
  });

  test('results reach every controller and «again» works only on the results screen', () => {
    const { host, a, b, join, tokenB } = inMatch();
    let again = 0;
    host.onAgain = () => again++;
    a.onReliable({ t: 'again' });
    expect(again).toBe(0);
    const summary = {
      won: true,
      wave: 11,
      waves: 11,
      seconds: 600,
      players: [],
      beatCore: true,
      endless: false,
      map: 'station',
      modifiers: [],
    };
    host.endMatch(summary);
    expect(a.last('results')?.slot).toBe(0);
    expect(b.last('results')?.slot).toBe(1);
    // Перепідключився на екрані результатів — теж бачить підсумок.
    expect(join('b2', tokenB).last('results')?.summary.wave).toBe(11);
    a.onReliable({ t: 'again' });
    expect(again).toBe(1);
  });

  test('skins cycle through unlocked ones only and fall back when locked', () => {
    const { host, join } = setup();
    const a = join('a');
    expect(host.slots[0]!.skin).toBe('standard');
    a.onReliable({ t: 'skin' });
    expect(host.slots[0]!.skin).toBe('standard');
    host.setSkins(['standard', 'desert', 'gold']);
    a.onReliable({ t: 'skin' });
    a.onReliable({ t: 'skin' });
    expect(host.slots[0]!.skin).toBe('gold');
    host.update();
    expect(a.last('lobby')?.skins).toEqual(['standard', 'desert', 'gold']);
    host.setSkins(['standard']);
    expect(host.slots[0]!.skin).toBe('standard');
  });

  test('audio toggles from any controller reach the screen; status carries the state', () => {
    const { host, a, advance } = inMatch();
    const got: string[] = [];
    host.onAudio = (w) => got.push(w);
    a.onReliable({ t: 'audio', what: 'music' });
    a.onReliable({ t: 'audio', what: 'voice' });
    a.onReliable({ t: 'audio', what: 'bogus' as 'music' });
    expect(got).toEqual(['music', 'voice']);
    host.audio = { music: false, sfx: true, voice: false };
    advance(200);
    host.update();
    expect(a.last('status')?.audio).toEqual({ music: false, sfx: true, voice: false });
  });
});
