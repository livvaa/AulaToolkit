import { useEffect, useState } from 'react';
import { Bug, ChevronRight, ExternalLink, FolderOpen, Keyboard, Link2, MessagesSquare, Mouse, Package, Search, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { MODELS } from '@shared/models';
import { useStore, useT, useTn } from '../store';
import logo from '../assets/logo.svg';
import { Wordmark } from './Wordmark';
import { Modal } from './ui';

// Empty strings hide the rows.
export const LINKS = {
  github: 'https://github.com/livvaa/AulaToolkit',
  releases: 'https://github.com/livvaa/AulaToolkit/releases',
  issues: 'https://github.com/livvaa/AulaToolkit/issues',
  discord: 'https://discord.gg/u9FbaJGtCe',
  aula: 'https://www.aulastar.com/driver/',
};

const LIBRARIES: [string, string][] = [
  ['Electron', 'https://www.electronjs.org/'], ['React', 'https://react.dev/'], ['node-hid', 'https://github.com/node-hid/node-hid'],
  ['Tailwind CSS', 'https://tailwindcss.com/'], ['Zustand', 'https://github.com/pmndrs/zustand'], ['Lucide', 'https://lucide.dev/'],
  ['Vite', 'https://vite.dev/'], ['electron-vite', 'https://electron-vite.org/'], ['Vitest', 'https://vitest.dev/'], ['electron-builder', 'https://www.electron.build/'],
];
const CREDITS: [string, string][] = [
  ['open-aula', 'https://github.com/paulcoding810/open-aula'], ['OpenMouse', 'https://github.com/OpenMouse-Project/mouse-protocol'],
  ['IncottHIDApp', 'https://github.com/romkazor/IncottHIDApp'], ['AulaSofwareLinux', 'https://github.com/thought-train/AulaSofwareLinux'],
];

export const About = () => {
  const t = useT();
  const tn = useTn();
  const toast = useStore((s) => s.toast);
  const [info, setInfo] = useState<{ version: string; build: string; electron: string; chrome: string } | null>(null);
  useEffect(() => { void window.aula.buildInfo().then(setInfo); }, []);

  const Row = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center gap-2 text-sm py-1.5 hover:underline" style={{ color: 'var(--color-accent-2)' }}>{icon}{label}</button>
  );
  const Pill = ({ name, url }: { name: string; url: string }) => (
    <button onClick={() => window.aula.openExternal(url)} className="chip hover:border-current" style={{ color: 'var(--color-accent-2)' }}>{name}</button>
  );

  return (
    <div className="flex flex-col gap-7 fade-in">
      <section className="flex items-start gap-5">
        <img src={logo} alt="" className="h-16 w-16" draggable={false} />
        <div className="flex flex-col gap-1">
          <Wordmark size={22} className="mb-1" />
          <div className="text-sm text-muted">{t('version')} {info?.version ?? '…'}</div>
          <div className="text-sm text-muted">{t('build')} {info?.build ?? '…'} · Electron {info?.electron ?? ''}</div>
          <div className="text-sm text-muted mt-2">© {new Date().getFullYear()} <button className="hover:underline" style={{ color: 'var(--color-accent-2)' }} onClick={() => window.aula.openExternal('https://github.com/Livvaa')}>Livvaa</button> · {t('licence')}</div>
          <div className="text-xs text-muted">{t('notAffiliated')}</div>
        </div>
      </section>

      <section>
        <h3 className="label mb-2">{t('links')}</h3>
        <div className="flex flex-col">
          {LINKS.github ? <Row icon={<Link2 size={14} />} label={t('projectPage')} onClick={() => window.aula.openExternal(LINKS.github)} /> : <div className="text-sm text-muted py-1.5 flex items-center gap-2"><Link2 size={14} />{t('projectPage')} · {t('comingSoon')}</div>}
          {LINKS.releases && <Row icon={<Package size={14} />} label={t('latestRelease')} onClick={() => window.aula.openExternal(LINKS.releases)} />}
          {LINKS.issues && <Row icon={<Bug size={14} />} label={t('reportIssue')} onClick={() => window.aula.openExternal(LINKS.issues)} />}
          {LINKS.discord && <Row icon={<MessagesSquare size={14} />} label={t('discord')} onClick={() => window.aula.openExternal(LINKS.discord)} />}
          <Row icon={<ExternalLink size={14} />} label={t('officialDrivers')} onClick={() => window.aula.openExternal(LINKS.aula)} />
          {LINKS.github && <Row icon={<Link2 size={14} />} label={t('contributeTranslation')} onClick={() => window.aula.openExternal(`${LINKS.github}/tree/main/src/shared/locales`)} />}
        </div>
      </section>

      <section>
        <h3 className="label mb-2">{t('supportedDevices')}</h3>
        <SupportedDevices />
      </section>

      <section>
        <h3 className="label mb-2">{t('libraries')}</h3>
        <div className="flex flex-wrap gap-2">{LIBRARIES.map(([n, u]) => <Pill key={n} name={n} url={u} />)}</div>
      </section>

      <section>
        <h3 className="label mb-2">{t('protocolCredits')}</h3>
        <div className="flex flex-wrap gap-2">{CREDITS.map(([n, u]) => <Pill key={n} name={n} url={u} />)}</div>
      </section>

      <section>
        <h3 className="label mb-2">{t('folders')}</h3>
        <div className="flex flex-col">
          <Row icon={<FolderOpen size={14} />} label={t('folderData')} onClick={() => void window.aula.openFolder('data')} />
          <Row icon={<FolderOpen size={14} />} label={t('folderLogs')} onClick={() => void window.aula.openFolder('logs')} />
          <Row icon={<FolderOpen size={14} />} label={t('folderBackups')} onClick={() => void window.aula.openFolder('backups')} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn" onClick={() => void window.aula.saveDiagnostics().then((ok) => ok && toast(t('saved'), 'ok'))}><Bug size={14} />{t('diagnostics')}</button>
          <span className="text-xs text-muted">{t('diagnosticsHint')}</span>
        </div>
      </section>
    </div>
  );
};

type Kind = 'all' | 'keyboard' | 'mouse';
type State = 'all' | 'ok' | 'untested';

const StatusChip = ({ ok }: { ok: boolean }) => {
  const t = useT();
  return ok
    ? <span className="chip chip-ok shrink-0"><ShieldCheck size={12} />{t('devVerified')}</span>
    : <span className="chip chip-warn shrink-0"><ShieldQuestion size={12} />{t('devAwaiting')}</span>;
};

const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="flex gap-0.5 p-0.5 rounded-md" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>
    {options.map(([v, label]) => (
      <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
        className={`h-6 px-2.5 rounded text-xs font-medium ${value === v ? '' : 'text-muted hover:text-[var(--color-text)]'}`}
        style={value === v ? { background: 'var(--color-panel-2)', boxShadow: 'inset 0 0 0 1px var(--color-line-2)' } : undefined}>{label}</button>
    ))}
  </div>
);

/** One summary line; the full list opens in a dialog so it stays short as devices are added. */
const SupportedDevices = () => {
  const t = useT();
  const tn = useTn();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [state, setState] = useState<State>('all');
  const verified = MODELS.filter((m) => m.verified).length;

  const term = query.trim().toLowerCase();
  const shown = MODELS.filter((m) => (kind === 'all' || m.kind === kind)
    && (state === 'all' || (state === 'ok') === !!m.verified)
    && (!term || `${m.brand} ${m.name} ${m.tagline ? tn(m.tagline) : ''}`.toLowerCase().includes(term)));
  const groups: ['keyboard' | 'mouse', string][] = [['keyboard', t('devKeyboards')], ['mouse', t('devMice')]];

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3 rounded-lg" style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-sm font-semibold">{t('devCount').replace('{n}', String(MODELS.length))}</span>
          <span className="text-xs text-muted truncate">{MODELS.map((m) => m.name).join(' · ')}</span>
        </div>
        <span className="chip chip-ok"><ShieldCheck size={12} />{verified}</span>
        <span className="chip chip-warn"><ShieldQuestion size={12} />{MODELS.length - verified}</span>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>{t('devOpenList')}<ChevronRight size={14} /></button>
      </div>

      {open && (
        <Modal width={580} onClose={() => setOpen(false)} title={<>{t('supportedDevices')} <span className="text-muted font-normal tabular-nums">{MODELS.length}</span></>}>
          <div className="flex flex-wrap gap-2 pb-3 sticky top-0 z-10" style={{ background: 'var(--color-panel)', borderBottom: '1px solid var(--color-line)' }}>
            <label className="flex items-center gap-2 flex-1 min-w-[180px] h-8 px-2.5 rounded-md" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>
              <Search size={14} className="text-muted shrink-0" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('devSearch')}
                className="bg-transparent outline-none text-sm w-full" />
            </label>
            <Seg value={kind} onChange={setKind} options={[['all', t('devAll')], ['keyboard', t('devKeyboard')], ['mouse', t('devMouse')]]} />
            <Seg value={state} onChange={setState} options={[['all', t('devAll')], ['ok', t('devVerified')], ['untested', t('devAwaiting')]]} />
          </div>

          <div className="flex flex-col">
            {groups.map(([k, title]) => {
              const list = shown.filter((m) => m.kind === k);
              if (!list.length) return null;
              return (
                <div key={k} className="flex flex-col">
                  <div className="label pt-3 pb-1.5">{title} · {list.length}</div>
                  {list.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-[var(--color-panel-2)]">
                      <span className="h-8 w-8 rounded-md grid place-items-center text-muted shrink-0" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>
                        {m.kind === 'mouse' ? <Mouse size={16} /> : <Keyboard size={16} />}
                      </span>
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-semibold">{m.brand} {m.name}</span>
                        {m.tagline && <span className="text-xs text-muted">{tn(m.tagline)}</span>}
                      </span>
                      <StatusChip ok={!!m.verified} />
                    </div>
                  ))}
                </div>
              );
            })}
            {!shown.length && <div className="text-sm text-muted text-center py-8">{t('devNone')}</div>}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 mt-1 text-xs" style={{ borderTop: '1px solid var(--color-line)' }}>
            <span className="text-muted flex-1 min-w-[220px]">{t('devAwaitingHint')}</span>
            {LINKS.issues && <button type="button" className="font-medium hover:underline" style={{ color: 'var(--color-accent-2)' }}
              onClick={() => window.aula.openExternal(`${LINKS.issues}/new`)}>{t('devRequest')}</button>}
          </div>
        </Modal>
      )}
    </>
  );
};
