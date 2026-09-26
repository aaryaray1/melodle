import type { ResolvedTracks, Track, VariantOption } from '../../shared/types.ts';
import { env, redirectUri } from '../lib/env.ts';
import { fetchJson, mapLimit, UpstreamError } from '../lib/http.ts';
import { resolvePreview, type TrackSeed } from '../lib/preview.ts';
import type { OAuthTokens } from '../lib/session.ts';
import { trackKey } from '../../shared/text.ts';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';
const DECORATION = /\s*[([][^)\]]*\b(?:official|lyric[s]?|audio|video|visuali[sz]er|hd|hq|4k|mv|m\/v|explicit|clean|full album|live)\b[^)\]]*[)\]]/gi;
const BARE_TAGS = /\s*[|·]\s*(?:official\s+\w+|lyrics?|audio|video)\s*$/gi;

interface Snippet {
  title?: string;
  channelTitle?: string;
  videoOwnerChannelTitle?: string;
  thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  resourceId?: { videoId?: string };
}

export const YOUTUBE_BASE_VARIANTS: VariantOption[] = [{ id: 'liked', label: 'Liked music' }];

export function youtubeConfigured(): boolean {
  return Boolean(env.google.id && env.google.secret);
}

export function youtubeAuthUrl(state: string, challenge: string): string {
  const query = new URLSearchParams({
    client_id: env.google.id,
    response_type: 'code',
    redirect_uri: redirectUri('youtube'),
    scope: SCOPE,
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  body.set('client_id', env.google.id);
  body.set('client_secret', env.google.secret);
  const payload = await fetchJson<{ access_token: string; refresh_token?: string; expires_in: number }>(
    'https://oauth2.googleapis.com/token',
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body },
  );
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
}

export async function exchangeYoutubeCode(code: string, verifier: string): Promise<OAuthTokens> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri('youtube'),
      code_verifier: verifier,
    }),
  );
  const profile = await fetchJson<{ items?: { snippet?: { title?: string } }[] }>(
    `${API}/channels?part=snippet&mine=true`,
    { headers: { authorization: `Bearer ${tokens.accessToken}` } },
  );
  tokens.account = profile.items?.[0]?.snippet?.title;
  return tokens;
}

async function accessToken(tokens: OAuthTokens, onRefresh?: (tokens: OAuthTokens) => void): Promise<string> {
  if (tokens.expiresAt > Date.now() + 30_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new UpstreamError('YouTube session expired, reconnect to keep playing', 401);
  const refreshed = await tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
  );
  tokens.accessToken = refreshed.accessToken;
  tokens.expiresAt = refreshed.expiresAt;
  onRefresh?.(tokens);
  return tokens.accessToken;
}

/** YouTube has no artist field, so the artist lives in the title or in an "X - Topic" channel. */
export function parseVideo(snippet: Snippet): TrackSeed | null {
  const rawTitle = (snippet.title ?? '').replace(DECORATION, ' ').replace(BARE_TAGS, '').replace(/\s+/g, ' ').trim();
  if (!rawTitle || rawTitle === 'Deleted video' || rawTitle === 'Private video') return null;
  const channel = (snippet.videoOwnerChannelTitle ?? snippet.channelTitle ?? '').trim();
  const artwork = snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url;
  const videoId = snippet.resourceId?.videoId;
  const link = videoId ? `https://music.youtube.com/watch?v=${videoId}` : undefined;

  if (/ - Topic$/i.test(channel)) {
    return { title: rawTitle, artist: channel.replace(/ - Topic$/i, '').trim(), artwork, link };
  }
  const split = rawTitle.split(/\s+[-–—]\s+/);
  if (split.length >= 2) {
    const [artist, ...rest] = split;
    return { title: rest.join(' - ').trim(), artist: (artist as string).trim(), artwork, link };
  }
  if (!channel) return null;
  return { title: rawTitle, artist: channel.replace(/\s*-?\s*(?:VEVO|Official)$/i, '').trim(), artwork, link };
}

async function pagedSnippets(token: string, path: string, pages: number): Promise<Snippet[]> {
  const items: Snippet[] = [];
  let pageToken = '';
  for (let page = 0; page < pages; page += 1) {
    const payload = await fetchJson<{ items?: { snippet?: Snippet }[]; nextPageToken?: string }>(
      `${API}/${path}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    items.push(...(payload.items ?? []).map((item) => item.snippet ?? {}));
    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }
  return items;
}

export async function youtubeVariants(tokens: OAuthTokens): Promise<VariantOption[]> {
  const token = await accessToken(tokens);
  const payload = await fetchJson<{ items?: { id?: string; snippet?: { title?: string } }[] }>(
    `${API}/playlists?part=snippet&mine=true&maxResults=50`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const playlists = (payload.items ?? [])
    .filter((item) => item.id && item.snippet?.title)
    .map((item) => ({ id: `playlist:${item.id}`, label: item.snippet?.title as string }));
  return [...YOUTUBE_BASE_VARIANTS, ...playlists];
}

export async function youtubeTracks(
  tokens: OAuthTokens,
  variant: string,
  limit = 120,
  onRefresh?: (tokens: OAuthTokens) => void,
): Promise<ResolvedTracks> {
  const token = await accessToken(tokens, onRefresh);
  const snippets = variant.startsWith('playlist:')
    ? await pagedSnippets(token, `playlistItems?part=snippet&playlistId=${encodeURIComponent(variant.slice(9))}`, 3)
    : await pagedSnippets(token, 'videos?part=snippet&myRating=like', 3);

  const seen = new Set<string>();
  const seeds: TrackSeed[] = [];
  for (const snippet of snippets) {
    const seed = parseVideo(snippet);
    if (!seed || !seed.artist) continue;
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
