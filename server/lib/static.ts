import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';

/** Vite names every file under assets/ by its content hash, so it never changes. */
const HASHED = /^\/assets\/[\w.-]+$/;
const ENCODINGS = [
  ['br', '.br'],
  ['gzip', '.gz'],
] as const;

/**
 * Serves the built client. `npm run build` writes .br and .gz beside each asset,
 * so the server sends those as they are instead of compressing on every request:
 * over a home upload the uncompressed script alone is three times the size.
 */
export function staticSite(dist: string): Router {
  const router = Router();

  router.use((request, response, next) => {
    if ((request.method !== 'GET' && request.method !== 'HEAD') || !HASHED.test(request.path)) {
      return next();
    }
    response.setHeader('vary', 'accept-encoding');
    for (const [encoding, suffix] of ENCODINGS) {
      if (!request.acceptsEncodings(encoding)) continue;
      if (!existsSync(path.join(dist, request.path + suffix))) continue;
      // Set before the rewrite, or the type would come from the .br extension.
      response.type(path.extname(request.path));
      response.setHeader('content-encoding', encoding);
      request.url = request.path + suffix;
      break;
    }
    next();
  });

  router.use('/assets', express.static(path.join(dist, 'assets'), { index: false, immutable: true, maxAge: '365d' }));
  // A stale page asking for an old script must get a 404, not HTML parsed as JavaScript.
  router.use('/assets', (_request, response) => {
    response.status(404).end();
  });
  router.use(express.static(dist, { index: false, maxAge: '1h' }));
  router.get(/.*/, (_request, response) => {
    // The page names the current hashed assets, so it must be revalidated after a deploy.
    response.setHeader('cache-control', 'no-cache');
    response.sendFile(path.join(dist, 'index.html'));
  });

  return router;
}
