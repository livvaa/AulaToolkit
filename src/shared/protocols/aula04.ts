// AULA "04" protocol (Sonix-based keyboards such as the S75 Pro).
// Pure encoders: no I/O here. Transport lives in src/main/hid/drivers/aula04Driver.ts.
//
// USB: 64-byte feature reports. Control command = 04 <op> <b2> 00 00 00 00 00 <count lo> <count hi>.
// Data blocks are 64-byte packets ending with AA 55. Typical write: BEGIN -> op -> data -> END -> APPLY.
// 2.4 GHz: 32-byte frames `cmd len seq data[28] checksum`, checksum = sum of first 31 bytes.

import type { KeyAction, KeyDef, LightingState, Macro, MacroStep, ScreenFrame } from '../types';
import { isModifier, modifierBit } from '../keycodes';

export const OP = {
  BEGIN: 0x18, END: 0x02, APPLY: 0xf0,
  LIGHT: 0x13, SETTINGS: 0x17, TIME: 0x28,
  KEYMAP: 0x11, KEYMAP_FN: 0x27,
  USER_LIGHT: 0x23, USER_LIGHT_READ: 0xf5, LIVE_LIGHT: 0x20,
  MACRO_BEGIN: 0x19, MACRO: 0x15, SCREEN: 0x72,
} as const;

export const USER_LIGHT_MODE = 0x80;
export const BLOCK = 0x240; // 9 x 64 bytes
export const CMD_DELAY_MS = 35;

const tag = (buf: Uint8Array, off: number): void => { buf[off] = 0xaa; buf[off + 1] = 0x55; };

export function command(op: number, b2 = 0, count = 0): Uint8Array {
  const b = new Uint8Array(64);
  b[0] = 0x04; b[1] = op; b[2] = b2;
  b[8] = count & 0xff; b[9] = (count >> 8) & 0xff;
  return b;
}

export function lightPayload(l: Partial<LightingState> & { mode: number }): Uint8Array {
  const p = new Uint8Array(64);
  const [r, g, b] = l.color ?? [255, 255, 255];
  p.set([l.mode & 0xff, r, g, b, 0, 0, 0, 0, l.colorful ? 1 : 0, l.brightness ?? 5, l.speed ?? 3, l.direction ?? 0]);
  tag(p, 62);
  return p;
}

export function barPayload(mode: number): Uint8Array {
  const p = new Uint8Array(64);
  p[0] = mode & 0xff;
  tag(p, 62);
  return p;
}

export function settingsPayload(s: Record<string, number>, bytes = { winLock: 2, altF4: 3, altTab: 4 }): Uint8Array {
  const p = new Uint8Array(64);
  p.set([0x00, 0x01, 0, 0, 0, s.fnSwitch ?? 0, s.sleep ?? 0, 0, s.response ?? 1]);
  p[bytes.winLock] = s.winLock ? 1 : 0;
  p[bytes.altF4] = s.altF4 ? 1 : 0;
  p[bytes.altTab] = s.altTab ? 1 : 0;
  tag(p, 62);
  return p;
}

export function timePayload(date = new Date(), slot = 1): Uint8Array {
  const p = new Uint8Array(64);
  p.set([0, slot, 0x5a, date.getFullYear() % 100, date.getMonth() + 1, date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), 0, date.getDay()]);
  tag(p, 62);
  return p;
}

const MOUSE_BYTES: Record<number, [number, number]> = {
  1: [0x01, 0x01], 3: [0x01, 0x02], 2: [0x01, 0x04], 4: [0x01, 0x03],
  5: [0x03, 0x01], 6: [0x03, 0xff], 7: [0x01, 0x08], 8: [0x01, 0x10],
};

/** 4-byte keymap entry for an action; null = leave default (all zero). */
export function encodeKeyAction(a: KeyAction | undefined): [number, number, number, number] | null {
  switch (a?.type) {
    case 'disable': return [0x05, 0x03, 0, 0];
    case 'key': {
      const mods = a.mods & 0xff;
      if (isModifier(a.code)) return [0x02, mods | modifierBit(a.code), 0, 0];
      return [0x02, mods, a.code & 0xff, 0];
    }
    case 'mouse': {
      const m = MOUSE_BYTES[a.id];
      return m ? [0x01, m[0], m[1], 0] : null;
    }
    case 'media': return [0x03, a.usage & 0xff, (a.usage >> 8) & 0xff, 0];
    case 'macro': return [0x06, a.index & 0xff, a.mode & 0xff, (a.loops ?? 1) & 0xff];
    default: return null;
  }
}

export function keymapBlock(keys: KeyDef[], actions: Record<number, KeyAction>): Uint8Array {
  const buf = new Uint8Array(BLOCK);
  for (const k of keys) {
    const bytes = encodeKeyAction(actions[k.code]);
    if (bytes) buf.set(bytes, k.idx * 4);
  }
  tag(buf, BLOCK - 2);
  return buf;
}

// Live lighting (op 0x20), captured from the official driver's Music Rhythm: 04 20 ... 08, then
// 8 x 64 bytes of [led, r, g, b] in layout order (rest zero, no AA 55 tag), then END. No BEGIN/APPLY,
// nothing is stored. The official driver sends one every ~47 ms.
export const LIVE_PACKETS = 8;

export function liveLightBlock(keys: KeyDef[], colors: Record<number, [number, number, number]>): Uint8Array {
  const buf = new Uint8Array(LIVE_PACKETS * 64);
  keys.slice(0, buf.length / 4).forEach((k, i) => {
    const c = colors[k.code] ?? [0, 0, 0];
    buf.set([k.light, c[0], c[1], c[2]], i * 4);
  });
  return buf;
}

export function userLightBlock(keys: KeyDef[], colors: Record<number, [number, number, number]>): Uint8Array {
  const buf = new Uint8Array(BLOCK);
  for (const k of keys) {
    const c = colors[k.code];
    if (c) buf.set([k.light, c[0], c[1], c[2]], k.light * 4);
  }
  tag(buf, BLOCK - 2);
  return buf;
}

export function decodeUserLightBlock(keys: KeyDef[], buf: Uint8Array): Record<number, [number, number, number]> {
  const colors: Record<number, [number, number, number]> = {};
  for (const k of keys) {
    const o = k.light * 4;
    if (o + 3 < buf.length) colors[k.code] = [buf[o + 1], buf[o + 2], buf[o + 3]];
  }
  return colors;
}

// ---- Macros ----
// Table: 100 x 4-byte entries (u16 LE offset, or FF FF FF FF when empty) at bytes 0..399.
// Macro body: u16 step count, 6 zero bytes, then 4-byte steps:
//   00 00 hid B0 key down | 00 00 hid 30 key up | 00 00 btn 90 mouse down | 00 00 btn 10 mouse up | lo hi 00 50 delay(ms)

export const MACRO_EVENT = { KEY_DOWN: 0xb0, KEY_UP: 0x30, MOUSE_DOWN: 0x90, MOUSE_UP: 0x10, DELAY: 0x50 } as const;
export const MACRO_PLAY_MODES = ['Play once', 'Repeat N times', 'Toggle (press again to stop)', 'Repeat while held', 'Click to play'];
const MACRO_TABLE = 400;
const MACRO_MAX = 0xe00;

function macroBody(macros: Macro[]): { buf: Uint8Array; len: number } {
  const buf = new Uint8Array(MACRO_MAX);
  let off = MACRO_TABLE;
  macros.slice(0, 100).forEach((m, i) => {
    const steps = m.steps ?? [];
    if (!steps.length) { buf.set([0xff, 0xff, 0xff, 0xff], i * 4); return; }
    if (off + 8 + steps.length * 4 > MACRO_MAX - 64) throw new Error('Macro memory full');
    buf[i * 4] = off & 0xff; buf[i * 4 + 1] = off >> 8;
    buf[off] = steps.length & 0xff; buf[off + 1] = steps.length >> 8;
    steps.forEach((s: MacroStep, j) => {
      const o = off + 8 + j * 4;
      if (s.kind === 'delay') {
        const ms = Math.max(10, Math.min(0xffff, s.ms ?? 10));
        buf.set([ms & 0xff, (ms >> 8) & 0xff, 0, MACRO_EVENT.DELAY], o);
      } else {
        buf.set([0, 0, (s.code ?? 0) & 0xff, MACRO_EVENT[s.kind]], o);
      }
    });
    off += 8 + steps.length * 4;
  });
  return { buf, len: off };
}

export function macroBlock(macros: Macro[]): { data: Uint8Array; packets: number } {
  const { buf, len } = macroBody(macros);
  const packets = (len >> 6) + (len % 64 === 0 ? 1 : 2);
  const out = buf.slice(0, packets * 64);
  tag(out, out.length - 2);
  return { data: out, packets };
}

export function macroBlockWireless(macros: Macro[]): { data: Uint8Array; chunks: number; lastLen: number } {
  const { buf, len } = macroBody(macros);
  const chunks = Math.floor(len / 28) + 1 + (len % 28 !== 0 ? 1 : 0);
  const out = new Uint8Array(chunks * 28);
  out.set(buf.slice(0, Math.min(len, out.length)));
  tag(out, out.length - 2);
  return { data: out, chunks, lastLen: len % 28 };
}

// ---- Screen ----
// 256-byte header (byte 0 frame count, bytes 1..n per-frame delay in 2 ms units), then RGB565 frames, padded with FF to 4096 multiples.
export function screenImage(frames: ScreenFrame[], s: { width: number; height: number; headLength: number; chunk: number }): { data: Uint8Array; chunks: number } {
  const frameSize = s.width * s.height * 2;
  const total = s.headLength + frameSize * frames.length;
  const chunks = Math.ceil(total / s.chunk);
  const buf = new Uint8Array(chunks * s.chunk).fill(0xff);
  buf[0] = frames.length;
  frames.forEach((f, i) => {
    buf[1 + i] = Math.max(1, Math.min(255, Math.round(f.delayMs / 2)));
    buf.set(f.pixels.subarray(0, frameSize), s.headLength + i * frameSize);
  });
  return { data: buf, chunks };
}

export function rgb565(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 2);
  for (let i = 0, o = 0; i < width * height; i++, o += 2) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const v = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
    out[o] = v & 0xff; out[o + 1] = v >> 8;
  }
  return out;
}

// ---- 2.4 GHz framing (32 bytes, no report id) ----
export function dongleFrame(cmd: number, len: number, seq: number, data: Uint8Array | number[] = []): Uint8Array {
  const b = new Uint8Array(32);
  b[0] = cmd; b[1] = len; b[2] = seq;
  b.set(Array.from(data).slice(0, 28), 3);
  let sum = 0;
  for (let i = 0; i < 31; i++) sum += b[i];
  b[31] = sum & 0xff;
  return b;
}

/** Short dongle command carrying the first 14 bytes of a USB payload + AA55. */
export function dongleShort(cmd: number, payload: Uint8Array): Uint8Array {
  const d = new Uint8Array(28);
  d.set(payload.subarray(0, 14));
  tag(d, 14);
  return dongleFrame(cmd, 0x10, 0, d);
}

/** A 576-byte block as 21 x 28-byte chunks (last one has len 0x10). */
export function dongleBlock(cmd: number, block: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let i = 0; i < 21; i++) frames.push(dongleFrame(cmd, i === 20 ? 0x10 : 0x1c, i, block.subarray(i * 28, i * 28 + 28)));
  return frames;
}

export const DONGLE_CMD = { LIGHT: 0x05, SETTINGS: 0x07, MACRO: 0x09, TIME: 0x0c, KEYMAP: 0x10, KEYMAP_FN: 0x12, USER_LIGHT: 0x14, BATTERY: 0x20 } as const;
