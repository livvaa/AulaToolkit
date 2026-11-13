// The tray hover flyout, laid out like Legion Toolkit's: a small app caption, then one section per
// connected device — an icon + name header with a status dot, followed by label/value detail rows.
// Rendered into the same bundle under the #flyout hash by a borderless, non-focusable window; it reports
// its own height so the window always fits the content.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Keyboard, MousePointer2 } from 'lucide-react';
import type { DeviceSettingsFile, DeviceStatus } from '@shared/types';
import type { BluetoothState } from '@shared/ipc';
import { MODELS } from '@shared/models';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { DICT, NAMES, type Lang } from './i18n';
import { applyTheme } from './theme';
import { Wordmark } from './components/Wordmark';

type Live = { dpiStages?: number[]; dpiActive?: number; dpiCount?: number; polling?: number; sensor?: string };

export const Flyout = () => {
  const [hid, setDevices] = useState<DeviceStatus[]>([]);
  const [bluetooth, setBluetooth] = useState<BluetoothState>({});
  const [settings, setSettings] = useState<Record<string, DeviceSettingsFile>>({});
  const [lang, setLang] = useState<Lang>('en');
  const panel = useRef<HTMLDivElement>(null);

  const loadSettings = (list: DeviceStatus[]): void => {
    for (const id of new Set(list.map((d) => d.modelId))) {
      void window.aula.loadSettings(id).then((f) => setSettings((s) => ({ ...s, [id]: f })));
    }
  };

  // plus the ones only on Bluetooth (from Windows)
  const devices: DeviceStatus[] = [
    ...hid,
    ...MODELS.filter((m) => bluetooth[m.id]?.connected && !hid.some((d) => d.modelId === m.id)).map((m) => ({
      key: `${m.id}:bluetooth`, modelId: m.id, link: 'bluetooth' as const, productName: m.name, battery: bluetooth[m.id].pct, charging: false,
    })),
  ];

  useEffect(() => {
    for (const id of Object.keys(bluetooth)) if (bluetooth[id].connected && !settings[id]) void window.aula.loadSettings(id).then((f) => setSettings((s) => ({ ...s, [id]: f })));
  }, [bluetooth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void window.aula.getBluetooth().then(setBluetooth);
    const offBt = window.aula.onBluetooth(setBluetooth);
    void window.aula.getDevices().then((d) => { setDevices(d); loadSettings(d); });
    const off = window.aula.onDevices((d) => { setDevices(d); loadSettings(d); });
    const refresh = (): void => {
      if (document.visibilityState !== 'visible') return;
      void window.aula.loadPrefs().then((p) => { setLang(p.language); applyTheme(p); });
      void window.aula.getDevices().then((d) => { setDevices(d); loadSettings(d); });
      void window.aula.getBluetooth().then(setBluetooth);
    };
    refresh();
    void window.aula.loadPrefs().then((p) => { setLang(p.language); applyTheme(p); });
    document.addEventListener('visibilitychange', refresh);
    const offShow = window.aula.onFlyoutRefresh(() => {
      void window.aula.loadPrefs().then((p) => { setLang(p.language); applyTheme(p); });
      void window.aula.getDevices().then((d) => { setDevices(d); loadSettings(d); });
    });
    return () => { off(); offShow(); offBt(); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  // Tell the main process how tall we are, so the window hugs the content.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const report = (): void => window.aula.flyoutSize(Math.ceil(el.getBoundingClientRect().height) + 16);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t = (k: string): string => (DICT[lang] as Record<string, string>)[k] ?? (DICT.en as Record<string, string>)[k] ?? k;
  const tn = (n: string): string => NAMES[lang]?.[n] ?? n;

  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-4 pl-7 py-[3px] text-[13px]">
      <span className="font-medium">{label}</span>
      <span className="text-right" style={{ color: 'var(--color-text)' }}>{children}</span>
    </div>
  );

  const batteryIcon = (s: DeviceStatus): ReactNode => {
    if (s.charging) return <BatteryCharging size={16} className="text-ok" />;
    const b = s.battery ?? 100;
    if (b <= 20) return <BatteryLow size={16} className="text-danger" />;
    if (b >= 80) return <BatteryFull size={16} />;
    return <BatteryMedium size={16} />;
  };

  return (
    <div className="h-screen w-screen p-2 select-none" style={{ background: 'transparent' }}>
      <div ref={panel} className="rounded-lg px-4 py-3 flex flex-col gap-2" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', boxShadow: '0 12px 40px -12px rgba(0,0,0,.6)' }}>
        <div className="flex items-center gap-2 text-xs text-muted">
          <Wordmark size={11} logo />
        </div>

        {devices.length === 0 && <div className="text-[13px] text-muted py-1">{t('noDevices')}</div>}

        {devices.map((s) => {
          const model = MODELS.find((m) => m.id === s.modelId);
          const name = settings[s.modelId]?.nickname || model?.name || s.productName;
          const file = settings[s.modelId];
          // can't read the device over Bluetooth, so no profile
          const profile = s.link === 'bluetooth' ? undefined : file?.profiles.find((p) => p.id === file.activeProfile);
          const live = (s.live ?? {}) as Live;
          const mouse = model?.features.dpi ? profile?.mouse : undefined; // mice the app reads DPI from
          const stages = live.dpiStages ?? mouse?.dpiStages;
          const active = live.dpiActive ?? mouse?.dpiActive;
          const count = live.dpiCount ?? mouse?.dpiCount;
          const dpi = stages && active != null ? stages[active] : undefined;
          const polling = live.polling ?? mouse?.polling;
          const light = profile?.keyboard?.lighting;
          const effect = light
            ? light.mode === USER_LIGHT_MODE ? t('perKey') : tn(model?.lightModes?.find((m) => m.mode === light.mode)?.name ?? '')
            : undefined;
          const link = s.link === 'usb' ? t('usb') : s.link === '2.4g' ? t('wireless') : t('bluetooth');
          return (
            <div key={s.key} className="flex flex-col">
              <div className="flex items-center gap-2.5 py-1">
                {model?.kind === 'mouse' ? <MousePointer2 size={17} /> : <Keyboard size={17} />}
                <span className="text-[14px] font-semibold">{name}</span>
                <span className="ml-auto flex items-center gap-1.5 text-[13px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-ok)' }} />
                  {t('connected')}
                </span>
              </div>
              <Row label={tn('Connectivity')}>{link}</Row>
              {s.battery != null && (
                <Row label={t('battery')}>
                  <span className="inline-flex items-center gap-1.5">{batteryIcon(s)}{s.battery}%{s.charging ? ` · ${t('charging')}` : ''}</span>
                </Row>
              )}
              {dpi != null && <Row label={t('dpi')}>{dpi}{active != null && count ? <span className="text-muted"> · {active + 1}/{count}</span> : null}</Row>}
              {polling != null && model?.kind === 'mouse' && <Row label={t('polling')}>{polling} Hz</Row>}
              {live.sensor && <Row label={t('sensor')}>{live.sensor}</Row>}
              {effect && <Row label={t('effect')}>{effect}</Row>}
              {light && light.mode !== 0 && <Row label={t('brightness')}>{light.brightness}/{model?.lightRange?.brightness ?? 5}</Row>}
              {profile && <Row label={t('profile')}>{profile.name}</Row>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
