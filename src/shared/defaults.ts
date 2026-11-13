import type { DeviceModel, KeyboardProfile, MouseProfile, Profile } from './types';

export const defaultKeyboardProfile = (m: DeviceModel): KeyboardProfile => ({
  lighting: { mode: 11, color: [255, 90, 31], colorful: true, brightness: m.lightRange?.brightness ?? 5, speed: 3, direction: 0 },
  perKey: {},
  keymap: {},
  fnKeymap: {},
  settings: Object.fromEntries((m.settings ?? []).map((s) => [s.key, s.default])),
  barMode: 0x20,
});

export const defaultMouseProfile = (m: DeviceModel): MouseProfile => ({
  dpiStages: m.dpi?.defaults ?? [400, 800, 1600, 2400, 3200, 6400],
  dpiActive: 2,
  dpiCount: m.dpi?.stages ?? 6,
  dpiColors: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]],
  dpiLed: 0,
  dpiExtra: [1, 1],
  polling: 1000,
  liftOff: 10,
  motionSync: true,
  angleSnap: false,
  ripple: false,
  performance: 2,
  debounce: 8,
  sleep: 300,
  receiverLed: 0,
  fireKey: { times: 3, intervalMs: 10 },
  buttons: {},
  ...(m.settings ? { settings: Object.fromEntries(m.settings.map((s) => [s.key, s.default])) } : {}),
});

export const newProfile = (m: DeviceModel, name: string): Profile => ({
  id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  name,
  keyboard: m.kind === 'keyboard' ? defaultKeyboardProfile(m) : undefined,
  mouse: m.kind === 'mouse' ? defaultMouseProfile(m) : undefined,
});
