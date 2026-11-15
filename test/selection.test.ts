import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { draftOf, isPicked, sameTarget, targetOf, toggleHistory, toggleTag } from '../shared/selection.ts';

const rock = { source: 'charts' as const, id: '152' };
const tens = { source: 'decades' as const, id: '2010s' };
const korean = { source: 'lang' as const, id: 'ko' };
const globalHits = { source: 'charts' as const, id: '0' };

test('the current choice becomes the draft', () => {
  assert.deepEqual(draftOf('blend', 'charts:152,decades:2010s,lang:ko'), { kind: 'mix', parts: [rock, tens, korean] });
  assert.deepEqual(draftOf('lastfm', 'top:overall'), { kind: 'history', source: 'lastfm', variant: 'top:overall' });
  assert.deepEqual(draftOf('charts', '0'), { kind: 'mix', parts: [globalHits] });
});

test('global hits is a pick like any other: it mixes with genres and sits in the result', () => {
  const draft = toggleTag({ kind: 'mix', parts: [rock] }, globalHits);
  assert.deepEqual(draft, { kind: 'mix', parts: [rock, globalHits] });
  assert.deepEqual(targetOf(draft), { source: 'blend', variant: 'charts:0,charts:152' });
  assert.ok(isPicked(draft, globalHits));
  assert.ok(isPicked(draft, rock));
});

test('with nothing picked, global hits is what plays, and shows as picked', () => {
  const empty = { kind: 'mix' as const, parts: [] };
  assert.deepEqual(targetOf(empty), { source: 'charts', variant: '0' });
  assert.ok(isPicked(empty, globalHits));
  assert.ok(!isPicked({ kind: 'mix', parts: [tens] }, globalHits), 'a decade alone is that decade, not global hits');
});

test('a language alone plays as a mix of one part', () => {
  assert.deepEqual(targetOf({ kind: 'mix', parts: [korean] }), { source: 'blend', variant: 'lang:ko' });
  assert.deepEqual(targetOf({ kind: 'mix', parts: [rock] }), { source: 'charts', variant: '152' });
});

test('a history choice can be switched off again, for every service', () => {
  for (const source of ['lastfm', 'spotify', 'youtube'] as const) {
    const on = toggleHistory(draftOf('charts', '0'), source, 'top:overall');
    assert.deepEqual(on, { kind: 'history', source, variant: 'top:overall' });
    assert.deepEqual(toggleHistory(on, source, 'top:overall'), { kind: 'mix', parts: [] }, `${source} turns off`);
  }
});

test('picking a tag while history is on replaces history, and tags toggle off', () => {
  assert.deepEqual(toggleTag(draftOf('lastfm', 'top:overall'), rock), { kind: 'mix', parts: [rock] });
  assert.deepEqual(toggleTag(toggleTag({ kind: 'mix', parts: [] }, rock), rock), { kind: 'mix', parts: [] });
});

test('sameTarget tells whether Play would change anything', () => {
  assert.ok(sameTarget({ kind: 'mix', parts: [rock] }, 'charts', '152'));
  assert.ok(!sameTarget({ kind: 'mix', parts: [rock, tens] }, 'charts', '152'));
  assert.ok(sameTarget({ kind: 'mix', parts: [] }, 'charts', '0'));
  assert.ok(sameTarget({ kind: 'mix', parts: [globalHits] }, 'charts', '0'));
});
