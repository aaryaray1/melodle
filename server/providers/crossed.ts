import type { Track } from '../../shared/types.ts';
import { DiskCache } from '../lib/diskcache.ts';
import { fetchJson, mapLimit } from '../lib/http.ts';
import { DECADES, decadeTracks, type Decade } from './decades.ts';
import { addPlaylistTracks, findPlaylists, plainTitle } from './editorial.ts';

/**
 * A genre within a decade: rock with the 10s is rock from the 2010s, not rock
 * plus the 2010s. Deezer has no year filter on its search, but its editors (and
 * its users) title playlists exactly that way, "2010s Rock", so a pair is built
 * from playlists whose own title names both the genre and that one decade.
 */
export interface GenreSpec {
  id: string;
  /** Words to search with. */
  terms: string[];
  /** How the genre is spelt in a playlist title. */
  pattern: RegExp;
}

const KNOWN: Record<string, { terms: string[]; pattern: RegExp }> = {
  '132': { terms: ['pop'], pattern: /\bpop\b/i },
  '116': { terms: ['hip hop', 'rap'], pattern: /\bhip[\s-]?hop\b|\brap\b/i },
  '152': { terms: ['rock'], pattern: /\brock\b/i },
  '113': { terms: ['dance'], pattern: /\bdance\b|\bedm\b/i },
  '165': { terms: ['r&b', 'rnb'], pattern: /\br\s?&\s?b\b|\br\s?n\s?b\b|\brnb\b/i },
  '85': { terms: ['alternative', 'indie'], pattern: /\balternative\b|\bindie\b|\balt\b/i },
  '106': { terms: ['electro', 'electronic'], pattern: /\belectro(nic|nica)?\b|\bedm\b/i },
  '466': { terms: ['folk'], pattern: /\bfolk\b/i },
  '129': { terms: ['jazz'], pattern: /\bjazz\b/i },
  '144': { terms: ['reggae'], pattern: /\breggae\b|\bdancehall\b/i },
  '464': { terms: ['metal'], pattern: /\bmetal\b/i },
};

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function genreSpec(id: string, label: string): GenreSpec {
  const known = KNOWN[id];
  if (known) return { id, ...known };
  const word = label.toLowerCase();
  return { id, terms: [word], pattern: new RegExp(`\\b${escape(word)}\\b`, 'i') };
}

function decadeOf(id: string): Decade {
  return DECADES.find((decade) => decade.id === id) ?? (DECADES[1] as Decade);
}

/** "2010s" and "10s", before and after the genre, for every way to say the genre. */
export function pairQueries(genre: GenreSpec, decadeId: string): string[] {
  const full = decadeOf(decadeId).id;
  const names = [full, full.slice(2)];
  const queries = genre.terms.flatMap((term) => names.flatMap((name) => [`${name} ${term}`, `${term} ${name}`]));
  return [...new Set(queries)];
}

/** Names the genre, names this decade, and names no other decade. */
export function titleFits(title: string, genre: GenreSpec, decadeId: string): boolean {
  const plain = plainTitle(title);
  const decade = decadeOf(decadeId);
  if (!genre.pattern.test(plain) || !decade.belongs.test(plain)) return false;
  return !DECADES.some((other) => other.id !== decade.id && other.belongs.test(plain));
}

/**
 * Users' playlists are checked song by song against Deezer's release date. A
 * date before the decade always rules a song out. A later one only does from the
 * 2000s on: older records are mostly on Deezer as reissues, dated by the reissue.
 */
export function yearFits(year: number | undefined, decadeId: string): boolean {
  if (!year) return false;
  const start = Number(decadeOf(decadeId).id.slice(0, 4));
  if (year < start) return false;
  if (start >= 2000) return year <= start + 10;
  // A date in the very next decade is a song from it; one further on is a reissue.
  return year < start + 10 || year >= start + 20;
}

// Release dates never change. Unknown ones are not kept, so a rate-limited miss is retried.
const years = new DiskCache<number | null>('release-year', 365 * 24 * 60 * 60 * 1000, (year) => year !== null, 5_000);

async function releaseYear(trackId: string): Promise<number | undefined> {
  const id = trackId.split(':')[1];
  const year = await years.wrap(trackId, async () => {
    const info = await fetchJson<{ release_date?: string }>(`https://api.deezer.com/track/${id}`).catch(() => null);
    const parsed = Number(String(info?.release_date ?? '').slice(0, 4));
    return parsed > 1900 ? parsed : null;
  });
  return year ?? undefined;
}

const MAX_TRACKS = 700;
/** How many songs from users' playlists are worth a date check each. */
const COMMUNITY_CHECKS = 200;
/** Below this, the editors' playlists are topped up from users' ones that pass the same title test. */
const TOP_UP_BELOW = 150;
const pairs = new DiskCache<Track[]>('genre-decade', 24 * 60 * 60 * 1000, (tracks) => tracks.length > 0);

export async function genreDecadeTracks(genreId: string, genreLabel: string, decadeId: string): Promise<Track[]> {
  // "Global hits" is no genre at all: within a decade it is just that decade.
  if (genreId === '0') return decadeTracks(decadeId);
  const genre = genreSpec(genreId, genreLabel);
  const decade = decadeOf(decadeId);

  return pairs.wrap(`${genreId}|${decade.id}`, async () => {
    const found = await findPlaylists({
      queries: pairQueries(genre, decade.id),
      belongs: [genre.pattern, decade.belongs],
      rejects: DECADES.filter((other) => other.id !== decade.id).map((other) => other.belongs),
      maxPlaylists: 8,
      minTracks: 20,
    });
    const tracks = await addPlaylistTracks([], found.editorial, MAX_TRACKS);
    if (tracks.length >= TOP_UP_BELOW) return tracks;

    // The editors' own playlists are trusted; users' ones have to prove each song's year.
    const trusted = tracks.length;
    await addPlaylistTracks(tracks, found.community, trusted + COMMUNITY_CHECKS);
    const candidates = tracks.splice(trusted);
    const checked = await mapLimit(candidates, 3, async (track) =>
      yearFits(await releaseYear(track.id), decade.id) ? track : null,
    );
    for (const track of checked) if (track) tracks.push(track);
    return tracks;
  });
}
