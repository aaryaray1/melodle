import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Track } from '../shared/types.ts';
import { resumable, type SavedRound } from '../src/game/resume.ts';

const track: Track = { id: 'deezer:1', title: 'Song', artist: 'Artist', previewUrl: '', previewFrom: 'deezer' };
const now = Date.parse('2026-11-14T12:00:00Z');
const saved = (extra: Partial<SavedRound> = {}): SavedRound => ({
  key: 'charts:0',
  day: '2026-11-14',
  answer: track,
  guesses: [{ outcome: 'skip', label: 'Skipped' }],
  status: 'playing',
  daily: false,
  savedAt: now - 60_000,
  ...extra,
});

test('an unfinished endless round comes back after a reload, with its guesses', () => {
  const round = resumable(saved(), { key: 'charts:0', day: '2026-11-14', daily: false, now });
  assert.ok(round);
  assert.equal(round.answer.id, 'deezer:1');
  assert.equal(round.guesses.length, 1);
});

test('a round from another list, mode or day is not forced on the player', () => {
  assert.equal(resumable(saved(), { key: 'charts:152', day: '2026-11-14', daily: false, now }), null, 'another list');
  assert.equal(resumable(saved(), { key: 'charts:0', day: '2026-11-14', daily: true, now }), null, 'another mode');
  assert.equal(resumable(saved({ daily: true }), { key: 'charts:0', day: '2026-11-15', daily: true, now }), null, 'yesterday\'s daily');
  assert.ok(resumable(saved({ daily: true }), { key: 'charts:0', day: '2026-11-14', daily: true, now }), 'today\'s daily');
});

test('a finished round or a stale one starts fresh instead', () => {
  assert.equal(resumable(saved({ status: 'won' }), { key: 'charts:0', day: '2026-11-14', daily: false, now }), null);
  const week = 8 * 24 * 60 * 60 * 1000;
  assert.equal(resumable(saved({ savedAt: now - week }), { key: 'charts:0', day: '2026-11-14', daily: false, now }), null);
});

test('garbage in storage is ignored', () => {
  for (const junk of [null, {}, { answer: 'x' }, { answer: { id: 1 }, guesses: 'no' }]) {
    assert.equal(resumable(junk as unknown as SavedRound, { key: 'charts:0', day: '2026-11-14', daily: false, now }), null);
  }
});
