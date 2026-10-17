import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { pickVideo, rankVideos, type VideoCandidate } from '../server/lib/youtube-match.ts';

// The real results YouTube gave for "Nirvana Smells Like Teen Spirit".
const teenSpirit: VideoCandidate[] = [
  { id: 'hTWKbfoikeg', channel: 'Nirvana', title: 'Nirvana - Smells Like Teen Spirit (Official Music Video)', duration: 279 },
  { id: '69Wqhhun5_o', channel: '7clouds Rock', title: 'Nirvana - Smells Like Teen Spirit (Lyrics)', duration: 300 },
  { id: 'lVkUZh7Jj-0', channel: 'Grunge +', title: 'Nirvana - Smells Like Teen Spirit', duration: 301 },
  { id: 'R3XIGon2RjY', channel: 'Nirvana', title: 'Nirvana - Smells Like Teen Spirit (Live at Reading 1992)', duration: 331 },
  { id: 'V7f03mfxN4I', channel: 'SLAYERO MUSIC', title: 'Nirvana - Smells Like Teen Spirit (Full Version 4K Remastered)', duration: 301 },
  { id: 'Ul8vqaGGnY0', channel: "Rockin'1000", title: "Smells Like Teen Spirit - Rockin'1000 That's Live Official", duration: 405 },
];
const song = { title: 'Smells Like Teen Spirit', artist: 'Nirvana', duration: 301 };

test('the album-length upload wins over the music video and live takes', () => {
  assert.equal(pickVideo(teenSpirit, song)?.id, 'lVkUZh7Jj-0');
});

test('a Topic upload, the album version itself, beats everything', () => {
  const withTopic = [...teenSpirit, { id: 'topic1', channel: 'Nirvana - Topic', title: 'Smells Like Teen Spirit', duration: 301 }];
  assert.equal(pickVideo(withTopic, song)?.id, 'topic1');
});

test('live, cover, remix and sped-up versions are never chosen', () => {
  const only = [
    { id: 'a', channel: 'x', title: 'Smells Like Teen Spirit (Live)', duration: 301 },
    { id: 'b', channel: 'x', title: 'Smells Like Teen Spirit - Piano Cover', duration: 301 },
    { id: 'c', channel: 'x', title: 'Smells Like Teen Spirit (sped up)', duration: 250 },
  ];
  assert.equal(pickVideo(only, song), null);
});

test('a version word in the song title itself is not held against it', () => {
  const remix = { title: 'Levitating (DaBaby Remix)', artist: 'Dua Lipa', duration: 220 };
  const found = pickVideo([{ id: 'r', channel: 'Dua Lipa', title: 'Dua Lipa - Levitating (DaBaby Remix) (Audio)', duration: 220 }], remix);
  assert.equal(found?.id, 'r');
});

test('a video that is not this song at all is not taken', () => {
  assert.equal(pickVideo([{ id: 'z', channel: 'Nirvana', title: 'Nirvana - Come As You Are', duration: 219 }], song), null);
});

test('a length far from the album version rules a video out', () => {
  assert.equal(pickVideo([{ id: 'long', channel: 'x', title: 'Nirvana - Smells Like Teen Spirit', duration: 600 }], song), null);
});

test('the uploads are ranked best first, so a failed fetch can fall back to the next', () => {
  const ranked = rankVideos(teenSpirit, song).map((video) => video.id);
  assert.equal(ranked[0], 'lVkUZh7Jj-0');
  assert.ok(ranked.length >= 2, 'there is a second choice');
  assert.ok(!ranked.includes('R3XIGon2RjY'), 'live takes are not even candidates');
  assert.ok(!ranked.includes('hTWKbfoikeg'), 'the 279s music video is not the album version');
});
