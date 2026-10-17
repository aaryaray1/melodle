import { Router } from 'express';
import { env, isPlausibleKey, redirectUri, saveCredentials } from '../lib/env.ts';
import { canEditKeys, storeKeys } from '../lib/keys.ts';
import { UpstreamError } from '../lib/http.ts';

const FIELDS: Record<string, string[]> = {
  lastfm: ['LASTFM_API_KEY'],
  spotify: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
  youtube: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
};

export const setupRouter = Router();

setupRouter.get('/setup/redirects', (_request, response) => {
  response.json({ spotify: redirectUri('spotify'), youtube: redirectUri('youtube') });
});

setupRouter.post('/setup/:provider', (request, response) => {
  if (!canEditKeys(request)) {
    throw new UpstreamError('Only the admin of this server can change its keys', 403);
  }
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

  // A development server keeps its keys in .env as it always has; a deployed one
  // keeps them in the database, because its .env is replaced on every deploy.
  if (env.isProduction) storeKeys(updates);
  else saveCredentials(updates);
  response.json({ saved: true });
});
