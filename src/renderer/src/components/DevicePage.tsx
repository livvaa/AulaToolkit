import { useEffect, useState, type ReactElement } from 'react';
import { Keyboard, Lightbulb, ListVideo, Monitor, MousePointer2, PlugZap, Settings2, Gauge, LayoutDashboard, Wrench } from 'lucide-react';
import { modelById } from '@shared/models';
import { useStore, useT } from '../store';
import { ProfileBar } from './ProfileBar';
import { Overview } from './Overview';
import { LightingPanel } from './keyboard/LightingPanel';
import { KeysPanel } from './keyboard/KeysPanel';
import { MacrosPanel } from './MacrosPanel';
import { ScreenPanel } from './keyboard/ScreenPanel';
import { KbSettingsPanel } from './keyboard/KbSettingsPanel';
import { DpiPanel } from './mouse/DpiPanel';
import { ButtonsPanel } from './mouse/ButtonsPanel';
import { PerformancePanel } from './mouse/PerformancePanel';
import { DeviceSettingsPanel } from './DeviceSettingsPanel';

type Tab = 'overview' | 'lighting' | 'keys' | 'macros' | 'screen' | 'settings' | 'dpi' | 'buttons' | 'performance' | 'device';

export const DevicePage = () => {
  const t = useT();
  const modelId = useStore((s) => s.selectedModel);
  const settings = useStore((s) => s.settings[modelId]);
  const ensure = useStore((s) => s.ensureSettings);
  const [sel, setSel] = useState<{ model: string; tab: Tab }>({ model: modelId, tab: 'overview' });
  const setTab = (next: Tab): void => setSel({ model: modelId, tab: next });
  useEffect(() => {
    const h = (e: Event): void => setSel({ model: useStore.getState().selectedModel, tab: (e as CustomEvent<Tab>).detail });
    window.addEventListener('aula:tab', h);
    return () => window.removeEventListener('aula:tab', h);
  }, []);
  const model = modelById(modelId)!;

  useEffect(() => { void ensure(modelId); }, [modelId, ensure]);

  const tabs: { id: Tab; label: string; icon: ReactElement; show: boolean }[] = [
    { id: 'overview', label: t('overview'), icon: <LayoutDashboard size={16} />, show: true },
    { id: 'lighting', label: t('lighting'), icon: <Lightbulb size={16} />, show: !!model.features.lighting },
    { id: 'keys', label: t('keys'), icon: <Keyboard size={16} />, show: !!model.features.keymap },
    { id: 'dpi', label: t('dpi'), icon: <Gauge size={16} />, show: !!model.features.dpi },
    { id: 'buttons', label: t('buttons'), icon: <MousePointer2 size={16} />, show: !!model.features.buttons },
    { id: 'performance', label: t('performance'), icon: <Settings2 size={16} />, show: model.kind === 'mouse' && model.protocol === 'incott' },
    { id: 'macros', label: t('macros'), icon: <ListVideo size={16} />, show: !!model.features.macros },
    { id: 'screen', label: t('screen'), icon: <Monitor size={16} />, show: !!model.features.screen },
    { id: 'settings', label: t('kbConfig'), icon: <Settings2 size={16} />, show: !!model.features.settings && (model.kind === 'keyboard' || model.protocol !== 'incott') },
    { id: 'device', label: t('deviceTab'), icon: <Wrench size={16} />, show: true },
  ];
  const tab: Tab = sel.model === modelId && tabs.some((x) => x.id === sel.tab && x.show) ? sel.tab : 'overview';

  const online = useStore((s) => !!s.deviceFor(modelId));
  if (!settings) return null;
  if (!online) {
    return (
      <div className="p-5 flex flex-col gap-4 fade-in" key={modelId}>
        <div className="chip chip-warn self-start"><PlugZap size={13} />{t('connectToConfigure')}</div>
        <nav className="flex items-center" style={{ borderBottom: '1px solid var(--color-line)' }}>
          <button className="tab" data-active={tab !== 'device'} onClick={() => setTab('overview')}><LayoutDashboard size={16} />{t('overview')}</button>
          <button className="tab" data-active={tab === 'device'} onClick={() => setTab('device')}><Wrench size={16} />{t('deviceTab')}</button>
        </nav>
        {tab === 'device' ? <DeviceSettingsPanel modelId={modelId} /> : <Overview modelId={modelId} />}
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-4 fade-in" key={modelId}>
      <ProfileBar modelId={modelId} />
      <nav className="flex items-center flex-wrap" style={{ borderBottom: '1px solid var(--color-line)' }}>
        {tabs.filter((x) => x.show).map((x) => (
          <button key={x.id} className="tab" data-active={tab === x.id} onClick={() => setTab(x.id)}>{x.icon}{x.label}</button>
        ))}
      </nav>
      <div key={tab} className="fade-in">
        {tab === 'overview' && <Overview modelId={modelId} />}
        {tab === 'lighting' && <LightingPanel modelId={modelId} />}
        {tab === 'keys' && <KeysPanel modelId={modelId} />}
        {tab === 'macros' && <MacrosPanel modelId={modelId} />}
        {tab === 'screen' && <ScreenPanel modelId={modelId} />}
        {tab === 'settings' && <KbSettingsPanel modelId={modelId} />}
        {tab === 'dpi' && <DpiPanel modelId={modelId} />}
        {tab === 'buttons' && <ButtonsPanel modelId={modelId} />}
        {tab === 'performance' && <PerformancePanel modelId={modelId} />}
        {tab === 'device' && <DeviceSettingsPanel modelId={modelId} />}
      </div>
    </div>
  );
};
