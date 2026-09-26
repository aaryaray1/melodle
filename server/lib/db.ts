import { DatabaseSync } from 'node:sqlite';
import { env } from './env.ts';

export const db = new DatabaseSync(env.dataFile);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    pending TEXT,
    created_at INTEGER NOT NULL,
    seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS connections (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    secret TEXT NOT NULL,
    account TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, track_id)
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    source TEXT NOT NULL,
    variant TEXT NOT NULL,
    outcome TEXT NOT NULL,
    stage INTEGER NOT NULL,
    day TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS party_members (
    party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (party_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS party_members_by_user ON party_members (user_id);
  CREATE INDEX IF NOT EXISTS rounds_by_user ON rounds (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS rounds_by_track ON rounds (track_id);
  CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);
`);

export function closeDatabase(): void {
  try {
    db.close();
  } catch {
    // Already closed during shutdown.
  }
}
