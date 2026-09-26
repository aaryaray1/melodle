import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { matchesTrack, normalize, similarity, trackKey } from '../shared/text.ts';

test('normalize strips accents, edition noise and punctuation', () => {
  assert.equal(normalize('Björk - Jóga'), 'bjork joga');
  assert.equal(normalize('Bohemian Rhapsody (Remastered 2011)'), 'bohemian rhapsody');
  assert.equal(normalize('Levitating (feat. DaBaby)'), 'levitating');
  assert.equal(normalize('Blinding Lights - Radio Edit'), 'blinding lights');
  assert.equal(normalize('Sunflower feat. Swae Lee'), 'sunflower');
  assert.equal(normalize('Simon & Garfunkel'), 'simon and garfunkel');
  assert.equal(normalize('  MULTIPLE   spaces '), 'multiple spaces');
});

test('normalize keeps distinct songs distinct', () => {
  assert.notEqual(normalize('Hello'), normalize('Halo'));
  assert.notEqual(normalize('One'), normalize('One More Time'));
});

test('similarity scores identical strings at 1 and unrelated ones near 0', () => {
  assert.equal(similarity('Get Lucky', 'Get Lucky'), 1);
  assert.equal(similarity('Get Lucky', 'Get Lucky (Radio Edit)'), 1);
  assert.ok(similarity('Get Lucky', 'Around the World') < 0.3);
  assert.equal(similarity('', 'anything'), 0);
});

test('a guess counts when the release differs but the song does not', () => {
  const answer = { title: 'Get Lucky', artist: 'Daft Punk' };
  assert.ok(matchesTrack({ title: 'Get Lucky (Radio Edit)', artist: 'Daft Punk' }, answer));
  assert.ok(matchesTrack({ title: 'Get Lucky', artist: 'Daft Punk, Pharrell Williams' }, answer));
  assert.ok(matchesTrack({ title: 'get lucky', artist: 'daft punk' }, answer));
});

test('a guess fails on a different song or a different artist', () => {
  const answer = { title: 'Get Lucky', artist: 'Daft Punk' };
  assert.equal(matchesTrack({ title: 'Around the World', artist: 'Daft Punk' }, answer), false);
  assert.equal(matchesTrack({ title: 'Get Lucky', artist: 'Mark Ronson' }, answer), false);
  assert.equal(matchesTrack({ title: 'Get Down', artist: 'Daft Punk' }, answer), false);
});

test('a cover by a different artist is not the answer', () => {
  assert.equal(
    matchesTrack({ title: 'Hurt', artist: 'Johnny Cash' }, { title: 'Hurt', artist: 'Nine Inch Nails' }),
    false,
  );
});

test('trackKey collapses the same song listed two ways', () => {
  assert.equal(
    trackKey({ title: 'Dreams - 2004 Remaster', artist: 'Fleetwood Mac' }),
    trackKey({ title: 'Dreams', artist: 'Fleetwood Mac' }),
  );
});
