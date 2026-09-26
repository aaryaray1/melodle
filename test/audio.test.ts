import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findEntryPoint, findHook, peaksForWindow, positionOf, secondsAt } from '../src/audio/scale.ts';
import { STAGE_DURATIONS } from '../shared/types.ts';

const WINDOW = 15;

/** A stand-in for the decoded preview, so the analysis can run without an AudioContext. */
function fakeBuffer(samples: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    sampleRate,
    length: samples.length,
    duration: samples.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function tone(seconds: number, amplitude: number, sampleRate = 44100): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * amplitude;
  }
  return samples;
}

test('the time axis maps the window onto exactly 0..1', () => {
  assert.equal(positionOf(0, WINDOW), 0);
  assert.equal(positionOf(WINDOW, WINDOW), 1);
  assert.equal(positionOf(-5, WINDOW), 0);
});

test('position and seconds are inverses', () => {
  for (const seconds of [0.1, 0.5, 2, 8, 15]) {
    const round = secondsAt(positionOf(seconds, WINDOW), WINDOW);
    assert.ok(Math.abs(round - seconds) < 1e-9, `${seconds} round-tripped to ${round}`);
  }
});

test('every stage gets a visible slice of the timeline', () => {
  const positions = STAGE_DURATIONS.map((seconds) => positionOf(seconds, WINDOW));
  const widths = positions.map((position, index) => position - (positions[index - 1] ?? 0));
  for (const [index, width] of widths.entries()) {
    assert.ok(width > 0.1, `stage ${index} would only take ${(width * 100).toFixed(1)}% of the bar`);
  }
  assert.ok(Math.max(...widths) / Math.min(...widths) < 2.5, 'stages should be roughly even on a log axis');
});

test('peaks are normalised and one per column', () => {
  const peaks = peaksForWindow(fakeBuffer(tone(20, 0.25)), 0, WINDOW, 64);
  assert.equal(peaks.length, 64);
  assert.ok(Math.max(...peaks) <= 1);
  assert.ok(Math.max(...peaks) > 0.9, 'a steady tone should reach the top of the scale');
});

test('a lone transient does not flatten the rest of the waveform', () => {
  const samples = tone(20, 0.2);
  for (let index = 0; index < 400; index += 1) samples[index] = 1;
  const peaks = peaksForWindow(fakeBuffer(samples), 0, WINDOW, 64);
  const tail = Array.from(peaks.slice(10));
  assert.ok(Math.max(...tail) > 0.8, 'the steady part should still be drawn at full height');
});

test('the window starts where the music starts, not in the lead-in silence', () => {
  const sampleRate = 44100;
  const silence = new Float32Array(sampleRate * 2);
  const music = tone(25, 0.4);
  const samples = new Float32Array(silence.length + music.length);
  samples.set(silence, 0);
  samples.set(music, silence.length);

  const start = findEntryPoint(fakeBuffer(samples, sampleRate), WINDOW);
  assert.ok(start > 1.5 && start <= 2, `expected a start near 2s, got ${start}`);
});

test('a track that is loud from the first sample starts at zero', () => {
  assert.equal(findEntryPoint(fakeBuffer(tone(30, 0.5)), WINDOW), 0);
});

test('the window never runs past the end of a short preview', () => {
  const start = findEntryPoint(fakeBuffer(tone(10, 0.5)), WINDOW);
  assert.equal(start, 0, 'a preview shorter than the window has nowhere to move to');
});

/** Quiet verse, loud chorus, quiet outro - the shape findHook has to spot. */
function song(sampleRate = 44100): Float32Array {
  const parts = [
    { seconds: 8, amplitude: 0.12 },
    { seconds: 10, amplitude: 0.85 },
    { seconds: 12, amplitude: 0.12 },
  ];
  const total = parts.reduce((sum, part) => sum + part.seconds, 0) * sampleRate;
  const samples = new Float32Array(total);
  let cursor = 0;
  for (const part of parts) {
    const length = part.seconds * sampleRate;
    for (let index = 0; index < length; index += 1) {
      samples[cursor + index] = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * part.amplitude;
    }
    cursor += length;
  }
  return samples;
}

test('hook mode opens on the loud section, not the quiet intro', () => {
  const start = findHook(fakeBuffer(song()), WINDOW);
  assert.ok(start > 5 && start < 11, `expected the chorus near 8s, got ${start}`);
});

test('opening mode and hook mode disagree on a song with a late chorus', () => {
  const buffer = fakeBuffer(song());
  assert.notEqual(findHook(buffer, WINDOW), findEntryPoint(buffer, WINDOW));
});

test('hook mode never runs past the end of the preview', () => {
  for (const seconds of [10, 16, 30]) {
    const buffer = fakeBuffer(tone(seconds, 0.5));
    const start = findHook(buffer, WINDOW);
    assert.ok(start >= 0, `negative start for a ${seconds}s preview`);
    assert.ok(start <= Math.max(0, buffer.duration - WINDOW) + 1e-9, `${seconds}s preview started at ${start}`);
  }
});

test('a song with no loud section still gives a usable start', () => {
  const start = findHook(fakeBuffer(tone(30, 0.3)), WINDOW);
  assert.ok(Number.isFinite(start) && start >= 0 && start <= 15);
});

test('hook mode is stable: the same song always opens in the same place', () => {
  const buffer = fakeBuffer(song());
  assert.equal(findHook(buffer, WINDOW), findHook(buffer, WINDOW));
});

test('hook mode stays distinct on a uniformly loud track', () => {
  // Modern pop is compressed flat; hook must not collapse onto the opening.
  const buffer = fakeBuffer(tone(30, 0.6));
  assert.notEqual(findHook(buffer, WINDOW), findEntryPoint(buffer, WINDOW));
});
