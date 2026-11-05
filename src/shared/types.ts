// Shared types between the Electron main process (HID drivers) and the renderer (UI).

export type DeviceKind = 'keyboard' | 'mouse';
export type Link = 'usb' | '2.4g' | 'bluetooth' | 'none';
export type ProtocolId = 'aula04' | 'incott' | 'g5kb';

export interface UsbId {
  vendorId: number;
  productId: number;
  role: 'usb' | 'dongle';
  /** Windows interface number (MI_xx) that carries the vendor protocol, when known. */
  iface?: number;
  /** Vendor usage page of the configuration collection, when known. */
  usagePage?: number;
}

export interface KeyDef {
  /** HID usage code of the physical key. */
  code: number;
  name: string;
  /** Slot in the 4-byte-per-key keymap block. */
  idx: number;
  /** Slot in the per-key RGB block. */
  light: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LightMode {
  mode: number;
  name: string;
  /** Capability bits: 1 brightness, 2 speed, 4 direction L/R, 8 direction U/D, 16 colourful toggle, 32 colour. */
  caps: number;
  /** Firmware effect id when it differs from `mode` (BYCOMBO4 keyboards). */
  hw?: number;
}

export interface SettingDef {
  key: string;
  label: string;
  type: 'check' | 'select' | 'number';
  default: number;
  options?: [number, string][];
  min?: number;
  max?: number;
}

export interface ButtonSlot {
  /** Wire index used by the protocol. */
  slot: number;
  name: string;
  /** Hotspot position in percent of the device image. */
  x: number;
  y: number;
  locked?: boolean;
}

export interface DeviceModel {
  id: string;
  name: string;
  brand: string;
  kind: DeviceKind;
  protocol: ProtocolId;
  usb: UsbId[];
  image: string;
  gallery?: string[];
  /** Colourways; the USB descriptor cannot tell them apart, so the user picks one. */
  variants?: { id: string; name: string; image: string; swatch: string }[];
  /** Top-down photo whose pixel space matches the key layout, for lighting previews. */
  topImage?: { id: string; width: number; height: number };
  tagline: string;
  /** Tested by the project on real hardware (otherwise supported from protocol research only). */
  verified?: boolean;
  specs: { label: string; value: string }[];
  features: {
    lighting?: boolean;
    perkey?: boolean;
    keymap?: boolean;
    fnLayer?: boolean;
    macros?: boolean;
    screen?: boolean;
    settings?: boolean;
    bar?: boolean;
    dpi?: boolean;
    buttons?: boolean;
    battery?: boolean;
    clock?: boolean;
    /** lights off with the monitor. only tried on the S75 Pro so far */
    displayBlackout?: boolean;
  };
  layout?: KeyDef[];
  lightModes?: LightMode[];
  barModes?: { mode: number; name: string }[];
  /** Regex for the Bluetooth device name. */
  bluetoothName?: string;
  /** Regex for the USB product name, for models that share USB ids with another one. */
  productMatch?: string;
  /** Swappable batteries in the box. */
  batteries?: number;
  lightRange?: { brightness: number; speed: number };
  settings?: SettingDef[];
  screen?: { width: number; height: number; headLength: number; maxFrames: number; chunk: number };
  buttonSlots?: ButtonSlot[];
  dpi?: { min: number; max: number; step: number; stages: number; defaults: number[] };
  pollingRates?: number[];
}

// ---- Actions that can be bound to a key or button ----

export type KeyAction =
  | { type: 'default' }
  | { type: 'disable' }
  | { type: 'key'; code: number; mods: number }
  | { type: 'mouse'; id: number }
  | { type: 'media'; usage: number }
  | { type: 'macro'; index: number; mode: number; loops?: number }
  | { type: 'dpi'; op: 'cycle' | 'up' | 'down' }
  | { type: 'fire' }
  | { type: 'profile' };

export type MacroStepKind = 'KEY_DOWN' | 'KEY_UP' | 'MOUSE_DOWN' | 'MOUSE_UP' | 'delay';

export interface MacroStep {
  kind: MacroStepKind;
  /** HID usage (keys) or mouse button bit (1 left, 2 right, 4 middle). */
  code?: number;
  /** Delay in milliseconds, for `delay` steps. */
  ms?: number;
}

export interface Macro {
  id: string;
  name: string;
  steps: MacroStep[];
}

export interface LightingState {
  mode: number;
  color: [number, number, number];
  colorful: boolean;
  brightness: number;
  speed: number;
  direction: number;
}

export interface KeyboardProfile {
  lighting: LightingState;
  perKey: Record<number, [number, number, number]>;
  keymap: Record<number, KeyAction>;
  fnKeymap: Record<number, KeyAction>;
  settings: Record<string, number>;
  barMode?: number;
}

export interface MouseProfile {
  dpiStages: number[];
  dpiActive: number;
  dpiCount: number;
  dpiColors: [number, number, number][];
  /** DPI indicator LED effect: 0 steady, 1 breathing, 2 off. */
  dpiLed: number;
  /** Trailing bytes of the DPI-cycle block, preserved as read from the device. */
  dpiExtra: [number, number];
  polling: number;
  liftOff: number;
  motionSync: boolean;
  angleSnap: boolean;
  ripple: boolean;
  performance: number;
  debounce: number;
  sleep: number;
  receiverLed: number;
  fireKey: { times: number; intervalMs: number };
  buttons: Record<number, KeyAction>;
}

export interface Profile {
  id: string;
  name: string;
  keyboard?: KeyboardProfile;
  mouse?: MouseProfile;
}

export interface DeviceSettingsFile {
  profiles: Profile[];
  activeProfile: string;
  macros: Macro[];
  variant?: string;
  nickname?: string;
  /** default on */
  displayBlackout?: boolean;
  music?: MusicEffect;
  keyAnimation?: KeyAnimation;
  batteries?: BatteryPacks;
}

export interface BatteryPacks { packs: { id: string; name: string }[]; installed: string }

export interface MusicEffect {
  enabled: boolean;
  /** rhythm needs USB */
  kind?: 'rhythm' | 'effect';
  /** also the rhythm's fallback on the receiver */
  mode: number;
  speed: number;
  /** RHYTHM_SCHEMES index */
  scheme?: number;
  /** 10..100 %. */
  amplitude?: number;
  /** BACKGROUNDS index, -1 = off */
  background?: number;
  /** 0..100 %. */
  backgroundBrightness?: number;
}

export interface KeyAnimation {
  enabled: boolean;
  libraryId: string;
  name: string;
  mode: 'cover' | 'fit';
  /** 1 = original speed */
  speed: number;
  /** 10..100 %. */
  brightness: number;
}

// ---- Runtime device state reported by the main process ----

export interface DeviceStatus {
  /** Unique key for this attached device (model id + link). */
  key: string;
  modelId: string;
  link: Link;
  productName: string;
  battery: number | null;
  /** when `battery` was read */
  batteryAt?: number | null;
  charging: boolean;
  firmware?: string;
  /** Live values read back from the device, when the protocol supports reads. */
  live?: Partial<MouseProfile> & { sensor?: string; receiver8k?: boolean; modelCode?: number };
  /** Some collections never answer (e.g. the mouse is asleep). */
  note?: string;
}

export interface LogEntry {
  t: number;
  dir: '→' | '←' | '⇢' | '⇠' | '!' | 'i';
  text: string;
  device?: string;
}

export interface ScreenFrame {
  /** RGB565 little-endian pixels, width*height*2 bytes. */
  pixels: Uint8Array;
  delayMs: number;
}
