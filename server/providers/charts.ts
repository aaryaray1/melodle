import type { Track, VariantOption } from '../../shared/types.ts';
import { TtlCache } from '../lib/cache.ts';
import { fetchJson } from '../lib/http.ts';
import { trackFromDeezer } from '../lib/preview.ts';
import { addPlaylistTracks, editorialPlaylists } from './editorial.ts';

const genreCache = new TtlCache<VariantOption[]>(24 * 60 * 60 * 1000, 4);
const chartCache = new TtlCache<Track[]>(60 * 60 * 1000, 40);

/** The chart itself is 100 songs; editorial playlists for the genre widen it to this. */
const MAX_TRACKS = 500;
const MAX_PLAYLISTS = 6;

function playlistQueries(genreId: string, name: string): string[] {
  if (genreId === '0') return ['top hits', 'global hits', 'hits', 'pop hits', 'party hits', 'viral hits'];
  return [`${name} hits`, `best of ${name}`, name, `${name} classics`];
}

const GENRE_ORDER = ['0', '132', '116', '152', '113', '165', '85', '106', '466', '129', '144', '464'];

export async function chartVariants(): Promise<VariantOption[]> {
  return genreCache.wrap('genres', async () => {
    const payload = await fetchJson<{ data?: { id: number; name: string }[] }>('https://api.deezer.com/genre');
    const byId = new Map((payload.data ?? []).map((genre) => [String(genre.id), genre.name]));
    const ordered = GENRE_ORDER.filter((id) => byId.has(id)).map((id) => ({
      id,
      label: id === '0' ? 'Global hits' : (byId.get(id) as string),
    }));
    return ordered.length ? ordered : [{ id: '0', label: 'Global hits' }];
  });
}

export async function chartTracks(variant: string): Promise<Track[]> {
  const genreId = /^\d+$/.test(variant) ? variant : '0';
  return chartCache.wrap(genreId, async () => {
    const payload = await fetchJson<{ data?: Parameters<typeof trackFromDeezer>[0][] }>(
      `https://api.deezer.com/chart/${genreId}/tracks?limit=100`,
    );
    const chart = (payload.data ?? []).map(trackFromDeezer).filter((track): track is Track => track !== null);
    // Widening is a bonus: if the playlist search fails, the chart alone still plays.
    try {
      const name = genreId === '0' ? '' : await chartLabel(genreId);
      const playlists = await editorialPlaylists({
        queries: playlistQueries(genreId, name),
        maxPlaylists: MAX_PLAYLISTS,
        minTracks: 30,
      });
      return await addPlaylistTracks(chart, playlists, MAX_TRACKS);
    } catch {
      return chart;
    }
  });
}

export async function chartLabel(variant: string): Promise<string> {
  const variants = await chartVariants();
  const match = variants.find((option) => option.id === variant);
  return match ? match.label : 'Global hits';
}
