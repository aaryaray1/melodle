import type { Track } from '../../shared/types.ts';
import { similarity, trackKey } from '../../shared/text.ts';
import { TtlCache } from './cache.ts';
import { fetchJson } from './http.ts';

/** Third-party links end up in href and src, so only web URLs survive. */
export function safeUrl(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export interface TrackSeed {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  link?: string;
}

interface DeezerTrack {
  id: number;
  title: string;
  title_short?: string;
  preview?: string;
  link?: string;
  rank?: number;
  artist?: { name?: string };
  album?: { title?: string; cover_medium?: string; cover_big?: string };
}

interface ItunesTrack {
  trackId: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
}

const IMPOSTORS = /\b(karaoke|tribute|made famous by|originally performed|in the style of|cover version|instrumental version|backing track|8-bit|lullaby rendition|workout mix)\b/i;

const resolved = new TtlCache<Track | null>(6 * 60 * 60 * 1000, 4000);

function score(seed: TrackSeed, candidateTitle: string, candidateArtist: string): number {
  const title = similarity(seed.title, candidateTitle);
  const artist = similarity(seed.artist, candidateArtist);
  if (title < 0.62 || artist < 0.5) return 0;
  return title * 2 + artist;
}

async function fromDeezer(seed: TrackSeed): Promise<Track | null> {
  const query = `${seed.artist} ${seed.title}`.trim();
  const url = `https://api.deezer.com/search?limit=8&q=${encodeURIComponent(query)}`;
  const payload = await fetchJson<{ data?: DeezerTrack[] }>(url);
  let best: { track: DeezerTrack; points: number } | null = null;

  for (const candidate of payload.data ?? []) {
    const artist = candidate.artist?.name ?? '';
    if (!candidate.preview || IMPOSTORS.test(`${candidate.title} ${artist}`)) continue;
    const points = score(seed, candidate.title, artist);
    if (points > 0 && (!best || points > best.points)) best = { track: candidate, points };
  }
  if (!best) return null;

  const { track } = best;
  return {
    id: `deezer:${track.id}`,
    title: track.title_short || track.title,
    artist: track.artist?.name ?? seed.artist,
    album: track.album?.title ?? seed.album,
    artwork: safeUrl(track.album?.cover_big ?? track.album?.cover_medium ?? seed.artwork),
    previewUrl: track.preview as string,
    previewFrom: 'deezer',
    link: safeUrl(seed.link ?? track.link),
    rank: track.rank,
  };
}

async function fromItunes(seed: TrackSeed): Promise<Track | null> {
  const term = `${seed.artist} ${seed.title}`.trim();
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=8&term=${encodeURIComponent(term)}`;
  const payload = await fetchJson<{ results?: ItunesTrack[] }>(url);
  let best: { track: ItunesTrack; points: number } | null = null;

  for (const candidate of payload.results ?? []) {
    const title = candidate.trackName ?? '';
    const artist = candidate.artistName ?? '';
    if (!candidate.previewUrl || IMPOSTORS.test(`${title} ${artist}`)) continue;
    const points = score(seed, title, artist);
    if (points > 0 && (!best || points > best.points)) best = { track: candidate, points };
  }
  if (!best) return null;

  const { track } = best;
  return {
    id: `itunes:${track.trackId}`,
    title: track.trackName ?? seed.title,
    artist: track.artistName ?? seed.artist,
    album: track.collectionName ?? seed.album,
    artwork: safeUrl(track.artworkUrl100?.replace('100x100bb', '500x500bb') ?? seed.artwork),
    previewUrl: track.previewUrl as string,
    previewFrom: 'itunes',
    link: safeUrl(seed.link ?? track.trackViewUrl),
  };
}

/** Finds a 30s preview for a track. Deezer first (mp3, generous rate limit), iTunes as backup. */
export async function resolvePreview(seed: TrackSeed): Promise<Track | null> {
  if (!seed.title.trim() || !seed.artist.trim()) return null;
  return resolved.wrap(trackKey(seed), async () => {
    try {
      const deezer = await fromDeezer(seed);
      if (deezer) return deezer;
    } catch {
      // Fall through to iTunes rather than losing the track.
    }
    try {
      return await fromItunes(seed);
    } catch {
      return null;
    }
  });
}

/** Deezer tracks already carry a preview, so they skip the lookup entirely. */
export function trackFromDeezer(raw: DeezerTrack): Track | null {
  if (!raw.preview) return null;
  return {
    id: `deezer:${raw.id}`,
    title: raw.title_short || raw.title,
    artist: raw.artist?.name ?? '',
    album: raw.album?.title,
    artwork: safeUrl(raw.album?.cover_big ?? raw.album?.cover_medium),
    previewUrl: raw.preview,
    previewFrom: 'deezer',
    link: safeUrl(raw.link),
    rank: raw.rank,
  };
}

/**
 * Deezer preview links carry a token that dies after about fifteen minutes, so
 * a cached pool outlives the URLs inside it. The client therefore asks for
 * audio by track id and the URL is fetched fresh here, just before streaming.
 */
const freshUrls = new TtlCache<string | null>(10 * 60 * 1000, 500);

export async function freshPreviewUrl(trackId: string): Promise<string | null> {
  const [source, id] = trackId.split(':');
  if (!id || !/^\d+$/.test(id)) return null;

  return freshUrls.wrap(trackId, async () => {
    try {
      if (source === 'deezer') {
        const track = await fetchJson<{ preview?: string }>(`https://api.deezer.com/track/${id}`);
        return safeUrl(track.preview) ?? null;
      }
      if (source === 'itunes') {
        const payload = await fetchJson<{ results?: { previewUrl?: string }[] }>(
          `https://itunes.apple.com/lookup?id=${id}`,
        );
        return safeUrl(payload.results?.[0]?.previewUrl) ?? null;
      }
      return null;
    } catch {
      return null;
    }
  });
}
