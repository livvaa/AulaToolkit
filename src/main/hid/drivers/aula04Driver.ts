// Transport + sequencing for the AULA "04" keyboard protocol (S75 Pro and siblings).
import type { Device } from 'node-hid';
import type { DeviceModel, DeviceStatus, KeyAction, KeyDef, LightingState, Link, Macro, ScreenFrame } from '@shared/types';
import * as P from '@shared/protocols/aula04';
import { HidPort, hasFeatureReport, hex, pathIface, sleep, waitPrecise } from '../transport';
import { LightWatcher, type LightChange } from '@shared/lightWatch';
import { EffectTracker } from '@shared/effectTracker';
import type { Driver, DriverContext } from './types';

const LIVE_POLL_MS = 140; // plus ~22 ms per read: about six readings a second; the view fills in between
const WATCH_EVERY_MS = 300;
const HOLD_MS = 1200;

interface Ports { main?: HidPort; dongle?: HidPort; screenCandidates: Device[]; screen?: HidPort }

export class Aula04Driver implements Driver {
  readonly key: string;
  readonly link: Link;
  private battery: number | null = null;
  private batteryAt: number | null = null;
  private liveBusy = 0;
  private liveBusyLogged = 0;
  private screenBusy = false;

  private constructor(readonly model: DeviceModel, private ports: Ports, private ctx: DriverContext) {
    this.link = ports.main ? 'usb' : '2.4g';
    this.key = `${model.id}:${this.link}`;
    this.watcher = new LightWatcher(model.lightRange?.brightness ?? 5);
    this.effects = model.id === 's75pro' ? new EffectTracker(this.keys) : null;
  }

  private get keys(): KeyDef[] { return (this.model.layout ?? []) as KeyDef[]; }

  /** The renderer tells us which effect its profile has, as a starting point for following the knob. */
  async noteLightMode(mode: number): Promise<void> {
    this.effects?.setMode(mode === P.USER_LIGHT_MODE ? null : mode);
  }

  get productName(): string { return (this.ports.main ?? this.ports.dongle)?.info.product ?? this.model.name; }
  get paths(): string[] { return [this.port.path]; }

  /** Finds the configuration collections among `devices` (all collections of the matching USB ids). */
  static async attach(model: DeviceModel, devices: Device[], ctx: DriverContext): Promise<Aula04Driver | null> {
    const ids = (role: 'usb' | 'dongle') => model.usb.filter((u) => u.role === role);
    const match = (d: Device, role: 'usb' | 'dongle') => ids(role).find((u) => u.vendorId === d.vendorId && u.productId === d.productId);
    const ports: Ports = { screenCandidates: [] };

    // USB: the collection that owns the 64-byte feature report (report id 0).
    const usb = devices.filter((d) => match(d, 'usb'));
    if (usb.length) {
      const pref = usb.slice().sort((a, b) => score(a, match(a, 'usb')!.iface) - score(b, match(b, 'usb')!.iface));
      for (const d of pref) {
        if (await hasFeatureReport(d, 0, 65)) { ports.main = await HidPort.open(d); break; }
      }
      ports.screenCandidates = usb.filter((d) => d.path !== ports.main?.path);
      if (!ports.main) ctx.log('!', `${model.name}: no collection answered a 64-byte feature read; is the keyboard in Bluetooth mode?`);
    }

    // 2.4 GHz dongle: 32-byte output/input reports on the vendor collection (MI_03 on the S75 Pro dongle).
    if (!ports.main) {
      const dongles = devices.filter((d) => match(d, 'dongle'));
      const pref = dongles.slice().sort((a, b) => score(a, match(a, 'dongle')!.iface) - score(b, match(b, 'dongle')!.iface));
      for (const d of pref) {
        let port: HidPort | null = null;
        try {
          port = await HidPort.open(d);
          const r = await radioOnce(port, P.dongleFrame(P.DONGLE_CMD.BATTERY, 0x01, 0));
          if (r) { ports.dongle = port; break; }
          await port.close();
        } catch { await port?.close(); }
      }
      if (dongles.length && !ports.dongle) ctx.log('!', `${model.name}: dongle found but the keyboard did not answer (asleep or off?)`);
    }

    if (!ports.main && !ports.dongle) return null;
    const drv = new Aula04Driver(model, ports, ctx);
    ctx.log('i', `${model.name} attached over ${drv.link.toUpperCase()}`);
    if (drv.link === 'usb' && model.features.perkey) drv.watchLight();
    return drv;
  }

  // ---- live lighting ----
  // The keyboard does not report changes made with Fn shortcuts or the knob, but over USB it answers
  // "which colour is each LED showing now" (op 0xF5, what the official driver polls on its Lighting tab).
  // Polling that drives the live keyboard picture and the OSD for on-keyboard changes.
  private watcher: LightWatcher;
  /** Follows the effect when it is changed on the keyboard (models with a known effect order only). */
  private effects: EffectTracker | null;
  private held: { c: LightChange; at: number }[] = [];
  private watchTimer: NodeJS.Timeout | null = null;
  private quietUntil = 0;
  private lastWatch = 0;
  private closed = false;

  private watchLight(): void {
    let paused = false;
    const tick = async (): Promise<void> => {
      if (this.closed) return;
      // official driver running: the LEDs show its stuff, not ours. start over once it's gone
      const pause = this.ctx.watchPaused?.() ?? false;
      if (pause !== paused) {
        paused = pause;
        this.held = [];
        this.watcher.reset();
        this.effects?.setMode(this.effects.mode);
      }
      // Skip while the app is writing, and briefly afterwards so its own changes are not reported back.
      if (!paused && !this.port.busy && Date.now() >= this.quietUntil) {
        const colors = await this.readLive().catch(() => null);
        if (colors && Date.now() >= this.quietUntil) {
          const now = Date.now();
          this.ctx.onLiveLight?.(colors);
          const mode = this.effects?.push(this.keys.map((k) => colors[k.code] ?? [0, 0, 0]), now) ?? null;
          if (mode !== null) {
            // A new effect explains any colour or brightness change seen just before it: drop those.
            this.held = [];
            this.watcher.announced(now);
            this.ctx.onEvent?.({ kind: 'light', change: 'mode', mode });
          }
          // The colour/brightness detector is tuned for about three readings a second.
          if (now - this.lastWatch >= WATCH_EVERY_MS) {
            this.lastWatch = now;
            for (const c of this.watcher.push(Object.values(colors), now)) this.held.push({ c, at: now });
          }
        }
      }
      // Colour and brightness changes wait briefly, in case they turn out to be an effect change.
      const due = Date.now() - HOLD_MS;
      for (const h of this.held.filter((x) => x.at <= due)) this.ctx.onEvent?.({ kind: 'light', ...h.c });
      this.held = this.held.filter((x) => x.at > due);
      const fast = this.ctx.liveViewActive?.() ?? true;
      if (!this.closed) this.watchTimer = setTimeout(() => void tick(), fast ? LIVE_POLL_MS : WATCH_EVERY_MS);
    };
    this.watchTimer = setTimeout(() => void tick(), 1500);
  }

  /** Current LED colours by key code, or null if the keyboard was busy. Not logged: it runs every poll. */
  private readLive(): Promise<Record<number, [number, number, number]> | null> {
    return this.port.exclusive(async () => {
      const main = this.ports.main!;
      const n = P.BLOCK / 64;
      // Measured on the S75 Pro: 5 ms after each command and 1 ms between blocks is reliable (~22 ms
      // per read); without the waits most reads fail.
      await main.sendFeature(0, P.command(P.OP.USER_LIGHT_READ, 0, n));
      await waitPrecise(5);
      const ack = (await main.getFeature(0, 65)).subarray(1);
      let ok = ack[1] === P.OP.USER_LIGHT_READ && ack[3] === 0x01;
      const buf = new Uint8Array(P.BLOCK);
      if (ok) {
        for (let i = 0; i < n; i++) {
          await waitPrecise(1);
          const r = (await main.getFeature(0, 65)).subarray(1);
          if (r.length < 64) { ok = false; break; }
          buf.set(r.subarray(0, 64), i * 64);
        }
      }
      await main.sendFeature(0, P.command(P.OP.END));
      await waitPrecise(5);
      await main.getFeature(0, 65);
      return ok ? P.decodeUserLightBlock(this.model.layout as KeyDef[], buf) : null;
    });
  }

  async status(): Promise<DeviceStatus> {
    // asleep it doesn't answer, keep the last reading. no level on USB (charging)
    if (this.link === '2.4g') {
      const b = await this.readBattery();
      if (b !== null) { this.battery = b; this.batteryAt = Date.now(); }
    }
    return { key: this.key, modelId: this.model.id, link: this.link, productName: this.productName, battery: this.battery, batteryAt: this.batteryAt, charging: this.link === 'usb' };
  }

  async call(method: string, args: unknown[]): Promise<unknown> {
    const fn = (this as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    if (typeof fn !== 'function' || method === 'call' || method === 'close' || method === 'watchLight' || method === 'readLive') throw new Error(`Unknown method ${method}`);
    const writes = !/^(read|status|note)/.test(method);
    if (writes) this.quietUntil = Date.now() + 60_000; // held until the write finishes
    try {
      return await fn.apply(this, args);
    } finally {
      if (writes) { this.quietUntil = Date.now() + 2500; this.watcher.reset(); }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.watchTimer) clearTimeout(this.watchTimer);
    await Promise.all([this.ports.main?.close(), this.ports.dongle?.close(), this.ports.screen?.close()]);
  }

  // ---- low level ----
  private get port(): HidPort { return (this.ports.main ?? this.ports.dongle)!; }

  private async feature(bytes: Uint8Array, readback: boolean): Promise<Uint8Array | null> {
    const main = this.ports.main!;
    this.ctx.log('→', hex(bytes, 16));
    await sleep(P.CMD_DELAY_MS);
    await main.sendFeature(0, bytes);
    if (!readback) return null;
    await sleep(P.CMD_DELAY_MS);
    let res = (await main.getFeature(0, 65)).subarray(1);
    this.ctx.log('←', hex(res, 16));
    if (res[1] === bytes[1] && res[3] === 0xff) {
      this.ctx.log('!', 'device reported 0xff, retrying');
      await sleep(P.CMD_DELAY_MS);
      await main.sendFeature(0, bytes);
      await sleep(P.CMD_DELAY_MS);
      res = (await main.getFeature(0, 65)).subarray(1);
      this.ctx.log('←', hex(res, 16));
    }
    return res;
  }

  private cmd(op: number, b2 = 0, count = 0, readback = true): Promise<Uint8Array | null> {
    return this.feature(P.command(op, b2, count), readback);
  }

  private async block(data: Uint8Array): Promise<void> {
    const main = this.ports.main!;
    await sleep(P.CMD_DELAY_MS);
    for (let i = 0; i < data.length; i += 64) {
      const chunk = data.subarray(i, i + 64);
      this.ctx.log('→', hex(chunk, 16));
      for (let tries = 0; ; tries++) {
        try { await main.sendFeature(0, chunk); break; } catch (e) {
          if (tries >= 10) throw e;
          await sleep(P.CMD_DELAY_MS);
        }
      }
      await sleep(P.CMD_DELAY_MS);
    }
  }

  private async radio(frame: Uint8Array): Promise<Buffer | null> {
    this.ctx.log('⇢', hex(frame, 16));
    const r = await radioOnce(this.ports.dongle!, frame);
    if (r) this.ctx.log('⇠', hex(r, 16));
    return r;
  }

  private async radioMany(frames: Uint8Array[]): Promise<void> {
    for (const f of frames) { await this.radio(f); await sleep(2); }
  }

  private async usbWrite(op: number, payload: Uint8Array, b2 = 0, apply = true): Promise<void> {
    await this.cmd(P.OP.BEGIN);
    await this.cmd(op, b2, 1);
    await this.feature(payload, false);
    await this.cmd(P.OP.END);
    if (apply) await this.cmd(P.OP.APPLY, 0, 0, false);
  }

  private async usbBlock(op: number, block: Uint8Array): Promise<void> {
    await this.cmd(P.OP.BEGIN);
    await this.cmd(op, 0, P.BLOCK / 64);
    await this.block(block);
    await this.cmd(P.OP.END);
    await this.cmd(P.OP.APPLY);
  }

  // ---- public API (reached through IPC `call`) ----
  setLighting(l: LightingState): Promise<void> {
    this.effects?.setMode(l.mode);
    return this.port.exclusive(async () => {
      const p = P.lightPayload(l);
      if (this.link === '2.4g') { await this.radio(P.dongleShort(P.DONGLE_CMD.LIGHT, p)); return; }
      await this.usbWrite(P.OP.LIGHT, p);
    });
  }

  setBarLight(mode: number): Promise<void> {
    return this.port.exclusive(async () => {
      if (this.link === '2.4g') {
        const d = new Uint8Array(28); d[0] = mode; d[14] = 0xaa; d[15] = 0x55;
        await this.radio(P.dongleFrame(P.DONGLE_CMD.LIGHT, 0x01, 0, d));
        return;
      }
      await this.usbWrite(P.OP.LIGHT, P.barPayload(mode));
    });
  }

  setUserLight(colors: Record<number, [number, number, number]>, brightness = 5): Promise<void> {
    this.effects?.setMode(null); // per-key lighting is not one of the knob's effects
    return this.port.exclusive(async () => {
      const keys = this.model.layout as KeyDef[];
      const p = P.lightPayload({ mode: P.USER_LIGHT_MODE, colorful: false, brightness, speed: 0 });
      const block = P.userLightBlock(keys, colors);
      if (this.link === '2.4g') {
        await this.radio(P.dongleShort(P.DONGLE_CMD.LIGHT, p));
        await this.radioMany(P.dongleBlock(P.DONGLE_CMD.USER_LIGHT, block));
        return;
      }
      await this.usbWrite(P.OP.LIGHT, p);
      await this.usbBlock(P.OP.USER_LIGHT, block);
    });
  }

  // live frame, see liveLightBlock. usb only, not logged (runs every frame)
  setLiveLight(colors: Record<number, [number, number, number]>): Promise<boolean> {
    if (this.link !== 'usb') return Promise.reject(new Error('Live lighting needs the USB cable'));
    return this.port.exclusive(async () => {
      const main = this.ports.main!;
      // 0xff = busy, happens now and then. retry twice, then drop the frame
      let ack: Uint8Array = new Uint8Array(0);
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await waitPrecise(20);
        await main.sendFeature(0, P.command(P.OP.LIVE_LIGHT, 0, P.LIVE_PACKETS));
        await waitPrecise(5);
        ack = (await main.getFeature(0, 65)).subarray(1);
        if (ack[1] !== P.OP.LIVE_LIGHT || ack[3] !== 0xff) break;
      }
      if (ack[1] === P.OP.LIVE_LIGHT && ack[3] === 0xff) {
        this.liveBusy++;
        if (Date.now() - this.liveBusyLogged > 10_000) { this.ctx.log('!', `live frames skipped, keyboard busy: ${this.liveBusy}`); this.liveBusy = 0; this.liveBusyLogged = Date.now(); }
        return false;
      }
      if (ack[1] !== P.OP.LIVE_LIGHT || ack[3] !== 0x01) throw new Error(`live frame refused (${hex(ack, 8)})`);
      const block = P.liveLightBlock(this.keys, colors);
      for (let i = 0; i < block.length; i += 64) await main.sendFeature(0, block.subarray(i, i + 64));
      await waitPrecise(5);
      // END sometimes answers 0xff too, the official driver ignores it
      await main.sendFeature(0, P.command(P.OP.END));
      await waitPrecise(5);
      await main.getFeature(0, 65);
      return true;
    });
  }

  setSettings(s: Record<string, number>): Promise<void> {
    return this.port.exclusive(async () => {
      const p = P.settingsPayload(s);
      if (this.link === '2.4g') { await this.radio(P.dongleShort(P.DONGLE_CMD.SETTINGS, p)); return; }
      await this.cmd(P.OP.BEGIN);
      await this.cmd(P.OP.SETTINGS, 1, 1);
      await this.feature(p, false);
      await this.cmd(P.OP.END);
    });
  }

  setKeymap(layer: 'base' | 'fn', actions: Record<number, KeyAction>): Promise<void> {
    return this.port.exclusive(async () => {
      const block = P.keymapBlock(this.model.layout as KeyDef[], actions);
      if (this.link === '2.4g') { await this.radioMany(P.dongleBlock(layer === 'fn' ? P.DONGLE_CMD.KEYMAP_FN : P.DONGLE_CMD.KEYMAP, block)); return; }
      await this.usbBlock(layer === 'fn' ? P.OP.KEYMAP_FN : P.OP.KEYMAP, block);
    });
  }

  setMacros(macros: Macro[]): Promise<void> {
    return this.port.exclusive(async () => {
      if (this.link === '2.4g') {
        const { data, chunks, lastLen } = P.macroBlockWireless(macros);
        const frames: Uint8Array[] = [];
        for (let i = 0; i < chunks; i++) frames.push(P.dongleFrame(P.DONGLE_CMD.MACRO, i === chunks - 1 ? lastLen : 0x1c, i, data.subarray(i * 28, i * 28 + 28)));
        await this.radioMany(frames);
        return;
      }
      const { data, packets } = P.macroBlock(macros);
      await this.cmd(P.OP.MACRO_BEGIN);
      await this.cmd(P.OP.MACRO, 0, packets);
      await sleep(30);
      await this.block(data);
      await sleep(30);
      await this.cmd(P.OP.END);
    });
  }

  syncTime(slot = 1): Promise<void> {
    return this.port.exclusive(async () => {
      const p = P.timePayload(new Date(), slot);
      if (this.link === '2.4g') { await this.radio(P.dongleShort(P.DONGLE_CMD.TIME, p)); return; }
      await this.cmd(P.OP.BEGIN);
      await this.cmd(P.OP.TIME, 0, 1);
      await this.feature(p, true);
      await this.cmd(P.OP.END);
    });
  }

  /** Uploads frames (RGB565) to the TFT. USB only. */
  uploadScreen(frames: ScreenFrame[], slot = 1): Promise<void> {
    return this.port.exclusive(async () => {
      if (!this.model.screen || !this.model.features.screen) throw new Error('No screen on this model');
      if (this.link !== 'usb') throw new Error('The screen can only be updated over USB');
      if (this.screenBusy) throw new Error('Screen upload already running');
      this.screenBusy = true;
      try {
        const screen = await this.openScreenPort();
        const { data, chunks } = P.screenImage(frames.map((f) => ({ ...f, pixels: toU8(f.pixels) })), this.model.screen);
        await this.cmd(P.OP.BEGIN);
        await this.cmd(P.OP.SCREEN, slot, chunks);
        let pct = -1;
        for (let i = 0; i < chunks; i++) {
          const now = Math.floor((i * 100) / chunks);
          if (now !== pct) { pct = now; this.ctx.onProgress?.('screen', i, chunks); }
          const chunk = data.subarray(i * this.model.screen.chunk, (i + 1) * this.model.screen.chunk);
          screen.flushInput();
          await screen.write(0, chunk);
          await screen.nextInput(300);
          if (i % 8 === 0) this.ctx.log('→', `screen chunk ${i + 1}/${chunks}`);
        }
        await this.cmd(P.OP.END);
        this.ctx.onProgress?.('screen', chunks, chunks);
        this.ctx.log('i', `screen upload done (${frames.length} frames, ${chunks} chunks)`);
      } finally { this.screenBusy = false; }
    });
  }

  private async openScreenPort(): Promise<HidPort> {
    if (this.ports.screen) return this.ports.screen;
    const probe = new Uint8Array(this.model.screen!.chunk).fill(0xff);
    for (const d of this.ports.screenCandidates) {
      let port: HidPort | null = null;
      try {
        port = await HidPort.open(d);
        // A collection without a 4096-byte output report rejects the write before anything reaches the device.
        await port.write(0, probe);
        this.ports.screen = port;
        return port;
      } catch { await port?.close(); }
    }
    throw new Error('Screen interface not found: reconnect the keyboard over USB');
  }

  /** Vendor-style reset: factory key maps, no macros, default effect and settings. */
  async resetKeyboard(): Promise<void> {
    await this.setMacros([]);
    await this.setKeymap('base', {});
    if (this.model.features.fnLayer) await this.setKeymap('fn', {});
    await this.setSettings(Object.fromEntries((this.model.settings ?? []).map((s) => [s.key, s.default])));
    await this.setLighting({ mode: 11, color: [255, 255, 255], colorful: true, brightness: 5, speed: 3, direction: 0 });
  }

  /** Reset plus cleared per-key colours and the side light bar. */
  async factoryReset(): Promise<void> {
    await this.resetKeyboard();
    if (this.model.features.perkey) await this.setUserLight({}, 5).catch(() => undefined);
    if (this.model.features.bar) await this.setBarLight(0x20).catch(() => undefined);
    await this.setLighting({ mode: 11, color: [255, 255, 255], colorful: true, brightness: 5, speed: 3, direction: 0 });
  }

  private async readBattery(): Promise<number | null> {
    if (this.link !== '2.4g') return null;
    return this.port.exclusive(async () => {
      const r = await this.radio(P.dongleFrame(P.DONGLE_CMD.BATTERY, 0x01, 0));
      return r && r[0] === 0x20 && r[3] ? Math.min(100, r[3]) : null;
    });
  }
}

function score(d: Device, iface?: number): number {
  let s = 10;
  if ((d.usagePage ?? 0) >= 0xff00) s -= 5;
  if (iface !== undefined && pathIface(d) === iface) s -= 3;
  return s;
}

async function radioOnce(port: HidPort, frame: Uint8Array): Promise<Buffer | null> {
  port.flushInput();
  try { await port.write(0, frame); } catch { await sleep(10); await port.write(0, frame); }
  await sleep(5);
  const deadline = Date.now() + 300;
  while (Date.now() < deadline) {
    const r = await port.nextInput(deadline - Date.now());
    if (!r) break;
    const body = r.length === 33 ? r.subarray(1) : r;
    if (body[0] === frame[0] && body[1] === frame[1] && body[2] === frame[2]) return Buffer.from(body);
  }
  return null;
}

function toU8(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (ArrayBuffer.isView(v)) return new Uint8Array((v as ArrayBufferView).buffer, (v as ArrayBufferView).byteOffset, (v as ArrayBufferView).byteLength);
  if (Array.isArray(v)) return Uint8Array.from(v);
  if (v && typeof v === 'object') return Uint8Array.from(Object.values(v as Record<string, number>));
  throw new Error('Invalid pixel buffer');
}
