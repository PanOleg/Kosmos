import { describe, expect, test } from 'vitest';
import { decodeInput, emptyInput, encodeInput, INPUT_PACKET_SIZE, seqNewer } from '../src/protocol';

describe('protocol', () => {
  test('input packet round-trips', () => {
    const v = new DataView(new ArrayBuffer(INPUT_PACKET_SIZE));
    encodeInput(v, 65535, { move: { x: 0.5, y: -1 }, ability: true, dash: false, buy: 0 });
    const out = emptyInput();
    expect(decodeInput(v, out)).toBe(65535);
    expect(out.move.x).toBeCloseTo(0.5, 1);
    expect(out.move.y).toBe(-1);
    expect(out.ability).toBe(true);
    expect(out.dash).toBe(false);
  });

  test('seq comparison survives wrap-around', () => {
    expect(seqNewer(1, 65535)).toBe(true);
    expect(seqNewer(65535, 1)).toBe(false);
    expect(seqNewer(10, 10)).toBe(false);
    expect(seqNewer(300, 200)).toBe(true);
  });
});
