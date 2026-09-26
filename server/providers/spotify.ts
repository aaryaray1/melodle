import type { ResolvedTracks, Track, VariantOption } from '../../shared/types.ts';
import { env, redirectUri } from '../lib/env.ts';
import { fetchJson, mapLimit, UpstreamError } from '../lib/http.ts';
import { resolvePreview, type TrackSeed } from '../lib/preview.ts';
import type { OAuthTokens } from '../lib/session.ts';
import { trackKey } from '../../shared/text.ts';

const SCOPES = 'user-top-read user-read-recently-played user-library-read';

export interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: { id?: string; name?: string }[];
  album?: { name?: string; images?: { url?: string }[] };
  external_urls?: { spotify?: string };
}

export const SPOTIFY_VARIANTS: VariantOption[] = [
  { id: 'mix', label: 'Your mix' },
  { id: 'top:short_term', label: 'On repeat (4 weeks)' },
  { id: 'top:medium_term', label: 'Last 6 months' },
  { id: 'top:long_term', label: 'All time' },
  { id: 'recent', label: 'Recently played' },
  { id: 'saved', label: 'Liked songs' },
];

export function spotifyConfigured(): boolean {
  return Boolean(env.spotify.id);
}

export function spotifyAuthUrl(state: string, challenge: string): string {
  const query = new URLSearchParams({
    client_id: env.spotify.id,
    response_type: 'code',
    redirect_uri: redirectUri('spotify'),
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `https://accounts.spotify.com/authorize?${query}`;
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (env.spotify.secret) {
    headers.authorization = `Basic ${Buffer.from(`${env.spotify.id}:${env.spotify.secret}`).toString('base64')}`;
  } else {
    body.set('client_id', env.spotify.id);
  }
  const payload = await fetchJson<{ access_token: string; refresh_token?: string; expires_in: number }>(
    'https://accounts.spotify.com/api/token',
    { method: 'POST', headers, body },
  );
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
}

export async function exchangeSpotifyCode(code: string, verifier: string): Promise<OAuthTokens> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri('spotify'),
      code_verifier: verifier,
    }),
  );
  const profile = await fetchJson<{ display_name?: string; id?: string }>('https://api.spotify.com/v1/me', {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  tokens.account = profile.display_name || profile.id;
  return tokens;
}

async function accessToken(tokens: OAuthTokens, onRefresh?: (tokens: OAuthTokens) => void): Promise<string> {
  if (tokens.expiresAt > Date.now() + 30_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new UpstreamError('Spotify session expired, reconnect to keep playing', 401);
  const refreshed = await tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
  );
  tokens.accessToken = refreshed.accessToken;
  tokens.expiresAt = refreshed.expiresAt;
  if (refreshed.refreshToken) tokens.refreshToken = refreshed.refreshToken;
  onRefresh?.(tokens);
  return tokens.accessToken;
}

export function seedFrom(track: SpotifyTrack | undefined): TrackSeed | null {
  const title = track?.name?.trim();
  const artist = track?.artists?.map((entry) => entry.name).filter(Boolean).join(', ').trim();
  if (!title || !artist) return null;
  return {
    title,
    artist,
    album: track?.album?.name,
    artwork: track?.album?.images?.[0]?.url,
    link: track?.external_urls?.spotify,
  };
}

export async function spotifyTracks(
  tokens: OAuthTokens,
  variant: string,
  limit = 120,
  onRefresh?: (tokens: OAuthTokens) => void,
): Promise<ResolvedTracks> {
  const token = await accessToken(tokens, onRefresh);
  const [kind, range = 'medium_term'] = variant.split(':');
  const get = <T>(path: string) =>
    fetchJson<T>(`https://api.spotify.com/v1/${path}`, { headers: { authorization: `Bearer ${token}` } });

  const raw: (SpotifyTrack | undefined)[] = [];
  if (kind === 'recent') {
    const payload = await get<{ items?: { track?: SpotifyTrack }[] }>('me/player/recently-played?limit=50');
    raw.push(...(payload.items ?? []).map((item) => item.track));
  } else if (kind === 'saved') {
    for (const offset of [0, 50]) {
      const payload = await get<{ items?: { track?: SpotifyTrack }[] }>(`me/tracks?limit=50&offset=${offset}`);
      raw.push(...(payload.items ?? []).map((item) => item.track));
      if ((payload.items?.length ?? 0) < 50) break;
    }
  } else {
    for (const offset of [0, 49]) {
      const payload = await get<{ items?: SpotifyTrack[] }>(
        `me/top/tracks?time_range=${encodeURIComponent(range)}&limit=50&offset=${offset}`,
      );
      raw.push(...(payload.items ?? []));
      if ((payload.items?.length ?? 0) < 50) break;
    }
  }

  const seen = new Set<string>();
  const seeds: TrackSeed[] = [];
  for (const entry of raw) {
    const seed = seedFrom(entry);
    if (!seed) continue;
    const key = trackKey(seed);
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push(seed);
    if (seeds.length >= limit) break;
  }

  const resolved = await mapLimit(seeds, 6, (seed) => resolvePreview(seed));
  const tracks = resolved.filter((track): track is Track => track !== null);
  return { tracks, dropped: seeds.length - tracks.length };
}

/**
 * Spotify withdrew its recommendations endpoint from new apps in late 2024, so
 * "Your mix" is Melodle's own blend of everything Spotify still exposes:
 * what you play most over three time ranges, what you played lately, what you
 * saved, and other well-known songs by the artists that dominate all of that.
 */
const MIX_SOURCES = [
  { path: 'me/top/tracks?time_range=short_term&limit=50', weight: 3, kind: 'items' },
  { path: 'me/top/tracks?time_range=medium_term&limit=50', weight: 2.4, kind: 'items' },
  { path: 'me/top/tracks?time_range=long_term&limit=50', weight: 1.8, kind: 'items' },
  { path: 'me/player/recently-played?limit=50', weight: 1.5, kind: 'wrapped' },
  { path: 'me/tracks?limit=50', weight: 1.2, kind: 'wrapped' },
] as const;

const DISCOVERY_ARTISTS = 12;
const DISCOVERY_WEIGHT = 0.55;

export interface Scored {
  seed: TrackSeed;
  score: number;
  artistIds: string[];
}

export interface WeightedList {
  weight: number;
  tracks: (SpotifyTrack | undefined)[];
}

export interface MixRanking {
  tracks: Scored[];
  artists: { id: string; name: string; score: number }[];
}

/**
 * The pure half of the mix: given what Spotify returned, decide what you are
 * most likely to recognise. Rank inside each list matters as much as the list.
 */
export function rankMix(lists: WeightedList[]): MixRanking {
  const scored = new Map<string, Scored>();
  const artistWeight = new Map<string, { name: string; score: number }>();

  for (const list of lists) {
    const total = list.tracks.length;
    list.tracks.forEach((track, index) => {
      const seed = seedFrom(track);
      if (!seed) return;
      // The top of a "top tracks" list is far more you than the tail of it.
      const score = list.weight * (1 - (total ? index / total : 0) * 0.5);
      const key = trackKey(seed);
      const existing = scored.get(key);
      if (existing) {
        existing.score += score;
      } else {
        const artistIds = (track?.artists ?? []).map((a) => a.id).filter((id): id is string => Boolean(id));
        scored.set(key, { seed, score, artistIds });
      }
      for (const artist of track?.artists ?? []) {
        if (!artist.id || !artist.name) continue;
        const entry = artistWeight.get(artist.id) ?? { name: artist.name, score: 0 };
        entry.score += list.weight;
        artistWeight.set(artist.id, entry);
      }
    });
  }

  return {
    tracks: [...scored.values()].sort((a, b) => b.score - a.score),
    artists: [...artistWeight.entries()]
      .map(([id, entry]) => ({ id, name: entry.name, score: entry.score }))
      .sort((a, b) => b.score - a.score),
  };
}

export async function spotifyMix(
  tokens: OAuthTokens,
  limit = 120,
  onRefresh?: (tokens: OAuthTokens) => void,
): Promise<ResolvedTracks> {
  const token = await accessToken(tokens, onRefresh);
  const get = <T>(path: string) =>
    fetchJson<T>(`https://api.spotify.com/v1/${path}`, { headers: { authorization: `Bearer ${token}` } });

  const lists: WeightedList[] = [];
  for (const source of MIX_SOURCES) {
    try {
      const payload = await get<{ items?: (SpotifyTrack | { track?: SpotifyTrack })[] }>(source.path);
      const items = payload.items ?? [];
      lists.push({
        weight: source.weight,
        tracks: items.map((item) =>
          source.kind === 'wrapped' ? (item as { track?: SpotifyTrack }).track : (item as SpotifyTrack),
        ),
      });
    } catch {
      // One unavailable list should not empty the whole mix.
    }
  }

  const base = rankMix(lists);
  const discovered: WeightedList[] = [];

  await mapLimit(base.artists.slice(0, DISCOVERY_ARTISTS), 4, async (artist) => {
    try {
      const payload = await get<{ tracks?: SpotifyTrack[] }>(`artists/${artist.id}/top-tracks?market=from_token`);
      discovered.push({ weight: artist.score * DISCOVERY_WEIGHT, tracks: (payload.tracks ?? []).slice(0, 5) });
    } catch {
      // Artist top tracks are a bonus, not a requirement.
    }
  });

  const ranked = rankMix([...lists, ...discovered]).tracks.slice(0, limit);
  const resolved = await mapLimit(ranked, 6, (entry) => resolvePreview(entry.seed));
  const tracks = resolved.filter((track): track is Track => track !== null);
  return { tracks, dropped: ranked.length - tracks.length };
}
