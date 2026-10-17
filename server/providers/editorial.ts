import type { Track } from '../../shared/types.ts';
import { trackKey } from '../../shared/text.ts';
import { fetchJson } from '../lib/http.ts';
import { trackFromDeezer } from '../lib/preview.ts';

interface DeezerPlaylist {
  id: number;
  title?: string;
  nb_tracks?: number;
  user?: { name?: string };
}

export interface PlaylistSearch {
  queries: string[];
  maxPlaylists: number;
  /** A playlist only counts if its own title matches every one of these. */
  belongs?: RegExp[];
  /** ...and none of these. */
  rejects?: RegExp[];
  minTracks?: number;
}

export interface FoundPlaylists {
  /** Deezer's own editors: a user playlist called "80s hits" may be one person's deep cuts. */
  editorial: number[];
  /** Everyone else's, kept apart as a fallback for pairs the editors never made. */
  community: number[];
}

/** "80's Hip-Hop" names the 80s: apostrophes come out before any title is matched. */
export function plainTitle(title: string): string {
  return title.replace(/['’`]/g, '');
}

export async function findPlaylists(search: PlaylistSearch): Promise<FoundPlaylists> {
  const found: FoundPlaylists = { editorial: [], community: [] };
  const seen = new Set<number>();

  for (const query of search.queries) {
    if (found.editorial.length >= search.maxPlaylists) break;
    const page = await fetchJson<{ data?: DeezerPlaylist[] }>(
      `https://api.deezer.com/search/playlist?limit=25&q=${encodeURIComponent(query)}`,
    ).catch(() => ({ data: [] as DeezerPlaylist[] }));

    for (const playlist of page.data ?? []) {
      const title = plainTitle(playlist.title ?? '');
      if ((playlist.nb_tracks ?? 0) < (search.minTracks ?? 40) || seen.has(playlist.id)) continue;
      if (search.belongs && !search.belongs.every((pattern) => pattern.test(title))) continue;
      if (search.rejects?.some((pattern) => pattern.test(title))) continue;
      seen.add(playlist.id);
      const editorial = /deezer/i.test(playlist.user?.name ?? '');
      if (editorial && found.editorial.length < search.maxPlaylists) found.editorial.push(playlist.id);
      else if (!editorial && found.community.length < search.maxPlaylists) found.community.push(playlist.id);
    }
  }
  return found;
}

export async function editorialPlaylists(search: PlaylistSearch): Promise<number[]> {
  return (await findPlaylists(search)).editorial;
}

/** Appends the playable, not-yet-seen songs of each playlist, up to `max` in all. */
export async function addPlaylistTracks(tracks: Track[], playlists: number[], max: number): Promise<Track[]> {
  const seen = new Set(tracks.map(trackKey));
  for (const id of playlists) {
    if (tracks.length >= max) break;
    const payload = await fetchJson<{ data?: Parameters<typeof trackFromDeezer>[0][] }>(
      `https://api.deezer.com/playlist/${id}/tracks?limit=150`,
    ).catch(() => ({ data: [] }));

    for (const raw of payload.data ?? []) {
      const track = trackFromDeezer(raw);
      if (!track || !track.artist) continue;
      const key = trackKey(track);
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push(track);
      if (tracks.length >= max) break;
    }
  }
  return tracks;
}
