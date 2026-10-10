import type { Track } from '../../shared/types.ts';
import { normalize, similarity } from '../../shared/text.ts';

export interface Searchable {
  track: Track;
  title: string;
  artist: string;
  /** Position in the pool, which is the source's own popularity order. */
  rank: number;
}

/** The list scrolls, so it can hold every match a real query produces. */
export const MAX_RESULTS = 40;
const ARTIST_MATCH = 0.78;
const LOOSE_MATCH = 0.42;
const WORD_MATCH_MIN = 3;

/**
 * Returns how strongly a query names this artist, or 0 for no match. Matching
 * whole-string prefixes alone is not enough: nobody types the "The" in
 * The Weeknd, so any word of the name can carry the match.
 */
function artistMatch(artist: string, needle: string): number {
  if (!artist) return 0;
  if (artist === needle) return 2;
  if (needle.length >= 2 && artist.startsWith(needle)) return 1.6 + needle.length / artist.length;
  if (needle.length >= WORD_MATCH_MIN && artist.includes(` ${needle}`)) {
    return 1.3 + needle.length / artist.length;
  }
  const score = similarity(artist, needle);
  return score >= ARTIST_MATCH ? score : 0;
}

export function buildIndex(tracks: Track[]): Searchable[] {
  return tracks.map((track, rank) => ({
    track,
    title: normalize(track.title),
    artist: normalize(track.artist),
    rank,
  }));
}

interface Group {
  strength: number;
  entries: Searchable[];
}

/**
 * Searching an artist should answer "what do they have", so a matching artist
 * gets a block of all their songs in pool order rather than whichever titles
 * happen to score well. Titles that start with the query lead, so searching
 * "billie" finds Billie Jean as well as Billie Eilish; then the artist blocks;
 * then every other title that merely contains or resembles the query.
 */
export function searchTracks(entries: Searchable[], query: string): Track[] {
  const needle = normalize(query);
  if (!needle) return [];

  const titleLeads: Searchable[] = [];
  const groups = new Map<string, Group>();
  const rest: { entry: Searchable; score: number }[] = [];

  for (const entry of entries) {
    const titleStarts = entry.title.startsWith(needle);
    if (titleStarts) titleLeads.push(entry);

    const artistScore = artistMatch(entry.artist, needle);
    if (artistScore > 0) {
      const group = groups.get(entry.artist) ?? { strength: artistScore, entries: [] };
      group.strength = Math.max(group.strength, artistScore);
      group.entries.push(entry);
      groups.set(entry.artist, group);
      continue;
    }
    if (titleStarts) continue;

    const score = (entry.title.includes(needle) ? 1.4 : 0) + similarity(`${entry.title} ${entry.artist}`, needle);
    if (score > LOOSE_MATCH) rest.push({ entry, score });
  }

  const picked: Track[] = [];
  const seen = new Set<string>();
  const take = (entry: Searchable) => {
    if (seen.has(entry.track.id) || picked.length >= MAX_RESULTS) return;
    seen.add(entry.track.id);
    picked.push(entry.track);
  };

  titleLeads.sort((a, b) => a.rank - b.rank);
  for (const entry of titleLeads) take(entry);

  const ordered = [...groups.values()].sort((a, b) => b.strength - a.strength);
  for (const group of ordered) {
    group.entries.sort((a, b) => a.rank - b.rank);
    for (const entry of group.entries) take(entry);
    if (picked.length >= MAX_RESULTS) break;
  }

  rest.sort((a, b) => b.score - a.score || a.entry.rank - b.entry.rank);
  for (const { entry } of rest) take(entry);

  return picked;
}
