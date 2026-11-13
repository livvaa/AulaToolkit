import { describe, expect, it } from 'vitest';
import * as P from '@shared/protocols/yxt';

const hex = (b: ArrayLike<number>, n = 16): string => Buffer.from(Array.from(b).slice(0, n)).toString('hex');
const bytes = (s: string): number[] => s.split(' ').map((x) => parseInt(x, 16));

// Answers from the SC390 capture (issue #4), first 16 bytes.
const START = bytes('0e 20 00 00 52 f0 f0 f0 00 00 00 00 41 53 01 00');
const END = bytes('0e 20 00 00 f2 f0 f0 f0 00 00 00 00 20 41 f2 00');

describe('SC390 (yxt)', () => {
  it('reads polling, DPI stage, LOD and the switches', () => {
    const a = P.parseState(START)!;
    expect([a.usbRate, a.dongleRate, a.dpiStage]).toEqual([1, 1, 2]);
    expect(P.decodeSettings(a)).toMatchObject({ lod: 1, ultraLowDelay: 0, moveWakeup: 0 });
    // the driver's screen after the capture: 1000 Hz both, LOD 3 mm, all four switches on
    expect(P.decodeSettings(P.parseState(END)!)).toEqual({ usbRate: 3, dongleRate: 3, lod: 2, ultraLowDelay: 1, ultraLowPower: 1, ripple: 1, moveWakeup: 1 });
  });

  it('builds the frames the official driver sent', () => {
    expect(hex(P.ratesFrame(3, 1), 8)).toBe('0e2000f0d0f0f0f0');
    expect(hex(P.ratesFrame(3, 3), 8)).toBe('0e2000f0f0f0f0f0');
    expect(hex(P.section2Frame(0x40, 0x53, 0x01))).toBe(hex(bytes('0e 20 40 00 00 00 00 00 00 00 00 00 40 53 01 00')));
    expect(P.patchByte14(0x01, { lod: 2 })).toBe(0x02);
    expect(P.patchByte14(0x02, { ultraLowDelay: 1 })).toBe(0x12);
    expect(P.patchByte14(0x72, { moveWakeup: 1 })).toBe(0xf2);
    expect(P.queryFrame().length).toBe(P.REPORT_SIZE);
  });
});
