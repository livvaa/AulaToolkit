import { useEffect, useState } from 'react';
import { ArrowRight, BatteryMedium, Cable, Check, Loader2, Moon, Radio } from 'lucide-react';
import { modelById } from '@shared/models';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { defaultKeyboardProfile, defaultMouseProfile } from '@shared/defaults';
import { imageFor } from '../assets';
import { activeProfile, useStore, useT, useTn } from '../store';
import { applyProfile, pullFromDevice } from '../apply';
import { Toggle } from './ui';

/** First-connection walkthrough for a device: introduction, personalisation, initial settings. */
export const DeviceSetup = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const s = useStore();
  const model = modelById(modelId)!;
  const dev = s.deviceFor(modelId);
  const file = s.settings[modelId];
  const prof = activeProfile(s, modelId);
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState('');
  const [reading, setReading] = useState(false);
  const [readOk, setReadOk] = useState<boolean | null>(null);
  const [choice, setChoice] = useState<'keep' | 'recommended'>('keep');
  const variant = file?.variant ?? model.variants?.[0]?.id;
  const image = model.variants?.find((v) => v.id === variant)?.image ?? model.image;

  useEffect(() => { void s.ensureSettings(modelId); }, [modelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (): Promise<void> => {
    setReading(true);
    const ok = await pullFromDevice(modelId);
    setReadOk(ok); setReading(false);
  };
  useEffect(() => { if (step === 2 && readOk === null) void read(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (): Promise<void> => {
    if (nick.trim()) s.setNickname(modelId, nick.trim());
    if (choice === 'recommended') {
      s.updateProfile(modelId, (p) => {
        if (model.kind === 'keyboard') p.keyboard = defaultKeyboardProfile(model);
        else p.mouse = defaultMouseProfile(model);
      }, null);
      await applyProfile(modelId);
    }
    s.finishSetup(modelId);
  };

  const summary: [string, string][] = [];
  if (prof?.mouse && model.features.dpi) {
    summary.push([t('dpi'), `${prof.mouse.dpiStages[prof.mouse.dpiActive] ?? '—'}`], [t('polling'), `${prof.mouse.polling} Hz`], [t('liftOff'), `${prof.mouse.liftOff / 10} mm`], [t('sleep'), `${prof.mouse.sleep} ${t('sec')}`]);
  }
  if (prof?.keyboard) {
    const eff = prof.keyboard.lighting.mode === USER_LIGHT_MODE ? t('perKey') : tn(model.lightModes?.find((x) => x.mode === prof.keyboard!.lighting.mode)?.name ?? '');
    summary.push([t('effect'), eff], [t('brightness'), `${prof.keyboard.lighting.brightness}/5`]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(5,7,12,0.78)', backdropFilter: 'blur(6px)' }}>
      <div className="panel glow w-[640px] overflow-hidden fade-in" key={step}>
        <div className="flex">
          <div className="p-8 flex-1 flex flex-col gap-4 min-h-[400px]">
            <div className="flex items-center gap-2 text-xs text-muted">
              {[0, 1, 2].map((i) => <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === step ? 28 : 10, background: i <= step ? 'var(--color-accent)' : 'var(--color-line-2)' }} />)}
              <span className="ml-2">{step + 1} / 3</span>
            </div>

            {step === 0 && (
              <>
                <div className="label">{model.brand}</div>
                <h2 className="text-3xl font-bold tracking-tight">{t('setupFound').replace('{name}', model.name)}</h2>
                <p className="text-muted">{t('setupIntro')}</p>
                <div className="flex gap-2 flex-wrap mt-1">
                  {dev && <span className="chip chip-ok">{dev.link === 'usb' ? <Cable size={12} /> : <Radio size={12} />}{dev.link === 'usb' ? t('usb') : t('wireless')}</span>}
                  {dev?.battery != null && <span className="chip"><BatteryMedium size={12} />{dev.battery}%</span>}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="text-2xl font-bold tracking-tight">{t('setupPersonalise')}</h2>
                {model.variants && (
                  <div>
                    <div className="text-sm mb-2">{t('colour')}</div>
                    <div className="flex gap-2">
                      {model.variants.map((v) => (
                        <button key={v.id} onClick={() => s.setVariant(modelId, v.id)} className="flex flex-col items-center gap-1">
                          <span className="h-9 w-9 rounded-full border-2 transition-all" style={{ background: v.swatch, borderColor: variant === v.id ? 'var(--color-accent)' : 'var(--color-line-2)', boxShadow: variant === v.id ? '0 0 0 3px color-mix(in srgb, var(--color-accent) 30%, transparent)' : undefined }} />
                          <span className="text-[11px] text-muted">{tn(v.name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="flex flex-col gap-1.5 mt-1">
                  <span className="text-sm">{t('nickname')}</span>
                  <input className="input" placeholder={model.name} value={nick} maxLength={24} onChange={(e) => setNick(e.target.value)} />
                  <span className="text-xs text-muted">{t('nicknameHint')}</span>
                </label>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-2xl font-bold tracking-tight">{t('setupInitial')}</h2>
                {reading ? (
                  <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" />{t('setupReading')}</div>
                ) : readOk === false ? (
                  <div className="chip chip-warn self-start"><Moon size={12} />{model.kind === 'mouse' ? t('asleep') : t('kbReadFailed')} <button className="underline ml-1" onClick={() => void read()}>{t('refresh')}</button></div>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {summary.map(([k, v]) => <div key={k} className="flex flex-col"><dt className="label">{k}</dt><dd>{v}</dd></div>)}
                  </dl>
                )}
                {model.features.battery && (
                  <div className="rounded-xl p-3 mt-2" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>
                    <Toggle label={t('batteryStatsOpt')} hint={t('batteryStatsHint')} on={!!s.prefs.batteryStats} onChange={(v) => void s.setPrefs({ batteryStats: v })} />
                  </div>
                )}
                <div className="flex flex-col gap-2 mt-2">
                  {(['keep', 'recommended'] as const).map((c) => (
                    <button key={c} onClick={() => setChoice(c)} className="text-left rounded-xl p-3 transition-all" style={{ border: `1px solid ${choice === c ? 'var(--color-accent)' : 'var(--color-line)'}`, background: choice === c ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'var(--color-bg-2)' }}>
                      <div className="text-sm font-medium flex items-center gap-2">{choice === c && <Check size={14} className="text-accent-2" />}{c === 'keep' ? t('setupKeep') : t('setupRecommended')}</div>
                      <div className="text-xs text-muted mt-0.5">{c === 'keep' ? t('setupKeepHint') : t('setupRecommendedHint')}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center gap-2 mt-auto pt-4">
              <button className="btn btn-ghost btn-sm" onClick={() => s.finishSetup(modelId)}>{t('skip')}</button>
              <div className="flex-1" />
              {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>{t('back')}</button>}
              {step < 2
                ? <button className="btn btn-primary" onClick={() => setStep(step + 1)}>{t('next')}<ArrowRight size={16} /></button>
                : <button className="btn btn-primary" disabled={reading} onClick={() => void finish()}>{t('done')}<Check size={16} /></button>}
            </div>
          </div>
          <div className="w-[240px] shrink-0 flex items-center justify-center p-6" style={{ background: 'radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 70%)' }}>
            <img src={imageFor(image)} alt={model.name} className="max-h-[300px] w-full object-contain drop-shadow-2xl" draggable={false} />
          </div>
        </div>
      </div>
    </div>
  );
};
