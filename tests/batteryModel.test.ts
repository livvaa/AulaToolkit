import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyse, migrate, type BatteryObs } from '@shared/batteryModel';

const H = 3600e3, D = 24 * H;

describe('real SC900 Pro log, 23-28 Oct (80 -> 58 %)', () => {
  // the old card said 179.5 %/day and 8 h left for this log (it timed each step by the sampling interval)
  const obs = migrate(JSON.parse(readFileSync(join(__dirname, 'fixtures', 'sc900-battery-v1.json'), 'utf8')));
  const now = Date.parse('2026-10-28T23:45:00Z');
  const r = analyse(obs, now, null);

  it('drain ~4 %/day', () => {
    expect(r.drainPerDay!.value).toBeGreaterThan(3.5);
    expect(r.drainPerDay!.value).toBeLessThan(4.5);
    expect(r.drainPerDay!.lo).toBeLessThan(r.drainPerDay!.value);
  });
  it('about two weeks left', () => {
    expect(r.remainingHours!.value / 24).toBeGreaterThan(11);
    expect(r.remainingHours!.value / 24).toBeLessThan(17);
    expect(r.remainingHours!.hi).toBeGreaterThan(r.remainingHours!.value);
  });
  it('cycles count the drop across gaps too', () => {
    expect(r.cycles).toBeCloseTo(0.22, 2);
  });
  it('last reading when not connected', () => {
    expect(r.level).toMatchObject({ pct: 58, live: false, charging: false });
    expect(r.lastFull).toBeNull();
    expect(r.health).toBeNull();
  });
});

describe('charging', () => {
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  // keyboard on the receiver 80 -> 40 over 4 days, then 2 h on the cable (no level), then back at 100
  const keyboard: BatteryObs[] = [];
  for (let m = 0; m <= 4 * 24 * 60; m += 10) keyboard.push({ t: t0 + m * 60e3, pct: 80 - Math.floor(m / (4 * 24 * 60) * 40), chg: 0, link: '2.4g', fresh: 1 });
  const plug = t0 + 4 * D + 10 * 60e3;
  for (let m = 0; m <= 120; m += 10) keyboard.push({ t: plug + m * 60e3, pct: null, chg: 1, link: 'usb' });
  const unplug = plug + 2 * H + 5 * 60e3;
  keyboard.push({ t: unplug, pct: 100, chg: 0, link: '2.4g', fresh: 1 });

  it('cable charge', () => {
    const r = analyse(keyboard, unplug + 60e3, { pct: 100, at: unplug, link: '2.4g', charging: false, asleep: false });
    expect(r.lastFull).toMatchObject({ approx: true });
    expect(r.lastFull!.t).toBeLessThanOrEqual(unplug);
    expect(r.cycles).toBeCloseTo(0.6, 2); // 60 % charged > 40 % discharged seen
    expect(r.level).toMatchObject({ pct: 100, live: true, charging: false });
  });

  it('99+ after charging long enough on the cable', () => {
    const onCable = keyboard.filter((o) => o.t <= plug + 120 * 60e3);
    const early = analyse(onCable.filter((o) => o.t <= plug + 30 * 60e3), plug + 30 * 60e3, { pct: null, at: null, link: 'usb', charging: true, asleep: false });
    expect(early.level).toMatchObject({ charging: true, estimated: true, full: false });
    const late = analyse([...onCable, { t: plug + 3.5 * H, pct: null, chg: 1, link: 'usb' }], plug + 3.5 * H, { pct: null, at: null, link: 'usb', charging: true, asleep: false });
    expect(late.level).toMatchObject({ charging: true, full: true });
    expect(late.remainingHours).toBeNull();
  });

  it('charge from a phone charger while on the receiver', () => {
    // 40 %, then +1 % every 2 min up to 100 (no charging flag), then draining again
    const obs: BatteryObs[] = [];
    let t = t0;
    for (let i = 0; i < 6; i++) { obs.push({ t, pct: 40, chg: 0, link: '2.4g', fresh: 1 }); t += 10 * 60e3; }
    for (let p = 41; p <= 100; p++) { obs.push({ t, pct: p, chg: 0, link: '2.4g', fresh: 1 }); t += 2 * 60e3; }
    for (let i = 0; i < 6; i++) { obs.push({ t, pct: 100, chg: 0, link: '2.4g', fresh: 1 }); t += 10 * 60e3; }
    obs.push({ t, pct: 99, chg: 0, link: '2.4g', fresh: 1 });
    const r = analyse(obs, t + 60e3, null);
    expect(r.cycles).toBeCloseTo(0.6, 2); // one charge of 60 %, not many small ones
    expect(r.lastFull).toMatchObject({ approx: false });
    // 30 %/h -> ~200 min
    expect(r.chargeMinutes!.value).toBeGreaterThan(180);
    expect(r.chargeMinutes!.value).toBeLessThan(220);
  });

  it('rising level counts as charging (bluetooth)', () => {
    const obs: BatteryObs[] = [];
    let t = t0;
    for (let i = 0; i < 6; i++) { obs.push({ t, pct: 40, chg: 0, link: 'bluetooth', fresh: 1 }); t += 10 * 60e3; }
    for (let p = 41; p <= 70; p++) { obs.push({ t, pct: p, chg: 0, link: 'bluetooth', fresh: 1 }); t += 2 * 60e3; }
    const r = analyse(obs, t, { pct: 70, at: t, link: 'bluetooth', charging: false, asleep: false });
    expect(r.level).toMatchObject({ pct: 70, live: true, charging: true });
  });

  it('charge speed, mouse on the cable', () => {
    const mouse: BatteryObs[] = [];
    for (let m = 0; m <= 120; m += 10) mouse.push({ t: t0 + m * 60e3, pct: Math.min(100, 20 + Math.round(m * 40 / 60)), chg: 1, link: 'usb' });
    mouse.push({ t: t0 + 130 * 60e3, pct: 100, chg: 0, link: '2.4g', fresh: 1 });
    const r = analyse(mouse, t0 + 131 * 60e3, null);
    // 40 %/h -> 150 min
    expect(r.chargeMinutes!.value).toBeGreaterThan(140);
    expect(r.chargeMinutes!.value).toBeLessThan(160);
    expect(r.lastFull).toMatchObject({ approx: false });
  });
});

describe('time per 1 % in use', () => {
  it('only counts awake time on the receiver', () => {
    const t0 = Date.parse('2026-02-01T00:00:00Z');
    const obs: BatteryObs[] = [];
    // 10 h of use at 1 %/h
    for (let m = 0; m <= 600; m += 10) obs.push({ t: t0 + m * 60e3, pct: 90 - Math.floor(m / 60), chg: 0, link: '2.4g', fresh: 1 });
    // then 6 h asleep, shouldn't count
    for (let m = 610; m <= 970; m += 10) obs.push({ t: t0 + m * 60e3, pct: 80, chg: 0, link: '2.4g', fresh: 0 });
    const r = analyse(obs, t0 + 980 * 60e3, null);
    expect(r.minutesPerPct!.value).toBeGreaterThan(55);
    expect(r.minutesPerPct!.value).toBeLessThan(65);
  });
});

describe('health from charge speed', () => {
  it('drops when it charges faster', () => {
    const obs: BatteryObs[] = [];
    let t = Date.parse('2026-01-01T00:00:00Z');
    for (let s = 0; s < 6; s++) {
      const minPerPct = s < 3 ? 1.5 : 1.2;
      for (let p = 20; p <= 80; p += 5) { obs.push({ t, pct: p, chg: 1, link: 'usb' }); t += 5 * minPerPct * 60e3; }
      obs.push({ t, pct: 80, chg: 0, link: '2.4g', fresh: 1 });
      t += 12 * D;
      obs.push({ t, pct: 20, chg: 0, link: '2.4g', fresh: 1 });
    }
    const r = analyse(obs, t + H, null);
    expect(r.health!.value).toBeCloseTo(80, 0);
    expect(r.progress.healthSessions).toBe(6);
  });
});

describe('voltage bounce is not a charge (real logs, 6 Nov)', () => {
  // The mouse on Bluetooth goes 57 <-> 62 at rest, the keyboard climbs a few points after resting or
  // unplugging. Neither was charging, but both showed "charging" and a charge time of days.
  for (const [f, link] of [['sc900', 'bluetooth'], ['s75pro', '2.4g']] as const) {
    it(f, () => {
      const obs = migrate(JSON.parse(readFileSync(join(__dirname, 'fixtures', `${f}-battery-v2.json`), 'utf8')));
      const last = obs.filter((o) => o.pct !== null).at(-1)!;
      const r = analyse(obs, obs.at(-1)!.t + 60e3, { pct: last.pct, at: last.t, link, charging: false, asleep: false });
      expect(r.level?.charging).toBe(false);
      if (r.chargeMinutes) expect(r.chargeMinutes.value).toBeLessThan(12 * 60);
    });
  }
});
