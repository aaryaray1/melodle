import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { draftOf, noGenre, sameTarget, targetOf, toggleHistory, toggleTag } from '../shared/selection.ts';

const rock = { source: 'charts' as const, id: '152' };
const tens = { source: 'decades' as const, id: '2010s' };

test('the current choice becomes the draft', () => {
  assert.deepEqual(draftOf('blend', 'charts:152,decades:2010s'), { kind: 'mix', parts: [rock, tens] });
  assert.deepEqual(draftOf('lastfm', 'top:overall'), { kind: 'history', source: 'lastfm', variant: 'top:overall' });
  assert.deepEqual(draftOf('party', 'all'), { kind: 'history', source: 'party', variant: 'all' });
});

test('a history choice can be switched off again, for every service', () => {
  for (const source of ['lastfm', 'spotify', 'youtube'] as const) {
    const on = toggleHistory(draftOf('charts', '0'), source, 'top:overall');
    assert.deepEqual(on, { kind: 'history', source, variant: 'top:overall' });
    const off = toggleHistory(on, source, 'top:overall');
    assert.deepEqual(off, { kind: 'mix', parts: [] }, `${source} turns off`);
  }
});

test('picking a genre while history is on replaces history', () => {
  const history = draftOf('lastfm', 'top:overall');
  assert.deepEqual(toggleTag(history, rock), { kind: 'mix', parts: [rock] });
});

test('picking a different history option switches to it', () => {
  const next = toggleHistory(draftOf('lastfm', 'top:overall'), 'lastfm', 'loved');
  assert.deepEqual(next, { kind: 'history', source: 'lastfm', variant: 'loved' });
});

test('genres and decades can be emptied, and nothing picked plays global hits', () => {
  const draft = toggleTag(toggleTag({ kind: 'mix', parts: [] }, rock), rock);
  assert.deepEqual(draft, { kind: 'mix', parts: [] });
  assert.deepEqual(targetOf(draft), { source: 'charts', variant: '0' });
});

test('the target is the plain list for one pick, a blend for several', () => {
  assert.deepEqual(targetOf({ kind: 'mix', parts: [rock] }), { source: 'charts', variant: '152' });
  assert.deepEqual(targetOf({ kind: 'mix', parts: [tens, rock] }), { source: 'blend', variant: 'charts:152,decades:2010s' });
  assert.deepEqual(targetOf(draftOf('spotify', 'mix')), { source: 'spotify', variant: 'mix' });
});

test('sameTarget tells whether Play would change anything', () => {
  assert.ok(sameTarget({ kind: 'mix', parts: [rock] }, 'charts', '152'));
  assert.ok(!sameTarget({ kind: 'mix', parts: [rock, tens] }, 'charts', '152'));
  assert.ok(sameTarget({ kind: 'mix', parts: [] }, 'charts', '0'));
});

const globalHits = { source: 'charts' as const, id: '0' };

test('global hits means no genre filter: it is lit whenever no genre is picked', () => {
  assert.deepEqual(draftOf('charts', '0'), { kind: 'mix', parts: [] });
  assert.ok(noGenre({ kind: 'mix', parts: [] }));
  assert.ok(noGenre({ kind: 'mix', parts: [tens] }), 'a decade alone is every genre of that decade');
  assert.ok(!noGenre({ kind: 'mix', parts: [rock] }));
  assert.ok(!noGenre(draftOf('lastfm', 'top:overall')));
});

test('tapping global hits clears the genres and keeps the decades', () => {
  const draft = toggleTag({ kind: 'mix', parts: [rock, tens] }, globalHits);
  assert.deepEqual(draft, { kind: 'mix', parts: [tens] });
  assert.deepEqual(targetOf(draft), { source: 'decades', variant: '2010s' });
});

test('global hits never ends up mixed with genres', () => {
  const draft = toggleTag(toggleTag({ kind: 'mix', parts: [] }, globalHits), rock);
  assert.deepEqual(draft, { kind: 'mix', parts: [rock] });
});
