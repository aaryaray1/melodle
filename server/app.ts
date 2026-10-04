import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { env } from './lib/env.ts';
import { UpstreamError } from './lib/http.ts';
import { sessionMiddleware } from './lib/session.ts';
import { staticSite } from './lib/static.ts';
import { audioRouter } from './routes/audio.ts';
import { authRouter } from './routes/auth.ts';
import { accountRouter } from './routes/account.ts';
import { catalogueRouter } from './routes/catalogue.ts';
import { partyRouter } from './routes/party.ts';
import { setupRouter } from './routes/setup.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// Images come from five different artwork CDNs; fonts come from Google.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "media-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export const app = express();

app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-frame-options', 'DENY');
  if (env.isProduction) response.setHeader('content-security-policy', CSP);
  next();
});
/**
 * The Android launcher has to confirm an address belongs to a Melodle server
 * before it hands the WebView over, and that check is cross-origin. This is the
 * only route that answers one: no session, no credentials, nothing private.
 */
app.get('/api/ping', (_request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('cache-control', 'no-store');
  response.json({ app: 'melodle', api: 1 });
});

app.use(express.json({ limit: '16kb' }));
app.use('/api', sessionMiddleware);
app.use('/api', catalogueRouter, accountRouter, authRouter, partyRouter, setupRouter, audioRouter);

app.use('/api', (_request: Request, response: Response) => {
  response.status(404).json({ error: 'No such endpoint' });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const status = error instanceof UpstreamError ? error.status : 500;
  const message =
    error instanceof UpstreamError
      ? error.message
      : 'Melodle could not reach the music services. Try again in a moment.';
  const detail = error instanceof UpstreamError ? error.detail : error;
  if (detail) console.error('[melodle]', detail);
  response.status(status).json({ error: message });
});

if (env.isProduction) {
  app.use(staticSite(path.join(here, '..', 'dist')));
}
