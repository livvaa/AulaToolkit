import { modelById } from '@shared/models';
import { activeProfile, useStore, useT, useTn } from '../../store';
import { Card, Select, Toggle } from '../ui';

export const KbSettingsPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const update = useStore((s) => s.updateProfile);
  const call = useStore((s) => s.call);
  const dev = useStore((s) => s.deviceFor(modelId));
  const blackout = useStore((s) => s.settings[modelId]?.displayBlackout !== false);
  const setBlackout = useStore((s) => s.setDisplayBlackout);
  // keyboards keep these in the keyboard profile, mice without the Incott protocol in the mouse profile
  const values = profile?.keyboard?.settings ?? profile?.mouse?.settings;
  if (!values) return null;
  const set = (key: string, v: number): void => update(modelId, (p) => {
    if (p.keyboard) p.keyboard.settings[key] = v;
    else if (p.mouse) p.mouse.settings = { ...p.mouse.settings, [key]: v };
  }, 'settings');
  const label = (key: string, fallback: string): string => ({ winLock: t('winLock'), altF4: t('altF4'), altTab: t('altTab'), fnSwitch: t('fnSwitch'), sleep: t('sleep'), response: t('response') } as Record<string, string>)[key] ?? tn(fallback);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card title={t('kbConfig')}>
        {(model.settings ?? []).map((s) =>
          s.type === 'check' ? (
            <Toggle key={s.key} label={label(s.key, s.label)} on={!!values[s.key]} onChange={(v) => set(s.key, v ? 1 : 0)} />
          ) : (
            <Select key={s.key} label={label(s.key, s.label)} value={values[s.key] ?? s.default} options={(s.options ?? []).map(([v, l]) => ({ value: v, label: tn(l) }))} onChange={(v) => set(s.key, v)} />
          ),
        )}
        {model.features.displayBlackout && (
          <Toggle label={t('displayBlackout')} hint={t('displayBlackoutHint')} on={blackout} onChange={(v) => setBlackout(modelId, v)} />
        )}
      </Card>
      {model.features.clock && (
        <Card title={t('syncClock')}>
          <p className="text-sm text-muted mb-3">{new Date().toLocaleString()}</p>
          <button className="btn" disabled={!dev} onClick={() => void call(modelId, 'syncTime', 1)}>{t('syncClock')}</button>
        </Card>
      )}
    </div>
  );
};
