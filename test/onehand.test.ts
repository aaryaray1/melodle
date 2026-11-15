import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { keyboardInset } from '../src/lib/viewport.ts';
import { DIFFICULTY_LEVELS, MAX_DIFFICULTY } from '../src/game/rules.ts';

test('the keyboard inset is the part of the layout the visible area no longer covers', () => {
  assert.equal(keyboardInset(844, 844, 0), 0, 'no keyboard');
  assert.equal(keyboardInset(844, 508, 0), 336, 'an iPhone keyboard covering the bottom');
  assert.equal(keyboardInset(844, 508, 40), 296, 'the page scrolled up by the browser as well');
  assert.equal(keyboardInset(600, 600, 0), 0, 'Android already shrank the layout to fit');
  assert.equal(keyboardInset(844, 850, 0), 0, 'never negative');
});

test('every difficulty level has a name and a description for the picker', () => {
  assert.equal(DIFFICULTY_LEVELS.length, MAX_DIFFICULTY);
  for (const level of DIFFICULTY_LEVELS) {
    assert.ok(level.name.length > 0 && level.blurb.length > 0);
  }
  assert.equal(new Set(DIFFICULTY_LEVELS.map((level) => level.name)).size, MAX_DIFFICULTY, 'names are distinct');
});
