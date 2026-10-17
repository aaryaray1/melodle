import { TtlCache } from './cache.ts';
import { db } from './db.ts';

/**
 * A TtlCache that survives restarts. Song lists cost dozens of rate-limited
 * Deezer calls to build, and release dates never change, so losing them on
 * every deploy would make the first player after it wait minutes. Recent values
 * stay in memory; everything is also kept in the database, as JSON.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (namespace, key)
  );
`);

const selectEntry = db.prepare('SELECT value FROM cache WHERE namespace = ? AND key = ? AND expires_at > ?');
const upsertEntry = db.prepare(`
  INSERT INTO cache (namespace, key, value, expires_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (namespace, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
`);
const purgeExpired = db.prepare('DELETE FROM cache WHERE expires_at <= ?');
purgeExpired.run(Date.now());

export class DiskCache<T> {
  private readonly namespace: string;
  private readonly ttlMs: number;
  private readonly keep: (value: T) => boolean;
  private readonly memory: TtlCache<T>;

  /** `keep` decides whether a fresh result is worth remembering; an empty list from a rate limit is not. */
  constructor(namespace: string, ttlMs: number, keep: (value: T) => boolean = () => true, memoryLimit = 40) {
    this.namespace = namespace;
    this.ttlMs = ttlMs;
    this.keep = keep;
    this.memory = new TtlCache<T>(ttlMs, memoryLimit);
  }

  async wrap(key: string, load: () => Promise<T>): Promise<T> {
    const hot = this.memory.get(key);
    if (hot !== undefined) return hot;

    const row = selectEntry.get(this.namespace, key, Date.now()) as { value: string } | undefined;
    if (row) return this.memory.set(key, JSON.parse(row.value) as T);

    const fresh = await load();
    if (this.keep(fresh)) {
      upsertEntry.run(this.namespace, key, JSON.stringify(fresh), Date.now() + this.ttlMs);
      this.memory.set(key, fresh);
    }
    return fresh;
  }
}
