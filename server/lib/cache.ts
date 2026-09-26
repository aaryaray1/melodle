interface Entry<T> {
  value: T;
  expires: number;
}

/** Small TTL cache; oldest entries are evicted once it outgrows `limit`. */
export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly limit: number;

  constructor(ttlMs: number, limit = 500) {
    this.ttlMs = ttlMs;
    this.limit = limit;
  }

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh insertion order so hot keys survive eviction.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): T {
    if (this.store.size >= this.limit) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }

  async wrap(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    return this.set(key, await load());
  }
}
