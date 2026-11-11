import './elevatedHelper'; // must stay first
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, session, shell, systemPreferences, Tray } from 'electron';
import { MODELS } from '@shared/models';
import { en } from '@shared/locales/en';
import { tr } from '@shared/locales/tr';
import { ru } from '@shared/locales/ru';
import { zh } from '@shared/locales/zh';
import { uk } from '@shared/locales/uk';
import { vi } from '@shared/locales/vi';
import { pt } from '@shared/locales/pt';
import { es } from '@shared/locales/es';
import { de } from '@shared/locales/de';
import { fr } from '@shared/locales/fr';
const L: Record<string, typeof en> = { en, tr, ru, zh, uk, vi, pt, es, de, fr };
const tx = (k: keyof typeof en): string => (L[prefs?.language] ?? en)[k] ?? en[k];
import type { DeviceStatus } from '@shared/types';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { CH, type AppPrefs } from '@shared/ipc';
import type { DeviceSettingsFile } from '@shared/types';
import { DeviceManager } from './hid/manager';
import { createBackup, loadDeviceSettings, loadPrefs, restoreBackup, saveDeviceSettings, savePrefs } from './store';
import * as updater from './updater';
import * as vendor from './vendorSoftware';
import { configureOsd, createOsd, osdWindow, showOsd } from './osd';
import { runScreenshots } from './screenshots';
import { startCliServer } from './cli';
import type { BluetoothState, CliRequest, CliResult, DeviceProgress, HwEvent, LiveLight, OsdPayload, StoredScreen } from '@shared/ipc';
import { colorKey } from '@shared/lightWatch';
import * as battery from './battery';
import * as library from './library';
import { readBluetoothBatteries } from './bluetoothBattery';
import { ensureCliOnPath } from './cliPath';
import { applyAutostartTask } from './autostartTask';
import { watchDisplayPower } from './displayPower';
import { setMediaWatch, stopMediaWatch } from './mediaPlayback';

declare const __BUILD_STAMP__: string;
const BUILD_STAMP = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev';
const manager = new DeviceManager();

// Keeps the official AULA apps out of the way while the user has opted in: renames their exes, ends them
// and parks their autostart entries. no UAC prompt at startup, and LED watching pauses while one runs
let vendorBusy = false;
let vendorRunning = false;
let vendorExesFor: boolean | null = null;
let vendorExesDeclined = false;
async function applyVendorBlock(): Promise<void> {
  if (vendorBusy || !prefs) return;
  vendorBusy = true;
  try {
    const block = prefs.blockVendorSoftware;
    await vendor.setVendorAutostart(!block);
    if (vendorExesFor !== null && vendorExesFor !== block) {
      vendorExesDeclined = (await setVendorExes(!block)) === 'declined';
    }
    vendorExesFor = block;
    if (block) {
      // one started anyway (reinstalled?), disable again
      if (!vendorExesDeclined && (await vendor.runningVendorApps()).length) {
        vendorExesDeclined = (await setVendorExes(false)) === 'declined';
      }
      const n = await vendor.killVendorApps();
      if (n) manager.addLog('i', `closed ${n} official AULA driver process(es)`);
    }
    const running = (await vendor.runningVendorApps()).length > 0;
    if (running !== vendorRunning) {
      vendorRunning = running;
      manager.addLog('i', running ? 'AULA driver is running, pausing LED watch' : 'AULA driver gone, LED watch back on');
    }
  } catch { /* best effort */ } finally { vendorBusy = false; }
}
manager.watchPaused = () => vendorRunning;
// Same USB ids, no telling name (the dongle): the one last connected over USB, where the name says
// which it is; else the one set up, the S75 Pro if both or none.
manager.pickShared = (c) => {
  const last = c.find((m) => m.id === prefs?.lastSharedModel);
  if (last) return last;
  const known = c.filter((m) => prefs?.knownDevices?.includes(m.id));
  return known.length === 1 ? known[0] : c[0];
};

async function setVendorExes(enable: boolean): Promise<'unchanged' | 'done' | 'declined'> {
  const r = await vendor.setVendorExecutables(enable);
  if (r !== 'unchanged') manager.addLog(r === 'done' ? 'i' : '!', `official AULA driver programs ${enable ? 'restored' : 'disabled'}${r === 'done' ? '' : ': administrator approval declined'}`);
  return r;
}

// Low-battery alerts: one notification per device each time the level drops under the threshold
// (and a second, urgent one at 5 %). Re-armed when the device charges above the threshold or reconnects.
const batteryAlerted = new Map<string, number>();
function checkBattery(statuses: DeviceStatus[]): void {
  if (!prefs?.batteryAlerts) return;
  const limit = prefs.batteryThreshold ?? 20;
  for (const s of statuses) {
    if (s.battery === null || s.battery === undefined) continue;
    if (s.charging || s.battery > limit) { batteryAlerted.delete(s.key); continue; }
    const level = s.battery <= 5 ? 5 : limit;
    if (batteryAlerted.get(s.key) === level) continue;
    batteryAlerted.set(s.key, level);
    const name = MODELS.find((m) => m.id === s.modelId)?.name ?? s.productName;
    const title = tx(level === 5 ? 'batteryCriticalTitle' : 'batteryLowTitle').replace('{name}', name);
    const body = tx('batteryBody').replace('{pct}', String(s.battery));
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, icon: iconPath(), urgency: level === 5 ? 'critical' : 'normal' });
      n.on('click', () => { win?.show(); win?.focus(); });
      n.show();
    }
  }
  for (const k of [...batteryAlerted.keys()]) if (!statuses.some((s) => s.key === k)) batteryAlerted.delete(k);
}
// battery care: remind to unplug at 80% (once per charge, and only if it was below 80 before)
const CARE_PCT = 80;
const careBelow = new Set<string>();
const careReminded = new Set<string>();
function checkBatteryCare(): void {
  if (!prefs?.batteryStats || prefs.batteryCare === false) return;
  const statuses = manager.getStatuses();
  for (const m of MODELS) {
    if (!m.features.battery) continue;
    const lv = battery.stats(m.id, statuses.find((s) => s.modelId === m.id)).level;
    if (!lv?.live || !lv.charging) { careBelow.delete(m.id); careReminded.delete(m.id); continue; }
    const pct = lv.pct ?? (lv.full ? 100 : null);
    if (pct === null) continue;
    if (pct < CARE_PCT) { careBelow.add(m.id); continue; }
    if (!careBelow.has(m.id) || careReminded.has(m.id)) continue;
    careReminded.add(m.id);
    const name = loadDeviceSettings(m.id).nickname || m.name;
    const shown = prefs.language === 'tr' ? `%${pct}` : `${pct}%`;
    const title = tx('batteryCareTitle').replace('{name}', name).replace('{pct}', String(pct));
    const body = tx('batteryCareBody');
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, icon: iconPath() });
      n.on('click', () => { win?.show(); win?.focus(); });
      n.show();
    }
    showOsd({ device: name, kind: 'battery', value: shown, note: body });
  }
}

// Ctrl+Alt+Shift+A restarts the app, for when something hangs.
const RESTART_KEYS = 'Control+Alt+Shift+A';
function restartApp(): void {
  showOsd({ device: 'AULA Toolkit', kind: 'restart', value: tx('restarting') });
  setTimeout(() => {
    const args = process.argv.slice(1).filter((a) => a !== '--hidden' && a !== '--delayed');
    if (!win?.isVisible()) args.push('--hidden');
    app.relaunch({ args });
    quitting = true;
    app.quit();
  }, 800);
}
function applyRestartHotkey(p: AppPrefs): void {
  const on = p.restartHotkey !== false;
  if (on && !globalShortcut.isRegistered(RESTART_KEYS)) {
    if (!globalShortcut.register(RESTART_KEYS, restartApp)) manager.addLog('!', `couldn't register ${RESTART_KEYS} (used by another app?)`);
  } else if (!on && globalShortcut.isRegistered(RESTART_KEYS)) globalShortcut.unregister(RESTART_KEYS);
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let flyout: BrowserWindow | null = null;
let flyoutHideTimer: NodeJS.Timeout | null = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden') || updater.consumeStartHidden();
const startDelayed = process.argv.includes('--delayed');

function applyAutostart(p: AppPrefs): void {
  const mode = typeof p.autostart === 'string' ? p.autostart : p.autostart ? 'on' : 'off';
  void applyAutostartTask(mode, (m) => manager.addLog('i', m));
}
let prefs: AppPrefs;
let stopDisplayPowerWatch: (() => void) | null = null;
let bluetoothState: BluetoothState = {};

const iconPath = (): string => join(__dirname, '../../resources/icon.png');

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 780,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    backgroundColor: '#0b0d12',
    titleBarStyle: 'hidden',
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // live lighting runs in this page at ~21 fps, also when it's hidden in the tray
      backgroundThrottling: false,
    },
  });

  win.on('ready-to-show', () => { if (!startHidden) win?.show(); });
  (win as unknown as { on(ev: 'minimize', cb: (e: { preventDefault(): void }) => void): void }).on('minimize', (e) => {
    if (prefs.minimizeToTrayOnMinimize) { e.preventDefault(); win?.hide(); }
  });
  win.on('close', (e) => {
    if (!quitting && prefs.minimizeToTray) { e.preventDefault(); win?.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

const trayMenu = (): Menu => Menu.buildFromTemplate([
  { label: tx('trayOpen'), click: () => { win?.show(); win?.focus(); } },
  { type: 'separator' },
  { label: tx('trayExit'), click: () => { quitting = true; app.quit(); } },
]);

// Borderless, non-focusable hover window that mirrors Legion Toolkit's tray flyout.
function rendererUrl(hash: string): { url?: string; file?: string; hash: string } {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) return { url: `${process.env.ELECTRON_RENDERER_URL}#${hash}`, hash };
  return { file: join(__dirname, '../renderer/index.html'), hash };
}

function createFlyout(): void {
  flyout = new BrowserWindow({
    width: 330,
    height: 220,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    // Kept rendering while hidden: otherwise Chromium pauses it, and on hover it showed up empty and at
    // its last (tiny) size before it had painted.
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true, backgroundThrottling: false },
  });
  flyout.setIgnoreMouseEvents(true);
  const r = rendererUrl('flyout');
  if (r.url) void flyout.loadURL(r.url);
  else void flyout.loadFile(r.file!, { hash: r.hash });
}

const FLYOUT_WIDTH = 330;
let flyoutHeight = 220;

function positionFlyout(): void {
  if (!flyout || flyout.isDestroyed()) return;
  const tb = tray?.getBounds();
  const disp = tb ? screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }) : screen.getPrimaryDisplay();
  const area = disp.workArea;
  const width = FLYOUT_WIDTH, height = flyoutHeight;
  // Anchor to the tray icon, kept inside the work area; the taskbar usually sits at the bottom.
  let x = tb ? Math.round(tb.x + tb.width / 2 - width / 2) : area.x + area.width - width - 8;
  let y = tb ? tb.y - height - 6 : area.y + area.height - height - 8;
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - width - 8));
  if (y < area.y + 8) y = tb ? tb.y + tb.height + 6 : area.y + 8;
  flyout.setBounds({ x, y, width, height });
}

let flyoutWatch: NodeJS.Timeout | null = null;
let trayMoveAt = 0;

function showFlyout(): void {
  trayMoveAt = Date.now();
  if (!flyout || flyout.isDestroyed()) createFlyout();
  if (flyoutHideTimer) { clearTimeout(flyoutHideTimer); flyoutHideTimer = null; }
  positionFlyout();
  if (!flyout!.isVisible()) flyout!.webContents.send(CH.FLYOUT_REFRESH);
  flyout!.showInactive();
  // Windows does not always send mouse-leave for tray icons: hide once the cursor is off the icon.
  if (!flyoutWatch) flyoutWatch = setInterval(() => {
    const b = tray?.getBounds(), c = screen.getCursorScreenPoint();
    const over = !!b && c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
    // the icon's bounds can be off (overflow area): also wait for the tray's own mouse moves to stop
    if (!over && Date.now() - trayMoveAt > 500) hideFlyoutSoon();
  }, 300);
}

function hideFlyoutSoon(): void {
  if (flyoutHideTimer) clearTimeout(flyoutHideTimer);
  flyoutHideTimer = setTimeout(() => {
    if (flyout && !flyout.isDestroyed()) flyout.hide();
    if (flyoutWatch) { clearInterval(flyoutWatch); flyoutWatch = null; }
  }, 250);
}

function createTray(): void {
  const img = nativeImage.createFromPath(iconPath());
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.setToolTip(''); // the hover flyout replaces the native tooltip
  tray.setContextMenu(trayMenu());
  createFlyout();
  tray.on('mouse-enter', () => showFlyout());
  tray.on('mouse-move', () => showFlyout());
  tray.on('mouse-leave', () => hideFlyoutSoon());
  tray.on('click', () => { win?.show(); win?.focus(); });
}

const applyOsdPrefs = (p: AppPrefs): void =>
  configureOsd({ onTop: p.osdOnTop, allDisplays: p.osdAllDisplays, position: p.osdPosition, duration: p.osdDuration });

function registerIpc(): void {
  ipcMain.handle(CH.DEVICES, () => manager.getStatuses());
  ipcMain.handle(CH.DEVICE_CALL, (_e, key: string, method: string, args: unknown[]) => manager.call(key, method, args));
  ipcMain.handle(CH.LOG_GET, () => manager.getLog());
  ipcMain.handle(CH.LOG_CLEAR, () => manager.clearLog());
  ipcMain.on(CH.LOG_ADD, (_e, text: unknown) => manager.addLog('!', String(text).slice(0, 300)));
  ipcMain.handle(CH.SETTINGS_LOAD, (_e, modelId: string) => loadDeviceSettings(modelId));
  ipcMain.handle(CH.SETTINGS_SAVE, (_e, modelId: string, data: DeviceSettingsFile) => {
    battery.setInstalledPack(modelId, data?.batteries?.installed);
    return saveDeviceSettings(modelId, data);
  });
  ipcMain.handle(CH.APP_PREFS_LOAD, () => prefs);
  ipcMain.handle(CH.APP_PREFS_SAVE, (_e, p: AppPrefs) => {
    const blockChanged = !!p.blockVendorSoftware !== !!prefs.blockVendorSoftware;
    prefs = { ...p, lastSharedModel: prefs.lastSharedModel, prefsVersion: prefs.prefsVersion }; savePrefs(prefs); // kept by main, the renderer's copy is stale
    applyOsdPrefs(p);
    updater.applyPrefs();
    if (blockChanged) void applyVendorBlock();
    battery.setEnabled(true); // always record; the preference only controls whether the card is shown
    tray?.setContextMenu(trayMenu());
    applyAutostart(p);
    applyRestartHotkey(p);
  });
  ipcMain.on(CH.APP_MINIMIZE, () => win?.minimize());
  ipcMain.on(CH.APP_MAXIMIZE, () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on(CH.APP_CLOSE, () => win?.close());
  ipcMain.handle(CH.APP_VERSION, () => app.getVersion());
  ipcMain.on(CH.APP_OPEN_EXTERNAL, (_e, url: string) => { if (/^https?:\/\//.test(url)) void shell.openExternal(url); });
  ipcMain.handle(CH.APP_RESCAN, () => manager.rescan());
  ipcMain.handle(CH.VENDOR_STATUS, () => vendor.vendorStatus());
  ipcMain.handle(CH.VENDOR_KILL, () => vendor.killVendorApps(true));
  // the renderer only saves the setting when this returns true (UAC not declined)
  ipcMain.handle(CH.VENDOR_SET_BLOCK, async (_e, on: boolean) => {
    if ((await setVendorExes(!on)) === 'declined') return false;
    vendorExesFor = on;
    vendorExesDeclined = false;
    return true;
  });
  ipcMain.handle(CH.APP_FULL_RESET, async () => {
    quitting = true;
    await applyAutostartTask('off', () => undefined);
    await manager.stop().catch(() => undefined);
    for (const sub of ['settings', 'battery', 'logs', 'screen', 'library']) rmSync(join(app.getPath('userData'), sub), { recursive: true, force: true });
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle(CH.APP_BACKUP, async () => {
    const dir = join(app.getPath('userData'), 'backups');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const r = await dialog.showSaveDialog(win!, { defaultPath: join(dir, `aula-toolkit-backup-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: 'AULA Toolkit backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return false;
    writeFileSync(r.filePath, JSON.stringify(createBackup(app.getVersion()), null, 2), 'utf8');
    return true;
  });
  ipcMain.handle(CH.APP_RESTORE, async () => {
    const r = await dialog.showOpenDialog(win!, { defaultPath: join(app.getPath('userData'), 'backups'), filters: [{ name: 'AULA Toolkit backup', extensions: ['json'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return 'canceled';
    let data: unknown;
    try { data = JSON.parse(readFileSync(r.filePaths[0], 'utf8')); } catch { return 'invalid'; }
    if (!restoreBackup(data)) return 'invalid';
    // Restart so every window, the tray and the devices pick up the restored settings.
    quitting = true;
    await manager.stop().catch(() => undefined);
    app.relaunch();
    app.exit(0);
    return 'ok';
  });
  ipcMain.handle(CH.APP_OPEN_FOLDER,async (_e, kind: 'data' | 'logs' | 'backups') => {
    const dir = join(app.getPath('userData'), { data: 'settings', logs: 'logs', backups: 'backups' }[kind] ?? 'settings');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
  });
  ipcMain.handle(CH.APP_ACCENT, () => { try { const c = systemPreferences.getAccentColor(); return c ? `#${c.slice(0, 6)}` : null; } catch { return null; } });
  ipcMain.handle(CH.APP_BUILD_INFO, () => ({ version: app.getVersion(), build: BUILD_STAMP, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, cliPath: app.isPackaged ? join(process.resourcesPath, 'bin', 'aula.cmd') : join(app.getAppPath(), 'resources', 'cli', 'aula.js') }));
  ipcMain.handle(CH.UPDATE_CHECK, () => updater.check());
  ipcMain.handle(CH.UPDATE_DOWNLOAD, () => updater.download());
  ipcMain.on(CH.UPDATE_INSTALL, () => { quitting = true; updater.install(); });
  ipcMain.handle(CH.UPDATE_STATE, () => updater.getState());
  ipcMain.handle(CH.APP_DIAGNOSTICS, async () => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `aula-toolkit-diagnostics-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return false;
    const payload = { app: { version: app.getVersion(), build: BUILD_STAMP, platform: `${process.platform} ${process.getSystemVersion()}` }, devices: manager.getStatuses(), log: manager.getLog(), exportedAt: new Date().toISOString() };
    writeFileSync(r.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  });
  ipcMain.handle(CH.APP_EXPORT_JSON, async (_e, name: string, data: unknown) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `${name}.aulaprofile.json`, filters: [{ name: 'AULA Toolkit profile', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return false;
    writeFileSync(r.filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });
  ipcMain.handle(CH.APP_IMPORT_JSON, async () => {
    const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'AULA Toolkit profile', extensions: ['json'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { name: r.filePaths[0], data: JSON.parse(readFileSync(r.filePaths[0], 'utf8')) };
  });
  ipcMain.handle(CH.APP_PICK_IMAGE, async () => {
    const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const ext = p.split('.').pop()?.toLowerCase() ?? 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return { name: p, dataUrl: `data:${mime};base64,${readFileSync(p).toString('base64')}` };
  });

  manager.on('devices', (d: DeviceStatus[]) => { win?.webContents.send(CH.DEVICES_EVENT, d); checkBattery(d); battery.record(d); scheduleCare(); });
  let careTimer: NodeJS.Timeout | null = null;
  const scheduleCare = (): void => { if (!careTimer) careTimer = setTimeout(() => { careTimer = null; checkBatteryCare(); }, 2000); };
  setInterval(checkBatteryCare, 30e3);
  manager.on('attached', (key: string) => {
    void applyVendorBlock();
    const [id, link] = key.split(':');
    if (link === 'usb' && MODELS.find((m) => m.id === id)?.productMatch && prefs.lastSharedModel !== id) {
      prefs = { ...prefs, lastSharedModel: id };
      savePrefs(prefs);
    }
  });
  // Bluetooth state comes from Windows, poll it every minute
  const pollBluetooth = (): void => {
    void readBluetoothBatteries().then((list) => {
      battery.recordBluetooth(list, manager.getStatuses());
      bluetoothState = Object.fromEntries(list.map((b) => [b.modelId, { connected: b.connected, pct: b.pct }]));
      win?.webContents.send(CH.BLUETOOTH_EVENT, bluetoothState);
      if (flyout && !flyout.isDestroyed()) flyout.webContents.send(CH.BLUETOOTH_EVENT, bluetoothState);
    });
  };
  setTimeout(pollBluetooth, 3000);
  setInterval(pollBluetooth, 60e3);
  // a device that just disappeared may come back on Bluetooth
  let lastModels = new Set<string>();
  manager.on('devices', (d: DeviceStatus[]) => {
    const now = new Set(d.map((x) => x.modelId));
    if ([...lastModels].some((id) => !now.has(id))) { setTimeout(pollBluetooth, 3000); setTimeout(pollBluetooth, 10000); }
    lastModels = now;
  });
  setInterval(() => void applyVendorBlock(), 10_000);
  void applyVendorBlock();
  // last uploaded screen picture per model/slot
  const screenFile = (modelId: string, slot: number): string | null => {
    if (!/^[a-z0-9-]+$/.test(modelId) || !Number.isInteger(slot) || slot < 1 || slot > 9) return null;
    return join(app.getPath('userData'), 'screen', `${modelId}-slot${slot}.json`);
  };
  ipcMain.handle(CH.SCREEN_LOAD, (_e, modelId: string, slot: number): StoredScreen | null => {
    const f = screenFile(modelId, slot);
    try { return f && existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as StoredScreen) : null; } catch { return null; }
  });
  ipcMain.handle(CH.SCREEN_SAVE, (_e, modelId: string, slot: number, s: StoredScreen) => {
    const f = screenFile(modelId, slot);
    if (!f || typeof s?.dataUrl !== 'string' || !s.dataUrl.startsWith('data:image/')) return;
    mkdirSync(join(app.getPath('userData'), 'screen'), { recursive: true });
    const thumb = typeof s.thumb === 'string' && s.thumb.startsWith('data:image/') ? s.thumb : undefined;
    const clamp = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : 0.5);
    const pos = s.pos ? { x: clamp(s.pos.x), y: clamp(s.pos.y) } : undefined;
    writeFileSync(f, JSON.stringify({ name: String(s.name), dataUrl: s.dataUrl, mode: s.mode === 'fit' ? 'fit' : 'cover', frames: Number(s.frames) || 1, thumb, pos }));
  });
  ipcMain.handle(CH.BLUETOOTH_GET, () => bluetoothState);
  ipcMain.handle(CH.LIBRARY_LIST, () => library.list());
  ipcMain.handle(CH.LIBRARY_ADD, (_e, item: { name: string; dataUrl: string; thumb: string; frames: number }) => library.add(item));
  ipcMain.handle(CH.LIBRARY_GET, (_e, id: string) => library.get(id));
  ipcMain.handle(CH.LIBRARY_DELETE, (_e, id: string) => library.remove(id));
  ipcMain.handle(CH.BATTERY_STATS, (_e, id: string, pack?: string) => battery.stats(id, manager.getStatuses().find((s) => s.modelId === id), pack));
  ipcMain.handle(CH.BATTERY_CLEAR, (_e, id: string) => battery.clear(id));
  manager.on('log', (e) => win?.webContents.send(CH.LOG_EVENT, e));
  const windowOnScreen = (): boolean => !!win && win.isVisible() && !win.isMinimized();
  manager.liveViewActive = windowOnScreen;
  manager.on('progress', (p: DeviceProgress) => {
    win?.webContents.send(CH.DEVICE_PROGRESS, p);
    if (p.task === 'screen') {
      const pct = Math.floor((p.done * 100) / p.total);
      const name = loadDeviceSettings(p.modelId).nickname || (MODELS.find((m) => m.id === p.modelId)?.name ?? p.modelId);
      showOsd({ device: name, kind: 'upload', value: prefs.language === 'tr' ? `%${pct}` : `${pct}%`, note: tx(pct >= 100 ? 'uploadDone' : 'uploading'), progress: pct });
    }
  });
  manager.on('live-light', (l: LiveLight) => { if (windowOnScreen()) win!.webContents.send(CH.DEVICE_LIVE_LIGHT, l); });
  manager.on('hw-event', (e: HwEvent) => {
    win?.webContents.send(CH.DEVICE_HW_EVENT, e);
    if (!prefs.osd) return;
    const device = MODELS.find((m) => m.id === e.modelId)?.name ?? e.modelId;
    if (e.kind === 'light') {
      if (e.change === 'mode') {
        // Same effect names as the app's effect list (translated in the OSD window).
        const name = MODELS.find((m) => m.id === e.modelId)?.lightModes?.find((m) => m.mode === e.mode)?.name ?? String(e.mode);
        showOsd({ device, kind: 'effect', value: name, valueName: name });
        return;
      }
      if (e.quiet) return;
      if (e.change === 'brightness') showOsd({ device, kind: 'brightness', value: String(e.level), unit: `/ ${e.max}`, stage: e.level - 1, count: e.max });
      else showOsd({ device, kind: 'color', value: '', valueKey: colorKey(e.color), swatch: e.color === 'multi' ? 'multi' : `rgb(${e.color.join(',')})` });
      return;
    }
    if (e.kind === 'dpi') showOsd({ device, kind: 'dpi', value: e.value ? String(e.value) : `${e.stage + 1}`, unit: e.value ? 'DPI' : undefined, stage: e.stage, count: e.count });
    else showOsd({ device, kind: 'polling', value: String(e.hz), unit: 'Hz' });
  });

  // CLI bridge: profile-changing commands run in the renderer, which owns the profiles.
  let cliReady = false;
  let cliSeq = 0;
  const cliPending = new Map<number, (r: CliResult) => void>();
  const cliWaiting: (() => void)[] = [];
  ipcMain.on(CH.CLI_READY, () => { cliReady = true; cliWaiting.splice(0).forEach((f) => f()); });
  ipcMain.on(CH.CLI_REPLY, (_e, id: number, res: CliResult) => { cliPending.get(id)?.(res); cliPending.delete(id); });
  const forward = (req: CliRequest): Promise<CliResult> => new Promise((resolve) => {
    const send = (): void => {
      const id = ++cliSeq;
      const timer = setTimeout(() => { cliPending.delete(id); resolve({ ok: false, out: 'AULA Toolkit did not answer in time.' }); }, 15_000);
      cliPending.set(id, (r) => { clearTimeout(timer); resolve(r); });
      win?.webContents.send(CH.CLI_REQUEST, id, req);
    };
    if (cliReady) send(); else cliWaiting.push(send);
  });
  startCliServer({
    statuses: () => manager.getStatuses(),
    version: () => app.getVersion(),
    showWindow: () => { win?.show(); win?.focus(); },
    hideWindow: () => win?.hide(),
    forward,
  }, (msg) => manager.addLog('i', msg));
  ipcMain.on(CH.MEDIA_WATCH, (_e, on: boolean) => setMediaWatch(on, (state) => {
    manager.addLog('i', `media ${state}`);
    win?.webContents.send(CH.MEDIA_PLAYBACK, state);
  }, (message) => manager.addLog('!', message)));
  ipcMain.on(CH.OSD_SHOW, (_e, p: OsdPayload) => { if (prefs.osd) showOsd(p); });
  ipcMain.on(CH.FLYOUT_SIZE, (_e, h: number) => {
    if (h < 40) return; // not laid out yet
    flyoutHeight = Math.max(60, Math.min(720, Math.round(h)));
    if (flyout && !flyout.isDestroyed() && flyout.isVisible()) positionFlyout();
  });
}

// Optional isolated profile (used by the screenshot script); must be set before the instance lock.
if (process.env.AULA_USER_DATA) app.setPath('userData', process.env.AULA_USER_DATA);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { win?.show(); win?.focus(); });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('dev.aulatoolkit.app');
    prefs = loadPrefs();
    applyOsdPrefs(prefs);
    applyAutostart(prefs);
    applyRestartHotkey(prefs);
    ensureCliOnPath((m) => manager.addLog('i', m));
    battery.setEnabled(true);
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
    // system audio for the music rhythm (loopback, no picker)
    session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
      void desktopCapturer.getSources({ types: ['screen'] }).then((s) => {
        if (!s[0]) manager.addLog('!', 'system audio: Windows offered no screen to capture the sound from');
        cb(s[0] ? { video: s[0], audio: 'loopback' } : {});
      }).catch((e: Error) => { manager.addLog('!', `system audio: ${e.message}`); cb({}); });
    });
    registerIpc();
    createWindow();
    createTray();
    createOsd();
    stopDisplayPowerWatch = watchDisplayPower((state) => {
      manager.addLog('i', `display turned ${state}`);
      win?.webContents.send(CH.DISPLAY_POWER, state);
    }, (message) => manager.addLog('!', message));
    if (process.env.AULA_SCREENSHOTS && win) {
      const shotSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      void runScreenshots(process.env.AULA_SCREENSHOTS, win, {
        osd: async () => {
          showOsd({ device: 'SC900 Pro', kind: 'dpi', value: '1600', unit: 'DPI', stage: 2, count: 6 });
          await shotSleep(700);
          return osdWindow()?.webContents.capturePage() ?? null;
        },
        flyout: async () => {
          showFlyout();
          await shotSleep(1500);
          return flyout && !flyout.isDestroyed() ? flyout.webContents.capturePage() : null;
        },
      }, (m) => manager.addLog('i', m)).then(() => { quitting = true; app.quit(); });
    }
    // Delayed autostart: let other login programs settle before touching the HID devices.
    const delay = startDelayed ? 30_000 : 0;
    setTimeout(() => { manager.start(); updater.setupUpdater(() => win, () => prefs); }, delay);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); stopDisplayPowerWatch?.(); stopMediaWatch(); void manager.stop(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
