// AULA SC390 (32C2:0024): 32-byte output reports with id 0x0E on interface 2, answered on the same
// interface. Decoded from a USB capture of the official driver (issue #4), matched against the
// driver's screen after each step. Only the parts seen in that capture are used here.
//
// `0e 20 <section> ...` writes and answers with the current state (same layout):
//   section 0x00: byte 3 = nibble mask for byte 4, byte 4 = USB rate (bits 7-6), 2.4G rate (bits 5-4),
//                 current DPI stage (low nibble). Mask 0 changes nothing, so it is used to read.
//   section 0x40: bytes 12-14 are written as given. 12: 2.4G sleep, 13: Bluetooth sleep (not used),
//                 14: LOD (bits 1-0, 0 = 1 mm) and four switches (bits 4-7).

export const REPORT_ID = 0x0e;
export const REPORT_SIZE = 32;
export const RATES = [125, 250, 500, 1000];

export const SWITCHES = { ultraLowDelay: 0x10, ultraLowPower: 0x20, ripple: 0x40, moveWakeup: 0x80 } as const;

export interface State { usbRate: number; dongleRate: number; dpiStage: number; b12: number; b13: number; b14: number }

const frame = (bytes: number[]): Uint8Array => {
  const p = new Uint8Array(REPORT_SIZE);
  p.set(bytes);
  return p;
};

/** Reads the state without changing anything. */
export const queryFrame = (): Uint8Array => frame([REPORT_ID, 0x20, 0x00, 0x00, 0x00]);

/** Polling rate indices (0-3 = 125-1000 Hz) for the cable and the dongle. */
export const ratesFrame = (usb: number, dongle: number): Uint8Array =>
  frame([REPORT_ID, 0x20, 0x00, 0xf0, ((usb & 3) << 6) | ((dongle & 3) << 4), 0xf0, 0xf0, 0xf0]);

export const section2Frame = (b12: number, b13: number, b14: number): Uint8Array => {
  const p = frame([REPORT_ID, 0x20, 0x40]);
  p[12] = b12; p[13] = b13; p[14] = b14;
  return p;
};

export function parseState(r: ArrayLike<number>): State | null {
  if (r.length < 15 || r[0] !== REPORT_ID || r[1] !== 0x20) return null;
  return { usbRate: (r[4] >> 6) & 3, dongleRate: (r[4] >> 4) & 3, dpiStage: r[4] & 0x0f, b12: r[12], b13: r[13], b14: r[14] };
}

/** Settings as the app shows them. */
export function decodeSettings(s: State): Record<string, number> {
  return {
    usbRate: s.usbRate, dongleRate: s.dongleRate, lod: s.b14 & 3,
    ...Object.fromEntries(Object.entries(SWITCHES).map(([k, bit]) => [k, s.b14 & bit ? 1 : 0])),
  };
}

/** Byte 14 with the given settings applied; bits this app does not know stay as they were. */
export function patchByte14(b14: number, s: Record<string, number>): number {
  let v = b14;
  if (s.lod != null) v = (v & ~3) | (s.lod & 3);
  for (const [k, bit] of Object.entries(SWITCHES)) if (s[k] != null) v = s[k] ? v | bit : v & ~bit;
  return v & 0xff;
}
