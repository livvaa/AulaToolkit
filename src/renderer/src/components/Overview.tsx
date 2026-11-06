import { BatteryCharging, BatteryMedium, Bluetooth, Cable, Radio, RefreshCw, Moon } from 'lucide-react';
import { modelById } from '@shared/models';
import { imageFor } from '../assets';
import { useStore, useT, useTn } from '../store';
import { Card } from './ui';
import { BatteryCard } from './BatteryCard';

export const Overview = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const dev = useStore((s) => s.deviceFor(modelId));
  const variant = useStore((s) => s.settings[modelId]?.variant);
  const image = model.variants?.find((v) => v.id === variant)?.image ?? model.image;
  const online = !!dev;
  const bluetooth = useStore((s) => s.bluetooth[modelId]);
  const bt = !online && bluetooth?.connected ? bluetooth : undefined;
  const statsOn = useStore((s) => s.prefs.batteryStats);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-5">
      <section className="panel overflow-hidden">
        <div className="flex items-stretch">
          <div className="p-6 flex flex-col gap-2.5 flex-1 justify-center">
            <div className="text-xs font-semibold text-muted">{model.brand}</div>
            <h1 className="text-[34px] leading-tight font-semibold tracking-tight">{model.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className={`chip ${online || bt ? 'chip-ok' : ''}`}>
                {online ? (dev.link === 'usb' ? <Cable size={13} /> : <Radio size={13} />) : bt ? <Bluetooth size={13} /> : null}
                {online ? (dev.link === 'usb' ? t('usb') : t('wireless')) : bt ? t('bluetooth') : t('disconnected')}
              </span>
              {dev?.battery !== null && dev?.battery !== undefined ? (
                <span className="chip">{dev.charging ? <BatteryCharging size={13} /> : <BatteryMedium size={13} />}{dev.battery}% {dev.charging ? `· ${t('charging')}` : ''}</span>
              ) : bt?.pct != null && (
                <span className="chip"><BatteryMedium size={13} />{bt.pct}%</span>
              )}
              {dev?.live?.sensor && <span className="chip">{t('sensor')} {dev.live.sensor}</span>}
              {dev?.live?.receiver8k && <span className="chip">8K {t('receiver')}</span>}
              {dev?.note === 'asleep' && <span className="chip chip-warn"><Moon size={13} />{t('asleep')}</span>}
              {online && <button className="btn btn-ghost btn-sm" onClick={() => void window.aula.rescan()}><RefreshCw size={13} />{t('refresh')}</button>}
            </div>
          </div>
          <div className="w-[300px] shrink-0 relative flex items-center justify-center p-3">
            <img src={imageFor(image)} alt={model.name} className="w-full object-contain" draggable={false} />
          </div>
        </div>
      </section>
      <Card title={t('specs')}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          {model.specs.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <dt className="label">{tn(s.label)}</dt>
              <dd className="text-sm">{tn(s.value)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {statsOn && (model.features.battery || dev?.battery != null) && <div className="xl:col-span-2"><BatteryCard modelId={modelId} /></div>}
    </div>
  );
};
