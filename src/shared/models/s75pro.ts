import type { DeviceModel } from '../types';
import { S75PRO_KEYS } from './s75pro.layout';

/**
 * AULA S75 Pro — 75% tri-mode keyboard with a 1.14" TFT screen and a knob.
 * USB ids come from the vendor driver's config.xml (S75Pro Driver 1.0.0.1):
 *   USB   0C45:800A, protocol on MI_00 (64-byte feature reports)
 *   2.4G  0C45:FEFE, protocol on MI_03 (32-byte output/input reports)
 * Some dongle revisions enumerate as 05AC:024F instead.
 */
export const S75PRO: DeviceModel = {
  id: 's75pro',
  name: 'S75 Pro',
  brand: 'AULA',
  kind: 'keyboard',
  protocol: 'aula04',
  usb: [
    { vendorId: 0x0c45, productId: 0x800a, role: 'usb', iface: 0 },
    { vendorId: 0x0c45, productId: 0xfefe, role: 'dongle', iface: 3 },
    { vendorId: 0x05ac, productId: 0x024f, role: 'dongle', iface: 3 },
  ],
  image: 's75pro',
  gallery: ['s75pro', 's75pro-2'],
  topImage: { id: 's75pro-top', width: 800, height: 300 },
  tagline: '75% gasket-mount keyboard with TFT screen and multifunction knob',
  verified: true,
  specs: [
    { label: 'Layout', value: '75% · 80 keys' },
    { label: 'Connectivity', value: 'USB-C · 2.4 GHz · Bluetooth 5.0' },
    { label: 'Screen', value: '1.14" TFT 135×240' },
    { label: 'Battery', value: '4000 mAh' },
    { label: 'Switches', value: 'Hot-swappable 3/5-pin' },
    { label: 'Lighting', value: 'Per-key RGB · 19 effects' },
  ],
  features: { lighting: true, perkey: true, keymap: true, fnLayer: true, macros: true, screen: true, settings: true, bar: true, battery: true, clock: true, displayBlackout: true },
  layout: S75PRO_KEYS,
  lightRange: { brightness: 5, speed: 5 },
  lightModes: [
    { mode: 1, name: 'Static', caps: 0x31 }, { mode: 2, name: 'Single On', caps: 0x33 },
    { mode: 3, name: 'Single Off', caps: 0x33 }, { mode: 4, name: 'Glittering', caps: 0x33 },
    { mode: 5, name: 'Fluttering', caps: 0x33 }, { mode: 6, name: 'Colourful', caps: 0x03 },
    { mode: 7, name: 'Breath', caps: 0x33 }, { mode: 8, name: 'Spectrum', caps: 0x03 },
    { mode: 9, name: 'Outward', caps: 0x33 }, { mode: 10, name: 'Scrolling', caps: 0x3b },
    { mode: 11, name: 'Rolling', caps: 0x37 }, { mode: 12, name: 'Rotating', caps: 0x37 },
    { mode: 13, name: 'Explode', caps: 0x33 }, { mode: 14, name: 'Launch', caps: 0x33 },
    { mode: 15, name: 'Ripples', caps: 0x33 }, { mode: 16, name: 'Flowing', caps: 0x37 },
    { mode: 17, name: 'Pulsating', caps: 0x33 }, { mode: 18, name: 'Tilt', caps: 0x37 },
    { mode: 19, name: 'Shuttle', caps: 0x33 }, { mode: 0, name: 'Off', caps: 0x00 },
  ],
  bluetoothName: 'S75',
  productMatch: 'S75',
  barModes: [
    { mode: 0x20, name: 'Flowing' }, { mode: 0x21, name: 'Red' }, { mode: 0x22, name: 'Blue' },
    { mode: 0x23, name: 'Neon' }, { mode: 0x24, name: 'Off' },
  ],
  settings: [
    { key: 'winLock', label: 'Disable Windows key', type: 'check', default: 0 },
    { key: 'altF4', label: 'Disable Alt + F4', type: 'check', default: 0 },
    { key: 'altTab', label: 'Disable Alt + Tab', type: 'check', default: 0 },
    { key: 'fnSwitch', label: 'Fn layer switch', type: 'select', options: [[0, 'Momentary'], [1, 'Toggle']], default: 0 },
    { key: 'sleep', label: 'Sleep after', type: 'select', options: [[0, 'Never'], [1, '1 min'], [2, '5 min'], [3, '30 min']], default: 0 },
    { key: 'response', label: 'Key response (debounce)', type: 'select', options: [[1, 'Fastest'], [2, '2'], [3, '3'], [4, '4'], [5, 'Safest']], default: 1 },
  ],
  screen: { width: 135, height: 240, headLength: 256, maxFrames: 141, chunk: 4096 },
};
