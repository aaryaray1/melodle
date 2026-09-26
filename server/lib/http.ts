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

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
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
