// AULA SC390 over the USB cable (the official driver does not configure it over the dongle either).
import type { Device } from 'node-hid';
import type { DeviceModel, DeviceStatus } from '@shared/types';
import * as P from '@shared/protocols/yxt';
import { HidPort, hex, pathIface, sleep } from '../transport';
import type { Driver, DriverContext } from './types';

export class YxtDriver implements Driver {
  readonly key: string;
  readonly link = 'usb' as const;

  private constructor(readonly model: DeviceModel, private port: HidPort, private ctx: DriverContext) {
    this.key = `${model.id}:usb`;
  }

  get productName(): string { return this.port.info.product ?? this.model.name; }
  get paths(): string[] { return [this.port.path]; }

  static async attach(model: DeviceModel, devices: Device[], ctx: DriverContext): Promise<YxtDriver | null> {
    const cands = devices
      .filter((d) => model.usb.some((u) => u.role === 'usb' && u.vendorId === d.vendorId && u.productId === d.productId))
      .sort((a, b) => (pathIface(a) === 2 ? 0 : 1) - (pathIface(b) === 2 ? 0 : 1));
    for (const d of cands) {
      let port: HidPort | null = null;
      try {
        port = await HidPort.open(d);
        const drv = new YxtDriver(model, port, ctx);
        const st = await drv.query().catch(() => null);
        if (!st) { await port.close(); continue; }
        ctx.log('i', `${model.name} attached over USB`);
        return drv;
      } catch { await port?.close(); }
    }
    return null;
  }

  async status(): Promise<DeviceStatus> {
    return { key: this.key, modelId: this.model.id, link: 'usb', productName: this.productName, battery: null, charging: false };
  }

  async call(method: string, args: unknown[]): Promise<unknown> {
    const fn = (this as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    if (typeof fn !== 'function' || ['call', 'close', 'send', 'query'].includes(method)) throw new Error(`Unknown method ${method}`);
    return fn.apply(this, args);
  }

  async close(): Promise<void> { await this.port.close(); }

  /** Sends a frame and returns the state the mouse answers with. */
  private async send(frame: Uint8Array): Promise<P.State> {
    this.port.flushInput();
    this.ctx.log('→', hex(frame, 16));
    await this.port.write(frame[0], frame.subarray(1));
    const end = Date.now() + 400;
    while (Date.now() < end) {
      const r = await this.port.nextInput(end - Date.now());
      if (!r) break;
      const st = P.parseState(r);
      if (st) { this.ctx.log('←', hex(r, 16)); return st; }
    }
    throw new Error('the mouse did not answer');
  }

  private query(): Promise<P.State> { return this.send(P.queryFrame()); }

  /** Profile shape used by pullFromDevice for mice. */
  readAll(): Promise<{ settings: Record<string, number> }> {
    return this.port.exclusive(async () => ({ settings: P.decodeSettings(await this.query()) }));
  }

  setSettings(s: Record<string, number>): Promise<void> {
    return this.port.exclusive(async () => {
      let st = await this.query();
      if ((s.usbRate != null && s.usbRate !== st.usbRate) || (s.dongleRate != null && s.dongleRate !== st.dongleRate)) {
        st = await this.send(P.ratesFrame(s.usbRate ?? st.usbRate, s.dongleRate ?? st.dongleRate));
        await sleep(20);
      }
      const b14 = P.patchByte14(st.b14, s);
      if (b14 !== st.b14) await this.send(P.section2Frame(st.b12, st.b13, b14));
    });
  }
}
