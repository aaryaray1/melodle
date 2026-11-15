import type { Account, Me, Party, Pool, ProviderId, Rating, Stats, Track } from '../../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Flaky phone connections hang more often than they fail; nothing may wait forever. */
const TIMEOUT_MS = 20_000;
/** A mix nobody asked for before is built from Deezer on the spot: up to a minute, cold. */
const POOL_TIMEOUT_MS = 120_000;

function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init, signal: withTimeout(init?.signal, timeoutMs) });
  } catch (problem) {
    if (init?.signal?.aborted) throw problem;
    throw new ApiError(
      problem instanceof Error && problem.name === 'TimeoutError' ? 'Melodle is taking too long to answer' : 'Could not reach Melodle',
      0,
    );
  }
  const payload = await response.json().catch(() => ({}) as { error?: string });
  if (!response.ok) {
    throw new ApiError((payload as { error?: string }).error ?? 'Something went wrong', response.status);
  }
  return payload as T;
}

function send<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface RoundReport {
  trackId: string;
  title: string;
  artist: string;
  source: string;
  variant: string;
  outcome: 'right' | 'wrong' | 'skip';
  stage: number;
  day: string;
}

export const api = {
  me: () => request<Me>('/api/me'),
  search: (query: string, signal?: AbortSignal) =>
    request<{ tracks: Track[] }>(`/api/search?q=${encodeURIComponent(query)}`, { signal }),
  pool: async (source: ProviderId, variant: string, signal?: AbortSignal) => {
    const path = `/api/pool?source=${source}&variant=${encodeURIComponent(variant)}`;
    try {
      return await request<Pool>(path, { signal }, POOL_TIMEOUT_MS);
    } catch (problem) {
      // One dropped connection should not end in an error screen.
      if (signal?.aborted || !(problem instanceof ApiError) || problem.status !== 0) throw problem;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return request<Pool>(path, { signal }, POOL_TIMEOUT_MS);
    }
  },

  register: (username: string, password: string, invite?: string) =>
    send<{ account: Account }>('/api/account/register', { username, password, invite }),
  login: (username: string, password: string) =>
    send<{ account: Account }>('/api/account/login', { username, password }),
  logout: () => send<{ account: null }>('/api/account/logout', {}),

  connectLastfm: (user: string) => send<{ account: string }>('/api/auth/lastfm', { user }),
  disconnect: (provider: ProviderId) => request<unknown>(`/api/auth/${provider}/disconnect`, { method: 'POST' }),

  rate: (track: { id: string; title: string; artist: string }, rating: Rating | 0) =>
    send<{ trackId: string; rating: number }>('/api/ratings', {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      rating,
    }),
  reportRound: (round: RoundReport) => send<{ stats: Stats }>('/api/rounds', round),

  createParty: (name: string) => send<{ party: Party }>('/api/party/create', { name }),
  joinParty: (code: string) => send<{ party: Party }>('/api/party/join', { code }),
  leaveParty: () => send<{ party: null }>('/api/party/leave', {}),

  redirects: () => request<{ spotify: string; youtube: string }>('/api/setup/redirects'),
  saveKeys: (provider: ProviderId, values: Record<string, string>) =>
    send<{ saved: boolean }>(`/api/setup/${provider}`, values),
};
