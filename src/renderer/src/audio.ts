// System audio (loopback) as frequency levels for the music rhythm. Shared, only runs while needed.
import { bandLevels } from '@shared/liveLighting';

let users = 0;
let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let starting: Promise<boolean> | null = null;

async function open(): Promise<boolean> {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    for (const t of stream.getVideoTracks()) t.stop(); // audio only
    if (!stream.getAudioTracks().length) throw new Error('no system audio');
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -80;
    analyser.maxDecibels = -20;
    ctx.createMediaStreamSource(stream).connect(analyser);
    bins = new Uint8Array(analyser.frequencyBinCount);
    return true;
  } catch (e) {
    const err = e as Error;
    window.aula.addLog(`system audio: ${err.name ? `${err.name}: ` : ''}${err.message}`);
    close();
    return false;
  }
}

function close(): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
  void ctx?.close();
  stream = null; ctx = null; analyser = null; bins = null;
}

/** false if there is no system audio */
export function acquireAudio(): Promise<boolean> {
  users++;
  if (analyser) return Promise.resolve(true);
  starting ??= open().finally(() => { starting = null; });
  return starting;
}

export function releaseAudio(): void {
  users = Math.max(0, users - 1);
  if (!users) close();
}

export function audioLevels(gain: number): number[] {
  if (!analyser || !bins || !ctx) return bandLevels([], 48000, gain);
  analyser.getByteFrequencyData(bins);
  return bandLevels(bins, ctx.sampleRate, gain);
}
