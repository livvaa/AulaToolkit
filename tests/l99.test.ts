import { describe, expect, it } from 'vitest';
import { L99_KEYS } from '@shared/models/l99.layout';
import { S75PRO_KEYS } from '@shared/models/s75pro.layout';
import { modelById } from '@shared/models';
import { settingsPayload } from '@shared/protocols/aula04';

describe('L99', () => {
  it('uses the S75 Pro key and LED slots for the keys they share', () => {
    const s75 = new Map(S75PRO_KEYS.map((k) => [k.code, k]));
    const shared = L99_KEYS.filter((k) => s75.has(k.code));
    expect(shared.length).toBe(79);
    for (const k of shared) expect([k.idx, k.light], k.name).toEqual([s75.get(k.code)!.idx, s75.get(k.code)!.light]);
  });
  it('is told apart from the S75 Pro by product name, screen off until its upload is known', () => {
    const l99 = modelById('l99')!, s75 = modelById('s75pro')!;
    expect(new RegExp(l99.productMatch!, 'i').test('AULA L99')).toBe(true);
    expect(new RegExp(s75.productMatch!, 'i').test('AULA L99')).toBe(false);
    expect(l99.features.screen).toBeFalsy();
    expect(l99.features.bar).toBeFalsy();
  });
  it('writes settings like the official driver (captured, issue #2)', () => {
    const l99 = modelById('l99')!;
    const hex = (s: Record<string, number>): string => Buffer.from(settingsPayload(s, l99.settingsBytes).subarray(0, 9)).toString('hex');
    const base = { winLock: 0, altF4: 0, altTab: 0, fnSwitch: 0, sleep: 0, response: 2 };
    expect(hex(base)).toBe('000100000000000002');
    expect(hex({ ...base, sleep: 2 })).toBe('000100000000020002');
    expect(hex({ ...base, sleep: 2, winLock: 1 })).toBe('000100000100020002');
    expect(hex({ ...base, sleep: 2, winLock: 1, altF4: 1 })).toBe('000100010100020002');
    expect(hex({ ...base, sleep: 2, winLock: 1, altF4: 1, altTab: 1 })).toBe('000101010100020002');
  });
});
