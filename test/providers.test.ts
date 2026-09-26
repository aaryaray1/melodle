import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toSeeds, type LastfmTrack } from '../server/providers/lastfm.ts';
import { seedFrom, type SpotifyTrack } from '../server/providers/spotify.ts';
import { safeUrl } from '../server/lib/preview.ts';

test('Last.fm artists survive all three shapes the API uses', () => {
  const raw: LastfmTrack[] = [
    { name: 'Get Lucky', artist: { name: 'Daft Punk' } },
    { name: 'Around the World', artist: { '#text': 'Daft Punk' } },
    { name: 'Digital Love', artist: 'Daft Punk' },
  ];
  assert.deepEqual(
    toSeeds(raw, 10).map((seed) => seed.artist),
    ['Daft Punk', 'Daft Punk', 'Daft Punk'],
  );
});

test('Last.fm entries without a title or artist are dropped, not half-imported', () => {
  const raw: LastfmTrack[] = [
    { name: '   ', artist: { name: 'Someone' } },
    { name: 'Real Song', artist: { name: '  ' } },
    { name: 'Real Song', artist: { name: 'Someone' } },
  ];
  const seeds = toSeeds(raw, 10);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0]?.title, 'Real Song');
});

test('recently played duplicates collapse to one song', () => {
  const raw: LastfmTrack[] = [
    { name: 'Dreams', artist: { name: 'Fleetwood Mac' } },
    { name: 'Dreams - 2004 Remaster', artist: { name: 'Fleetwood Mac' } },
    { name: 'Dreams', artist: { name: 'Fleetwood Mac' } },
    { name: 'Rhiannon', artist: { name: 'Fleetwood Mac' } },
  ];
  assert.equal(toSeeds(raw, 10).length, 2);
});

test('the limit is honoured so a huge history cannot stall a round', () => {
  const raw: LastfmTrack[] = Array.from({ length: 500 }, (_, index) => ({
    name: `Song ${index}`,
    artist: { name: 'Artist' },
  }));
  assert.equal(toSeeds(raw, 120).length, 120);
});

test('Last.fm picks the largest artwork it offers', () => {
  const seeds = toSeeds(
    [
      {
        name: 'Song',
        artist: { name: 'Artist' },
        image: [
          { size: 'small', '#text': 'https://example.com/s.png' },
          { size: 'extralarge', '#text': 'https://example.com/xl.png' },
        ],
      },
    ],
    1,
  );
  assert.equal(seeds[0]?.artwork, 'https://example.com/xl.png');
});

test('Last.fm placeholder artwork is treated as no artwork', () => {
  const seeds = toSeeds([{ name: 'Song', artist: { name: 'Artist' }, image: [{ size: 'large', '#text': '' }] }], 1);
  assert.equal(seeds[0]?.artwork, undefined);
});

test('Spotify collaborations keep every credited artist', () => {
  const track: SpotifyTrack = {
    name: 'Get Lucky',
    artists: [{ name: 'Daft Punk' }, { name: 'Pharrell Williams' }],
    album: { name: 'Random Access Memories', images: [{ url: 'https://i.scdn.co/image/big' }] },
    external_urls: { spotify: 'https://open.spotify.com/track/1' },
  };
  const seed = seedFrom(track);
  assert.equal(seed?.artist, 'Daft Punk, Pharrell Williams');
  assert.equal(seed?.artwork, 'https://i.scdn.co/image/big');
  assert.equal(seed?.link, 'https://open.spotify.com/track/1');
});

test('a Spotify entry with no track survives as null', () => {
  assert.equal(seedFrom(undefined), null);
  assert.equal(seedFrom({ name: 'Untitled' }), null);
  assert.equal(seedFrom({ artists: [{ name: 'Nobody' }] }), null);
});

test('only web URLs reach an href or src attribute', () => {
  assert.equal(safeUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(safeUrl('http://example.com/a.jpg'), 'http://example.com/a.jpg');
  for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'not a url', '', undefined]) {
    assert.equal(safeUrl(hostile), undefined, `${hostile} should be dropped`);
  }
});
