// Transport + sequencing for the SinoWealth BYCOMBO4 keyboard protocol (AULA F75 family). USB cable or 2.4 GHz dongle.
import type { Device } from 'node-hid';
import type { DeviceModel, DeviceStatus, KeyAction, KeyDef, LightingState, Link, Macro } from '@shared/types';
import * as P from '@shared/protocols/g5kb';
import { F75_EXTRA } from '@shared/models/f75.layout';
import { HidPort, hex, sleep } from '../transport';
import type { Driver, DriverContext } from './types';

type Effects = { mode: number; hw: number }[];

export class G5kbDriver implements Driver {
  readonly key: string;
  private macros: Macro[] = [];
  private password = '';

  private constructor(readonly model: DeviceModel, private port: HidPort, private ctx: DriverContext, readonly link: Link) {
    this.key = `${model.id}:${link}`;
  }

  get productName(): string { return this.port.info.product ?? this.model.name; }
  get paths(): string[] { return [this.port.path]; }
  private get effects(): Effects { return (this.model.lightModes ?? []) as unknown as Effects; }
  private get keys(): (KeyDef & { def: number[] })[] { return (this.model.layout ?? []) as (KeyDef & { def: number[] })[]; }

  static async attach(model: DeviceModel, devices: Device[], ctx: DriverContext): Promise<G5kbDriver | null> {
    const role = (d: Device): 'usb' | 'dongle' | undefined => model.usb.find((u) => u.vendorId === d.vendorId && u.productId === d.productId)?.role as 'usb' | 'dongle' | undefined;
    // cable first, then the vendor page (0xff00) before the other interfaces
    const rank = (d: Device): number => (role(d) === 'usb' ? 0 : 2) + ((d.usagePage ?? 0) === 0xff00 ? 0 : 1);
    const cands = devices.filter((d) => role(d)).sort((a, b) => rank(a) - rank(b));
    for (const d of cands) {
      let port: HidPort | null = null;
      try {
        port = await HidPort.open(d);
        const link: Link = role(d) === 'dongle' ? '2.4g' : 'usb';
        const drv = new G5kbDriver(model, port, ctx, link);
        const pw = await drv.read(P.CMD.INFO, 1, 6).catch(() => null);
        if (!pw) { await port.close(); continue; }
        drv.password = hex(pw);
        ctx.log('i', `${model.name} attached over ${link === 'usb' ? 'USB' : '2.4G'} (id ${drv.password})`);
        return drv;
      } catch { await port?.close(); }
    }
    return null;
  }

  async status(): Promise<DeviceStatus> {
    return { key: this.key, modelId: this.model.id, link: this.link, productName: this.productName, battery: null, charging: false, firmware: this.password };
  }

  async call(method: string, args: unknown[]): Promise<unknown> {
    const fn = (this as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    if (typeof fn !== 'function' || ['call', 'close', 'read', 'write'].includes(method)) throw new Error(`Unknown method ${method}`);
    return fn.apply(this, args);
  }

  async close(): Promise<void> { await this.port.close(); }

  // ---- transport ----
  private async set(p: Uint8Array): Promise<void> {
    this.ctx.log('→', hex(p, 24));
    await sleep(20);
    for (let tries = 0; ; tries++) {
      try { await this.port.sendFeatureRaw(p); return; } catch (e) { if (tries >= 2) throw e; await sleep(70); }
    }
  }

  private async write(cmd: number, sub: number, data: Uint8Array): Promise<void> {
    for (const p of P.writePackets(cmd, sub, data)) await this.set(p);
  }

  private async read(cmd: number, sub: number, size: number): Promise<Uint8Array> {
    const total = Math.max(1, Math.ceil(size / P.CHUNK));
    const buf = new Uint8Array(size);
    for (let i = 0; i < total; i++) {
      const n = Math.min(P.CHUNK, size - i * P.CHUNK);
      await this.set(P.header(cmd | P.READ, sub, total, i, n));
      await sleep(20);
      const r = new Uint8Array(await this.port.getFeature(P.REPORT_ID, P.REPORT_SIZE));
      this.ctx.log('←', hex(r, 24));
      if (r[1] !== (cmd | P.READ)) throw new Error(`device answered 0x${r[1].toString(16)}, expected 0x${(cmd | P.READ).toString(16)}`);
      buf.set(r.subarray(8, 8 + n), i * P.CHUNK);
    }
    return buf;
  }

  private async ledPage(): Promise<Uint8Array> {
    const page = await this.read(P.CMD.LED, 0, P.LED_SIZE);
    if (!P.checkSignature(page, 0x7e)) throw new Error('Unexpected lighting page from keyboard (signature mismatch)');
    return page;
  }

  // ---- public API ----
  setLighting(l: LightingState): Promise<void> {
    return this.port.exclusive(async () => {
      const { page, slot } = P.patchLed(await this.ledPage(), this.effects, l);
      await this.write(P.CMD.LED, 0, page);
      const caps = this.model.lightModes?.[slot]?.caps ?? 0;
      if (caps & 0x20 && !l.colorful) {
        const tab = await this.read(P.CMD.RGB_TAB, 0, P.RGB_TAB_SIZE);
        if (!P.checkSignature(tab, 0x1fa)) throw new Error('Unexpected colour table from keyboard (signature mismatch)');
        await this.write(P.CMD.RGB_TAB, 0, P.patchRgbTab(tab, slot, l.color));
      }
    });
  }

  readLighting(): Promise<Partial<LightingState> | null> {
    return this.port.exclusive(async () => {
      const page = await this.ledPage();
      const tab = await this.read(P.CMD.RGB_TAB, 0, P.RGB_TAB_SIZE).catch(() => null);
      return P.decodeLed(page, tab, this.effects);
    });
  }

  readSettings(): Promise<Record<string, number>> {
    return this.port.exclusive(async () => {
      const page = await this.ledPage();
      return { debounce: page[3], sleep: page[0x18] };
    });
  }

  setSettings(s: Record<string, number>): Promise<void> {
    return this.port.exclusive(async () => {
      const page = Uint8Array.from(await this.ledPage());
      if (s.debounce != null) page[3] = s.debounce;
      if (s.sleep != null) page[0x18] = s.sleep;
      await this.write(P.CMD.LED, 0, page);
    });
  }

  /** Macros live inside the matrix write on this firmware; keep them for the next keymap write. */
  async setMacros(macros: Macro[]): Promise<void> { this.macros = macros; }

  setKeymap(layer: 'base' | 'fn', actions: Record<number, KeyAction>): Promise<void> {
    return this.port.exclusive(async () => {
      const used = [...new Set(Object.values(actions).filter((a) => a?.type === 'macro').map((a) => (a as { index: number }).index))];
      const ids = new Map(used.map((idx, i) => [idx, i]));
      await this.write(P.CMD.MATRIX, layer === 'fn' ? 1 : 0, P.matrixBlock(this.keys, actions, ids, 128, F75_EXTRA));
      if (used.length) await this.write(P.CMD.MACRO, 0, P.macroBlock(this.macros, used));
    });
  }

  /** Restores the factory configuration (the vendor's "reset keyboard"). */
  resetKeyboard(): Promise<void> {
    return this.port.exclusive(() => this.write(P.CMD.RESET, 0, Uint8Array.of(1)));
  }
  factoryReset(): Promise<void> { return this.resetKeyboard(); }
}
