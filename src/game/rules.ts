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
