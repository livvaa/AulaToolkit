import { useEffect, useState } from 'react';
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
  const load = (): void => { void window.aula.batteryStats(modelId, pack).then(setSt); };
  useEffect(() => { load(); const i = setInterval(load, 60e3); return () => clearInterval(i); }, [modelId, pack, dev?.battery, dev?.charging, dev?.link]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return null;

  const num = (v: number, digits = 1): string => v.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (v: number, digits = 0): string => (v / 100).toLocaleString(locale, { style: 'percent', maximumFractionDigits: digits });
  const dur = (minutes: number): string => {
    if (minutes >= 48 * 60) return `${num(minutes / 1440, 0)} ${t('days')}`;
    if (minutes >= 60) { const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return m ? `${h} ${t('hours')} ${m} ${t('min')}` : `${h} ${t('hours')}`; }
    return `${Math.max(1, Math.round(minutes))} ${t('min')}`;
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

  // step line, gaps dashed, charging in green
  const W = 320, H = 72;
  const pts = st.points;
  const t0 = pts[0]?.t ?? 0, t1 = pts[pts.length - 1]?.t ?? 1;
  const x = (tt: number): number => (t1 > t0 ? ((tt - t0) / (t1 - t0)) * W : W);
  const y = (p: number): number => H - (p / 100) * H;
  let solid = '', dashed = '', charge = '';
  pts.forEach((p, i) => {
    if (!i) { solid += `M${x(p.t)},${y(p.pct)}`; return; }
    const a = pts[i - 1];
    const seg = `M${x(a.t)},${y(a.pct)}H${x(p.t)}V${y(p.pct)}`;
    if (p.gap) dashed += `M${x(a.t)},${y(a.pct)}L${x(p.t)},${y(p.pct)}`;
    else if (p.chg && a.chg) charge += seg;
    else solid += `${seg}`;
  });
  const fmtD = (ms: number): string => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  return (
    <Card
      title={<span className="flex items-center gap-2"><BatteryCharging size={16} className="text-accent-2" />{t('batteryCard')}</span>}
      right={packs && packs.packs.length > 1 ? (
        <Segmented value={pack!} onChange={setViewPack} options={packs.packs.map((p) => ({ value: p.id, label: `${t('batteryPack').replace('{n}', p.name)}${p.id === packs.installed ? ' •' : ''}` }))} />
      ) : undefined}
    >
      <div className="flex gap-6 items-start">
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
          <div className="flex-[2] min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1 truncate">{t('batteryChartTitle')}</div>
            <div className="flex gap-2">
              <div className="flex flex-col justify-between text-[10px] text-muted py-0.5" style={{ height: 52 }}>
                <span>{pct(100)}</span><span>{pct(50)}</span><span>{pct(0)}</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 52 }}>
                {[0, 0.5, 1].map((g) => (
                  <line key={g} x1="0" x2={W} y1={g * H} y2={g * H} stroke="var(--color-line)" strokeWidth="0.5" strokeDasharray="3 3" />
                ))}
                <path d={solid} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d={dashed} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" vectorEffect="non-scaling-stroke" />
                <path d={charge} fill="none" stroke="var(--color-ok)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="flex justify-between text-[10px] text-muted mt-1 ml-9">
              <span>{fmtD(t0)}</span><span>{fmtD(t1)}</span>
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
