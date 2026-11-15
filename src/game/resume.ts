import type { Track } from '../../shared/types.ts';
import type { Guess, Status } from './rules.ts';

/**
 * The round in progress, written to storage on every change so that a reload,
 * a phone that threw the tab out of memory, or a crash cannot lose the song.
 * The answer travels with it, so it can be resumed before the song list has
 * even loaded.
 */
export interface SavedRound {
  key: string;
  day: string;
  answer: Track;
  guesses: Guess[];
  status: Status;
  daily: boolean;
  savedAt: number;
}

interface Now {
  key: string;
  day: string;
  daily: boolean;
  now: number;
}

/** Older than this, an unfinished round is let go rather than sprung on the player. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isTrack(value: unknown): value is Track {
  const track = value as Track | null;
  return Boolean(track && typeof track.id === 'string' && typeof track.title === 'string' && typeof track.artist === 'string');
}

/** The saved round, if it is the one the player would otherwise lose: same list, same mode, still going. */
export function resumable(saved: SavedRound | null | undefined, current: Now): SavedRound | null {
  if (!saved || typeof saved !== 'object') return null;
  if (!isTrack(saved.answer) || !Array.isArray(saved.guesses)) return null;
  if (saved.status !== 'playing') return null;
  if (saved.key !== current.key || saved.daily !== current.daily) return null;
  if (saved.daily && saved.day !== current.day) return null;
  if (typeof saved.savedAt !== 'number' || current.now - saved.savedAt > MAX_AGE_MS) return null;
  return saved;
}
