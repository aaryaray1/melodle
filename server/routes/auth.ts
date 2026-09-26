import { Router } from 'express';
import { removeConnection, saveConnection } from '../lib/accounts.ts';
import { env } from '../lib/env.ts';
import { UpstreamError } from '../lib/http.ts';
import { challengeFor, createState, createVerifier } from '../lib/oauth.ts';
import { rememberPending } from '../lib/session.ts';
import { exchangeSpotifyCode, spotifyAuthUrl, spotifyConfigured } from '../providers/spotify.ts';
import { exchangeYoutubeCode, youtubeAuthUrl, youtubeConfigured } from '../providers/youtube.ts';
import { verifyUser } from '../providers/lastfm.ts';

const PENDING_TTL_MS = 10 * 60 * 1000;

export const authRouter = Router();

function appUrl(params: Record<string, string>): string {
  const base = env.publicOrigin.replace(/\/$/, '');
  return `${base}/?${new URLSearchParams(params)}`;
}

for (const provider of ['spotify', 'youtube'] as const) {
  authRouter.get(`/auth/${provider}/start`, (request, response) => {
    if (!request.session.userId) {
      response.redirect(appUrl({ connect: provider, error: 'no_account' }));
      return;
    }
    const configured = provider === 'spotify' ? spotifyConfigured() : youtubeConfigured();
    if (!configured) {
      response.redirect(appUrl({ connect: provider, error: 'not_configured' }));
      return;
    }

    const state = createState();
    const verifier = createVerifier();
    rememberPending(request.session, { provider, state, verifier, createdAt: Date.now() });
    const url =
      provider === 'spotify'
        ? spotifyAuthUrl(state, challengeFor(verifier))
        : youtubeAuthUrl(state, challengeFor(verifier));
    response.redirect(url);
  });

  authRouter.get(`/auth/${provider}/callback`, async (request, response) => {
    const { pending, userId } = request.session;
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    rememberPending(request.session, null);

    if (request.query.error) {
      response.redirect(appUrl({ connect: provider, error: 'denied' }));
      return;
    }
    if (!userId) {
      response.redirect(appUrl({ connect: provider, error: 'no_account' }));
      return;
    }
    if (!pending || pending.provider !== provider || !state || pending.state !== state) {
      response.redirect(appUrl({ connect: provider, error: 'state_mismatch' }));
      return;
    }
    if (Date.now() - pending.createdAt > PENDING_TTL_MS || !code) {
      response.redirect(appUrl({ connect: provider, error: 'expired' }));
      return;
    }

    try {
      const tokens =
        provider === 'spotify'
          ? await exchangeSpotifyCode(code, pending.verifier)
          : await exchangeYoutubeCode(code, pending.verifier);
      saveConnection(userId, provider, tokens, tokens.account);
      response.redirect(appUrl({ connect: provider, status: 'connected' }));
    } catch {
      response.redirect(appUrl({ connect: provider, error: 'exchange_failed' }));
    }
  });
}

authRouter.post('/auth/lastfm', async (request, response) => {
  const userId = request.session.userId;
  if (!userId) throw new UpstreamError('Make an account first, then link Last.fm to it', 401);
  const user = typeof request.body?.user === 'string' ? request.body.user.trim() : '';
  if (!user) throw new UpstreamError('Type your Last.fm username first', 400);
  if (!env.lastfmKey) throw new UpstreamError('Last.fm is not set up on this server yet', 503);

  const name = await verifyUser(user);
  saveConnection(userId, 'lastfm', { user: name }, name);
  response.json({ connected: true, account: name });
});

authRouter.post('/auth/:provider/disconnect', (request, response) => {
  const userId = request.session.userId;
  if (!userId) throw new UpstreamError('Sign in first', 401);
  const provider = request.params.provider;
  if (provider === 'spotify' || provider === 'youtube' || provider === 'lastfm') {
    removeConnection(userId, provider);
    response.json({ connected: false });
    return;
  }
  throw new UpstreamError('Unknown provider', 400);
});
