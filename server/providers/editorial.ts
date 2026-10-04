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
  /** When given, a playlist only counts if its own title matches. */
  belongs?: RegExp;
  minTracks?: number;
}

/**
 * Deezer's own editors, not users: a user playlist called "80s hits" is as
 * likely to be one person's deep cuts as the decade's hits.
 */
export async function editorialPlaylists(search: PlaylistSearch): Promise<number[]> {
  const chosen: number[] = [];
  const seen = new Set<number>();

  for (const query of search.queries) {
    if (chosen.length >= search.maxPlaylists) break;
    const found = await fetchJson<{ data?: DeezerPlaylist[] }>(
      `https://api.deezer.com/search/playlist?limit=10&q=${encodeURIComponent(query)}`,
    ).catch(() => ({ data: [] as DeezerPlaylist[] }));

    for (const playlist of found.data ?? []) {
      const title = playlist.title ?? '';
      const editorial = /deezer/i.test(playlist.user?.name ?? '');
      if (!editorial || (playlist.nb_tracks ?? 0) < (search.minTracks ?? 40)) continue;
      if ((search.belongs && !search.belongs.test(title)) || seen.has(playlist.id)) continue;
      seen.add(playlist.id);
      chosen.push(playlist.id);
      if (chosen.length >= search.maxPlaylists) break;
    }
  }
  return chosen;
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
