import { STAGE_DURATIONS, type ProviderId, type Track } from '../../shared/types.ts';

export type GuessOutcome = 'right' | 'wrong' | 'skip';

export interface Guess {
  outcome: GuessOutcome;
  label: string;
}

export type Status = 'playing' | 'won' | 'lost';

export function unlockedSeconds(stage: number): number {
  return STAGE_DURATIONS[Math.min(stage, STAGE_DURATIONS.length - 1)] as number;
}

export function nextUnlock(stage: number): number | null {
  const next = STAGE_DURATIONS[stage + 1];
  return next === undefined ? null : next;
}

export function sourceKey(source: ProviderId, variant: string): string {
  return `${source}:${variant}`;
}

export function todayKey(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** cyrb53: fast, well-mixed string hash. Same day plus same list picks the same song. */
export function hash(value: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function dailyTrack(tracks: Track[], key: string, day: string): Track | undefined {
  if (!tracks.length) return undefined;
  return tracks[hash(`${key}|${day}`) % tracks.length];
}

export function randomTrack(tracks: Track[], avoidId?: string): Track | undefined {
  if (!tracks.length) return undefined;
  if (tracks.length === 1) return tracks[0];
  let pick = tracks[Math.floor(Math.random() * tracks.length)];
  while (pick && pick.id === avoidId) {
    pick = tracks[Math.floor(Math.random() * tracks.length)];
  }
  return pick;
}

const MIN_POOL = 5;

/**
 * Songs you thumbed down never come up again, unless dropping them would leave
 * too few to play with.
 */
export function playableTracks(tracks: Track[], ratings: Record<string, 1 | -1>): Track[] {
  const kept = tracks.filter((track) => ratings[track.id] !== -1);
  return kept.length >= MIN_POOL ? kept : tracks;
}

export const MAX_DIFFICULTY = 5;

function clampDifficulty(level: number): number {
  return Number.isFinite(level) ? Math.min(Math.max(Math.round(level), 1), MAX_DIFFICULTY) : 1;
}

/** A correct guess moves you up one level, to at most 5; a miss sends you back to 1. */
export function nextDifficulty(level: number, won: boolean): number {
  return won ? Math.min(clampDifficulty(level) + 1, MAX_DIFFICULTY) : 1;
}

/**
 * The slice of the pool a difficulty draws from. Songs are ordered by Deezer
 * popularity and each level looks at 40% of them, the window sliding from the
 * biggest hits at level 1 to the deepest cuts at level 5. Neighbouring levels
 * overlap, so a step up feels like a step rather than a cliff.
 */
export function difficultyBand(tracks: Track[], level: number): Track[] {
  const byPopularity = [...tracks].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  const size = Math.min(byPopularity.length, Math.max(MIN_POOL, Math.ceil(byPopularity.length * 0.4)));
  const step = (clampDifficulty(level) - 1) / (MAX_DIFFICULTY - 1);
  const start = Math.round(step * (byPopularity.length - size));
  return byPopularity.slice(start, start + size);
}

const MARKS: Record<GuessOutcome, string> = { right: '🟩', wrong: '🟥', skip: '⬛' };

export function shareText(options: {
  label: string;
  day: string;
  guesses: Guess[];
  status: Status;
  daily: boolean;
}): string {
  const grid = Array.from({ length: STAGE_DURATIONS.length }, (_, index) => {
    const guess = options.guesses[index];
    return guess ? MARKS[guess.outcome] : '⬜';
  }).join('');
  const solvedAt = options.status === 'won' ? `${(unlockedSeconds(options.guesses.length - 1)).toString()}s` : 'missed';
  const headline = options.daily ? `Melodle ${options.day}` : 'Melodle endless';
  return `${headline}\n${options.label}\n${grid} ${solvedAt}`;
}
