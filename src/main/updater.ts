// Auto-update through GitHub Releases (electron-updater). The app installs per-user, so no elevation
// is needed. Downloads happen in the background; with "download and install automatically" the update
// is also installed silently once the PC is idle, since the app lives in the tray and rarely quits.
import { app, BrowserWindow, powerMonitor } from 'electron';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { CH, type AppPrefs, type UpdateState } from '@shared/ipc';

let win: (() => BrowserWindow | null) | null = null;
let prefs: (() => AppPrefs) | null = null;
let timer: NodeJS.Timeout | null = null;
let state: UpdateState = { status: 'idle', current: app.getVersion() };
let installTimer: NodeJS.Timeout | null = null;

const IDLE_S = 120; // no keyboard or mouse input for this long

/** Written before a background install, so the relaunched app starts in the tray like it was. */
const hiddenMarker = (): string => join(app.getPath('userData'), 'start-hidden');
/** True once, right after a background update: start in the tray. */
export function consumeStartHidden(): boolean {
  try { if (existsSync(hiddenMarker())) { rmSync(hiddenMarker(), { force: true }); return true; } } catch { /* ignore */ }
  return false;
}

/** Installs a downloaded update quietly while nobody uses the PC and the window is not in front. */
function installWhenIdle(): void {
  if (installTimer) return;
  installTimer = setInterval(() => {
    if (state.status !== 'ready' || !prefs?.().autoDownload) return;
    const w = win?.();
    if (w && w.isVisible() && w.isFocused()) return;
    if (powerMonitor.getSystemIdleTime() < IDLE_S) return;
    if (installTimer) { clearInterval(installTimer); installTimer = null; }
    try { if (!w?.isVisible()) writeFileSync(hiddenMarker(), ''); } catch { /* ignore */ }
    autoUpdater.quitAndInstall(true, true);
  }, 60e3);
}

const emit = (patch: Partial<UpdateState>): void => {
  state = { ...state, ...patch, current: app.getVersion() };
  win?.()?.webContents.send(CH.UPDATE_EVENT, state);
};

export const INTERVALS: Record<string, number> = { never: 0, hourly: 3600e3, '3h': 3 * 3600e3, '12h': 12 * 3600e3, daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3, monthly: 30 * 24 * 3600e3 };

export function setupUpdater(getWin: () => BrowserWindow | null, getPrefs: () => AppPrefs): void {
  win = getWin; prefs = getPrefs;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: undefined }));
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    emit({ status: 'available', latest: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined });
    if (prefs?.().autoDownload) void autoUpdater.downloadUpdate().catch((e) => emit({ status: 'error', error: String(e) }));
  });
  autoUpdater.on('update-not-available', () => emit({ status: 'upToDate', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', progress: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => { emit({ status: 'ready', latest: info.version, progress: 100 }); installWhenIdle(); });
  autoUpdater.on('error', (e) => emit({ status: 'error', error: e?.message ?? String(e) }));
  applyPrefs();
}

export function applyPrefs(): void {
  const p = prefs?.();
  if (!p) return;
  autoUpdater.allowPrerelease = p.updateChannel === 'beta';
  if (timer) clearInterval(timer);
  const ms = INTERVALS[p.updateInterval] ?? INTERVALS.daily;
  if (ms > 0 && app.isPackaged) {
    timer = setInterval(() => void check(), ms);
    setTimeout(() => void check(), 15e3);
  }
}

export async function check(): Promise<UpdateState> {
  if (!app.isPackaged) { emit({ status: 'upToDate', checkedAt: Date.now(), error: undefined }); return state; }
  try { await autoUpdater.checkForUpdates(); } catch (e) { emit({ status: 'error', error: (e as Error).message }); }
  return state;
}

export async function download(): Promise<void> {
  if (state.status !== 'available') return;
  await autoUpdater.downloadUpdate();
}

export function install(): void { autoUpdater.quitAndInstall(false, true); }
export const getState = (): UpdateState => state;
