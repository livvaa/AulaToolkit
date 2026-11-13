// Keeps the device in sync with the active profile: changes are pushed as they happen,
// and readable values are pulled from the device when it connects.
import { modelById } from '@shared/models';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import type { LightingState, MouseProfile, Profile } from '@shared/types';
import { activeProfile, useStore } from './store';
import { isBarOverridden, isOverridden } from './overrides';

export type Section = 'lighting' | 'perKey' | 'bar' | 'settings' | 'keymap' | 'fnKeymap' | 'macros' | 'dpi' | 'buttons' | 'perf' | 'all';

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
const pending: Record<string, Set<Section>> = {};

/** Debounced push of one profile section to the device. */
export function schedule(modelId: string, section: Section): void {
  (pending[modelId] ??= new Set()).add(section);
  clearTimeout(timers[modelId]);
  timers[modelId] = setTimeout(() => {
    const sections = pending[modelId]; pending[modelId] = new Set();
    void push(modelId, sections);
  }, 350);
}

async function push(modelId: string, sections: Set<Section>): Promise<void> {
  const s = useStore.getState();
  const model = modelById(modelId);
  const file = s.settings[modelId];
  const p = file?.profiles.find((x) => x.id === file.activeProfile);
  if (!model || !p || !s.deviceFor(modelId)) return;
  const all = sections.has('all');
  const has = (x: Section): boolean => all || sections.has(x);
  s.setBusy(`${modelId}:sync`, true);
  try {
    if (model.kind === 'keyboard' && p.keyboard) {
      const k = p.keyboard;
      if (has('macros')) await s.call(modelId, 'setMacros', file?.macros ?? []);
      if (has('keymap')) await s.call(modelId, 'setKeymap', 'base', k.keymap);
      if (has('fnKeymap') && model.features.fnLayer) await s.call(modelId, 'setKeymap', 'fn', k.fnKeymap);
      if (has('settings')) await s.call(modelId, 'setSettings', k.settings);
      // skip while blackout/music/gif is on, overrides.ts writes it back after
      const lit = !isOverridden(modelId);
      if (lit && (has('lighting') || has('perKey'))) {
        if (k.lighting.mode === USER_LIGHT_MODE) await s.call(modelId, 'setUserLight', k.perKey, k.lighting.brightness);
        else await s.call(modelId, 'setLighting', k.lighting);
      }
      if (!isBarOverridden(modelId) && has('bar') && model.features.bar && k.barMode !== undefined) await s.call(modelId, 'setBarLight', k.barMode);
      if (all && model.features.clock) await s.call(modelId, 'syncTime', 1).catch(() => undefined);
    }
    if (model.kind === 'mouse' && p.mouse) {
      const m = p.mouse;
      if (model.protocol !== 'incott') {
        if (has('settings') && m.settings) await s.call(modelId, 'setSettings', m.settings);
        return;
      }
      const macros = file?.macros ?? [];
      if (has('macros') || has('buttons')) {
        for (const [, a] of Object.entries(m.buttons)) if (a.type === 'macro' && macros[a.index]) await s.call(modelId, 'uploadMacro', a.index, macros[a.index].steps, a.mode, a.loops ?? 1);
      }
      if (has('buttons')) await s.call(modelId, 'setButtons', m.buttons);
      if (has('dpi')) {
        await s.call(modelId, 'setDpiStages', m.dpiStages);
        await s.call(modelId, 'setDpiCycle', Math.max(1, Math.min(6, m.dpiCount)), Math.min(m.dpiActive, m.dpiCount - 1), m.dpiLed, m.dpiExtra);
      }
      if (has('perf')) {
        await s.call(modelId, 'setPolling', m.polling);
        await s.call(modelId, 'setLiftOff', m.liftOff);
        await s.call(modelId, 'setToggle', 'motionSync', m.motionSync);
        await s.call(modelId, 'setToggle', 'angleSnap', m.angleSnap);
        await s.call(modelId, 'setToggle', 'ripple', m.ripple);
        await s.call(modelId, 'setPerformance', m.performance);
        await s.call(modelId, 'setDebounce', m.debounce);
        await s.call(modelId, 'setSleep', m.sleep);
        await s.call(modelId, 'setFireKey', m.fireKey.times, m.fireKey.intervalMs);
        await s.call(modelId, 'setReceiverLed', m.receiverLed);
      }
    }
  } catch {
    /* already toasted by call() */
  } finally {
    s.setBusy(`${modelId}:sync`, false);
  }
}

/** Runs any pending push for the device right away and resolves once it has been written. */
export async function flush(modelId: string): Promise<void> {
  clearTimeout(timers[modelId]);
  const sections = pending[modelId];
  if (!sections || !sections.size) return;
  pending[modelId] = new Set();
  await push(modelId, sections);
}

/** Pushes the whole active profile (used when the user switches profiles). */
export const applyProfile = (modelId: string): Promise<void> => push(modelId, new Set<Section>(['all']));

/** Reads whatever the device can report and merges it into the active profile without writing anything. */
export async function pullFromDevice(modelId: string): Promise<boolean> {
  const s = useStore.getState();
  const model = modelById(modelId);
  if (!model || !s.deviceFor(modelId)) return false;
  s.setBusy(`${modelId}:pull`, true);
  try {
    if (model.kind === 'mouse') {
      const live = await s.call<Partial<MouseProfile>>(modelId, 'readAll');
      const got = live && Object.keys(live).length > 0;
      if (got) s.updateProfile(modelId, (p: Profile) => { if (p.mouse) Object.assign(p.mouse, live); }, null);
      return !!got;
    }
    if (model.protocol === 'g5kb') {
      const light = await s.call<Partial<LightingState> | null>(modelId, 'readLighting').catch(() => null);
      const st = await s.call<Record<string, number>>(modelId, 'readSettings').catch(() => null);
      if (light || st) s.updateProfile(modelId, (p) => { if (!p.keyboard) return; if (light) Object.assign(p.keyboard.lighting, light); if (st) Object.assign(p.keyboard.settings, st); }, null);
      return !!(light || st);
    }
    // AULA "04" keyboards (S75 Pro) have no read-back for their settings: the only lighting read returns
    // the colours the LEDs show at this moment (used for the live view), not the saved per-key layout.
    // Tell the driver which effect the profile has, so it can follow changes made with the knob.
    if (model.protocol === 'aula04') {
      const mode = activeProfile(s, modelId)?.keyboard?.lighting.mode;
      if (mode !== undefined) await s.call(modelId, 'noteLightMode', mode).catch(() => undefined);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    s.setBusy(`${modelId}:pull`, false);
  }
}
