import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Track } from '../shared/types.ts';
import { interleave } from '../server/providers/party.ts';
import { rankMix, type SpotifyTrack, type WeightedList } from '../server/providers/spotify.ts';

function track(title: string, artist: string, contributor: string): Track {
  return {
    id: `deezer:${title}`,
    title,
    artist,
    previewUrl: 'https://cdnt-preview.dzcdn.net/x.mp3',
    previewFrom: 'deezer',
    contributor,
  };
}

test('a party deals songs round-robin, so nobody waits their turn', () => {
  const merged = interleave([
    [track('A1', 'X', 'ana'), track('A2', 'X', 'ana'), track('A3', 'X', 'ana')],
    [track('B1', 'Y', 'ben'), track('B2', 'Y', 'ben'), track('B3', 'Y', 'ben')],
  ]);
  assert.deepEqual(
    merged.map((entry) => entry.contributor),
    ['ana', 'ben', 'ana', 'ben', 'ana', 'ben'],
  );
});

test('a shorter list does not leave gaps at the end', () => {
  const merged = interleave([
    [track('A1', 'X', 'ana'), track('A2', 'X', 'ana'), track('A3', 'X', 'ana')],
    [track('B1', 'Y', 'ben')],
  ]);
  assert.deepEqual(
    merged.map((entry) => entry.contributor),
    ['ana', 'ben', 'ana', 'ana'],
  );
});

test('a song two people share is credited once, to whoever came first', () => {
  const merged = interleave([
    [track('Shared', 'X', 'ana')],
    [track('Shared', 'X', 'ben'), track('B2', 'Y', 'ben')],
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.contributor, 'ana');
});

test('an empty party list contributes nothing rather than breaking', () => {
  assert.deepEqual(interleave([]), []);
  assert.deepEqual(interleave([[], []]), []);
});

function spotify(name: string, artist: string, id = artist): SpotifyTrack {
  return { name, artists: [{ id, name: artist }], album: { name: 'Album' } };
}

test('the mix favours what you play most, across every list', () => {
  const lists: WeightedList[] = [
    { weight: 3, tracks: [spotify('Recent Favourite', 'Ana')] },
    { weight: 1.2, tracks: [spotify('Saved Deep Cut', 'Zed')] },
  ];
  const ranked = rankMix(lists);
  assert.equal(ranked.tracks[0]?.seed.title, 'Recent Favourite');
});

test('a song in several of your lists outranks one that is only in the best list', () => {
  const ranked = rankMix([
    { weight: 2, tracks: [spotify('Only Top', 'Ana')] },
    { weight: 1.2, tracks: [spotify('Everywhere', 'Ben')] },
    { weight: 1.2, tracks: [spotify('Everywhere', 'Ben')] },
  ]);
  assert.equal(ranked.tracks[0]?.seed.title, 'Everywhere');
});

test('rank inside a list matters, not just which list it is', () => {
  const ranked = rankMix([
    { weight: 3, tracks: Array.from({ length: 10 }, (_, i) => spotify(`Song ${i}`, `Artist ${i}`)) },
  ]);
  assert.equal(ranked.tracks[0]?.seed.title, 'Song 0');
  assert.equal(ranked.tracks.at(-1)?.seed.title, 'Song 9');
});

test('artist affinity adds up across lists, which is what drives discovery', () => {
  const ranked = rankMix([
    { weight: 3, tracks: [spotify('One', 'Ana'), spotify('Two', 'Ana')] },
    { weight: 2, tracks: [spotify('Three', 'Ben')] },
  ]);
  assert.equal(ranked.artists[0]?.name, 'Ana');
  assert.ok((ranked.artists[0]?.score ?? 0) > (ranked.artists[1]?.score ?? 0));
});

test('tracks Spotify returns half-formed are skipped, not half-imported', () => {
  const ranked = rankMix([
    { weight: 3, tracks: [undefined, { name: 'No Artist' }, { artists: [{ id: 'a', name: 'No Title' }] }] },
  ]);
  assert.equal(ranked.tracks.length, 0);
});
