import type { ProviderId } from '../../shared/types.ts';
import { db } from './db.ts';
import { hashPassword, seal, unseal, verifyPassword } from './secrets.ts';

export interface Account {
  id: number;
  username: string;
}

export interface RoundRecord {
  trackId: string;
  title: string;
  artist: string;
  source: string;
  variant: string;
  outcome: 'right' | 'wrong' | 'skip';
  stage: number;
  day: string;
}

export interface AccountStats {
  played: number;
  won: number;
  streak: number;
  bestStreak: number;
  byStage: number[];
}

const STAGES = 5;

const insertUser = db.prepare(
  'INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?) RETURNING id, username',
);
const selectUserByName = db.prepare('SELECT id, username, password_hash, salt FROM users WHERE username = ?');
const selectUserById = db.prepare('SELECT id, username FROM users WHERE id = ?');
const upsertConnection = db.prepare(`
  INSERT INTO connections (user_id, provider, secret, account, updated_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, provider) DO UPDATE SET secret = excluded.secret, account = excluded.account, updated_at = excluded.updated_at
`);
const selectConnection = db.prepare('SELECT secret, account FROM connections WHERE user_id = ? AND provider = ?');
const selectConnections = db.prepare('SELECT provider, account FROM connections WHERE user_id = ?');
const deleteConnection = db.prepare('DELETE FROM connections WHERE user_id = ? AND provider = ?');
const upsertRating = db.prepare(`
  INSERT INTO ratings (user_id, track_id, rating, title, artist, updated_at) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (user_id, track_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at
`);
const deleteRating = db.prepare('DELETE FROM ratings WHERE user_id = ? AND track_id = ?');
const selectRatings = db.prepare('SELECT track_id, rating FROM ratings WHERE user_id = ?');
const insertRound = db.prepare(`
  INSERT INTO rounds (user_id, track_id, title, artist, source, variant, outcome, stage, day, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const selectRounds = db.prepare(
  'SELECT outcome, stage FROM rounds WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 5000',
);

export class UsernameTaken extends Error {}

export function createAccount(username: string, password: string): Account {
  if (selectUserByName.get(username)) throw new UsernameTaken(username);
  const { hash, salt } = hashPassword(password);
  try {
    return insertUser.get(username, hash, salt, Date.now()) as unknown as Account;
  } catch (problem) {
    // The unique index is the real guard against two simultaneous sign-ups.
    if (String(problem).includes('UNIQUE')) throw new UsernameTaken(username);
    throw problem;
  }
}

export function authenticate(username: string, password: string): Account | null {
  const row = selectUserByName.get(username) as
    | { id: number; username: string; password_hash: string; salt: string }
    | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.salt, row.password_hash)) return null;
  return { id: row.id, username: row.username };
}

export function getAccount(id: number): Account | null {
  return (selectUserById.get(id) as Account | undefined) ?? null;
}

export function saveConnection(userId: number, provider: ProviderId, payload: unknown, account?: string): void {
  upsertConnection.run(userId, provider, seal(payload), account ?? null, Date.now());
}

export function readConnection<T>(userId: number, provider: ProviderId): T | null {
  const row = selectConnection.get(userId, provider) as { secret: string; account: string | null } | undefined;
  return row ? unseal<T>(row.secret) : null;
}

export function listConnections(userId: number): { provider: string; account: string | null }[] {
  return selectConnections.all(userId) as { provider: string; account: string | null }[];
}

export function removeConnection(userId: number, provider: ProviderId): void {
  deleteConnection.run(userId, provider);
}

export function rateTrack(
  userId: number,
  track: { id: string; title: string; artist: string },
  rating: 1 | -1 | 0,
): void {
  if (rating === 0) {
    deleteRating.run(userId, track.id);
    return;
  }
  upsertRating.run(userId, track.id, rating, track.title, track.artist, Date.now());
}

export function listRatings(userId: number): Record<string, 1 | -1> {
  const rows = selectRatings.all(userId) as { track_id: string; rating: number }[];
  const ratings: Record<string, 1 | -1> = {};
  for (const row of rows) ratings[row.track_id] = row.rating > 0 ? 1 : -1;
  return ratings;
}

export function recordRound(userId: number, round: RoundRecord): void {
  insertRound.run(
    userId,
    round.trackId,
    round.title,
    round.artist,
    round.source,
    round.variant,
    round.outcome,
    round.stage,
    round.day,
    Date.now(),
  );
}

/** Stats live in the rounds table so they follow the account, not the browser. */
export function accountStats(userId: number): AccountStats {
  const rows = selectRounds.all(userId) as { outcome: string; stage: number }[];
  const byStage = new Array<number>(STAGES).fill(0);
  let played = 0;
  let won = 0;
  let streak = 0;
  let bestStreak = 0;

  for (const row of rows) {
    played += 1;
    if (row.outcome === 'right') {
      won += 1;
      streak += 1;
      if (streak > bestStreak) bestStreak = streak;
      const index = Math.min(Math.max(row.stage, 0), STAGES - 1);
      byStage[index] = (byStage[index] ?? 0) + 1;
    } else {
      streak = 0;
    }
  }
  return { played, won, streak, bestStreak, byStage };
}
