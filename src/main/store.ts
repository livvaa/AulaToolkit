// Persistent settings: one JSON file per device model plus app preferences, under %APPDATA%/AULA Toolkit.
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeviceSettingsFile } from '@shared/types';
import { DEFAULT_PREFS, type AppPrefs } from '@shared/ipc';

const dir = (): string => {
  const d = join(app.getPath('userData'), 'settings');
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
};

const read = <T>(file: string, fallback: T): T => {
  try { return JSON.parse(readFileSync(join(dir(), file), 'utf8')) as T; } catch { return fallback; }
};
const write = (file: string, data: unknown): void => writeFileSync(join(dir(), file), JSON.stringify(data, null, 2), 'utf8');

export const emptySettings = (): DeviceSettingsFile => ({ profiles: [], activeProfile: '', macros: [] });

export const loadDeviceSettings = (modelId: string): DeviceSettingsFile => read(`${modelId}.json`, emptySettings());
export const saveDeviceSettings = (modelId: string, data: DeviceSettingsFile): void => write(`${modelId}.json`, data);

export const loadPrefs = (): AppPrefs => {
  const p: AppPrefs = { ...DEFAULT_PREFS, ...read<Partial<AppPrefs>>('prefs.json', {}) };
  // Migrate values saved by earlier builds.
  const auto = p.autostart as unknown;
  if (typeof auto === 'boolean') p.autostart = auto ? 'on' : 'off';
  if (!['off', 'on', 'delayed'].includes(p.autostart)) p.autostart = 'on';
  if (typeof p.osd !== 'boolean') p.osd = true;
  if (typeof p.osdOnTop !== 'boolean') p.osdOnTop = true;
  if (typeof p.osdAllDisplays !== 'boolean') p.osdAllDisplays = false;
  if (!['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'].includes(p.osdPosition)) p.osdPosition = 'bottom-center';
  if (!['short', 'normal', 'long'].includes(p.osdDuration)) p.osdDuration = 'normal';
  if (!['system', 'dark', 'light'].includes(p.theme)) p.theme = 'system';
  if (typeof p.accent !== 'string' || !p.accent) p.accent = 'ember';
  // 1: tray, restart keys and battery options became on by default; switch them on once for everyone.
  if ((p.prefsVersion ?? 0) < 1) {
    Object.assign(p, { minimizeToTray: true, minimizeToTrayOnMinimize: true, restartHotkey: true, batteryAlerts: true, batteryStats: true, batteryCare: true, prefsVersion: 1 });
    try { savePrefs(p); } catch { /* read-only data folder: try again next start */ }
  }
  return p;
};
export const savePrefs = (p: AppPrefs): void => write('prefs.json', p);

const BACKUP_FORMAT = 'aula-toolkit-backup';
const SAFE_ID = /^[a-z0-9_-]{1,40}$/i;

export interface Backup { format: typeof BACKUP_FORMAT; version: 1; appVersion: string; createdAt: string; prefs: AppPrefs; devices: Record<string, DeviceSettingsFile> }

/** App preferences plus every device's profiles, macros and active profile. */
export function createBackup(appVersion: string): Backup {
  const devices: Record<string, DeviceSettingsFile> = {};
  for (const f of readdirSync(dir())) {
    const id = f.replace(/\.json$/, '');
    if (f === 'prefs.json' || !f.endsWith('.json') || !SAFE_ID.test(id)) continue;
    devices[id] = loadDeviceSettings(id);
  }
  return { format: BACKUP_FORMAT, version: 1, appVersion, createdAt: new Date().toISOString(), prefs: loadPrefs(), devices };
}

/** Writes a backup over the current settings. Returns false if `data` is not an AULA Toolkit backup. */
export function restoreBackup(data: unknown): boolean {
  const b = data as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.prefs !== 'object' || !b.prefs || typeof b.devices !== 'object' || !b.devices) return false;
  const devices = Object.entries(b.devices).filter(([id, v]) => SAFE_ID.test(id) && v && Array.isArray(v.profiles));
  for (const [id, v] of devices) saveDeviceSettings(id, { ...emptySettings(), ...v });
  savePrefs({ ...DEFAULT_PREFS, ...b.prefs });
  return true;
}
