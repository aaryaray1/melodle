import type { Track, VariantOption } from '../../shared/types.ts';
import { trackKey } from '../../shared/text.ts';
import { TtlCache } from '../lib/cache.ts';
import { fetchJson } from '../lib/http.ts';
import { trackFromDeezer } from '../lib/preview.ts';

interface DeezerPlaylist {
  id: number;
  title?: string;
  nb_tracks?: number;
  user?: { name?: string };
}

interface Decade {
  id: string;
  label: string;
  queries: string[];
  /** A playlist only counts if its own title names this decade. */
  belongs: RegExp;
}

const DECADES: Decade[] = [
  {
    id: '1970s',
    label: 'The 70s',
    queries: ['70s hits', '70s party hits', '70s rock', '70s disco'],
    belongs: /(^|\W)(70s|1970s|seventies|197\d)(\W|$)/i,
  },
  {
    id: '1980s',
    label: 'The 80s',
    queries: ['80s hits', '80s pop', '80s party hits', '80s rock'],
    belongs: /(^|\W)(80s|1980s|eighties|198\d)(\W|$)/i,
  },
  {
    id: '1990s',
    label: 'The 90s',
    queries: ['90s hits', '90s party hits', '90s pop', '90s rock'],
    belongs: /(^|\W)(90s|1990s|nineties|199\d)(\W|$)/i,
  },
  {
    id: '2000s',
    label: 'The 00s',
    queries: ['00s hits', '00s pop', '00s party hits', '00s rock'],
    belongs: /(^|\W)(00s|2000s|200\d)(\W|$)/i,
  },
  {
    id: '2010s',
    label: 'The 10s',
    queries: ['10s hits', '10s pop', '10s party hits', '2010s rock'],
    belongs: /(^|\W)(10s|2010s|201\d)(\W|$)/i,
  },
  {
    id: '2020s',
    label: 'The 20s',
    queries: ['20s hits', '20s pop', '20s party hits', 'top hits 2023'],
    belongs: /(^|\W)(20s|2020s|202\d)(\W|$)/i,
  },
];

const MAX_PLAYLISTS = 4;
const MAX_TRACKS = 250;

const pools = new TtlCache<Track[]>(24 * 60 * 60 * 1000, 12);

export const DECADE_VARIANTS: VariantOption[] = DECADES.map(({ id, label }) => ({ id, label }));

export function decadeLabel(variant: string): string {
  return DECADES.find((decade) => decade.id === variant)?.label ?? 'The 80s';
}

async function playlistsFor(decade: Decade): Promise<number[]> {
  const chosen: number[] = [];
  const seen = new Set<number>();

  for (const query of decade.queries) {
    if (chosen.length >= MAX_PLAYLISTS) break;
    const found = await fetchJson<{ data?: DeezerPlaylist[] }>(
      `https://api.deezer.com/search/playlist?limit=8&q=${encodeURIComponent(query)}`,
    ).catch(() => ({ data: [] as DeezerPlaylist[] }));

    for (const playlist of found.data ?? []) {
      const title = playlist.title ?? '';
      const editorial = /deezer/i.test(playlist.user?.name ?? '');
      if (!editorial || (playlist.nb_tracks ?? 0) < 40) continue;
      if (!decade.belongs.test(title) || seen.has(playlist.id)) continue;
      seen.add(playlist.id);
      chosen.push(playlist.id);
      if (chosen.length >= MAX_PLAYLISTS) break;
    }
  }
  return chosen;
}

export async function decadeTracks(variant: string): Promise<Track[]> {
  const decade = DECADES.find((entry) => entry.id === variant) ?? (DECADES[1] as Decade);
  return pools.wrap(decade.id, async () => {
    const playlists = await playlistsFor(decade);
    const seen = new Set<string>();
    const tracks: Track[] = [];

    for (const id of playlists) {
      const payload = await fetchJson<{ data?: Parameters<typeof trackFromDeezer>[0][] }>(
        `https://api.deezer.com/playlist/${id}/tracks?limit=100`,
      ).catch(() => ({ data: [] }));

      for (const raw of payload.data ?? []) {
        const track = trackFromDeezer(raw);
        if (!track || !track.artist) continue;
        const key = trackKey(track);
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push(track);
        if (tracks.length >= MAX_TRACKS) return tracks;
      }
    }
    return tracks;
  });
}
