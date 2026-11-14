import { useEffect, useState, type MouseEvent } from 'react';
import { AlertTriangle, BatteryCharging } from 'lucide-react';
import type { BatteryStats } from '@shared/ipc';
import type { Estimate } from '@shared/batteryModel';
import { modelById } from '@shared/models';
import { useStore, useT } from '../store';
import { packsOf } from '../batteryPacks';
import { Card, Segmented } from './ui';

// Compact layout: the stats sit on the left and the level chart on the right, so the card stays short
// enough for the device overview to fit the fixed window without scrolling.
export const BatteryCard = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const dev = useStore((s) => s.deviceFor(modelId));
  const lang = useStore((s) => s.prefs.language);
  const locale = ({ pt: 'pt-BR', zh: 'zh-CN', uk: 'uk-UA' } as Record<string, string>)[lang] ?? lang;
  const packs = packsOf(modelById(modelId), useStore((s) => s.settings[modelId]));
  const [viewPack, setViewPack] = useState<string | undefined>(undefined);
  const pack = packs ? viewPack && packs.packs.some((p) => p.id === viewPack) ? viewPack : packs.installed : undefined;
  const [st, setSt] = useState<BatteryStats | null>(null);
  /** Chart: last 24 hours, last 10 days or the whole log (30 days), and what the mouse is on. */
  const [view, setView] = useState<'day' | 'days' | 'all' | null>(null);
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  /** 30-day line: 0..1 across the chart. */
  const [hoverAt, setHoverAt] = useState<number | null>(null);
  const load = (): void => { void window.aula.batteryStats(modelId, pack).then(setSt); };
  useEffect(() => { load(); const i = setInterval(load, 60e3); return () => clearInterval(i); }, [modelId, pack, dev?.battery, dev?.charging, dev?.link]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return null;

  const num = (v: number, digits = 1): string => v.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (v: number, digits = 0): string => (v / 100).toLocaleString(locale, { style: 'percent', maximumFractionDigits: digits });
  const dur = (minutes: number): string => {
    if (minutes >= 48 * 60) return `${num(minutes / 1440, 0)} ${t('days')}`;
    const total = Math.max(1, Math.round(minutes)); // round first, so 59.6 min is 1 h, not "60 min"
    if (total >= 60) { const h = Math.floor(total / 60), m = total % 60; return m ? `${h} ${t('hours')} ${m} ${t('min')}` : `${h} ${t('hours')}`; }
    return `${total} ${t('min')}`;
  };
  const range = (e: Estimate, f: (v: number) => string): string => `${f(e.lo)} – ${f(e.hi)}`;
  const collecting = t('batteryCollecting');

  const lv = st.level;
  const age = lv?.at ? Date.now() - lv.at : 0;
  const level = !lv ? '—'
    : lv.charging && lv.full ? `${pct(99)}+`
    : lv.pct === null ? '—'
    : lv.estimated ? `~${pct(lv.pct)}` : pct(lv.pct);
  const levelNote = lv?.charging ? t('batteryCharging') : lv && (!lv.live || age > 15 * 60e3) && lv.at ? t('batteryAgo').replace('{t}', dur(age / 60e3)) : undefined;

  const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
    <div className="flex flex-col min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted truncate" title={label}>{label}</dt>
      <dd className="text-[15px] font-semibold leading-tight truncate" title={value}>{value}</dd>
      {note && <dd className="text-[11px] text-muted truncate" title={note}>{note}</dd>}
    </div>
  );

  // Like the battery screen on iPhone and Mac: the last 24 hours as the average level of each
  // 15-minute slot (charging in green), the last 10 days as the share of the battery used per day.
  const pts = st.points;
  const SLOT = 15 * 60e3, DAY = 86400e3, now = Date.now();
  // A rise across a gap this fast is a charge (the keyboard charges at ~12 %/h, the mouse faster); the
  // voltage creeping back up after a rest is under 1 %/h.
  const quickRise = (a: { t: number; pct: number }, b: { t: number; pct: number }): boolean => b.pct > a.pct && (b.pct - a.pct) / Math.max(1, (b.t - a.t) / 3600e3) >= 5;
  // level at a moment: held until the next reading, read off the straight line across a gap
  const levelAt = (tt: number): { pct: number; est: boolean; chg: boolean } | null => {
    if (!pts.length || tt < pts[0].t || tt > pts[pts.length - 1].t + SLOT) return null;
    let i = 0;
    while (i + 1 < pts.length && pts[i + 1].t <= tt) i++;
    const a = pts[i], b = pts[i + 1];
    if (b?.gap && tt > a.t) return { pct: a.pct + ((b.pct - a.pct) * (tt - a.t)) / (b.t - a.t), est: true, chg: quickRise(a, b) };
    return { pct: a.pct, est: false, chg: !!(a.chg && (b ? b.chg : true)) };
  };
  const chartView = view ?? (pts.some((p) => p.t >= now - DAY) ? 'day' : 'days');
  type Bar = { from: number; to: number; value: number | null; chg?: boolean; est?: boolean; charged?: number };
  const bars: Bar[] = chartView === 'all' ? [] : chartView === 'day'
    ? Array.from({ length: 96 }, (_, k) => {
      const from = Math.ceil(now / SLOT) * SLOT - (96 - k) * SLOT, to = from + SLOT;
      const s = [0.2, 0.5, 0.8].map((f) => from + SLOT * f).filter((x) => x <= now).map(levelAt).filter((x) => !!x);
      return s.length ? { from, to, value: s.reduce((n, x) => n + x.pct, 0) / s.length, chg: s.some((x) => x.chg), est: s.every((x) => x.est) } : { from, to, value: null };
    })
    : Array.from({ length: 10 }, (_, k) => {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (9 - k));
      const from = d.getTime(), to = from + DAY;
      let used = 0, charged = 0, seen = false;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (b.t < from || b.t >= to) continue;
        seen = true;
        if (!a.chg && !b.chg) used += Math.max(0, a.pct - b.pct);
        else charged += Math.max(0, b.pct - a.pct);
      }
      return { from, to, value: seen ? used : null, charged };
    });
  const max = chartView !== 'days' ? 100 : Math.max(10, Math.ceil(Math.max(0, ...bars.map((b) => (b.value ?? 0) + (b.charged ?? 0))) / 10) * 10);
  const hb = hoverBar !== null ? bars[hoverBar] : null;
  const hm = (ms: number): string => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const dayName = (ms: number): string => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', weekday: 'short' });
  const chartLabel = !hb ? (chartView === 'days' ? t('batteryDailyUse') : t('batteryChartTitle'))
    : chartView === 'day'
      ? `${hm(hb.from)}–${hm(hb.to)} · ${hb.value === null ? '—' : `${hb.est ? '≈ ' : ''}${pct(Math.round(hb.value))}`}${hb.chg ? ` · ${t('batteryCharging')}` : ''}`
      : `${dayName(hb.from)} · ${hb.value === null ? '—' : t('batteryUsed').replace('{p}', pct(Math.round(hb.value)))}${hb.charged ? ` · ${t('batteryCharging')} +${pct(Math.round(hb.charged))}` : ''}`;

  // 30 days: step line, gaps dashed, charging in green
  const W = 320, H = 72;
  const t0 = pts[0]?.t ?? 0, t1 = pts[pts.length - 1]?.t ?? 1;
  const lx = (tt: number): number => (t1 > t0 ? ((tt - t0) / (t1 - t0)) * W : W);
  const ly = (v: number): number => H - (v / 100) * H;
  let solid = '', dashed = '', dashedUp = '', dashedSlow = '', charge = '';
  pts.forEach((pt, i) => {
    if (!i) { solid += `M${lx(pt.t)},${ly(pt.pct)}`; return; }
    const a = pts[i - 1];
    const seg = `M${lx(a.t)},${ly(a.pct)}H${lx(pt.t)}V${ly(pt.pct)}`;
    // a gap the level rose across: quickly = charged while the app was not watching, slowly = unclear
    if (pt.gap && quickRise(a, pt)) dashedUp += `M${lx(a.t)},${ly(a.pct)}L${lx(pt.t)},${ly(pt.pct)}`;
    else if (pt.gap && pt.pct > a.pct) dashedSlow += `M${lx(a.t)},${ly(a.pct)}L${lx(pt.t)},${ly(pt.pct)}`;
    else if (pt.gap) dashed += `M${lx(a.t)},${ly(a.pct)}L${lx(pt.t)},${ly(pt.pct)}`;
    else if (pt.chg && a.chg) charge += seg;
    else solid += seg;
  });
  const fmtD = (ms: number): string => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const ticks = t1 - t0 > 2 * DAY ? [0, 0.25, 0.5, 0.75, 1] : [0, 1];
  const lineHover = hoverAt === null ? null : (() => {
    const tt = t0 + hoverAt * (t1 - t0);
    const l = levelAt(Math.min(tt, t1));
    return l && { ...l, tt };
  })();
  const onLineMove = (e: MouseEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverAt(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  return (
    <Card
      title={<span className="flex items-center gap-2"><BatteryCharging size={16} className="text-accent-2" />{t('batteryCard')}</span>}
      right={packs && packs.packs.length > 1 ? (
        <Segmented value={pack!} onChange={setViewPack} options={packs.packs.map((p) => ({ value: p.id, label: `${t('batteryPack').replace('{n}', p.name)}${p.id === packs.installed ? ' •' : ''}` }))} />
      ) : undefined}
    >
      <div className="flex gap-6 items-stretch">
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 flex-[3] min-w-0">
          <Stat label={t('batteryNow')} value={level} note={levelNote} />
          <Stat label={t('batteryInUse')} value={st.minutesPerPct ? `≈ ${dur(st.minutesPerPct.value)}` : collecting} note={st.minutesPerPct ? range(st.minutesPerPct, dur) : undefined} />
          <Stat label={t('batteryDrain')} value={st.drainPerDay ? `≈ ${pct(st.drainPerDay.value, 1)} / ${t('day')}` : collecting} note={st.drainPerDay ? range(st.drainPerDay, (v) => pct(v, 1)) : undefined} />
          <Stat label={t('batteryRemaining')} value={lv?.charging ? '—' : st.remainingHours ? `≈ ${dur(st.remainingHours.value * 60)}` : collecting} note={!lv?.charging && st.remainingHours ? range(st.remainingHours, (v) => dur(v * 60)) : undefined} />
          <Stat label={t('batteryChargeTime')} value={st.chargeMinutes ? `≈ ${dur(st.chargeMinutes.value)}` : collecting} />
          <Stat label={t('batteryHealth')} value={st.health ? `≈ ${pct(st.health.value)}` : collecting} />
          <Stat label={t('batteryCycles')} value={num(st.cycles, 2)} />
          <Stat label={t('batteryLastFull')} value={st.lastFull ? `${st.lastFull.approx ? '≤ ' : ''}${new Date(st.lastFull.t).toLocaleDateString(locale)}` : t('batteryNotSeen')} />
          <Stat label={t('batteryTracking')} value={st.tracking.since ? `${num(st.tracking.days)} ${t('days')}` : '—'} note={st.tracking.since ? t('batteryWatched').replace('{d}', `${num(st.tracking.observedDays)} ${t('days')}`) : undefined} />
        </dl>
        {pts.length >= 2 && (
          <div className="flex-[2] min-w-0 flex flex-col">
            <div className="flex items-center gap-2 mb-1.5 text-[10px] h-5">
              <span className={`flex-1 min-w-0 truncate tabular-nums ${hb ? 'font-semibold text-[11px]' : 'font-semibold uppercase tracking-wider text-muted'}`}>{chartLabel}</span>
              <div className="flex shrink-0 rounded-md p-0.5 gap-0.5" role="group" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>
                {(['day', 'days', 'all'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={chartView === v}
                    onClick={() => { setView(v); setHoverBar(null); setHoverAt(null); }}
                    className="h-4 px-2 rounded text-[10px] font-medium leading-none transition-colors"
                    style={chartView === v
                      ? { background: 'var(--color-panel-2)', color: 'var(--color-text)', boxShadow: 'inset 0 0 0 1px var(--color-line-2)' }
                      : { color: 'var(--color-muted)' }}
                  >
                    {t(v === 'day' ? 'batteryLast24h' : v === 'days' ? 'batteryLast10d' : 'batteryLast30d')}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 flex-1" style={{ minHeight: 52 }}>
              <div className="flex flex-col justify-between text-[10px] text-muted py-0.5 tabular-nums">
                <span>{pct(max)}</span><span>{pct(max / 2)}</span><span>{pct(0)}</span>
              </div>
              {chartView === 'all' ? (
              <div className="relative flex-1 min-w-0" style={{ cursor: 'crosshair' }} onMouseMove={onLineMove} onMouseLeave={() => setHoverAt(null)}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                  {[0, 0.5, 1].map((g) => (
                    <line key={g} x1="0" x2={W} y1={g * H} y2={g * H} stroke="var(--color-line)" strokeWidth="0.5" strokeDasharray="3 3" />
                  ))}
                  <path d={solid} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  <path d={dashed} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" vectorEffect="non-scaling-stroke" />
                  <path d={dashedSlow} fill="none" stroke="var(--color-muted)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.7" vectorEffect="non-scaling-stroke" />
                  <path d={dashedUp} fill="none" stroke="var(--color-ok)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" vectorEffect="non-scaling-stroke" />
                  <path d={charge} fill="none" stroke="var(--color-ok)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                {lineHover && hoverAt !== null && (
                  <>
                    <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${hoverAt * 100}%`, background: 'var(--color-line-2)' }} />
                    <div className="absolute w-2 h-2 rounded-full pointer-events-none" style={{ left: `calc(${hoverAt * 100}% - 4px)`, top: `calc(${100 - lineHover.pct}% - 4px)`, background: lineHover.chg ? 'var(--color-ok)' : 'var(--color-accent)', boxShadow: '0 0 0 2px var(--color-panel)' }} />
                    <div
                      className="absolute -top-1 pointer-events-none whitespace-nowrap rounded-md px-2 py-1 text-[11px] tabular-nums"
                      style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line-2)', ...(hoverAt > 0.6 ? { right: `calc(${(1 - hoverAt) * 100}% + 8px)` } : { left: `calc(${hoverAt * 100}% + 8px)` }) }}
                    >
                      <span className="font-semibold">{lineHover.est ? '≈ ' : ''}{pct(Math.round(lineHover.pct))}</span>
                      <span className="text-muted"> · {new Date(lineHover.tt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{lineHover.chg ? ` · ${t('batteryCharging')}` : ''}</span>
                    </div>
                  </>
                )}
              </div>
              ) : (
              <div className="relative flex-1 min-w-0" onMouseLeave={() => setHoverBar(null)}>
                {[0, 0.5, 1].map((g) => (
                  <div key={g} className="absolute left-0 right-0 pointer-events-none" style={{ top: `${g * 100}%`, borderTop: '1px dashed var(--color-line)' }} />
                ))}
                <div className="absolute inset-0 flex items-end" style={{ gap: chartView === 'day' ? 1 : 5 }}>
                  {bars.map((b, i) => (
                    <div key={b.from} className="flex-1 h-full flex flex-col justify-end" onMouseEnter={() => setHoverBar(i)}
                      style={{ opacity: b.est ? 0.4 : hoverBar === null || hoverBar === i ? 1 : 0.5 }}>
                      {!!b.charged && <div className="w-full" style={{ height: `${(b.charged / max) * 100}%`, background: 'var(--color-ok)', borderRadius: '2px 2px 0 0' }} />}
                      <div className="w-full" style={{
                        height: b.value === null ? 0 : `${Math.max(2, (b.value / max) * 100)}%`,
                        background: b.chg ? 'var(--color-ok)' : 'var(--color-accent)',
                        borderRadius: b.charged ? 0 : chartView === 'day' ? 1 : 2,
                      }} />
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
            <div className="relative text-[10px] text-muted mt-1 ml-9 h-3.5 tabular-nums">
              {chartView === 'all'
                ? ticks.map((f) => (
                  <span key={f} className="absolute" style={f === 0 ? { left: 0 } : f === 1 ? { right: 0 } : { left: `${f * 100}%`, transform: 'translateX(-50%)' }}>{fmtD(t0 + f * (t1 - t0))}</span>
                ))
                : chartView === 'day'
                ? bars.map((b, i) => (new Date(b.from).getMinutes() === 0 && new Date(b.from).getHours() % 6 === 0
                  ? <span key={b.from} className="absolute" style={{ left: `${(i / bars.length) * 100}%` }}>{String(new Date(b.from).getHours()).padStart(2, '0')}</span>
                  : null))
                : bars.map((b, i) => (
                  <span key={b.from} className="absolute text-center" style={{ left: `${(i / bars.length) * 100}%`, width: `${100 / bars.length}%` }}>
                    {new Date(b.from).toLocaleDateString(locale, { weekday: 'narrow' })}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5 text-[12px]"><AlertTriangle size={13} className="shrink-0" style={{ color: 'var(--color-warn)' }} />{t('batteryNoFastCharge')}</span>
        <span>{t('batteryDisclaimer')}</span>
      </div>
    </Card>
  );
};
