import { describe, expect, test } from 'vitest';
import { DiagLog, MAX_FOREIGN, describeError, wallClock } from '../src/diag';

describe('diagnostic log', () => {
  test('ring buffer keeps the newest lines; drain returns only fresh ones', () => {
    let t = 0;
    const log = new DiagLog(() => `t${++t}`, 3);
    log.add('net', 'a');
    log.add('net', 'b');
    expect(log.drain()).toEqual(['t1 [net] a', 't2 [net] b']);
    expect(log.drain()).toEqual([]);
    log.add('net', 'c');
    log.add('net', 'd');
    expect(log.lines()).toEqual(['t2 [net] b', 't3 [net] c', 't4 [net] d']);
    expect(log.drain()).toEqual(['t3 [net] c', 't4 [net] d']);
    // Курсор для надсилання на сервер: свої й чужі рядки, не більше за буфер.
    const mark = log.seq;
    log.add('net', 'e');
    log.addForeign('П1', ['f']);
    expect(log.since(mark)).toEqual(['t5 [net] e', 'П1 f']);
    expect(log.since(0).length).toBe(3);
    expect(log.since(log.seq)).toEqual([]);
  });

  test('foreign lines are capped, filtered and never echoed back', () => {
    const log = new DiagLog(() => 't', 500);
    expect(log.addForeign('П1', 'oops')).toBe(0);
    const many = Array.from({ length: MAX_FOREIGN + 20 }, (_, i) => `l${i}`);
    expect(log.addForeign('П1', [...many, 7, null])).toBe(MAX_FOREIGN - 2);
    expect(log.lines()[0]).toMatch(/^П1 l/);
    expect(log.drain()).toEqual([]);
    log.addForeign('П1', ['x'.repeat(1000)]);
    expect(log.lines().at(-1)!.length).toBe(300);
  });

  test('a line repeated in a row is written once and counted', () => {
    const log = new DiagLog(() => 't', 50);
    for (let i = 0; i < 1000; i++) log.add('помилка', 'boom');
    expect(log.lines()).toEqual(['t [помилка] boom']);
    log.add('net', 'ok');
    expect(log.lines()).toEqual([
      't [помилка] boom',
      't [net] попередній рядок повторився ще 999 раз(ів)',
      't [net] ok',
    ]);
  });

  test('restored lines, error text and clock format', () => {
    const log = new DiagLog(() => 't', 2, ['a', 'b', 'c']);
    expect(log.text()).toBe('b\nc');
    expect(describeError(Object.assign(new Error('boom'), { type: 'network' }))).toBe(
      'network: Error: boom',
    );
    expect(describeError({ a: 1 })).toBe('{"a":1}');
    expect(wallClock(new Date(2026, 0, 2, 3, 4, 5, 6))).toBe('03:04:05.006');
  });
});
