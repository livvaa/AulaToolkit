// Battery guesses from our own log. The devices only report whole %, so it's all from when the level
// changes. Readings more than GAP_MS apart = gap (app closed, PC asleep). Charging = device flag, usb
// cable, or the level going up 10+ points (the levels are voltage based and bounce back up to ~5 points
// after resting or unplugging). Health = charge speed now vs the first charges (15-85 % part).
// Ranges are rough.

import type { Link } from './types';

export type BatteryLink = Link;

/** `pct` is null when there is no level (keyboard on USB). */
export interface BatteryObs { t: number; pct: number | null; chg: 0 | 1; link?: BatteryLink; fresh?: 0 | 1; bat?: string }

export interface Estimate { value: number; lo: number; hi: number }

export interface BatteryReport {
  level: { pct: number | null; at: number | null; live: boolean; charging: boolean; estimated: boolean; full: boolean } | null;
  /** % per day (calendar time). */
  drainPerDay: Estimate | null;
  /** Minutes per 1 % while in use on the receiver. */
  minutesPerPct: Estimate | null;
  remainingHours: Estimate | null;
  /** Minutes from empty to full at the measured charge speed. */
  chargeMinutes: Estimate | null;
  /** % of the capacity at the first measured charges. */
  health: Estimate | null;
  cycles: number;
  lastFull: { t: number; approx: boolean } | null;
  tracking: { since: number | null; days: number; observedDays: number };
  progress: { drainSteps: number; drainHours: number; useSteps: number; useHours: number; chargeSessions: number; healthSessions: number };
  points: { t: number; pct: number; gap?: boolean; chg?: boolean }[];
}

export interface LiveState { pct: number | null; at: number | null; link: BatteryLink; charging: boolean; asleep: boolean }

export const GAP_MS = 15 * 60e3; // we log every 10 min, more than this = gap
const BRIDGE_MS = 72 * 3600e3; // longer gaps probably hide a charge
const WINDOW_MS = 30 * 86400e3; // drain uses the last month
const CHARGE_WINDOW_MS = 180 * 86400e3;
const DRAIN_MIN_STEPS = 5, DRAIN_MIN_HOURS = 24;
const REMAIN_MIN_STEPS = 8;
const USE_MIN_STEPS = 5, USE_MIN_HOURS = 3;
const CHARGE_MIN_STEPS = 10;
const HEALTH_SESSIONS = 6, HEALTH_MIN_SPAN = 30 * 86400e3;
const CC_LO = 15, CC_HI = 85; // CC part of the charge
const ASSUME_FULL_AFTER = 3 * 3600e3; // on the cable this long without a known charge speed -> call it full
const RISE_PTS = 10; // a charge without a flag: the level this far above its low
const STALL_MS = 20 * 60e3; // ...and it ends once the level stops rising for this long

const relErr = (steps: number): number => Math.max(0.1, 1.28 / Math.sqrt(Math.max(1, steps)));
const est = (value: number, e: number): Estimate => ({ value, lo: value * (1 - e), hi: value * (1 + e) });
const median = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

interface Run { start: number; top: number; min: number; lastT: number; first?: { t: number; from: number }; lastExactDrop?: { t: number; from: number }; lastWasExactDrop: boolean }
interface Charge { start: number; end: number; from: number | null; to: number | null; readings: [number, number][]; approx: boolean; inferred: boolean; lastRise: number }

/** v1 log (array of {t, pct, charging}) to observations */
export function migrate(raw: unknown): BatteryObs[] {
  const list = Array.isArray(raw) ? raw : (raw as { obs?: unknown[] })?.obs ?? [];
  return (list as Record<string, unknown>[])
    .filter((o) => typeof o?.t === 'number')
    .map((o) => ('chg' in o
      ? o as unknown as BatteryObs
      : { t: o.t as number, pct: typeof o.pct === 'number' ? o.pct : null, chg: o.charging ? 1 : 0 }));
}

export function analyse(input: BatteryObs[], now: number, live: LiveState | null): BatteryReport {
  const sorted = input.filter((o) => o.t <= now + 86400e3).sort((a, b) => a.t - b.t);
  // Windows reports a stale Bluetooth level right after connecting: drop that first reading when the
  // next one, minutes later, already says something else.
  const obs = sorted.filter((o, i) => {
    const prev = sorted[i - 1], next = sorted[i + 1];
    const first = o.link === 'bluetooth' && (!prev || prev.link !== 'bluetooth' || o.t - prev.t > GAP_MS);
    return !(first && next && next.link === 'bluetooth' && next.t - o.t <= GAP_MS && next.pct !== o.pct);
  });
  const known = obs.filter((o) => o.pct !== null) as (BatteryObs & { pct: number })[];
  let q = 0;
  for (let i = 1; i < known.length; i++) q = gcd(q, Math.abs(known[i].pct - known[i - 1].pct));
  q = q || 1;
  const rise = Math.max(RISE_PTS, 4 * q);
  const charging = (o: BatteryObs): boolean => o.chg === 1 || o.link === 'usb';

  const runs: Run[] = [];
  const charges: Charge[] = [];
  let run: Run | null = null;
  let charge: Charge | null = null;
  let lastPct: number | null = null;
  let discharged = 0;
  let observedMs = 0;
  // in use = connected and awake on the receiver
  let useMs = 0, useDrop = 0;
  let useStart: number | null = null, useLevel: number | null = null;
  const endUse = (): void => { if (useStart !== null && useLevel !== null && lastPct !== null) useDrop += Math.max(0, useStart - lastPct); useStart = null; useLevel = null; };

  const closeRun = (): void => { if (run) { runs.push(run); discharged += run.top - run.min; run = null; } };

  for (let i = 0; i < obs.length; i++) {
    const o = obs[i], prev = obs[i - 1];
    const gap = !!prev && (o.t - prev.t > GAP_MS || (!!o.link && !!prev.link && o.link !== prev.link));
    if (prev && !gap) observedMs += o.t - prev.t;
    const flagged = charging(o);
    const risen = !flagged && run !== null && o.pct !== null && o.pct >= run.min + rise;
    // an inferred charge lasts while the level keeps rising (or holds, briefly)
    const peak = charge?.readings.length ? Math.max(...charge.readings.map((r) => r[1])) : null;
    const stillRising = !flagged && !!charge?.inferred && o.pct !== null && peak !== null
      && (o.pct > peak || (o.pct === peak && o.t - charge.lastRise <= STALL_MS));

    if (flagged || risen || stillRising) {
      endUse();
      const before: number | null = run ? run.min : lastPct;
      closeRun();
      if (!charge) {
        charge = { start: gap || risen ? (prev?.t ?? o.t) : o.t, end: o.t, from: before, to: null, readings: [], approx: gap || risen, inferred: risen, lastRise: o.t };
        if (risen && prev?.pct != null) charge.readings.push([prev.t, prev.pct]);
      }
      if (flagged) charge.inferred = false;
      if (o.pct !== null && (peak === null || o.pct > peak)) charge.lastRise = o.t;
      charge.end = o.t;
      if (o.pct !== null) charge.readings.push([o.t, o.pct]);
      lastPct = o.pct ?? lastPct;
      continue;
    } else if (charge) {
      // off the charger
      charge.to = charge.inferred && peak !== null ? peak : o.pct ?? (charge.readings.length ? charge.readings[charge.readings.length - 1][1] : null);
      if (gap) charge.approx = true;
      charges.push(charge);
      charge = null;
    }
    if (o.pct === null) continue;

    if (!run || (gap && prev && o.t - prev.t > BRIDGE_MS)) {
      if (run && o.pct < run.min) discharged += run.min - o.pct; // drop across the long gap
      closeRun();
      run = { start: o.t, top: o.pct, min: o.pct, lastT: o.t, lastWasExactDrop: false };
      endUse();
    } else {
      run.lastWasExactDrop = false;
      if (o.pct < run.min) {
        if (!gap) {
          run.lastExactDrop = { t: o.t, from: run.min };
          run.lastWasExactDrop = true;
          if (run.first === undefined && run.min === run.top) run.first = { t: o.t, from: run.min };
        }
        run.min = o.pct;
      }
      run.lastT = o.t;
    }
    const wireless = (x: BatteryObs): boolean => x.link !== 'usb';
    if (prev && !gap && prev.pct !== null && wireless(o) && wireless(prev) && !(prev.fresh === 0 && o.fresh === 0)) {
      useStart ??= prev.pct;
      useLevel = o.pct;
      useMs += o.t - prev.t;
    } else endUse();
    lastPct = o.pct;
  }
  endUse();
  const openRun = run as Run | null;
  if (openRun) discharged += openRun.top - openRun.min;

  // drain per day (last month)
  let span = 0, drop = 0;
  for (const r of [...runs, ...(openRun ? [openRun] : [])]) {
    if (r.lastT < now - WINDOW_MS) continue;
    const a = r.first ?? { t: r.start, from: r.top + q / 2 };
    const b = r.lastWasExactDrop && r.lastExactDrop ? r.lastExactDrop : { t: r.lastT, from: r.min + q / 2 };
    if (b.t <= a.t) continue;
    span += b.t - a.t;
    drop += Math.max(0, a.from - b.from);
  }
  const drainSteps = drop / q, drainHours = span / 3600e3;
  const ratePerHour = drainHours > 0 ? drop / drainHours : 0;
  const drainPerDay = drainSteps >= DRAIN_MIN_STEPS && drainHours >= DRAIN_MIN_HOURS && ratePerHour > 0 ? est(ratePerHour * 24, relErr(drainSteps)) : null;

  // time per 1 % in use
  const useSteps = useDrop / q, useHours = useMs / 3600e3;
  const minutesPerPct = useSteps >= USE_MIN_STEPS && useHours >= USE_MIN_HOURS && useDrop > 0
    ? (() => { const v = useMs / 60e3 / useDrop, e = relErr(useSteps); return { value: v, lo: v / (1 + e), hi: v / (1 - Math.min(e, 0.9)) }; })()
    : null;

  // charge speed, health
  const recentCharges = charges.filter((c) => c.end >= now - CHARGE_WINDOW_MS);
  const speeds: { t: number; pct: number; ms: number }[] = [];
  for (const c of charges) {
    const inBand = c.readings.filter(([, p]) => p >= CC_LO && p <= CC_HI);
    if (inBand.length >= 2 && inBand[inBand.length - 1][1] > inBand[0][1]) {
      speeds.push({ t: c.start, pct: inBand[inBand.length - 1][1] - inBand[0][1], ms: inBand[inBand.length - 1][0] - inBand[0][0] });
    } else if (c.from !== null && c.to !== null && c.to > c.from && c.to < 100 - q && c.end - c.start >= 30 * 60e3) {
      // only start and end known (keyboard on USB), fine if it didn't reach 100
      speeds.push({ t: c.start, pct: c.to - c.from, ms: c.end - c.start });
    }
  }
  const recentSpeeds = speeds.filter((s) => s.t >= now - CHARGE_WINDOW_MS);
  const chargedSteps = recentSpeeds.reduce((n, s) => n + s.pct, 0) / q;
  const chargeRate = recentSpeeds.reduce((n, s) => n + s.pct, 0) / Math.max(1, recentSpeeds.reduce((n, s) => n + s.ms, 0)) * 3600e3; // %/h
  const chargeMinutes = chargedSteps >= CHARGE_MIN_STEPS && chargeRate > 0 ? est((100 / chargeRate) * 60, relErr(chargedSteps)) : null;

  const healthSamples = speeds.filter((s) => s.pct >= 10 * q && (s.ms / s.pct) > 0).map((s) => ({ t: s.t, minPerPct: s.ms / 60e3 / s.pct }));
  let health: Estimate | null = null;
  if (healthSamples.length >= HEALTH_SESSIONS && healthSamples[healthSamples.length - 1].t - healthSamples[0].t >= HEALTH_MIN_SPAN) {
    const base = median(healthSamples.slice(0, 3).map((x) => x.minPerPct));
    const nowM = median(healthSamples.slice(-3).map((x) => x.minPerPct));
    const v = Math.max(30, Math.min(110, (nowM / base) * 100));
    const spread = Math.max(...healthSamples.map((x) => x.minPerPct)) / Math.min(...healthSamples.map((x) => x.minPerPct));
    const e = Math.min(0.3, Math.max(0.05, (spread - 1) / 4));
    health = est(v, e);
  }

  // cycles, last full
  const charged = charges.reduce((n, c) => n + (c.from !== null && c.to !== null ? Math.max(0, c.to - c.from) : 0), 0);
  const cycles = Math.max(discharged, charged) / 100;
  let lastFull: BatteryReport['lastFull'] = null;
  for (const c of [...charges, ...(charge ? [charge] : [])]) {
    const r = c.readings.find(([, p]) => p >= 100 - q);
    if (r) lastFull = { t: r[0], approx: false };
    else if (c.to !== null && c.to >= 100 - q) lastFull = { t: c.end, approx: true };
  }
  for (const o of obs) if (o.pct !== null && o.pct >= 100 - q && (!lastFull || o.t > lastFull.t) && charging(o)) lastFull = { t: o.t, approx: false };

  // level now
  const lastKnown = known[known.length - 1];
  let level: BatteryReport['level'] = lastKnown ? { pct: lastKnown.pct, at: lastKnown.t, live: false, charging: charging(lastKnown), estimated: false, full: false } : null;
  const onCharger = live ? live.charging || live.link === 'usb' : false;
  if (live && live.pct !== null && !live.asleep) level = { pct: live.pct, at: live.at ?? now, live: true, charging: onCharger, estimated: false, full: onCharger && live.pct >= 100 - q };
  else if (live && onCharger) {
    // on the cable without a reading: estimate from the charge speed
    const since = charge?.start ?? now;
    const from = charge?.from ?? lastPct;
    const hours = (now - since) / 3600e3;
    const guess = from !== null && chargeRate > 0 && chargedSteps >= CHARGE_MIN_STEPS ? Math.min(100, from + chargeRate * hours) : null;
    const full = guess !== null ? guess >= 100 - q : now - since >= ASSUME_FULL_AFTER;
    level = { pct: guess !== null ? Math.floor(guess) : null, at: now, live: true, charging: true, estimated: true, full };
  } else if (live && level) level = { ...level, live: true }; // asleep: last reading
  // still charging by the last readings: a flagged charge, or one seen rising within STALL_MS
  if (level && charge && !level.charging && (!charge.inferred || now - charge.lastRise <= STALL_MS)) level = { ...level, charging: true };

  let remainingHours: Estimate | null = null;
  if (drainPerDay && drainSteps >= REMAIN_MIN_STEPS && level && level.pct !== null && !level.charging) {
    const r = drainPerDay.value / 24;
    const mid = level.pct + q / 2; // middle of the % step
    const age = (now - (level.at ?? now)) / 3600e3;
    const e = relErr(drainSteps);
    remainingHours = { value: Math.max(0, mid / r - age), lo: Math.max(0, mid / (r * (1 + e)) - age), hi: Math.max(0, mid / (r * (1 - Math.min(e, 0.9))) - age) };
  }

  // chart points
  const points: BatteryReport['points'] = [];
  let prevT = 0;
  for (const o of known) {
    if (o.t < now - WINDOW_MS) { prevT = o.t; continue; }
    const p = { t: o.t, pct: o.pct, ...(prevT && o.t - prevT > GAP_MS ? { gap: true } : {}), ...(charging(o) ? { chg: true } : {}) };
    const last = points[points.length - 1];
    // drop repeated levels
    if (last && last.pct === p.pct && !p.gap && !p.chg && points.length > 1 && points[points.length - 2].pct === p.pct) points[points.length - 1] = p;
    else points.push(p);
    prevT = o.t;
  }

  const since = obs[0]?.t ?? null;
  return {
    level,
    drainPerDay,
    minutesPerPct,
    remainingHours,
    chargeMinutes,
    health,
    cycles: Math.round(cycles * 100) / 100,
    lastFull,
    tracking: { since, days: since ? (now - since) / 86400e3 : 0, observedDays: observedMs / 86400e3 },
    progress: { drainSteps: Math.round(drainSteps * 10) / 10, drainHours: Math.round(drainHours), useSteps: Math.round(useSteps * 10) / 10, useHours: Math.round(useHours * 10) / 10, chargeSessions: recentCharges.length, healthSessions: healthSamples.length },
    points,
  };
}
