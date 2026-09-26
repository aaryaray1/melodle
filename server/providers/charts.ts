import type { Track, VariantOption } from '../../shared/types.ts';
import { TtlCache } from '../lib/cache.ts';
import { fetchJson } from '../lib/http.ts';
import { trackFromDeezer } from '../lib/preview.ts';

const genreCache = new TtlCache<VariantOption[]>(24 * 60 * 60 * 1000, 4);
const chartCache = new TtlCache<Track[]>(60 * 60 * 1000, 40);

const GENRE_ORDER = ['0', '132', '116', '152', '113', '165', '85', '106', '466', '129', '144', '464'];

export async function chartVariants(): Promise<VariantOption[]> {
  return genreCache.wrap('genres', async () => {
    const payload = await fetchJson<{ data?: { id: number; name: string }[] }>('https://api.deezer.com/genre');
    const byId = new Map((payload.data ?? []).map((genre) => [String(genre.id), genre.name]));
    const ordered = GENRE_ORDER.filter((id) => byId.has(id)).map((id) => ({
      id,
      label: id === '0' ? 'Global top 100' : (byId.get(id) as string),
    }));
    return ordered.length ? ordered : [{ id: '0', label: 'Global top 100' }];
  });
}

export async function chartTracks(variant: string): Promise<Track[]> {
  const genreId = /^\d+$/.test(variant) ? variant : '0';
  return chartCache.wrap(genreId, async () => {
    const payload = await fetchJson<{ data?: Parameters<typeof trackFromDeezer>[0][] }>(
      `https://api.deezer.com/chart/${genreId}/tracks?limit=100`,
    );
    return (payload.data ?? []).map(trackFromDeezer).filter((track): track is Track => track !== null);
  });
}

export async function chartLabel(variant: string): Promise<string> {
  const variants = await chartVariants();
  const match = variants.find((option) => option.id === variant);
  return match ? match.label : 'Global top 100';
}
