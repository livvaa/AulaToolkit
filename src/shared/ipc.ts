// IPC contract between the renderer and the main process.
import type { BatteryReport } from './batteryModel';
import type { DeviceSettingsFile, DeviceStatus, LogEntry, Profile } from './types';
import type { LightChange } from './lightWatch';

export const CH = {
  DEVICES: 'devices:list',
  DEVICES_EVENT: 'devices:changed',
  DEVICE_CALL: 'device:call',
  LOG_GET: 'log:get',
  LOG_EVENT: 'log:entry',
  LOG_CLEAR: 'log:clear',
  LOG_ADD: 'log:add',
  SETTINGS_LOAD: 'settings:load',
  SETTINGS_SAVE: 'settings:save',
  APP_PREFS_LOAD: 'app:prefs:load',
  APP_PREFS_SAVE: 'app:prefs:save',
  APP_MINIMIZE: 'app:minimize',
  APP_CLOSE: 'app:close',
  APP_MAXIMIZE: 'app:maximize',
  APP_VERSION: 'app:version',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  APP_EXPORT_JSON: 'app:exportJson',
  APP_IMPORT_JSON: 'app:importJson',
  APP_PICK_IMAGE: 'app:pickImage',
  APP_RESCAN: 'app:rescan',
  APP_OPEN_FOLDER: 'app:openFolder',
  APP_BUILD_INFO: 'app:buildInfo',
  APP_ACCENT: 'app:systemAccent',
  APP_DIAGNOSTICS: 'app:diagnostics',
  APP_FULL_RESET: 'app:fullReset',
  APP_BACKUP: 'app:backup',
  APP_RESTORE: 'app:restore',
  VENDOR_STATUS: 'vendor:status',
  VENDOR_KILL: 'vendor:kill',
  VENDOR_SET_BLOCK: 'vendor:setBlock',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATE: 'update:state',
  UPDATE_EVENT: 'update:event',
  BATTERY_STATS: 'battery:stats',
  BATTERY_CLEAR: 'battery:clear',
  DEVICE_HW_EVENT: 'device:hwEvent',
  OSD_SHOW: 'osd:show',
  CLI_REQUEST: 'cli:request',
  CLI_REPLY: 'cli:reply',
  CLI_READY: 'cli:ready',
  FLYOUT_SIZE: 'flyout:size',
  DEV_NAVIGATE: 'dev:navigate',
  FLYOUT_REFRESH: 'flyout:refresh',
  DEVICE_LIVE_LIGHT: 'device:liveLight',
  DEVICE_PROGRESS: 'device:progress',
  SCREEN_LOAD: 'screen:load',
  SCREEN_SAVE: 'screen:save',
  BLUETOOTH_GET: 'bluetooth:get',
  BLUETOOTH_EVENT: 'bluetooth:event',
  LIBRARY_LIST: 'library:list',
  LIBRARY_ADD: 'library:add',
  LIBRARY_GET: 'library:get',
  LIBRARY_DELETE: 'library:delete',
  DISPLAY_POWER: 'display:power',
  MEDIA_WATCH: 'media:watch',
  MEDIA_PLAYBACK: 'media:playback',
} as const;

export interface AppPrefs {
  language: 'en' | 'tr' | 'ru' | 'zh' | 'uk' | 'vi' | 'pt' | 'es' | 'de' | 'fr';
  /** 'on' starts minimised at login; 'delayed' waits ~30 s so other startup apps settle first. */
  autostart: 'off' | 'on' | 'delayed';
  /** Close button hides to the tray instead of quitting. */
  minimizeToTray: boolean;
  /** Minimise button hides to the tray instead of the taskbar. */
  minimizeToTrayOnMinimize: boolean;
  
  theme: 'system' | 'dark' | 'light';
  /** 'system' = Windows accent colour, a preset id, or a #hex. */
  accent: string;
  /** Models the user has connected at least once; the sidebar shows only these. */
  knownDevices: string[];
  userName: string;
  onboarded: boolean;
  /** Low-battery notifications and the level (percent) that triggers them. */
  batteryAlerts: boolean;
  batteryThreshold: number;
  /** Close the official AULA driver apps and disable their autostart while AULA Toolkit is in use. */
  blockVendorSoftware: boolean;
  updateChannel: 'stable' | 'beta';
  updateInterval: 'never' | 'hourly' | '3h' | '12h' | 'daily' | 'weekly' | 'monthly';
  autoDownload: boolean;
  /** Opt-in battery history and estimates (cycles, drain, health). */
  batteryStats: boolean;
  /** Remind to unplug at 80 % (needs batteryStats). */
  batteryCare?: boolean;
  /** On-screen display for changes made on the hardware (mouse DPI button) or from the CLI. */
  osd: boolean;
  /** Keep the OSD above full-screen apps and games. */
  osdOnTop: boolean;
  /** Show the OSD on every connected display instead of only the one under the cursor. */
  osdAllDisplays: boolean;
  osdPosition: OsdPosition;
  osdDuration: 'short' | 'normal' | 'long';
  /** Ctrl+Alt+Shift+A restarts the app. */
  restartHotkey?: boolean;
  /** Of the models sharing USB ids (S75 Pro, L99), the one last seen over USB; used on the dongle. */
  lastSharedModel?: string;
  /** Last one-time migration applied by loadPrefs (see src/main/store.ts). */
  prefsVersion?: number;
}

export type OsdPosition = 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export interface OsdOptions { onTop: boolean; allDisplays: boolean; position: OsdPosition; duration: AppPrefs['osdDuration'] }

export type BatteryStats = BatteryReport;

export interface VendorStatus { running: { name: string; pid: number; path: string }[]; autostart: { name: string; location: string }[] }

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'upToDate' | 'error';
  current: string;
  latest?: string;
  progress?: number;
  notes?: string;
  error?: string;
  checkedAt?: number;
}

export const DEFAULT_PREFS: AppPrefs = { language: 'tr', autostart: 'on', minimizeToTray: true, minimizeToTrayOnMinimize: true, theme: 'system', accent: 'ember', knownDevices: [], userName: '', onboarded: false, batteryAlerts: true, batteryThreshold: 20, blockVendorSoftware: false, updateChannel: 'beta', updateInterval: 'daily', autoDownload: true, batteryStats: true, batteryCare: true, osd: true, osdOnTop: true, osdAllDisplays: false, osdPosition: 'bottom-center', osdDuration: 'normal', restartHotkey: true };

export interface AulaApi {
  getDevices(): Promise<DeviceStatus[]>;
  onDevices(cb: (d: DeviceStatus[]) => void): () => void;
  call<T = unknown>(deviceKey: string, method: string, ...args: unknown[]): Promise<T>;
  getLog(): Promise<LogEntry[]>;
  onLog(cb: (e: LogEntry) => void): () => void;
  clearLog(): Promise<void>;
  /** Adds a warning from the window to the log (for the diagnostics file). */
  addLog(text: string): void;
  loadSettings(modelId: string): Promise<DeviceSettingsFile>;
  saveSettings(modelId: string, data: DeviceSettingsFile): Promise<void>;
  loadPrefs(): Promise<AppPrefs>;
  savePrefs(p: AppPrefs): Promise<void>;
  minimize(): void;
  maximize(): void;
  close(): void;
  version(): Promise<string>;
  openExternal(url: string): void;
  exportJson(name: string, data: unknown): Promise<boolean>;
  importJson(): Promise<{ name: string; data: Profile | DeviceSettingsFile } | null>;
  pickImage(): Promise<{ name: string; dataUrl: string } | null>;
  rescan(): Promise<void>;
  openFolder(kind: 'data' | 'logs' | 'backups'): Promise<void>;
  systemAccent(): Promise<string | null>;
  buildInfo(): Promise<{ version: string; build: string; electron: string; chrome: string; node: string; cliPath: string }>;
  saveDiagnostics(): Promise<boolean>;
  /** Deletes every setting, profile and history, then restarts the app as if freshly installed. */
  fullReset(): Promise<void>;
  /** Saves app preferences and every device's profiles to a JSON file the user picks. */
  backup(): Promise<boolean>;
  /** Restores a backup file and restarts the app; resolves with an error key if the file is not a backup. */
  restore(): Promise<'ok' | 'canceled' | 'invalid'>;
  vendorStatus(): Promise<VendorStatus>;
  vendorKill(): Promise<number>;
  /** false if the UAC prompt was declined */
  vendorSetBlock(on: boolean): Promise<boolean>;
  updateCheck(): Promise<UpdateState>;
  updateDownload(): Promise<void>;
  updateInstall(): void;
  updateState(): Promise<UpdateState>;
  onUpdate(cb: (s: UpdateState) => void): () => void;
  batteryStats(modelId: string, pack?: string): Promise<BatteryStats>;
  batteryClear(modelId: string): Promise<void>;
  /** Changes that originated on the device itself (e.g. the DPI button). */
  onHwEvent(cb: (e: HwEvent) => void): () => void;
  /** Live keyboard LED colours, sent about twice a second while the window is visible (USB only). */
  onLiveLight(cb: (l: LiveLight) => void): () => void;
  onProgress(cb: (p: DeviceProgress) => void): () => void;
  /** Last uploaded screen picture. */
  loadScreen(modelId: string, slot: number): Promise<StoredScreen | null>;
  saveScreen(modelId: string, slot: number, s: StoredScreen): Promise<void>;
  getBluetooth(): Promise<BluetoothState>;
  onBluetooth(cb: (s: BluetoothState) => void): () => void;
  libraryList(): Promise<LibraryItem[]>;
  libraryAdd(item: { name: string; dataUrl: string; thumb: string; frames: number }): Promise<LibraryItem | null>;
  libraryGet(id: string): Promise<string | null>;
  libraryDelete(id: string): Promise<void>;
  onDisplayPower(cb: (state: DisplayPowerState) => void): () => void;
  setMediaWatch(on: boolean): void;
  onMediaPlayback(cb: (state: MediaPlaybackState) => void): () => void;
  /** OSD window only: payload to display. */
  onOsd(cb: (p: OsdPayload) => void): () => void;
  /** CLI bridge: requests from the `aula` command, answered with cliReply. */
  onCliRequest(cb: (id: number, req: CliRequest) => void): () => void;
  cliReply(id: number, res: CliResult): void;
  cliReady(): void;
  /** Tray flyout only: reports its content height so the window fits it. */
  flyoutSize(height: number): void;
  /** Tray flyout only: fired each time the flyout is shown. */
  onFlyoutRefresh(cb: () => void): () => void;
  /** Shows the on-screen display (used for CLI-driven changes). */
  showOsd(p: OsdPayload): void;
  /** Development screenshot mode only: navigate to a page/tab. */
  onDevNavigate(cb: (n: DevNavigate) => void): () => void;
}

export interface DevNavigate { page: 'home' | 'device' | 'settings'; model?: string; tab?: string; settingsTab?: string; dialog?: 'notifications' | 'backup' }

export type DisplayPowerState = 'on' | 'off';
export type BluetoothState = Record<string, { connected: boolean; pct: number | null }>;
export interface DeviceProgress { modelId: string; task: 'screen'; done: number; total: number }
export interface StoredScreen { name: string; dataUrl: string; mode: 'cover' | 'fit'; frames: number; thumb?: string; pos?: { x: number; y: number } }
export interface LibraryItem { id: string; name: string; thumb: string; frames: number; addedAt: number }
export type MediaPlaybackState = 'playing' | 'stopped';

/** A change reported by the device without the app asking (button presses on the hardware). */
export type HwEvent =
  | { modelId: string; kind: 'dpi'; stage: number; count?: number; value?: number }
  | { modelId: string; kind: 'polling'; hz: number }
  | ({ modelId: string; kind: 'light' } & LightChange);

/** Live LED colours of a keyboard (key code → RGB). */
export interface LiveLight { modelId: string; colors: Record<number, [number, number, number]>; /** Read time (ms since epoch). */ t: number }

/** What the OSD shows: a device, a headline value and optionally a stage strip. */
export interface OsdPayload {
  device: string;
  kind: 'dpi' | 'polling' | 'profile' | 'light' | 'color' | 'brightness' | 'effect' | 'battery' | 'upload' | 'restart';
  value: string;
  /** Translation key shown instead of `value` (the OSD window translates it). */
  valueKey?: string;
  /** Device-level name (an effect) shown instead of `value`, translated like the app's lists. */
  valueName?: string;
  unit?: string;
  stage?: number;
  count?: number;
  /** Colour sample next to the value: a CSS colour, or 'multi' for a rainbow. */
  swatch?: string;
  /** Small text under the value. */
  note?: string;
  /** 0..100, shows a progress bar. */
  progress?: number;
}

export interface CliRequest { cmd: string; modelId: string; args: string[]; opts: Record<string, string> }
export interface CliResult { ok: boolean; out: string }
