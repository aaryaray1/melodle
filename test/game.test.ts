import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Track } from '../shared/types.ts';
import {
  dailyTrack,
  difficultyBand,
  hash,
  MAX_DIFFICULTY,
  nextDifficulty,
  nextUnlock,
  playableTracks,
  randomTrack,
  shareText,
  todayKey,
  unlockedSeconds,
} from '../src/game/rules.ts';
import { isAllowedPreviewUrl } from '../server/routes/audio.ts';
import { isPlausibleKey } from '../server/lib/env.ts';
import { parseVideo } from '../server/providers/youtube.ts';

const pool: Track[] = Array.from({ length: 60 }, (_, index) => ({
  id: `track-${index}`,
  title: `Song ${index}`,
  artist: `Artist ${index}`,
  previewUrl: 'https://cdnt-preview.dzcdn.net/x.mp3',
  previewFrom: 'deezer',
}));

test('the stage ladder runs 0.1 to 15 and stops there', () => {
  assert.equal(unlockedSeconds(0), 0.1);
  assert.equal(unlockedSeconds(4), 15);
  assert.equal(unlockedSeconds(9), 15, 'an overrun index should clamp, not crash');
  assert.equal(nextUnlock(0), 0.5);
  assert.equal(nextUnlock(4), null);
});

test('the song of the day is the same all day and different tomorrow', () => {
  const today = dailyTrack(pool, 'charts:0', '2026-09-21');
  assert.equal(today?.id, dailyTrack(pool, 'charts:0', '2026-09-21')?.id);
  assert.notEqual(today?.id, dailyTrack(pool, 'charts:0', '2026-09-22')?.id);
});

test('two different lists do not hand out the same song on the same day', () => {
  const charts = dailyTrack(pool, 'charts:0', '2026-09-21');
  const lastfm = dailyTrack(pool, 'lastfm:top:overall', '2026-09-21');
  assert.notEqual(charts?.id, lastfm?.id);
});

test('the daily pick spreads across the pool over a year', () => {
  const seen = new Set<string>();
  for (let day = 1; day <= 365; day += 1) {
    const date = new Date(Date.UTC(2026, 0, day));
    seen.add(dailyTrack(pool, 'charts:0', todayKey(date))?.id ?? '');
  }
  assert.ok(seen.size > pool.length * 0.6, `only ${seen.size} of ${pool.length} songs ever came up`);
});

test('hash stays inside a safe integer range', () => {
  for (const value of ['', 'a', 'charts:0|2026-09-21', 'x'.repeat(500)]) {
    const result = hash(value);
    assert.ok(Number.isSafeInteger(result) && result >= 0, `${value} hashed to ${result}`);
  }
});

test('an empty pool yields no song instead of throwing', () => {
  assert.equal(dailyTrack([], 'charts:0', '2026-09-21'), undefined);
  assert.equal(randomTrack([]), undefined);
});

test('the next endless song is never the one just played', () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    assert.notEqual(randomTrack(pool, 'track-7')?.id, 'track-7');
  }
});

test('a one-song pool repeats rather than looping forever', () => {
  assert.equal(randomTrack([pool[0] as Track], 'track-0')?.id, 'track-0');
});

test('the shared result shows the stage grid without naming the song', () => {
  const text = shareText({
    label: 'Global hits',
    day: '2026-09-21',
    daily: true,
    status: 'won',
    guesses: [
      { outcome: 'wrong', label: 'Some Song' },
      { outcome: 'skip', label: 'Skipped' },
      { outcome: 'right', label: 'NINAO' },
    ],
  });
  assert.ok(text.includes('🟥⬛🟩⬜⬜'), text);
  assert.ok(text.includes('2s'), text);
  assert.equal(text.includes('NINAO'), false, 'the share text must not spoil the answer');
});

test('the audio proxy only streams from the preview hosts', () => {
  assert.ok(isAllowedPreviewUrl('https://cdnt-preview.dzcdn.net/api/1/1/x.mp3'));
  assert.ok(isAllowedPreviewUrl('https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a'));
  assert.ok(isAllowedPreviewUrl('https://is1-ssl.mzstatic.com/image.jpg'));

  for (const hostile of [
    'http://cdnt-preview.dzcdn.net/x.mp3',
    'https://dzcdn.net.evil.com/x.mp3',
    'https://evil.com/x.mp3?dzcdn.net',
    'http://127.0.0.1:8787/api/sources',
    'http://169.254.169.254/latest/meta-data/',
    'file:///C:/Windows/win.ini',
    'https://evil.com/#dzcdn.net',
    'not a url',
    '',
  ]) {
    assert.equal(isAllowedPreviewUrl(hostile), false, `${hostile} should be refused`);
  }
});

test('only dashboard-shaped keys are accepted into .env', () => {
  assert.ok(isPlausibleKey('0123456789abcdef0123456789abcdef'));
  assert.ok(isPlausibleKey('1234.apps.googleusercontent.com'));
  for (const bad of ['', 'short', 'has space', 'line\nbreak', 'quote"inside', 'a'.repeat(300)]) {
    assert.equal(isPlausibleKey(bad), false, `${JSON.stringify(bad)} should be refused`);
  }
});

test('YouTube titles resolve to an artist and a song', () => {
  assert.deepEqual(parseVideo({ title: 'NINAO', channelTitle: 'GIMS - Topic' }), {
    title: 'NINAO',
    artist: 'GIMS',
    artwork: undefined,
    link: undefined,
  });
  assert.equal(parseVideo({ title: 'Daft Punk - Get Lucky (Official Video)', channelTitle: 'DaftPunkVEVO' })?.artist, 'Daft Punk');
  assert.equal(parseVideo({ title: 'Daft Punk - Get Lucky (Official Video)', channelTitle: 'DaftPunkVEVO' })?.title, 'Get Lucky');
  assert.equal(parseVideo({ title: 'Some Song [Official Audio]', channelTitle: 'Label' })?.title, 'Some Song');
  assert.equal(parseVideo({ title: 'Deleted video', channelTitle: '' }), null);
  assert.equal(parseVideo({ title: '', channelTitle: 'Anything' }), null);
});

test('songs you thumbed down stop coming up', () => {
  const kept = playableTracks(pool, { 'track-3': -1, 'track-9': -1, 'track-4': 1 });
  assert.equal(kept.length, pool.length - 2);
  assert.equal(
    kept.some((track) => track.id === 'track-3' || track.id === 'track-9'),
    false,
  );
  assert.ok(kept.some((track) => track.id === 'track-4'), 'a liked song stays in');
});

test('disliking almost everything still leaves a playable round', () => {
  const ratings = Object.fromEntries(pool.map((track) => [track.id, -1 as const]));
  assert.equal(playableTracks(pool, ratings).length, pool.length, 'an empty list would break the game');
});

test('the daily pick shifts once a song is ruled out', () => {
  const before = dailyTrack(pool, 'charts:0', '2026-09-21');
  const after = dailyTrack(playableTracks(pool, { [before?.id ?? '']: -1 }), 'charts:0', '2026-09-21');
  assert.notEqual(after?.id, before?.id);
});

function ranked(count: number): Track[] {
  // Index 0 is the biggest hit: rank falls as the index rises.
  return Array.from({ length: count }, (_, index) => ({
    id: `deezer:${index}`,
    title: `Song ${index}`,
    artist: 'Artist',
    previewUrl: 'https://cdnt-preview.dzcdn.net/x.mp3',
    previewFrom: 'deezer' as const,
    rank: 1_000_000 - index * 1000,
  }));
}

test('difficulty 1 draws only from the most popular songs, 5 only from the least', () => {
  const tracks = ranked(100).reverse();
  const easy = difficultyBand(tracks, 1).map((track) => Number(track.id.split(':')[1]));
  const hard = difficultyBand(tracks, MAX_DIFFICULTY).map((track) => Number(track.id.split(':')[1]));
  assert.equal(easy.length, 40);
  assert.equal(Math.max(...easy), 39);
  assert.equal(hard.length, 40);
  assert.equal(Math.min(...hard), 60);
});

test('each difficulty step moves the band toward obscurity', () => {
  const tracks = ranked(200);
  let previous = -1;
  for (let level = 1; level <= MAX_DIFFICULTY; level += 1) {
    const indexes = difficultyBand(tracks, level).map((track) => Number(track.id.split(':')[1]));
    const middle = indexes.reduce((sum, value) => sum + value, 0) / indexes.length;
    assert.ok(middle > previous, `level ${level} should be harder than level ${level - 1}`);
    previous = middle;
  }
});

test('a small pool still leaves every difficulty something to play', () => {
  for (let level = 1; level <= MAX_DIFFICULTY; level += 1) {
    assert.ok(difficultyBand(ranked(6), level).length >= 5);
  }
  assert.equal(difficultyBand([], 3).length, 0);
});

test('songs without a popularity score count as the most obscure', () => {
  const tracks = ranked(20);
  const unknown = { ...tracks[0], id: 'itunes:1', rank: undefined } as Track;
  assert.ok(!difficultyBand([unknown, ...tracks], 1).some((track) => track.id === 'itunes:1'));
  assert.ok(difficultyBand([unknown, ...tracks], MAX_DIFFICULTY).some((track) => track.id === 'itunes:1'));
});

test('difficulty climbs one step per correct guess, stops at 5, and a miss sends it back to 1', () => {
  assert.equal(nextDifficulty(1, true), 2);
  assert.equal(nextDifficulty(3, false), 1);
  assert.equal(nextDifficulty(MAX_DIFFICULTY, false), 1);
  assert.equal(nextDifficulty(MAX_DIFFICULTY, true), MAX_DIFFICULTY);
  assert.equal(nextDifficulty(Number.NaN, true), 2);
});
