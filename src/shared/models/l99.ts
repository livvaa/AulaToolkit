import type { DeviceModel } from '../types';
import { L99_KEYS } from './l99.layout';
import { S75PRO } from './s75pro';

/**
 * AULA L99, from the vendor driver (AULA L99 Driver 1.0.0.7). Same firmware family and USB ids as the
 * S75 Pro (0C45:800A, dongle 05AC:024F), told apart by the product name "AULA L99" over USB.
 * The 3.5" screen (320×480, 200 frames) has save targets the S75 Pro lacks (GIF, background, photo
 * frame), so it stays off until its upload is captured. Side bar and knob tracking: not checked yet.
 */
export const L99: DeviceModel = {
  ...S75PRO,
  id: 'l99',
  name: 'L99',
  productMatch: 'L99',
  usb: S75PRO.usb.filter((u) => !(u.vendorId === 0x0c45 && u.productId === 0xfefe)),
  image: 'l99-top',
  gallery: ['l99-top'],
  topImage: { id: 'l99-top', width: 800, height: 300 },
  tagline: 'Tri-mode keyboard with a 3.5" screen',
  verified: false,
  specs: [
    { label: 'Layout', value: '84 keys' },
    { label: 'Connectivity', value: 'USB-C · 2.4 GHz · Bluetooth' },
    { label: 'Screen', value: '320×480' },
    { label: 'Lighting', value: 'Per-key RGB · 19 effects' },
  ],
  features: { lighting: true, perkey: true, keymap: true, fnLayer: true, macros: true, settings: true, battery: true, clock: true },
  layout: L99_KEYS,
  bluetoothName: 'L99',
  // from a USB capture of the official driver (issue #2): Alt+Tab and the Windows key swap places
  settingsBytes: { winLock: 4, altF4: 3, altTab: 2 },
  barModes: undefined,
  screen: { width: 320, height: 480, headLength: 256, maxFrames: 200, chunk: 4096 },
};
