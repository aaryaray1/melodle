import type { Account, Me, Party, Pool, ProviderId, Rating, Stats } from '../../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
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
  pool: (source: ProviderId, variant: string, signal?: AbortSignal) =>
    request<Pool>(`/api/pool?source=${source}&variant=${encodeURIComponent(variant)}`, { signal }),

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
