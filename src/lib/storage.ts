import { STAGE_DURATIONS, type Rating, type StartMode, type Stats } from '../../shared/types.ts';
import type { Guess, Status } from '../game/rules.ts';

const PREFIX = 'melodle.v1';

export interface LocalStats extends Stats {
  lastDay: string | null;
}

export interface DailyProgress {
  answerId: string;
  guesses: Guess[];
  status: Status;
}

export interface Settings {
  source: string;
  variant: string;
  daily: boolean;
  startMode: StartMode;
  /** 1 to 5. Rises with every correct endless guess; a miss sends it back to 1. */
  difficulty: number;
}

const emptyStats: LocalStats = {
  played: 0,
  won: 0,
  streak: 0,
  bestStreak: 0,
  byStage: STAGE_DURATIONS.map(() => 0),
  lastDay: null,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}.${key}`);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the game still plays, it just forgets.
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function loadStats(): LocalStats {
  const stats = read<LocalStats>('stats', emptyStats);
  return {
    played: count(stats.played),
    won: Math.min(count(stats.won), count(stats.played)),
    streak: count(stats.streak),
    bestStreak: count(stats.bestStreak),
    byStage: STAGE_DURATIONS.map((_, index) => count(stats.byStage?.[index])),
    lastDay: typeof stats.lastDay === 'string' ? stats.lastDay : null,
  };
}

export function recordResult(stats: LocalStats, won: boolean, stageIndex: number, day: string): LocalStats {
  const byStage = [...stats.byStage];
  if (won) byStage[stageIndex] = (byStage[stageIndex] ?? 0) + 1;
  const streak = won ? stats.streak + 1 : 0;
  const next: LocalStats = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    byStage,
    lastDay: day,
  };
  write('stats', next);
  return next;
}

export function loadRatings(): Record<string, Rating> {
  const stored = read<Record<string, Rating>>('ratings', {});
  const ratings: Record<string, Rating> = {};
  for (const [trackId, rating] of Object.entries(stored)) {
    if (rating === 1 || rating === -1) ratings[trackId] = rating;
  }
  return ratings;
}

export function saveRatings(ratings: Record<string, Rating>): void {
  write('ratings', ratings);
}

export function loadSettings(fallback: Settings): Settings {
  return read<Settings>('settings', fallback);
}

export function saveSettings(settings: Settings): void {
  write('settings', settings);
}

const OUTCOMES = new Set(['right', 'wrong', 'skip']);
const STATUSES = new Set(['playing', 'won', 'lost']);

/** Anything in localStorage may have been edited by hand, so nothing is assumed. */
function isProgress(value: unknown): value is DailyProgress {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DailyProgress>;
  if (typeof candidate.answerId !== 'string') return false;
  if (!STATUSES.has(candidate.status as string)) return false;
  if (!Array.isArray(candidate.guesses) || candidate.guesses.length > STAGE_DURATIONS.length) return false;
  return candidate.guesses.every(
    (guess) => guess && OUTCOMES.has(guess.outcome as string) && typeof guess.label === 'string',
  );
}

export function loadProgress(key: string, day: string): DailyProgress | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}.daily.${key}.${day}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProgress(key: string, day: string, progress: DailyProgress): void {
  write(`daily.${key}.${day}`, progress);
  pruneProgress(day);
}

/** Yesterday's rounds are dead weight; keep the store from growing forever. */
function pruneProgress(day: string): void {
  try {
    const stale: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${PREFIX}.daily.`) && !key.endsWith(day)) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    // Nothing to prune if storage is unavailable.
  }
}
