import { Router } from 'express';
import type { Connections, Me, Pool, ProviderId, Track, VariantOption } from '../../shared/types.ts';
import {
  accountStats,
  getAccount,
  listConnections,
  listRatings,
  readConnection,
  saveConnection,
} from '../lib/accounts.ts';
import { env } from '../lib/env.ts';
import { UpstreamError } from '../lib/http.ts';
import type { OAuthTokens, Session } from '../lib/session.ts';
import { chartLabel, chartTracks, chartVariants } from '../providers/charts.ts';
import { DECADE_VARIANTS, decadeLabel, decadeTracks } from '../providers/decades.ts';
import { LASTFM_VARIANTS, lastfmTracks } from '../providers/lastfm.ts';
import { SPOTIFY_VARIANTS, spotifyConfigured, spotifyMix, spotifyTracks } from '../providers/spotify.ts';
import { canHearSongStart } from '../lib/intro.ts';
import { canEditKeys } from '../lib/keys.ts';
import { partyFor } from '../lib/parties.ts';
import { interleave, partyTracks } from '../providers/party.ts';
import { blendVariant, mixLabel, parseBlend } from '../../shared/blend.ts';
import { isAlternateVersion } from '../../shared/versions.ts';
import { facetTracks } from '../providers/facets.ts';
import { englishOnly, LANGUAGE_VARIANTS, languageLabel } from '../providers/languages.ts';
import { fetchJson, mapLimit } from '../lib/http.ts';
import { TtlCache } from '../lib/cache.ts';
import { trackFromDeezer } from '../lib/preview.ts';
import { YOUTUBE_BASE_VARIANTS, youtubeConfigured, youtubeTracks, youtubeVariants } from '../providers/youtube.ts';

export const catalogueRouter = Router();

function connectionsOf(session: Session): Connections {
  const linked = new Map(
    session.userId ? listConnections(session.userId).map((row) => [row.provider, row.account]) : [],
  );
  const history = (provider: ProviderId, configured: boolean, detail: string) => ({
    connected: linked.has(provider),
    configured,
    needsAccount: true,
    account: linked.get(provider) ?? undefined,
    detail: configured ? undefined : detail,
  });

  return {
    charts: { connected: true, configured: true, needsAccount: false, detail: 'No account needed' },
    decades: { connected: true, configured: true, needsAccount: false, detail: 'No account needed' },
    blend: { connected: true, configured: true, needsAccount: false, detail: 'No account needed' },
    party: {
      connected: Boolean(session.userId && partyFor(session.userId)),
      configured: true,
      needsAccount: true,
      detail: 'Everyone in the party adds their music',
    },
    lastfm: history('lastfm', Boolean(env.lastfmKey), 'Add a Last.fm API key to use your scrobbles'),
    spotify: history('spotify', spotifyConfigured(), 'Add a Spotify client ID and secret to connect'),
    youtube: history('youtube', youtubeConfigured(), 'Add a Google client ID and secret to connect'),
  };
}

function labelFor(variants: VariantOption[], variant: string, fallback: string): string {
  return variants.find((option) => option.id === variant)?.label ?? fallback;
}

function tokensFor(session: Session, provider: 'spotify' | 'youtube'): OAuthTokens {
  const tokens = session.userId ? readConnection<OAuthTokens>(session.userId, provider) : null;
  if (!tokens) throw new UpstreamError(`Connect ${provider === 'spotify' ? 'Spotify' : 'YouTube Music'} first`, 401);
  return tokens;
}

catalogueRouter.get('/me', async (request, response) => {
  const session = request.session;
  const account = session.userId ? getAccount(session.userId) : null;
  const youtubeTokens = session.userId ? readConnection<OAuthTokens>(session.userId, 'youtube') : null;

  const party = session.userId ? partyFor(session.userId) : null;
  const variants: Record<ProviderId, VariantOption[]> = {
    charts: await chartVariants().catch(() => [{ id: '0', label: 'Global hits' }]),
    decades: DECADE_VARIANTS,
    blend: [],
    party: party ? [{ id: 'all', label: `${party.name} · everyone` }] : [],
    lastfm: LASTFM_VARIANTS,
    spotify: SPOTIFY_VARIANTS,
    youtube: youtubeTokens
      ? await youtubeVariants(youtubeTokens).catch(() => YOUTUBE_BASE_VARIANTS)
      : YOUTUBE_BASE_VARIANTS,
  };

  const payload: Me = {
    account,
    connections: connectionsOf(session),
    variants,
    stats: session.userId ? accountStats(session.userId) : null,
    ratings: session.userId ? listRatings(session.userId) : {},
    languages: LANGUAGE_VARIANTS,
    invitesRequired: Boolean(env.inviteCode),
    keysEditable: canEditKeys(request),
    songStart: canHearSongStart(session.userId),
    party: party ? { code: party.code, name: party.name, members: party.members, youAreHost: party.youAreHost } : null,
  };
  response.json(payload);
});

/**
 * Guessing is not limited to the pool: the search box asks all of Deezer too.
 * Results are cached per query for an hour, since every player typing shares
 * the server's Deezer allowance.
 */
const searches = new TtlCache<Track[]>(60 * 60 * 1000, 2000);

catalogueRouter.get('/search', async (request, response) => {
  const query = (typeof request.query.q === 'string' ? request.query.q : '').trim().slice(0, 80);
  if (query.length < 2) {
    response.json({ tracks: [] });
    return;
  }
  const tracks = await searches.wrap(query.toLowerCase(), async () => {
    const payload = await fetchJson<{ data?: Parameters<typeof trackFromDeezer>[0][] }>(
      `https://api.deezer.com/search?limit=40&q=${encodeURIComponent(query)}`,
    );
    return (payload.data ?? []).map(trackFromDeezer).filter((track): track is Track => track !== null);
  });
  response.setHeader('cache-control', 'private, max-age=300');
  response.json({ tracks: forClient(tracks) });
});

/** The client plays audio by track id, never by URL, so the preview URL stays on the server. */
function forClient(tracks: Track[]): Omit<Track, 'previewUrl'>[] {
  return tracks.map((track) => {
    const copy: Partial<Track> = { ...track };
    delete copy.previewUrl;
    return copy as Omit<Track, 'previewUrl'>;
  });
}

catalogueRouter.get('/pool', async (request, response) => {
  let source = (typeof request.query.source === 'string' ? request.query.source : 'charts') as ProviderId;
  let requested = typeof request.query.variant === 'string' ? request.query.variant : '';
  // The old Spanish genre is the Spanish language now.
  if (source === 'charts' && requested === '197') {
    source = 'blend';
    requested = 'lang:es';
  }
  const session = request.session;
  let pool: Pool;

  if (source === 'blend') {
    const parts = parseBlend(requested);
    if (!parts.length) throw new UpstreamError('Pick at least one genre, decade or language', 400);
    const genres = parts.filter((part) => part.source === 'charts');
    const decades = parts.filter((part) => part.source === 'decades');
    const languages = parts.filter((part) => part.source === 'lang');
    const genreLabels = await Promise.all(genres.map((part) => chartLabel(part.id)));
    const decadeLabels = decades.map((part) => decadeLabel(part.id));
    const languageLabels = languages.map((part) => languageLabel(part.id));

    // Each kind narrows the others: Korean + Pop + the 10s is K-pop from the
    // 2010s. Several of one kind add up: Rock + Metal is both.
    const one = <T>(list: T[]): (T | undefined)[] => (list.length ? list : [undefined]);
    const jobs: (() => Promise<Track[]>)[] = [];
    for (const language of one(languages)) {
      for (const [index, genre] of one(genres).entries()) {
        for (const decade of one(decades)) {
          jobs.push(() =>
            facetTracks({
              lang: language?.id,
              genre: genre?.id,
              genreLabel: genre ? genreLabels[index] : undefined,
              decade: decade?.id,
            }),
          );
        }
      }
    }
    // A few at a time: a cold cache costs each list several Deezer calls.
    const lists = await mapLimit(jobs, 3, (job) => job().catch(() => [] as Track[]));
    // Round-robin, so a short list is not drowned by a long one.
    let tracks = interleave(lists);
    if (!languages.length) tracks = await englishOnly(tracks);
    pool = { source, variant: blendVariant(parts), label: mixLabel(languageLabels, genreLabels, decadeLabels), tracks, dropped: 0 };
  } else if (source === 'decades') {
    const variant = requested || '1980s';
    const tracks = await englishOnly(await decadeTracks(variant));
    pool = { source, variant, label: decadeLabel(variant), tracks, dropped: 0 };
  } else if (source === 'lastfm') {
    const connection = session.userId ? readConnection<{ user: string }>(session.userId, 'lastfm') : null;
    if (!connection) throw new UpstreamError('Connect Last.fm first', 401);
    const variant = requested || 'top:overall';
    const resolved = await lastfmTracks(connection.user, variant);
    pool = {
      source,
      variant,
      label: `${labelFor(LASTFM_VARIANTS, variant, 'Top tracks')} · ${connection.user}`,
      ...resolved,
    };
  } else if (source === 'party') {
    if (!session.userId) throw new UpstreamError('Make an account to play a party round', 401);
    const party = partyFor(session.userId);
    if (!party) throw new UpstreamError('Start or join a party first', 404);
    const { contributors, ...resolved } = await partyTracks(party);
    pool = {
      source,
      variant: 'all',
      label: `${party.name} · ${contributors.join(', ')}`,
      ...resolved,
    };
  } else if (source === 'spotify') {
    const variant = requested || 'mix';
    const save = (fresh: OAuthTokens) => saveConnection(session.userId as number, 'spotify', fresh, fresh.account);
    const tokens = tokensFor(session, 'spotify');
    const resolved =
      variant === 'mix' ? await spotifyMix(tokens, 200, save) : await spotifyTracks(tokens, variant, 200, save);
    pool = { source, variant, label: labelFor(SPOTIFY_VARIANTS, variant, 'Your mix'), ...resolved };
  } else if (source === 'youtube') {
    const tokens = tokensFor(session, 'youtube');
    const variant = requested || 'liked';
    const resolved = await youtubeTracks(tokens, variant, 200, (fresh) =>
      saveConnection(session.userId as number, 'youtube', fresh, fresh.account),
    );
    const variants = await youtubeVariants(tokens).catch(() => YOUTUBE_BASE_VARIANTS);
    pool = { source, variant, label: labelFor(variants, variant, 'Liked music'), ...resolved };
  } else {
    const variant = requested || '0';
    const tracks = await englishOnly(await chartTracks(variant));
    pool = { source: 'charts', variant, label: await chartLabel(variant), tracks, dropped: 0 };
  }

  // Remixes, acoustic and live takes, instrumentals and the like are never the
  // answer, whatever the source: they are not the record people know.
  const before = pool.tracks.length;
  pool = { ...pool, tracks: pool.tracks.filter((track) => !isAlternateVersion(track)) };
  pool.dropped += before - pool.tracks.length;

  if (pool.tracks.length < 5) {
    throw new UpstreamError(
      `Only ${pool.tracks.length} playable song${pool.tracks.length === 1 ? '' : 's'} came back from that list. Pick another one.`,
      422,
    );
  }
  // Lists change every few hours at most; a reload within ten minutes need not ask again.
  response.setHeader('cache-control', 'private, max-age=600');
  response.json({ ...pool, tracks: forClient(pool.tracks) });
});
