import { useEffect, useMemo, useRef, useState } from 'react';
import { interpolate } from '@shared/colorInterp';
import { Paintbrush, Eraser, PaintBucket, Cable } from 'lucide-react';
import { modelById } from '@shared/models';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { activeProfile, useStore, useT, useTn } from '../../store';
import { Card, ColorField, Segmented, Slider, Toggle, rgbToHex, Select } from '../ui';
import { KeyboardView } from './KeyboardView';
import { imageFor } from '../../assets';
import { useEffectPreview } from '../../effects';
import { LibraryGrid } from '../LibraryGrid';
import { MUSIC_DEFAULTS, animationSource } from '../../liveEngine';
import type { DeviceModel, KeyAnimation, MusicEffect } from '@shared/types';

// live frames only on aula04 keyboards with per-key LEDs
const liveCapable = (m: DeviceModel): boolean => m.protocol === 'aula04' && !!m.features.perkey;

const CAP = { BRIGHTNESS: 1, SPEED: 2, DIR_LR: 4, DIR_UD: 8, COLORFUL: 16, COLOR: 32 };

type Rgb = [number, number, number];

/**
 * Playback delay for live readings. They arrive about every 160 ms with some jitter; drawing slightly
 * in the past lets every screen frame sit between two known readings, so the motion stays smooth.
 */
const LIVE_DELAY_MS = 240;

/**
 * Live LED colours for the screen, interpolated at display rate between the readings and scaled up.
 * At low brightness the keyboard reports dim values (a peak of ~47 at level 1) that look washed out
 * over the photo; the gain follows the brightest reading of the last few seconds, so breathing and
 * fading effects keep their shape.
 */
function useLiveColors(live: { colors: Record<number, Rgb>; at: number } | undefined): Record<number, Rgb> | undefined {
  const frames = useRef<{ t: number; colors: Record<number, Rgb>; peak: number }[]>([]);
  const [out, setOut] = useState<Record<number, Rgb> | undefined>(undefined);

  useEffect(() => {
    if (!live) return;
    const list = frames.current;
    if (list.length && list[list.length - 1].t >= live.at) return;
    if (list.length && live.at - list[list.length - 1].t > 2000) list.length = 0; // readings paused (window hidden)
    let peak = 0;
    for (const c of Object.values(live.colors)) peak = Math.max(peak, c[0], c[1], c[2]);
    list.push({ t: live.at, colors: live.colors, peak });
    if (list.length > 16) list.shift();
  }, [live]);

  const active = !!live;
  useEffect(() => {
    if (!active) { setOut(undefined); return; }
    let raf = 0;
    const tick = (): void => {
      const list = frames.current;
      if (list.length) {
        const rt = Date.now() - LIVE_DELAY_MS;
        let i = list.findIndex((f) => f.t > rt);
        if (i === -1) i = list.length; // past the newest reading: hold it
        const ia = Math.max(0, i - 1);
        const a = list[ia], b = list[Math.min(list.length - 1, i)], before = ia > 0 ? list[ia - 1] : undefined;
        const k = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
        const top = Math.max(...list.map((f) => f.peak));
        const gain = top > 0 ? Math.min(6, 255 / top) : 1;
        const next: Record<number, Rgb> = {};
        for (const key of Object.keys(b.colors)) {
          const code = Number(key);
          const cb = b.colors[code], ca = a.colors[code] ?? cb;
          const c = k >= 1 ? cb : interpolate(before?.colors[code], ca, cb, k);
          next[code] = [Math.min(255, Math.round(c[0] * gain)), Math.min(255, Math.round(c[1] * gain)), Math.min(255, Math.round(c[2] * gain))];
        }
        setOut(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return active ? out : undefined;
}

// Same frames liveEngine sends, for the keyboard picture.
function useAnimationPreview(modelId: string, anim: KeyAnimation | undefined): Record<number, Rgb> | undefined {
  const [colors, setColors] = useState<Record<number, Rgb> | undefined>(undefined);
  const key = anim?.enabled && anim.libraryId ? `${anim.libraryId}|${anim.mode}|${anim.speed}|${anim.brightness}` : '';
  useEffect(() => {
    setColors(undefined);
    if (!key || !anim) return;
    let stop = false; let timer = 0;
    void animationSource(modelId, anim).then((src) => {
      if (!src || stop) return;
      const tick = (): void => { setColors(src(performance.now())); timer = window.setTimeout(tick, 47); };
      tick();
    });
    return () => { stop = true; window.clearTimeout(timer); };
  }, [modelId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return colors;
}

export const LightingPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const update = useStore((s) => s.updateProfile);
  const [paint, setPaint] = useState<[number, number, number]>([255, 90, 31]);
  const [erase, setErase] = useState(false);
  const kb = profile?.keyboard;
  const modes = model.lightModes ?? [];
  const cur = useMemo(() => modes.find((m) => m.mode === kb?.lighting.mode), [modes, kb?.lighting.mode]);
  const simulated = useEffectPreview(kb?.lighting, model.layout ?? [], kb?.perKey);
  // Over USB the S75 Pro reports what its LEDs show right now; prefer that to the simulation.
  const device = useStore((s) => s.deviceFor(modelId));
  const deviceLight = useStore((s) => s.liveLight[modelId]);
  const liveColors = useLiveColors(device?.link === 'usb' ? deviceLight : undefined);
  const anim = useStore((s) => s.settings[modelId]?.keyAnimation);
  const animPreview = useAnimationPreview(modelId, liveCapable(model) ? anim : undefined);
  if (!kb) return null;
  const perKey = kb.lighting.mode === USER_LIGHT_MODE;
  const caps = perKey ? CAP.BRIGHTNESS : cur?.caps ?? 0;
  const animating = !!anim?.enabled && device?.link === 'usb' && liveCapable(model);
  const showLive = !!liveColors && device?.link === 'usb' && (!perKey || animating);

  const setL = (patch: Partial<typeof kb.lighting>): void => update(modelId, (p) => { if (p.keyboard) Object.assign(p.keyboard.lighting, patch); }, 'lighting');

  const paintKey = (code: number): void => update(modelId, (p) => {
    if (!p.keyboard) return;
    if (erase) delete p.keyboard.perKey[code]; else p.keyboard.perKey[code] = paint;
  }, 'perKey');

  const previewColors = animPreview ?? (showLive ? liveColors : simulated);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
      <div className="flex flex-col gap-5">
        <Card>
          <KeyboardView
            keys={model.layout ?? []}
            colors={previewColors}
            onKey={perKey ? paintKey : undefined}
            glow={perKey ? undefined : rgbToHex(kb.lighting.color)}
            dimUnpainted={perKey}
            photo={model.topImage ? { src: imageFor(model.topImage.id), width: model.topImage.width, height: model.topImage.height } : undefined}
          />
          {perKey && (
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <span className="text-xs text-muted">{t('paintHint')}</span>
              <div className="flex-1" />
              <Segmented value={erase ? 'erase' : 'paint'} onChange={(v) => setErase(v === 'erase')} options={[{ value: 'paint', label: <span className="flex items-center gap-1"><Paintbrush size={14} />{t('color')}</span> }, { value: 'erase', label: <span className="flex items-center gap-1"><Eraser size={14} />{t('clearAll')}</span> }]} />
              <button className="btn btn-sm" onClick={() => update(modelId, (p) => { if (p.keyboard) p.keyboard.perKey = Object.fromEntries((model.layout ?? []).map((k) => [k.code, paint])); }, 'perKey')}><PaintBucket size={14} />{t('fillAll')}</button>
              <button className="btn btn-sm" onClick={() => update(modelId, (p) => { if (p.keyboard) p.keyboard.perKey = {}; }, 'perKey')}><Eraser size={14} />{t('clearAll')}</button>
            </div>
          )}
        </Card>
        {liveCapable(model) && <KeyAnimCard modelId={modelId} />}
      </div>
      <div className="flex flex-col gap-5">
        <Card title={t('effect')}>
          {animating && <p className="text-xs text-muted mb-3">{t('keyAnimActive')}</p>}
          <div className="flex flex-wrap gap-1.5">
            {[...modes, ...(model.features.perkey ? [{ mode: USER_LIGHT_MODE, name: t('perKey'), caps: 1 }] : [])].map((m) => (
              <button
                key={m.mode}
                onClick={() => setL({ mode: m.mode })}
                className="rounded-full px-3 py-1.5 text-[13px] transition-all flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  background: kb.lighting.mode === m.mode ? 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 35%, var(--color-panel-2)), var(--color-panel-2))' : 'var(--color-bg-2)',
                  border: `1px solid ${kb.lighting.mode === m.mode ? 'var(--color-accent)' : 'var(--color-line)'}`,
                }}
              >
                {m.mode === USER_LIGHT_MODE ? <Paintbrush size={13} /> : null}
                {tn(m.name)}
              </button>
            ))}
          </div>
        </Card>
        <Card title={perKey ? t('perKey') : tn(cur?.name ?? '') || t('lighting')}>
          {perKey && <ColorField value={paint} onChange={setPaint} label={t('color')} />}
          {!!(caps & CAP.COLOR) && !kb.lighting.colorful && <ColorField value={kb.lighting.color} onChange={(c) => setL({ color: c })} label={t('color')} />}
          {!!(caps & CAP.COLORFUL) && <Toggle on={kb.lighting.colorful} onChange={(v) => setL({ colorful: v })} label={t('colorful')} />}
          {!!(caps & CAP.BRIGHTNESS) && <Slider label={t('brightness')} min={0} max={model.lightRange?.brightness ?? 5} value={kb.lighting.brightness} onChange={(v) => setL({ brightness: v })} />}
          {!!(caps & CAP.SPEED) && <Slider label={t('speed')} min={0} max={model.lightRange?.speed ?? 5} value={kb.lighting.speed} onChange={(v) => setL({ speed: v })} />}
          {!!(caps & (CAP.DIR_LR | CAP.DIR_UD)) && (
            <div className="py-2 flex items-center justify-between">
              <span className="text-sm">{t('direction')}</span>
              <Segmented
                value={kb.lighting.direction}
                onChange={(v) => setL({ direction: v })}
                options={[
                  ...(caps & CAP.DIR_LR ? [{ value: 0, label: t('left') }, { value: 1, label: t('right') }] : []),
                  ...(caps & CAP.DIR_UD ? [{ value: 2, label: t('up') }, { value: 3, label: t('down') }] : []),
                ]}
              />
            </div>
          )}
        </Card>
        {model.features.bar && model.barModes && (
          <Card title={t('sideBar')}>
            <Select
              value={kb.barMode ?? model.barModes[0].mode}
              options={model.barModes.map((b) => ({ value: b.mode, label: tn(b.name) }))}
              onChange={(v) => update(modelId, (p) => { if (p.keyboard) p.keyboard.barMode = v; }, 'bar')}
            />
          </Card>
        )}
        <MusicCard modelId={modelId} />
      </div>
    </div>
  );
};

const SCHEME_LABELS = ['schemeTraffic', 'schemeRainbow', 'schemeRainbowRev', 'schemeGradient', 'schemeCycle', 'colWhite', 'colRed', 'colOrange', 'colYellow', 'colGreen', 'colBlue', 'schemeAmbient'] as const;
const BACKGROUND_LABELS = ['colWhite', 'colRed', 'colOrange', 'colYellow', 'colGreen', 'colCyan', 'colBlue', 'colPurple'] as const;
const pct = (v: number): string => `${v}%`;

const MusicCard = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const music = useStore((s) => s.settings[modelId]?.music);
  const setMusic = useStore((s) => s.setMusic);
  const modes = (model.lightModes ?? []).filter((m) => m.mode !== 0);
  if (!modes.length) return null;
  const live = liveCapable(model);
  const cur: MusicEffect = { enabled: false, mode: (modes.find((m) => m.name === 'Pulsating') ?? modes[0]).mode, speed: 3, ...(live ? MUSIC_DEFAULTS : {}), ...music };
  const kind = live ? cur.kind ?? 'rhythm' : 'effect';
  const set = (patch: Partial<MusicEffect>): void => setMusic(modelId, { ...cur, ...patch });
  const caps = modes.find((m) => m.mode === cur.mode)?.caps ?? 0;
  const bg = cur.background ?? -1;
  const effectPicker = (label: string) => (
    <>
      <Select label={label} value={cur.mode} options={modes.map((m) => ({ value: m.mode, label: tn(m.name) }))} onChange={(v) => set({ mode: v })} />
      {!!(caps & CAP.SPEED) && <Slider label={t('speed')} min={0} max={model.lightRange?.speed ?? 5} value={cur.speed} onChange={(v) => set({ speed: v })} />}
    </>
  );
  return (
    <Card title={t('musicEffect')}>
      <Toggle label={t('musicEffect')} hint={t('musicEffectHint')} on={cur.enabled} onChange={(v) => set({ enabled: v })} />
      {cur.enabled && live && (
        <div className="py-2">
          <Segmented value={kind} onChange={(v) => set({ kind: v })} options={[{ value: 'rhythm', label: t('musicRhythm') }, { value: 'effect', label: t('musicKeyEffect') }]} />
        </div>
      )}
      {cur.enabled && kind === 'rhythm' && (
        <>
          <p className="text-xs text-muted py-1">{t('musicRhythmHint')}</p>
          <Select label={t('rhythmColors')} value={cur.scheme ?? 4} options={SCHEME_LABELS.map((k, i) => ({ value: i, label: t(k) }))} onChange={(v) => set({ scheme: v })} />
          <Slider label={t('amplitude')} min={10} max={100} step={5} value={cur.amplitude ?? 50} format={pct} onChange={(v) => set({ amplitude: v })} />
          <Select label={t('background')} value={bg} options={[{ value: -1, label: tn('Off') }, ...BACKGROUND_LABELS.map((k, i) => ({ value: i, label: t(k) }))]} onChange={(v) => set({ background: v })} />
          {bg >= 0 && <Slider label={t('backgroundBrightness')} min={5} max={100} step={5} value={cur.backgroundBrightness ?? 30} format={pct} onChange={(v) => set({ backgroundBrightness: v })} />}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-line)' }}>{effectPicker(t('musicFallback'))}</div>
        </>
      )}
      {cur.enabled && kind === 'effect' && effectPicker(t('effect'))}
    </Card>
  );
};

const KeyAnimCard = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const anim = useStore((s) => s.settings[modelId]?.keyAnimation);
  const setAnim = useStore((s) => s.setKeyAnimation);
  const dev = useStore((s) => s.deviceFor(modelId));
  const cur: KeyAnimation = { enabled: false, libraryId: '', name: '', mode: 'cover', speed: 1, brightness: 100, ...anim };
  const set = (patch: Partial<KeyAnimation>): void => setAnim(modelId, { ...cur, ...patch });
  return (
    <Card title={t('keyAnim')}>
      <Toggle label={t('keyAnim')} hint={t('keyAnimHint')} on={cur.enabled && !!cur.libraryId} onChange={(v) => set({ enabled: v })} />
      {cur.enabled && dev && dev.link !== 'usb' && (
        <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--color-warn)' }}><Cable size={16} className="shrink-0" />{t('needsCable')}</div>
      )}
      {cur.enabled && (
        <>
          <div className="py-2 flex items-center justify-between gap-4">
            <span className="text-sm truncate">{cur.name}</span>
            <Segmented value={cur.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'cover', label: t('cover') }, { value: 'fit', label: t('fit') }]} />
          </div>
          <Slider label={t('speed')} min={0.25} max={3} step={0.25} value={cur.speed} format={(v) => `${v}×`} onChange={(v) => set({ speed: v })} />
          <Slider label={t('brightness')} min={10} max={100} step={5} value={cur.brightness} format={pct} onChange={(v) => set({ brightness: v })} />
        </>
      )}
      {(cur.enabled || !cur.libraryId) && (
        <div className="mt-3">
          <LibraryGrid bare selectedId={cur.libraryId} onPick={(p) => set({ libraryId: p.item.id, name: p.item.name, enabled: true })} />
        </div>
      )}
    </Card>
  );
};
