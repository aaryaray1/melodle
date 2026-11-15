import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { languageGenreQueries, phrasePattern, titleNamesBoth } from '../server/providers/facets.ts';
import { genreSpec } from '../server/providers/crossed.ts';
import { languageSpec } from '../server/providers/languages.ts';

const german = languageSpec('de')!;
const french = languageSpec('fr')!;
const korean = languageSpec('ko')!;
const rap = genreSpec('116', 'Rap/Hip Hop');
const pop = genreSpec('132', 'Pop');

test('a language\'s own word for a genre is recognised, spaces and accents aside', () => {
  assert.ok(titleNamesBoth('Deutschrap Brandneu', german, rap), 'one word in German');
  assert.ok(titleNamesBoth('Deutscher Rap 2024', german, rap));
  assert.ok(titleNamesBoth('Rap Français', french, rap));
  assert.ok(titleNamesBoth('Rap francais', french, rap), 'without the cedilla');
  assert.ok(titleNamesBoth('K-Pop Hits', korean, pop));
});

test('a title must name both the language and the genre', () => {
  assert.ok(!titleNamesBoth('Rap Caviar', french, rap), 'no language');
  assert.ok(!titleNamesBoth('Deutschpop Super Hits', german, rap), 'the wrong genre');
  assert.ok(titleNamesBoth('Deutschpop Super Hits', german, null), 'language alone when no genre is asked');
});

test('the phrase pattern does not fire inside other words', () => {
  const pattern = phrasePattern(['k-pop'])!;
  assert.ok(pattern.test('Top K-Pop'));
  assert.ok(!pattern.test('skipping'));
  assert.equal(phrasePattern([]), null);
});

test('the search starts from the language\'s own phrases, then plain combinations', () => {
  const queries = languageGenreQueries(german, rap);
  assert.equal(queries[0], 'deutschrap');
  assert.ok(queries.includes('deutschpop hip hop') || queries.includes('deutschpop rap'));
  assert.equal(new Set(queries).size, queries.length, 'no repeats');
});
