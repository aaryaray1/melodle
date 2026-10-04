import type { Track, VariantOption } from '../../shared/types.ts';
import { TtlCache } from '../lib/cache.ts';
import { addPlaylistTracks, editorialPlaylists } from './editorial.ts';

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
    queries: ['70s hits', '70s party hits', '70s rock', '70s disco', '70s pop', '70s soul', '70s classics'],
    belongs: /(^|\W)(70s|1970s|seventies|197\d)(\W|$)/i,
  },
  {
    id: '1980s',
    label: 'The 80s',
    queries: ['80s hits', '80s pop', '80s party hits', '80s rock', '80s dance', '80s ballads', '80s classics'],
    belongs: /(^|\W)(80s|1980s|eighties|198\d)(\W|$)/i,
  },
  {
    id: '1990s',
    label: 'The 90s',
    queries: ['90s hits', '90s party hits', '90s pop', '90s rock', '90s dance', '90s hip hop', '90s r&b'],
    belongs: /(^|\W)(90s|1990s|nineties|199\d)(\W|$)/i,
  },
  {
    id: '2000s',
    label: 'The 00s',
    queries: ['00s hits', '00s pop', '00s party hits', '00s rock', '2000s hip hop', '2000s r&b', '2000s dance'],
    belongs: /(^|\W)(00s|2000s|200\d)(\W|$)/i,
  },
  {
    id: '2010s',
    label: 'The 10s',
    queries: ['10s hits', '10s pop', '10s party hits', '2010s rock', '2010s hip hop', '2010s dance', '2010s r&b'],
    belongs: /(^|\W)(10s|2010s|201\d)(\W|$)/i,
  },
  {
    id: '2020s',
    label: 'The 20s',
    queries: ['20s hits', '20s pop', '20s party hits', 'top hits 2023', 'top hits 2024', 'top hits 2025', '2020s hip hop'],
    belongs: /(^|\W)(20s|2020s|202\d)(\W|$)/i,
  },
];

const MAX_PLAYLISTS = 9;
const MAX_TRACKS = 700;

const pools = new TtlCache<Track[]>(24 * 60 * 60 * 1000, 12);

export const DECADE_VARIANTS: VariantOption[] = DECADES.map(({ id, label }) => ({ id, label }));

export function decadeLabel(variant: string): string {
  return DECADES.find((decade) => decade.id === variant)?.label ?? 'The 80s';
}

export async function decadeTracks(variant: string): Promise<Track[]> {
  const decade = DECADES.find((entry) => entry.id === variant) ?? (DECADES[1] as Decade);
  return pools.wrap(decade.id, async () => {
    const playlists = await editorialPlaylists({
      queries: decade.queries,
      belongs: decade.belongs,
      maxPlaylists: MAX_PLAYLISTS,
    });
    return addPlaylistTracks([], playlists, MAX_TRACKS);
  });
}
