import type { DeviceModel } from '../types';
import { F75_KEYS } from './f75.layout';

/**
 * AULA F75 — 75% gasket keyboard on the SinoWealth BYCOMBO4 platform.
 * All models of this family share USB 258A:010C; the firmware's 6-byte "password" tells them apart
 * (F75 3-mode: 03 00 00 00 00 CD, F75 wired: 03 00 00 00 00 E1). The official driver (KB.ini VID_Wireless /
 * PID_Wireless) drives the 2.4 GHz dongle 3554:FA09 with the same CDevG5KB code, so the same commands.
 */
export const F75: DeviceModel = {
  id: 'f75',
  name: 'F75',
  brand: 'AULA',
  kind: 'keyboard',
  protocol: 'g5kb',
  usb: [
    { vendorId: 0x258a, productId: 0x010c, role: 'usb', usagePage: 0xff00 },
    { vendorId: 0x3554, productId: 0xfa09, role: 'dongle', usagePage: 0xff00 },
  ],
  image: 'f75',
  topImage: { id: 'f75-top', width: 679, height: 284 },
  tagline: '75% gasket-mount keyboard with a volume knob and 18 lighting effects',
  specs: [
    { label: 'Layout', value: '75% · 80 keys + knob' },
    { label: 'Connectivity', value: 'USB-C · 2.4 GHz · Bluetooth 5.0' },
    { label: 'Battery', value: '4000 mAh' },
    { label: 'Switches', value: 'Hot-swappable 3/5-pin' },
    { label: 'Lighting', value: 'RGB · 18 effects' },
  ],
  features: { lighting: true, keymap: true, fnLayer: true, macros: true, settings: true },
  layout: F75_KEYS,
  lightRange: { brightness: 9, speed: 4 },
  // mode = UI index, hw = value written to the firmware (from the vendor KB.ini LedOpt table).
  lightModes: [
    { mode: 1, name: 'Fixed on', caps: 0x31, hw: 1 }, { mode: 2, name: 'Respire', caps: 0x33, hw: 3 },
    { mode: 3, name: 'Rainbow', caps: 0x03, hw: 2 }, { mode: 4, name: 'Flash away', caps: 0x33, hw: 19 },
    { mode: 5, name: 'Raindrops', caps: 0x33, hw: 15 }, { mode: 6, name: 'Rainbow wheel', caps: 0x33, hw: 13 },
    { mode: 7, name: 'Ripples shining', caps: 0x33, hw: 20 }, { mode: 8, name: 'Stars twinkle', caps: 0x33, hw: 16 },
    { mode: 9, name: 'Shadow disappear', caps: 0x33, hw: 18 }, { mode: 10, name: 'Retro snake', caps: 0x33, hw: 5 },
    { mode: 11, name: 'Neon stream', caps: 0x33, hw: 7 }, { mode: 12, name: 'Reaction', caps: 0x33, hw: 17 },
    { mode: 13, name: 'Sine wave', caps: 0x33, hw: 12 }, { mode: 14, name: 'Retinue scanning', caps: 0x33, hw: 8 },
    { mode: 15, name: 'Rotating windmill', caps: 0x03, hw: 28 }, { mode: 16, name: 'Colorful waterfall', caps: 0x03, hw: 30 },
    { mode: 17, name: 'Blossoming', caps: 0x03, hw: 14 }, { mode: 18, name: 'Rotating storm', caps: 0x33, hw: 29 },
    { mode: 0, name: 'Off', caps: 0x00, hw: 0 },
  ],
  settings: [
    { key: 'sleep', label: 'Sleep after (wireless)', type: 'select', default: 10, options: [[0, 'Never'], [2, '1 min'], [3, '1.5 min'], [4, '2 min'], [6, '3 min'], [8, '4 min'], [10, '5 min'], [20, '10 min'], [30, '15 min'], [40, '20 min']] },
    { key: 'debounce', label: 'Debounce', type: 'select', default: 1, options: [[1, '1'], [2, '2'], [3, '3'], [4, '4']] },
  ],
};
