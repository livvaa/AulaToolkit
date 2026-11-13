// Device manager: enumerates HID devices, attaches a driver per model, polls status, keeps a packet log.
import { EventEmitter } from 'node:events';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { Device } from 'node-hid';
import { MODELS } from '@shared/models';
import type { DeviceModel, DeviceStatus, LogEntry } from '@shared/types';
import { listDevices } from './transport';
import type { Driver } from './drivers/types';
import { Aula04Driver } from './drivers/aula04Driver';
import { IncottDriver } from './drivers/incottDriver';
import { G5kbDriver } from './drivers/g5kbDriver';
import { YxtDriver } from './drivers/yxtDriver';
import { SimDriver } from './drivers/simDriver';
import type { DriverEvent } from './drivers/types';

const SCAN_MS = 2000;
const STATUS_MS = 30000;
const LOG_MAX = 2000;

export class DeviceManager extends EventEmitter {
  private drivers = new Map<string, Driver>();
  private statuses = new Map<string, DeviceStatus>();
  private log: LogEntry[] = [];
  private scanning = false;
  /** Whether a window that shows live lighting is on screen; drivers poll faster while it is. */
  liveViewActive: () => boolean = () => true;
  watchPaused: () => boolean = () => false;
  private scanTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private lastSignature = '';
  private failedSignatures = new Map<string, { at: number; count: number }>();

  start(): void {
    for (const id of (process.env.AULA_SIM ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
      const model = MODELS.find((m) => m.id === id);
      if (!model || this.drivers.has(`${id}:sim`)) continue;
      const drv = new SimDriver(model, { log: (dir, text) => this.addLog(dir, text, model.id), onStatus: () => void this.refresh(`${id}:sim`) });
      this.drivers.set(drv.key, drv);
      this.statuses.set(drv.key, { key: drv.key, modelId: model.id, link: 'usb', productName: drv.productName, battery: null, charging: false });
      void this.refresh(drv.key);
    }
    this.emitDevices();
    if (process.env.AULA_SIM_ONLY) return; // screenshots / demos: simulated devices only
    void this.scan(true);
    this.scanTimer = setInterval(() => void this.scan(false), SCAN_MS);
    this.statusTimer = setInterval(() => void this.refreshAll(), STATUS_MS);
  }

  async stop(): Promise<void> {
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    await Promise.all([...this.drivers.values()].map((d) => d.close()));
    this.drivers.clear();
  }

  private logPath: string | null = null;
  private appendFile(e: LogEntry): void {
    try {
      if (!this.logPath) {
        const dir = join(app.getPath('userData'), 'logs');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        this.logPath = join(dir, `hid-${new Date().toISOString().slice(0, 10)}.log`);
      }
      appendFileSync(this.logPath, `${new Date(e.t).toISOString()} ${e.device ?? '-'} ${e.dir} ${e.text}\n`);
    } catch { /* logging must never break the app */ }
  }

  getStatuses(): DeviceStatus[] { return [...this.statuses.values()]; }
  getLog(): LogEntry[] { return this.log; }
  clearLog(): void { this.log = []; }

  addLog(dir: LogEntry['dir'], text: string, device?: string): void {
    const e: LogEntry = { t: Date.now(), dir, text, device };
    if (process.env.AULA_DEBUG) console.log(`[hid] ${device ?? ''} ${dir} ${text}`);
    this.appendFile(e);
    this.log.push(e);
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
    this.emit('log', e);
  }

  async call(key: string, method: string, args: unknown[]): Promise<unknown> {
    const d = this.drivers.get(key);
    if (!d) throw new Error('Device not connected');
    try {
      return await d.call(method, args);
    } catch (e) {
      this.addLog('!', `${method}: ${(e as Error).message}`, key);
      throw e;
    }
  }

  async rescan(): Promise<void> { this.lastSignature = ''; this.failedSignatures.clear(); await this.scan(true); }

  /**
   * Picks between models with the same USB ids (S75 Pro, L99) when the product name does not say,
   * as on the 2.4 GHz dongle ("2.4G Dongle"): the app chooses the one the user has set up.
   */
  pickShared: (candidates: DeviceModel[]) => DeviceModel = (c) => c[0];

  private groups(devices: Device[]): Map<string, { model: DeviceModel; devices: Device[] }> {
    const out = new Map<string, { model: DeviceModel; devices: Device[] }>();
    for (const d of devices) {
      const candidates = MODELS.filter((model) => model.usb.some((u) => u.vendorId === d.vendorId && u.productId === d.productId));
      if (!candidates.length) continue;
      const named = candidates.filter((model) => model.productMatch && new RegExp(model.productMatch, 'i').test(d.product ?? ''));
      const model = named.length === 1 ? named[0] : candidates.length === 1 ? candidates[0] : this.pickShared(candidates);
      const g = out.get(model.id) ?? { model, devices: [] };
      g.devices.push(d);
      out.set(model.id, g);
    }
    return out;
  }

  private async scan(force: boolean): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const devices = listDevices();
      const signature = devices.map((d) => d.path).sort().join('|');
      if (!force && signature === this.lastSignature) return;
      this.lastSignature = signature;
      const groups = this.groups(devices);

      // Detach drivers whose ports vanished. check the driver's own paths, cable -> dongle keeps the
      // model in the list but the usb path is gone
      for (const [key, drv] of [...this.drivers]) {
        if (key.endsWith(':sim')) continue; // simulated devices have no USB port
        const g = groups.get(drv.model.id);
        const own = drv.paths ?? [];
        const stillThere = own.length ? own.every((p) => devices.some((x) => x.path === p)) : !!g;
        if (!stillThere) {
          await drv.close();
          this.drivers.delete(key);
          this.statuses.delete(key);
          this.addLog('i', `${drv.model.name} disconnected`);
          this.emitDevices();
        }
      }

      // Attach drivers for new groups (one driver per model; USB preferred over the dongle).
      let retryLater = false;
      for (const [modelId, g] of groups) {
        const existing = [...this.drivers.values()].find((d) => d.model.id === modelId);
        const gsig = modelId + ':' + g.devices.map((d) => d.path).sort().join('|');
        if (existing) {
          // Re-attach when a USB link appears while we are on the dongle.
          const hasUsb = g.devices.some((d) => g.model.usb.some((u) => u.role === 'usb' && u.vendorId === d.vendorId && u.productId === d.productId));
          if (!(existing.link === '2.4g' && hasUsb)) continue;
          await existing.close();
          this.drivers.delete(existing.key);
          this.statuses.delete(existing.key);
        }
        const lastFail = this.failedSignatures.get(gsig);
        const wait = lastFail ? Math.min(15000, 3000 * 2 ** (lastFail.count - 1)) : 0;
        if (!force && lastFail && Date.now() - lastFail.at < wait) { retryLater = true; continue; }
        // retry after 3, 6, 12, then every 15 s (a keyboard moved to the dongle needs a moment to pair)
        const drv = await this.attach(g.model, g.devices, lastFail !== undefined);
        if (!drv) { this.failedSignatures.set(gsig, { at: Date.now(), count: (lastFail?.count ?? 0) + 1 }); retryLater = true; continue; }
        this.failedSignatures.delete(gsig);
        this.drivers.set(drv.key, drv);
        this.statuses.set(drv.key, { key: drv.key, modelId: drv.model.id, link: drv.link, productName: drv.productName, battery: null, charging: false });
        this.emitDevices();
        this.emit('attached', drv.key);
        void this.refresh(drv.key);
      }
      if (retryLater) this.lastSignature = ''; // force a rescan
    } catch (e) {
      this.addLog('!', `scan failed: ${(e as Error).message}`);
    } finally {
      this.scanning = false;
    }
  }

  private async attach(model: DeviceModel, devices: Device[], quiet = false): Promise<Driver | null> {
    let attaching = true;
    const ctx = {
      log: (dir: LogEntry['dir'], text: string) => { if (!(quiet && attaching && dir === '!')) this.addLog(dir, text, model.id); },
      onStatus: () => void this.refresh(`${model.id}:usb`, `${model.id}:2.4g`),
      onEvent: (e: DriverEvent) => this.emit('hw-event', { ...e, modelId: model.id }),
      onLiveLight: (colors: Record<number, [number, number, number]>) => this.emit('live-light', { modelId: model.id, colors, t: Date.now() }),
      liveViewActive: () => this.liveViewActive(),
      watchPaused: () => this.watchPaused(),
      onProgress: (task: 'screen', done: number, total: number) => this.emit('progress', { modelId: model.id, task, done, total }),
    };
    try {
      switch (model.protocol) {
        case 'aula04': return await Aula04Driver.attach(model, devices, ctx);
        case 'incott': return await IncottDriver.attach(model, devices, ctx);
        case 'g5kb': return await G5kbDriver.attach(model, devices, ctx);
        case 'yxt': return await YxtDriver.attach(model, devices, ctx);
        default: return null;
      }
    } finally {
      attaching = false;
    }
  }

  async refresh(...keys: string[]): Promise<void> {
    for (const key of keys) {
      const d = this.drivers.get(key);
      if (!d) continue;
      try {
        const s = await d.status();
        // unplugged while reading
        if (this.drivers.get(key) !== d) continue;
        this.statuses.set(key, s);
        this.emitDevices();
      } catch (e) {
        if (this.drivers.get(key) === d) this.addLog('!', `status: ${(e as Error).message}`, key);
      }
    }
  }

  private async refreshAll(): Promise<void> { await this.refresh(...this.drivers.keys()); }

  private emitDevices(): void { this.emit('devices', this.getStatuses()); }
}
