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
  private gain: GainNode | null = null;
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

  /**
   * Audio is requested by track id; the server resolves a fresh, unexpired URL.
   * `intro` asks for the song's real opening instead of the mid-song preview.
   */
  async load(trackId: string, signal?: AbortSignal, kind: 'preview' | 'intro' = 'preview'): Promise<AudioBuffer> {
    const context = this.ensureContext();
    const route = kind === 'intro' ? 'intro' : 'audio';
    const response = await fetch(`/api/${route}?track=${encodeURIComponent(trackId)}`, { signal });
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

    // The end is a scheduled stop rather than start()'s duration argument, because a
    // stop time can be moved later while the clip plays: see extend().
    source.start(at, clip.start);
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
    this.gain = gain;
    this.clipStart = at;
    this.clipEnd = at + duration;
    this.onEnded = onEnded ?? null;
  }

  /**
   * Lets a clip that is still sounding run on to `duration` seconds in total: a
   * skip or a wrong guess mid-play unlocks more, and the music simply keeps going.
   * Returns false when nothing is playing (or it already ended), so there is nothing to extend.
   */
  extend(duration: number): boolean {
    const context = this.context;
    const source = this.source;
    const gain = this.gain;
    if (!context || !source || !gain) return false;
    const now = context.currentTime;
    const end = this.clipStart + duration;
    if (now >= this.clipEnd || end <= this.clipEnd) return false;

    const fade = Math.min(0.01, duration * 0.08);
    const level = gain.gain;
    // Drop the old fade-out; if it had begun, come back up rather than jump.
    level.cancelScheduledValues(now);
    level.setValueAtTime(level.value, now);
    level.linearRampToValueAtTime(1, now + fade);
    level.setValueAtTime(1, end - fade);
    level.linearRampToValueAtTime(0, end);
    // A later stop() replaces the earlier one while the source is still running.
    source.stop(end);
    this.clipEnd = end;
    return true;
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
