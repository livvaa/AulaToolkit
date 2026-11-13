import type { DeviceModel } from '../types';
import { RATES } from '../protocols/yxt';

const rateOptions: [number, string][] = RATES.map((r, i) => [i, `${r} Hz`]);

/**
 * AULA SC390: tri-mode mouse with a small display (PAW3311). USB 32C2:0024, dongle 32C2:0027.
 * Settings from a USB capture of the official driver (issue #4); the driver sets it up over the cable only.
 * DPI, buttons and sleep times are not in that capture yet.
 */
export const SC390: DeviceModel = {
  id: 'sc390',
  name: 'SC390',
  brand: 'AULA',
  kind: 'mouse',
  protocol: 'yxt',
  usb: [{ vendorId: 0x32c2, productId: 0x0024, role: 'usb', iface: 2 }],
  image: 'sc390',
  gallery: ['sc390', 'sc390-2'],
  variants: [
    { id: 'black', name: 'Black', image: 'sc390', swatch: '#1b1b1f' },
    { id: 'white', name: 'White', image: 'sc390-2', swatch: '#f2f2f2' },
  ],
  tagline: 'Tri-mode gaming mouse with a built-in display',
  verified: false,
  specs: [
    { label: 'Sensor', value: 'PixArt PAW3311' },
    { label: 'DPI', value: '1200 – 20 000' },
    { label: 'Polling', value: 'Up to 1000 Hz' },
    { label: 'Connectivity', value: 'USB-C · 2.4 GHz · Bluetooth' },
    { label: 'Battery', value: '400 mAh' },
  ],
  features: { settings: true },
  bluetoothName: 'SC390',
  settings: [
    { key: 'usbRate', label: 'USB polling rate', type: 'select', options: rateOptions, default: 3 },
    { key: 'dongleRate', label: '2.4 GHz polling rate', type: 'select', options: rateOptions, default: 3 },
    { key: 'lod', label: 'Lift-off distance', type: 'select', options: [[0, '1 mm'], [1, '2 mm'], [2, '3 mm'], [3, '4 mm']], default: 1 },
    { key: 'ultraLowDelay', label: 'Ultra low delay', type: 'check', default: 0 },
    { key: 'ultraLowPower', label: 'Ultra low power', type: 'check', default: 0 },
    { key: 'ripple', label: 'Ripple control', type: 'check', default: 0 },
    { key: 'moveWakeup', label: 'Wake up on movement', type: 'check', default: 0 },
  ],
};
