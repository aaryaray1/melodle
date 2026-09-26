import { Router } from 'express';
import type { Connections, Me, Pool, ProviderId, VariantOption } from '../../shared/types.ts';
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
import { partyFor } from '../lib/parties.ts';
import { partyTracks } from '../providers/party.ts';
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
    charts: await chartVariants().catch(() => [{ id: '0', label: 'Global top 100' }]),
    decades: DECADE_VARIANTS,
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
    invitesRequired: Boolean(env.inviteCode),
    party: party ? { code: party.code, name: party.name, members: party.members, youAreHost: party.youAreHost } : null,
  };
  response.json(payload);
});

catalogueRouter.get('/pool', async (request, response) => {
  const source = (typeof request.query.source === 'string' ? request.query.source : 'charts') as ProviderId;
  const requested = typeof request.query.variant === 'string' ? request.query.variant : '';
  const session = request.session;
  let pool: Pool;

  if (source === 'decades') {
    const variant = requested || '1980s';
    const tracks = await decadeTracks(variant);
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
      variant === 'mix' ? await spotifyMix(tokens, 120, save) : await spotifyTracks(tokens, variant, 120, save);
    pool = { source, variant, label: labelFor(SPOTIFY_VARIANTS, variant, 'Your mix'), ...resolved };
  } else if (source === 'youtube') {
    const tokens = tokensFor(session, 'youtube');
    const variant = requested || 'liked';
    const resolved = await youtubeTracks(tokens, variant, 120, (fresh) =>
      saveConnection(session.userId as number, 'youtube', fresh, fresh.account),
    );
    const variants = await youtubeVariants(tokens).catch(() => YOUTUBE_BASE_VARIANTS);
    pool = { source, variant, label: labelFor(variants, variant, 'Liked music'), ...resolved };
  } else {
    const variant = requested || '0';
    const tracks = await chartTracks(variant);
    pool = { source: 'charts', variant, label: await chartLabel(variant), tracks, dropped: 0 };
  }

  if (pool.tracks.length < 5) {
    throw new UpstreamError(
      `Only ${pool.tracks.length} playable song${pool.tracks.length === 1 ? '' : 's'} came back from that list. Pick another one.`,
      422,
    );
  }
  response.json(pool);
});
