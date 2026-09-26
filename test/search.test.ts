import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Track } from '../shared/types.ts';
import { ARTIST_SONGS, buildIndex, searchTracks } from '../src/game/search.ts';

function make(title: string, artist: string): Track {
  return {
    id: `deezer:${artist}:${title}`,
    title,
    artist,
    previewUrl: 'https://cdnt-preview.dzcdn.net/x.mp3',
    previewFrom: 'deezer',
  };
}

// Pool order is the source's own ranking, so earlier means more popular.
const pool: Track[] = [
  make('Blinding Lights', 'The Weeknd'),
  make('Starboy', 'The Weeknd'),
  make('Billie Jean', 'Michael Jackson'),
  make('Save Your Tears', 'The Weeknd'),
  make('bad guy', 'Billie Eilish'),
  make('Beat It', 'Michael Jackson'),
  make('The Hills', 'The Weeknd'),
  make('Thriller', 'Michael Jackson'),
  make('Die For You', 'The Weeknd'),
  make('lovely', 'Billie Eilish'),
  make('Can’t Feel My Face', 'The Weeknd'),
  make('In Your Eyes', 'The Weeknd'),
  make('After Hours', 'The Weeknd'),
  make('Smooth Criminal', 'Michael Jackson'),
  make('ocean eyes', 'Billie Eilish'),
];
const index = buildIndex(pool);
const titles = (query: string) => searchTracks(index, query).map((track) => track.title);

test('searching an artist lists their songs, most popular first', () => {
  const found = titles('the weeknd');
  assert.equal(found.length, ARTIST_SONGS);
  assert.deepEqual(found, [
    'Blinding Lights',
    'Starboy',
    'Save Your Tears',
    'The Hills',
    'Die For You',
    'Can’t Feel My Face',
    'In Your Eyes',
  ]);
});

test('a partial artist name works before you finish typing', () => {
  assert.deepEqual(titles('weeknd').slice(0, 2), ['Blinding Lights', 'Starboy']);
  assert.deepEqual(titles('michael').slice(0, 3), ['Billie Jean', 'Beat It', 'Thriller']);
});

test('an artist with fewer songs than seven returns only what they have', () => {
  const found = titles('billie eilish');
  assert.deepEqual(found, ['bad guy', 'lovely', 'ocean eyes']);
});

test('a title that starts with the query still leads, even when an artist matches it', () => {
  const found = titles('billie');
  assert.equal(found[0], 'Billie Jean', 'the song called Billie Jean must not be buried under Billie Eilish');
  assert.ok(found.includes('bad guy'), 'Billie Eilish should still be offered');
});

test('searching a song title finds that song', () => {
  assert.equal(titles('blinding')[0], 'Blinding Lights');
  assert.equal(titles('smooth criminal')[0], 'Smooth Criminal');
});

test('a misspelt title still turns up', () => {
  assert.ok(titles('blinidng lights').includes('Blinding Lights'));
});

test('case and punctuation do not matter', () => {
  assert.equal(titles('THE WEEKND').length, ARTIST_SONGS);
  assert.ok(titles('cant feel my face').includes('Can’t Feel My Face'));
});

test('an empty query offers nothing', () => {
  assert.deepEqual(titles(''), []);
  assert.deepEqual(titles('   '), []);
});

test('nonsense returns nothing rather than the whole pool', () => {
  assert.ok(titles('zzzqqqxyw').length < 3);
});

test('the list never grows past what the dropdown can show', () => {
  for (const query of ['the', 'a', 'e', 'michael', 'the weeknd']) {
    assert.ok(searchTracks(index, query).length <= 9, `${query} returned too many`);
  }
});

test('an empty pool searches cleanly', () => {
  assert.deepEqual(searchTracks(buildIndex([]), 'anything'), []);
});
