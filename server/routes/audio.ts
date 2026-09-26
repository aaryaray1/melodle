import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import type { Response } from 'express';
import { env } from '../lib/env.ts';
import { UpstreamError } from '../lib/http.ts';
import { freshPreviewUrl } from '../lib/preview.ts';

/**
 * The only route that fetches a URL the client names, so the host list is a
 * hard allowlist: anything else would make this an open proxy.
 */
const ALLOWED_HOSTS = [
  'dzcdn.net',
  'deezer.com',
  'mzstatic.com',
  'itunes.apple.com',
  'audio-ssl.itunes.apple.com',
];

const FORWARD_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
const MAX_REDIRECTS = 3;

export function isAllowedPreviewUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function isAbort(problem: unknown): boolean {
  return problem instanceof Error && (problem.name === 'AbortError' || problem.name === 'TimeoutError');
}

function sendHeaders(response: Response, upstream: globalThis.Response): void {
  response.status(upstream.status);
  for (const header of FORWARD_HEADERS) {
    const value = upstream.headers.get(header);
    if (value) response.setHeader(header, value);
  }
  response.setHeader('cache-control', 'public, max-age=86400');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
}

export const audioRouter = Router();

audioRouter.get('/audio', async (request, response) => {
  const trackId = typeof request.query.track === 'string' ? request.query.track : '';
  if (!/^(deezer|itunes):\d+$/.test(trackId)) {
    throw new UpstreamError('That is not a track Melodle can play', 400);
  }

  const url = await freshPreviewUrl(trackId);
  if (!url) throw new UpstreamError('This song has no preview any more', 404);
  // The resolver only ever returns preview CDNs, but the guard stays as the
  // last word on what this route is allowed to fetch.
  if (!isAllowedPreviewUrl(url)) {
    throw new UpstreamError('That audio host is not one Melodle streams from', 502);
  }

  // Skipping to the next song aborts this request; stop pulling bytes when it does.
  const controller = new AbortController();
  const giveUp = () => controller.abort();
  response.on('close', giveUp);
  // This covers getting the headers only; it is cleared before the body streams.
  const headerTimer = setTimeout(giveUp, env.audioHeaderTimeoutMs);

  try {
    const range = request.headers.range;
    const hop = (target: string) =>
      fetch(target, {
        headers: range ? { range } : {},
        redirect: 'manual',
        signal: controller.signal,
      });

    let target = url;
    let upstream = await hop(target);

    for (let redirect = 0; redirect < MAX_REDIRECTS && upstream.status >= 300 && upstream.status < 400; redirect += 1) {
      const location = upstream.headers.get('location');
      const next = location ? new URL(location, target).toString() : '';
      if (!isAllowedPreviewUrl(next)) {
        throw new UpstreamError('That preview redirected somewhere Melodle does not follow', 502);
      }
      await upstream.body?.cancel().catch(() => undefined);
      target = next;
      upstream = await hop(target);
    }

    clearTimeout(headerTimer);

    if (!upstream.ok || !upstream.body) {
      throw new UpstreamError('The preview could not be loaded', upstream.status === 404 ? 404 : 502);
    }

    sendHeaders(response, upstream);
    // pipeline rejects instead of raising an unhandled 'error' on the stream,
    // which is what used to take the whole server down on a skipped song.
    await pipeline(Readable.fromWeb(upstream.body as never), response);
  } catch (problem) {
    if (isAbort(problem) || response.writableEnded || response.headersSent) {
      response.destroy();
      return;
    }
    throw problem;
  } finally {
    clearTimeout(headerTimer);
    response.off('close', giveUp);
  }
});
