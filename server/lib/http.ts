const USER_AGENT = 'Melodle/1.0 (+local game client)';

/** `message` is shown to the player; `detail` stays in the server log. */
export class UpstreamError extends Error {
  readonly status: number;
  readonly detail: string | undefined;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * A sliding window: at most `limit` requests start in any `windowMs`. Callers
 * past the limit wait their turn, in order, rather than being refused.
 */
export class RateWindow {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly starts: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  take(): Promise<void> {
    const turn = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        while (this.starts.length && now - (this.starts[0] as number) >= this.windowMs) this.starts.shift();
        if (this.starts.length < this.limit) {
          this.starts.push(now);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, this.windowMs - (now - (this.starts[0] as number)) + 1));
      }
    });
    this.queue = turn;
    return turn;
  }
}

/**
 * Deezer allows about 50 requests per 5 seconds per server, and when it is over
 * that it still answers 200, with a quota error in the body. Bigger pools and
 * per-song date checks would trip it, so every Deezer call queues here first.
 */
const deezerWindow = new RateWindow(40, 5_000);
const DEEZER_QUOTA = 4;

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
  const deezer = url.startsWith('https://api.deezer.com/');
  for (let attempt = 0; ; attempt += 1) {
    if (deezer) await deezerWindow.take();
    const payload = await fetchOnce<T & { error?: { code?: number } }>(url, init, timeoutMs);
    if (!deezer || payload?.error?.code !== DEEZER_QUOTA || attempt >= 2) return payload;
    // Over quota anyway (another process, or a burst): wait out the window and retry.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

async function fetchOnce<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new UpstreamError(
      'The music service turned that request down.',
      response.status,
      `${url.split('?')[0]} -> ${response.status} ${body.slice(0, 300)}`,
    );
  }
  return (await response.json()) as T;
}

/** Runs `worker` over `items` with bounded concurrency, keeping input order. */
export async function mapLimit<In, Out>(
  items: readonly In[],
  limit: number,
  worker: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as In, index);
    }
  });
  await Promise.all(runners);
  return results;
}
