import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { thumbnail } from '../shared/artwork.ts';

test('a Deezer cover is asked for at the small size', () => {
  assert.equal(
    thumbnail('https://cdn-images.dzcdn.net/images/cover/abc/500x500-000000-80-0-0.jpg', 120),
    'https://cdn-images.dzcdn.net/images/cover/abc/120x120-000000-80-0-0.jpg',
  );
});

test('an Apple Music cover is asked for at the small size', () => {
  assert.equal(
    thumbnail('https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/source/600x600bb.jpg', 120),
    'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/source/120x120bb.jpg',
  );
});

test('any other image is left alone, and no image stays no image', () => {
  const lastfm = 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.png';
  assert.equal(thumbnail(lastfm, 120), lastfm);
  assert.equal(thumbnail(undefined, 120), undefined);
});
