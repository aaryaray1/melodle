import type { Track } from '../../shared/types.ts';
import { DiskCache } from '../lib/diskcache.ts';
import { mapLimit } from '../lib/http.ts';
import { chartTracks } from './charts.ts';
import { DECADES, decadeTracks, type Decade } from './decades.ts';
import { genreDecadeTracks, genreSpec, releaseYear, yearFits, type GenreSpec } from './crossed.ts';
import { findPlaylists, addPlaylistTracks, plainTitle } from './editorial.ts';
import { languageSpec, languageTracks, type LanguageSpec } from './languages.ts';

/**
 * A language, a genre and a decade narrow each other: Korean + Pop + the 10s is
 * K-pop from the 2010s. Playlists titled for all of them are rare, so the list
 * is built from the most specific combination Deezer's playlists name, and the
 * decade is then applied song by song from Deezer's release dates when the
 * titles alone could not.
 */
export interface Facets {
  lang?: string;
  /** Deezer genre id; "0" (global hits) is no genre. */
  genre?: string;
  genreLabel?: string;
  decade?: string;
}

function fold(text: string): string {
  return plainTitle(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "deutschrap" / "deutscher rap" / "rap français", spaces optional, accents folded. */
export function phrasePattern(phrases: string[]): RegExp | null {
  if (!phrases.length) return null;
  const alternatives = phrases.map((phrase) => fold(phrase).split(/\s+/).map(escape).join('\\s*'));
  return new RegExp(`(^|[^a-z])(${alternatives.join('|')})([^a-z]|$)`, 'i');
}

/** Whether a playlist title names the language and the genre (by Deezer's name or the language's own phrase). */
export function titleNamesBoth(title: string, language: LanguageSpec, genre: GenreSpec | null): boolean {
  const folded = fold(title);
  if (!language.pattern.test(folded)) return false;
  if (!genre) return true;
  const phrases = phrasePattern(language.genres[genre.id] ?? []);
  return genre.pattern.test(folded) || Boolean(phrases?.test(folded));
}

/** Searches for playlists of the language's genre: its own phrases first, then plain combinations. */
export function languageGenreQueries(language: LanguageSpec, genre: GenreSpec): string[] {
  const own = language.genres[genre.id] ?? [];
  const languageWords = language.queries.slice(0, 2).map((query) => query.split(' ')[0] as string);
  const plain = genre.terms.slice(0, 2).flatMap((term) => languageWords.map((word) => `${word} ${term}`));
  return [...new Set([...own, ...plain])];
}

function decadeOf(id: string): Decade {
  return DECADES.find((decade) => decade.id === id) ?? (DECADES[1] as Decade);
}

const decadeNames = (decade: Decade) => [decade.id, decade.id.slice(2)];

/** The most popular songs that Deezer dates inside the decade. Bounded: each date is a request. */
async function inDecade(tracks: Track[], decadeId: string, checks = 250): Promise<Track[]> {
  const candidates = [...tracks].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)).slice(0, checks);
  const kept = await mapLimit(candidates, 3, async (track) => (yearFits(await releaseYear(track.id), decadeId) ? track : null));
  return kept.filter((track): track is Track => track !== null);
}

const MAX_TRACKS = 700;
const ENOUGH = 40;
const facets = new DiskCache<Track[]>('facet-v1', 24 * 60 * 60 * 1000, (tracks) => tracks.length > 0);

async function fromPlaylists(queries: string[], belongs: RegExp[], rejects: RegExp[]): Promise<Track[]> {
  const found = await findPlaylists({ queries, belongs, rejects, maxPlaylists: 10, minTracks: 20 });
  const tracks = await addPlaylistTracks([], found.editorial, MAX_TRACKS);
  if (tracks.length < 150) await addPlaylistTracks(tracks, found.community, MAX_TRACKS);
  return tracks;
}

async function languageGenre(language: LanguageSpec, genre: GenreSpec): Promise<Track[]> {
  const phrases = phrasePattern(language.genres[genre.id] ?? []);
  const genreOrPhrase = phrases ? new RegExp(`${genre.pattern.source}|${phrases.source}`, 'i') : genre.pattern;
  const tracks = await fromPlaylists(languageGenreQueries(language, genre), [language.pattern, genreOrPhrase], []);
  // Too thin to be a list: the language on its own beats an empty screen.
  return tracks.length >= 15 ? tracks : languageTracks(language.code);
}

export async function facetTracks(facets_: Facets): Promise<Track[]> {
  const genreId = facets_.genre && facets_.genre !== '0' ? facets_.genre : undefined;
  const { lang, decade } = facets_;

  if (!lang) {
    if (genreId && decade) return genreDecadeTracks(genreId, facets_.genreLabel ?? '', decade);
    if (decade) return decadeTracks(decade);
    return chartTracks(genreId ?? '0');
  }
  const language = languageSpec(lang);
  if (!language) return [];
  const genre = genreId ? genreSpec(genreId, facets_.genreLabel ?? '') : null;

  return facets.wrap(`${lang}|${genreId ?? ''}|${decade ?? ''}`, async () => {
    const base = genre ? await languageGenre(language, genre) : await languageTracks(lang);
    if (!decade) return base;

    // Playlists titled for the decade as well ("2010s K-Pop", "années 80 chanson")...
    const span = decadeOf(decade);
    const stems = genre ? languageGenreQueries(language, genre) : language.queries.slice(0, 3);
    const queries = stems.flatMap((stem) => decadeNames(span).flatMap((name) => [`${stem} ${name}`, `${name} ${stem}`]));
    const phrases = genre ? phrasePattern(language.genres[genre.id] ?? []) : null;
    const genreOrPhrase = genre ? (phrases ? new RegExp(`${genre.pattern.source}|${phrases.source}`, 'i') : genre.pattern) : null;
    const titled = await fromPlaylists(
      [...new Set(queries)].slice(0, 12),
      genreOrPhrase ? [language.pattern, span.belongs, genreOrPhrase] : [language.pattern, span.belongs],
      DECADES.filter((other) => other.id !== span.id).map((other) => other.belongs),
    );
    if (titled.length >= ENOUGH) return titled;
    // ...and otherwise the language (or language + genre) list, kept to songs dated in the decade.
    const dated = await inDecade(base, decade);
    return dated.length >= 5 ? dated : titled;
  });
}
