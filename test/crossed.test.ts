import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { genreSpec, pairQueries, titleFits, yearFits } from '../server/providers/crossed.ts';

const rock = genreSpec('152', 'Rock');
const hipHop = genreSpec('116', 'Rap/Hip Hop');
const rnb = genreSpec('165', 'R&B');

test('a playlist counts for rock in the 2010s only if its title says both', () => {
  assert.ok(titleFits('2010s Rock', rock, '2010s'));
  assert.ok(titleFits('Rock Hits of the 10s', rock, '2010s'));
  assert.ok(!titleFits('2010s Hits', rock, '2010s'), 'no genre in the title');
  assert.ok(!titleFits('Rock Classics', rock, '2010s'), 'no decade in the title');
  assert.ok(!titleFits('80s Rock', rock, '2010s'), 'the wrong decade');
});

test('a title that spans several decades does not count for one of them', () => {
  assert.ok(!titleFits('Rock 90s 2000s 2010s', rock, '2010s'));
  assert.ok(!titleFits('Hits Dance House Electro 90s 2000s 2010s', genreSpec('106', 'Electro'), '2010s'));
});

test('genre names are matched the way playlist titles spell them', () => {
  assert.ok(titleFits("80's Hip-Hop", hipHop, '1980s'));
  assert.ok(titleFits('80s Rap Classics', hipHop, '1980s'));
  assert.ok(titleFits('90s RnB', rnb, '1990s'));
  assert.ok(titleFits('90s R&B', rnb, '1990s'));
  assert.ok(!titleFits('80s Rockabilly', rock, '1980s'), 'rock must be a word, not a prefix');
});

test('a pair searches the decade both ways round, in both spellings', () => {
  const queries = pairQueries(rock, '2010s');
  assert.ok(queries.includes('2010s rock'));
  assert.ok(queries.includes('10s rock'));
  assert.ok(queries.includes('rock 2010s'));
  assert.equal(new Set(queries).size, queries.length, 'no repeated searches');
});

test('a genre Deezer adds later still gets a sensible search', () => {
  const spec = genreSpec('999', 'Latin');
  assert.ok(titleFits('2000s Latin', spec, '2000s'));
});

test('a song dated before the decade never counts for it', () => {
  assert.ok(!yearFits(1973, '2010s'), 'Piano Man is not 2010s rock');
  assert.ok(yearFits(2014, '2010s'));
});

test('a later date rules a song out only where reissues are rare', () => {
  assert.ok(!yearFits(2011, '2000s'), 'Moves Like Jagger is not from the 2000s');
  assert.ok(yearFits(1998, '1970s'), 'a 1970s record remastered in 1998 still counts');
  assert.ok(!yearFits(1969, '1970s'));
  assert.ok(!yearFits(undefined, '2010s'), 'no date, no proof');
});

test('a song dated in the next decade does not count for an older one', () => {
  assert.ok(!yearFits(1993, '1980s'), 'Shoop is not 80s hip hop');
  assert.ok(yearFits(2005, '1980s'), 'a reissue years later still counts');
});
