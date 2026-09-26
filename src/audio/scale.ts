/**
 * The five stages (0.1s -> 15s) are roughly geometric, so the timeline is drawn
 * on a log axis. That gives each stage a similar slice of the bar instead of
 * cramming the first two into the leftmost 3% of a linear one.
 */
const BEND = 0.1;

export function positionOf(seconds: number, windowSeconds: number): number {
  if (seconds <= 0) return 0;
  return Math.log1p(seconds / BEND) / Math.log1p(windowSeconds / BEND);
}

export function secondsAt(position: number, windowSeconds: number): number {
  return BEND * (Math.exp(position * Math.log1p(windowSeconds / BEND)) - 1);
}

/**
 * One peak per drawn column, sampled across the log axis so the opening
 * milliseconds get real detail instead of a single pixel.
 */
export function peaksForWindow(
  buffer: AudioBuffer,
  startSeconds: number,
  windowSeconds: number,
  columns: number,
): Float32Array {
  const channel = buffer.getChannelData(0);
  const other = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const rate = buffer.sampleRate;
  const peaks = new Float32Array(columns);

  for (let column = 0; column < columns; column += 1) {
    const from = startSeconds + secondsAt(column / columns, windowSeconds);
    const to = startSeconds + secondsAt((column + 1) / columns, windowSeconds);
    const first = Math.max(0, Math.floor(from * rate));
    const last = Math.min(channel.length, Math.max(first + 1, Math.ceil(to * rate)));
    const step = Math.max(1, Math.floor((last - first) / 256));

    let peak = 0;
    for (let index = first; index < last; index += step) {
      const left = Math.abs(channel[index] as number);
      const right = other ? Math.abs(other[index] as number) : left;
      const value = (left + right) / 2;
      if (value > peak) peak = value;
    }
    peaks[column] = peak;
  }

  // A single transient must not flatten the rest of the track, so the scale is
  // the 95th percentile rather than the maximum.
  const sorted = Float32Array.from(peaks).sort();
  const reference = sorted[Math.floor(sorted.length * 0.95)] as number;
  if (reference > 0) {
    for (let column = 0; column < columns; column += 1) {
      peaks[column] = Math.min(1, (peaks[column] as number) / reference);
    }
  }
  return peaks;
}

/**
 * The start of the preview, skipping a fade-in or a beat of silence that would
 * make the 0.1s round unwinnable. Note this is the start of the *excerpt*:
 * Deezer and Apple cut previews from the middle of a track, so the song's own
 * intro is not in the audio at all.
 */
export function findEntryPoint(buffer: AudioBuffer, windowSeconds: number): number {
  const channel = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const latest = Math.max(0, buffer.duration - windowSeconds);
  if (latest <= 0) return 0;

  const frame = Math.floor(rate * 0.05);
  const searchEnd = Math.min(channel.length, Math.floor(Math.min(latest, 6) * rate) + frame);
  const energies: number[] = [];
  for (let start = 0; start + frame <= searchEnd; start += frame) {
    let sum = 0;
    for (let index = start; index < start + frame; index += 4) {
      const sample = channel[index] as number;
      sum += sample * sample;
    }
    energies.push(Math.sqrt(sum / (frame / 4)));
  }
  if (!energies.length) return 0;

  const loudest = Math.max(...energies);
  if (loudest === 0) return 0;
  const threshold = loudest * 0.35;
  const firstLoud = energies.findIndex((energy) => energy >= threshold);
  if (firstLoud <= 0) return 0;
  // Back off one frame so the attack of the note is inside the window.
  return Math.min(latest, Math.max(0, (firstLoud - 1) * 0.05));
}

/**
 * The most energetic window of the track, which for most songs is the chorus.
 *
 * An earlier version looked for the peak of an energy curve and walked back to
 * its onset. On modern, heavily compressed pop that walk reaches the start of
 * the preview, so "hook" and "opening" collapsed into the same thing. Scoring
 * whole candidate windows instead cannot degenerate: there is always a loudest
 * one. Near-ties resolve to the later window, because a chorus sits later than
 * second zero and the opening is what the other mode is for.
 */
export function findHook(buffer: AudioBuffer, windowSeconds: number): number {
  const channel = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const latest = Math.max(0, buffer.duration - windowSeconds);
  if (latest <= 0) return 0;

  const step = 0.05;
  const frame = Math.max(1, Math.floor(rate * step));
  const energy: number[] = [];
  for (let at = 0; at + frame <= channel.length; at += frame) {
    let sum = 0;
    for (let index = at; index < at + frame; index += 4) {
      const sample = channel[index] as number;
      sum += sample * sample;
    }
    energy.push(Math.sqrt(sum / (frame / 4)));
  }

  const span = Math.round(windowSeconds / step);
  const lastStart = Math.min(energy.length - span, Math.round(latest / step));
  if (span <= 0 || lastStart <= 0) return 0;

  const prefix = new Float64Array(energy.length + 1);
  for (let index = 0; index < energy.length; index += 1) {
    prefix[index + 1] = (prefix[index] as number) + (energy[index] as number);
  }
  const meanAt = (index: number) => ((prefix[index + span] as number) - (prefix[index] as number)) / span;

  let best = 0;
  for (let index = 1; index <= lastStart; index += 1) {
    if (meanAt(index) > meanAt(best)) best = index;
  }

  const target = meanAt(best) * 0.98;
  let chosen = best;
  for (let index = lastStart; index > best; index -= 1) {
    if (meanAt(index) >= target) {
      chosen = index;
      break;
    }
  }
  return Math.min(latest, chosen * step);
}
