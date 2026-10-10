import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { blendLabel, blendVariant, MAX_BLEND, parseBlend, selectionOf, toggleSelection } from '../shared/blend.ts';

test('a blend variant round-trips and is the same whatever order it was picked in', () => {
  const variant = blendVariant([
    { source: 'decades', id: '1980s' },
    { source: 'charts', id: '152' },
  ]);
  assert.equal(variant, blendVariant([
    { source: 'charts', id: '152' },
    { source: 'decades', id: '1980s' },
  ]));
  assert.deepEqual(parseBlend(variant), [
    { source: 'charts', id: '152' },
    { source: 'decades', id: '1980s' },
  ]);
});

test('parsing drops anything that is not a chart or decade id, and duplicates', () => {
  assert.deepEqual(parseBlend('charts:152,lastfm:top,decades:../x,decades:1990s,charts:152,charts:abc'), [
    { source: 'charts', id: '152' },
    { source: 'decades', id: '1990s' },
  ]);
  assert.deepEqual(parseBlend(''), []);
});

test('a blend never holds more than the cap', () => {
  const many = Array.from({ length: 20 }, (_, index) => `charts:${index}`).join(',');
  assert.equal(parseBlend(many).length, MAX_BLEND);
});

test('the current pick becomes the starting selection', () => {
  assert.deepEqual(selectionOf('charts', '116'), [{ source: 'charts', id: '116' }]);
  assert.deepEqual(selectionOf('decades', '2000s'), [{ source: 'decades', id: '2000s' }]);
  assert.deepEqual(selectionOf('blend', 'charts:0,decades:1970s'), [
    { source: 'charts', id: '0' },
    { source: 'decades', id: '1970s' },
  ]);
  assert.deepEqual(selectionOf('lastfm', 'top:overall'), []);
});

test('toggling adds and removes, never empties the selection, and stops at the cap', () => {
  const rock = { source: 'charts' as const, id: '152' };
  const eighties = { source: 'decades' as const, id: '1980s' };
  assert.deepEqual(toggleSelection([rock], eighties), [rock, eighties]);
  assert.deepEqual(toggleSelection([rock, eighties], rock), [eighties]);
  assert.deepEqual(toggleSelection([rock], rock), [rock]);
  const full = Array.from({ length: MAX_BLEND }, (_, index) => ({ source: 'charts' as const, id: String(index) }));
  assert.equal(toggleSelection(full, eighties).length, MAX_BLEND);
});

test('a blend label lists a few picks and counts the rest', () => {
  assert.equal(blendLabel(['Rock', 'The 80s']), 'Rock + The 80s');
  assert.equal(blendLabel(['Rock', 'Pop', 'The 80s', 'The 90s', 'Jazz']), 'Rock + Pop + 3 more');
});
