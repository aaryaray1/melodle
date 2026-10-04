import type { ResolvedTracks, Track, VariantOption } from '../../shared/types.ts';
import { env } from '../lib/env.ts';
import { fetchJson, mapLimit, UpstreamError } from '../lib/http.ts';
import { resolvePreview, type TrackSeed } from '../lib/preview.ts';
import { trackKey } from '../../shared/text.ts';

const API = 'https://ws.audioscrobbler.com/2.0/';

export interface LastfmTrack {
  name?: string;
  artist?: { name?: string; '#text'?: string } | string;
  image?: { '#text'?: string; size?: string }[];
  url?: string;
}

export const LASTFM_VARIANTS: VariantOption[] = [
  { id: 'top:overall', label: 'All-time favourites' },
  { id: 'top:12month', label: 'Last 12 months' },
  { id: 'top:3month', label: 'Last 3 months' },
  { id: 'top:1month', label: 'Last month' },
  { id: 'recent', label: 'Recently scrobbled' },
  { id: 'loved', label: 'Loved tracks' },
];

function artistName(track: LastfmTrack): string {
  const { artist } = track;
  if (typeof artist === 'string') return artist;
  return artist?.name ?? artist?.['#text'] ?? '';
}

function artworkOf(track: LastfmTrack): string | undefined {
  const images = track.image ?? [];
  const large = images.find((image) => image.size === 'extralarge') ?? images.at(-1);
  const url = large?.['#text'];
  return url && url.length > 0 ? url : undefined;
}

async function call<T>(params: Record<string, string>): Promise<T> {
  if (!env.lastfmKey) throw new UpstreamError('Add a Last.fm API key in the setup panel first', 503);
  const query = new URLSearchParams({ ...params, api_key: env.lastfmKey, format: 'json' });
  let payload: T & { error?: number; message?: string };
  try {
    payload = await fetchJson<T & { error?: number; message?: string }>(`${API}?${query}`);
  } catch (problem) {
    const status = problem instanceof UpstreamError ? problem.status : 502;
    const detail = problem instanceof UpstreamError ? problem.detail : undefined;
    if (status === 403) {
      throw new UpstreamError('Last.fm rejected that API key. Paste it again in the setup panel.', 403, detail);
    }
    if (status === 404) {
      throw new UpstreamError('Last.fm has no account with that name', 404, detail);
    }
    throw new UpstreamError('Last.fm is not answering right now. Try again in a moment.', status, detail);
  }
  if (payload.error) throw new UpstreamError(readableLastfmError(payload.error), 400, payload.message);
  return payload;
}

function readableLastfmError(code: number): string {
  if (code === 6) return 'Last.fm has no account with that name';
  if (code === 10 || code === 26) return 'Last.fm rejected that API key. Paste it again in the setup panel.';
  if (code === 29) return 'Last.fm is rate limiting this key. Wait a minute and try again.';
  return 'Last.fm could not answer that request';
}

export async function verifyUser(user: string): Promise<string> {
  const payload = await call<{ user?: { name?: string } }>({ method: 'user.getinfo', user });
  const name = payload.user?.name;
  if (!name) throw new UpstreamError(`Last.fm has no account called "${user}"`, 404);
  return name;
}

/** Last.fm returns the artist as an object, a string or a "#text" field depending on the call. */
export function toSeeds(raw: LastfmTrack[], limit: number): TrackSeed[] {
  const seen = new Set<string>();
  const seeds: TrackSeed[] = [];
  for (const entry of raw) {
    const title = entry.name?.trim();
    const artist = artistName(entry).trim();
    if (!title || !artist) continue;
    const key = trackKey({ title, artist });
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ title, artist, artwork: artworkOf(entry), link: entry.url });
    if (seeds.length >= limit) break;
  }
  return seeds;
}

async function seedsFor(user: string, variant: string, limit: number): Promise<TrackSeed[]> {
  const [kind, period = 'overall'] = variant.split(':');
  let raw: LastfmTrack[] = [];

  if (kind === 'recent') {
    const payload = await call<{ recenttracks?: { track?: LastfmTrack[] } }>({
      method: 'user.getrecenttracks',
      user,
      limit: String(limit * 2),
    });
    raw = payload.recenttracks?.track ?? [];
  } else if (kind === 'loved') {
    const payload = await call<{ lovedtracks?: { track?: LastfmTrack[] } }>({
      method: 'user.getlovedtracks',
      user,
      limit: String(limit),
    });
    raw = payload.lovedtracks?.track ?? [];
  } else {
    const payload = await call<{ toptracks?: { track?: LastfmTrack[] } }>({
      method: 'user.gettoptracks',
      user,
      period,
      limit: String(limit),
    });
    raw = payload.toptracks?.track ?? [];
  }

  return toSeeds(raw, limit);
}

export async function lastfmTracks(user: string, variant: string, limit = 200): Promise<ResolvedTracks> {
  const seeds = await seedsFor(user, variant, limit);
  const resolved = await mapLimit(seeds, 6, (seed) => resolvePreview(seed));
  const tracks = resolved.filter((track): track is Track => track !== null);
  return { tracks, dropped: seeds.length - tracks.length };
}
