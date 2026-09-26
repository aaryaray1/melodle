import { Router } from 'express';
import type { Request } from 'express';
import { env, isPlausibleKey, redirectUri, saveCredentials } from '../lib/env.ts';
import { UpstreamError } from '../lib/http.ts';

const FIELDS: Record<string, string[]> = {
  lastfm: ['LASTFM_API_KEY'],
  spotify: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
  youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
};

/**
 * Typing keys into the page writes them to .env, which is only ever appropriate
 * for the person running the server on their own machine.
 */
function assertLocalOperator(request: Request): void {
  if (env.isProduction) {
    throw new UpstreamError('Editing keys from the page is disabled on a deployed server', 403);
  }
  const address = (request.socket.remoteAddress ?? '').replace('::ffff:', '');
  if (address !== '127.0.0.1' && address !== '::1') {
    throw new UpstreamError('Keys can only be changed from the machine running Melodle', 403);
  }
}

export const setupRouter = Router();

setupRouter.get('/setup/redirects', (_request, response) => {
  response.json({ spotify: redirectUri('spotify'), youtube: redirectUri('youtube') });
});

setupRouter.post('/setup/:provider', (request, response) => {
  assertLocalOperator(request);
  const fields = FIELDS[request.params.provider ?? ''];
  if (!fields) throw new UpstreamError('Unknown provider', 400);

  const updates: Record<string, string> = {};
  for (const field of fields) {
    const value = String(request.body?.[field] ?? '').trim();
    if (!isPlausibleKey(value)) {
      throw new UpstreamError(`${field} does not look like a key. Copy it again from the dashboard.`, 400);
    }
    updates[field] = value;
  }

  saveCredentials(updates);
  response.json({ saved: true });
});
