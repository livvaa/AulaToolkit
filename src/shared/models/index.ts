import type { DeviceModel } from '../types';
import { S75PRO } from './s75pro';
import { SC900 } from './sc900';
import { F75 } from './f75';
import { L99 } from './l99';

export const MODELS: DeviceModel[] = [S75PRO, L99, SC900, F75];

export const modelById = (id: string): DeviceModel | undefined => MODELS.find((m) => m.id === id);

export const modelForIds = (vendorId: number, productId: number): DeviceModel | undefined =>
  MODELS.find((m) => m.usb.some((u) => u.vendorId === vendorId && u.productId === productId));
