import { ArrowRight, BatteryCharging, BatteryMedium, Bluetooth, Cable, Gauge, Lightbulb, Radio, Usb } from 'lucide-react';
import { MODELS } from '@shared/models';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { imageFor } from '../assets';
import { activeProfile, useStore, useT, useTn } from '../store';
import { Dropdown } from './ui';
import logo from '../assets/logo.svg';
import { Wordmark } from './Wordmark';

const greetKey = (): 'greetNight' | 'greetMorning' | 'greetDay' | 'greetEvening' => {
  const h = new Date().getHours();
  return h < 6 ? 'greetNight' : h < 12 ? 'greetMorning' : h < 18 ? 'greetDay' : 'greetEvening';
};

export const Home = () => {
  const t = useT();
  const tn = useTn();
  const s = useStore();
  // Bluetooth-only devices last
  const connected = [
    ...MODELS.filter((m) => s.devices.some((d) => d.modelId === m.id)),
    ...MODELS.filter((m) => !s.devices.some((d) => d.modelId === m.id) && s.bluetooth[m.id]?.connected),
  ];

  return (
    <div className="p-8 flex flex-col gap-8 fade-in max-w-6xl">
      <section className="flex items-center gap-6 pb-6" style={{ borderBottom: '1px solid var(--color-line)' }}>
        <img src={logo} alt="" className="h-16 w-16" draggable={false} />
        <div className="flex-1 min-w-0">
          <Wordmark size={13} />
          <h1 className="text-[32px] leading-tight font-bold tracking-tight mt-1">{t(greetKey())}{s.prefs.userName ? `, ${s.prefs.userName}` : ''}</h1>
          <p className="text-muted mt-1.5 text-[15px] truncate">
            {connected.length
              ? connected.map((m) => {
                const d = s.devices.find((x) => x.modelId === m.id);
                return `${s.settings[m.id]?.nickname || m.name} · ${d ? (d.link === 'usb' ? t('usb') : t('wireless')) : t('bluetooth')}`;
              }).join(', ')
              : t('noDevices')}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[40px] leading-none font-bold tabular-nums">{connected.length}</div>
          <div className="label">{t('connected')}</div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="h2">{t('devices')}</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => void window.aula.rescan()}>{t('rescan')}</button>
        </div>
        {connected.length === 0 ? (
          <div className="panel p-10 text-center">
            <Usb className="mx-auto mb-3 opacity-50" size={36} />
            <div className="text-lg font-semibold">{t('noDevices')}</div>
            <div className="text-sm text-muted mt-1 max-w-md mx-auto">{t('noDevicesHint')}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {connected.map((m) => {
              const dev = s.devices.find((d) => d.modelId === m.id);
              const bt = dev ? undefined : s.bluetooth[m.id];
              const file = s.settings[m.id];
              const prof = activeProfile(s, m.id);
              const img = m.variants?.find((v) => v.id === file?.variant)?.image ?? m.image;
              const effect = dev && prof?.keyboard ? (prof.keyboard.lighting.mode === USER_LIGHT_MODE ? t('perKey') : tn(m.lightModes?.find((x) => x.mode === prof.keyboard!.lighting.mode)?.name ?? '')) : null;
              const dpi = dev && prof?.mouse && m.features.dpi ? prof.mouse.dpiStages[prof.mouse.dpiActive] : null;
              return (
                <div key={m.id} className="panel p-5 flex gap-5">
                  <div className="h-28 w-28 shrink-0">
                    <img src={imageFor(img)} alt={m.name} className="h-full w-full object-contain" draggable={false} />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="text-[11px] text-muted tracking-widest">{m.brand}</div>
                    <div className="text-xl font-semibold">{file?.nickname || m.name}</div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {dev
                        ? <span className="chip chip-ok">{dev.link === 'usb' ? <Cable size={12} /> : <Radio size={12} />}{dev.link === 'usb' ? t('usb') : t('wireless')}</span>
                        : <span className="chip chip-ok"><Bluetooth size={12} />{t('bluetooth')}</span>}
                      {dev && dev.battery !== null && <span className="chip">{dev.charging ? <BatteryCharging size={12} /> : <BatteryMedium size={12} />}{dev.battery}%</span>}
                      {bt?.pct != null && <span className="chip"><BatteryMedium size={12} />{bt.pct}%</span>}
                      {effect && <span className="chip"><Lightbulb size={12} />{effect}</span>}
                      {dpi && <span className="chip"><Gauge size={12} />{dpi} DPI</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-auto pt-3">
                      {file && dev && (
                        <Dropdown value={file.activeProfile} options={file.profiles.map((p) => ({ value: p.id, label: p.name }))} onChange={(id) => s.setActiveProfile(m.id, id)} minWidth={150} />
                      )}
                      <div className="flex-1" />
                      <button className="btn btn-primary btn-sm" onClick={() => s.select(m.id)}>{t('configure')}<ArrowRight size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4">
        <section className="panel p-5">
          <h2 className="h2 mb-3">{t('tips')}</h2>
          <ul className="flex flex-col gap-2 text-sm text-muted">
            {(['tip1', 'tip2', 'tip3'] as const).map((k) => <li key={k} className="flex gap-2.5"><span className="text-accent-2">–</span>{t(k)}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
};
