import type { ProviderId, ResolvedTracks, Track } from '../../shared/types.ts';
import { trackKey } from '../../shared/text.ts';
import { readConnection, saveConnection } from '../lib/accounts.ts';
import { UpstreamError } from '../lib/http.ts';
import type { PartyDetail } from '../lib/parties.ts';
import type { OAuthTokens } from '../lib/session.ts';
import { lastfmTracks } from './lastfm.ts';
import { spotifyMix } from './spotify.ts';
import { youtubeTracks } from './youtube.ts';

/** Enough from each person to feel present, without a ten minute wait to start. */
const PER_MEMBER = 45;

const SOURCE_ORDER: ProviderId[] = ['spotify', 'lastfm', 'youtube'];

async function historyFor(userId: number, username: string): Promise<Track[]> {
  for (const provider of SOURCE_ORDER) {
    if (provider === 'lastfm') {
      const connection = readConnection<{ user: string }>(userId, 'lastfm');
      if (!connection) continue;
      const { tracks } = await lastfmTracks(connection.user, 'top:overall', PER_MEMBER);
      return tracks.map((track) => ({ ...track, contributor: username }));
    }
    const tokens = readConnection<OAuthTokens>(userId, provider);
    if (!tokens) continue;
    const save = (fresh: OAuthTokens) => saveConnection(userId, provider, fresh, fresh.account);
    const { tracks } =
      provider === 'spotify'
        ? await spotifyMix(tokens, PER_MEMBER, save)
        : await youtubeTracks(tokens, 'liked', PER_MEMBER, save);
    return tracks.map((track) => ({ ...track, contributor: username }));
  }
  return [];
}

/**
 * Round-robin rather than concatenation: with four people you want every fourth
 * song to be yours, not the first quarter of the game.
 */
export function interleave(lists: Track[][]): Track[] {
  const merged: Track[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((list) => list.length));

  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const track = list[index];
      if (!track) continue;
      const key = trackKey(track);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(track);
    }
  }
  return merged;
}

export async function partyTracks(party: PartyDetail): Promise<ResolvedTracks & { contributors: string[] }> {
  const lists: Track[][] = [];
  const contributors: string[] = [];

  for (const member of party.memberIds) {
    const tracks = await historyFor(member.userId, member.username).catch(() => []);
    if (!tracks.length) continue;
    lists.push(tracks);
    contributors.push(member.username);
  }

  if (!lists.length) {
    throw new UpstreamError(
      'Nobody in this party has linked a music service yet. Link one and the party fills up.',
      422,
    );
  }

  const tracks = interleave(lists);
  return { tracks, dropped: 0, contributors };
}
