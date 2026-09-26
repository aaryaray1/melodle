import type { StartMode } from '../../shared/types.ts';
import { findEntryPoint, findHook, peaksForWindow } from './scale.ts';

export interface LoadedClip {
  buffer: AudioBuffer;
  /** Where in the preview the game's 15 second window begins. */
  start: number;
  peaks: Float32Array;
}

const WINDOW_SECONDS = 15;
const COLUMNS = 420;
/** Scheduling headroom: the envelope has to be written before the clock reaches it. */
const LEAD_SECONDS = 0.02;

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private clipStart = 0;
  private clipEnd = 0;
  private onEnded: (() => void) | null = null;

  /** A suspended context is enough to decode; only playback needs a gesture. */
  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  /** Resuming costs a few hundred ms, so spend it on the first touch, not the first play. */
  async warm(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
  }

  /** Audio is requested by track id; the server resolves a fresh, unexpired URL. */
  async load(trackId: string, signal?: AbortSignal): Promise<AudioBuffer> {
    const context = this.ensureContext();
    const response = await fetch(`/api/audio?track=${encodeURIComponent(trackId)}`, { signal });
    if (!response.ok) throw new Error('This preview would not load');
    const encoded = await response.arrayBuffer();
    return context.decodeAudioData(encoded);
  }

  /**
   * Plays exactly `duration` seconds from `offset`, scheduled on the audio clock
   * rather than a timer, with a short fade at each edge so a 100ms clip sounds
   * like music instead of a click.
   */
  async play(clip: LoadedClip, duration: number, onEnded?: () => void): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
    const master = this.master;
    if (!master) return;
    this.stop();

    const fade = Math.min(0.01, duration * 0.08);
    const gain = context.createGain();
    const source = context.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(gain);
    gain.connect(master);

    const at = context.currentTime + LEAD_SECONDS;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + fade);
    gain.gain.setValueAtTime(1, at + Math.max(fade, duration - fade));
    gain.gain.linearRampToValueAtTime(0, at + duration);

    source.start(at, clip.start, duration);
    source.stop(at + duration);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        this.onEnded?.();
        this.onEnded = null;
      }
      gain.disconnect();
    };

    this.source = source;
    this.clipStart = at;
    this.clipEnd = at + duration;
    this.onEnded = onEnded ?? null;
  }

  stop(): void {
    const source = this.source;
    this.source = null;
    this.onEnded = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped; nothing to do.
    }
    source.disconnect();
  }

  /** Seconds played so far, or null when nothing is sounding. */
  progress(): number | null {
    const context = this.context;
    if (!context || !this.source) return null;
    const elapsed = context.currentTime - this.clipStart;
    if (elapsed < 0) return 0;
    if (context.currentTime > this.clipEnd) return null;
    return elapsed;
  }

  get playing(): boolean {
    return this.source !== null;
  }
}

/** Slicing is pure maths on a decoded buffer, so switching mode needs no refetch. */
export function clipFor(buffer: AudioBuffer, mode: StartMode): LoadedClip {
  const start = mode === 'hook' ? findHook(buffer, WINDOW_SECONDS) : findEntryPoint(buffer, WINDOW_SECONDS);
  return { buffer, start, peaks: peaksForWindow(buffer, start, WINDOW_SECONDS, COLUMNS) };
}

export const WINDOW = WINDOW_SECONDS;
