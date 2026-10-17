import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import type { Response } from 'express';
import { env } from '../lib/env.ts';
import { DiskCache } from '../lib/diskcache.ts';
import { fetchJson, UpstreamError } from '../lib/http.ts';
import { canHearSongStart, introFile, IntroUnavailable } from '../lib/intro.ts';
import { freshPreviewUrl } from '../lib/preview.ts';
import type { SongFacts } from '../lib/youtube-match.ts';

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

const trackFacts = new DiskCache<SongFacts | null>('track-facts', 30 * 24 * 60 * 60 * 1000, (facts) => facts !== null);

async function factsFor(deezerId: string): Promise<SongFacts | null> {
  return trackFacts.wrap(deezerId, async () => {
    const info = await fetchJson<{ title_short?: string; title?: string; duration?: number; artist?: { name?: string } }>(
      `https://api.deezer.com/track/${deezerId}`,
    ).catch(() => null);
    const title = info?.title_short || info?.title;
    const artist = info?.artist?.name;
    return title && artist ? { title, artist, duration: info?.duration } : null;
  });
}

/**
 * A song's real opening, cut from its YouTube album upload. Only for the
 * accounts in SONG_START_USERS (any signed-in account if it is empty); everyone
 * else keeps the Deezer previews. The client falls back to the preview
 * whenever this answers anything but audio.
 */
audioRouter.get('/intro', async (request, response) => {
  if (!request.session.userId) throw new UpstreamError('Sign in to hear songs from the very start', 401);
  if (!canHearSongStart(request.session.userId)) {
    throw new UpstreamError('Song starts are switched on for a few accounts only', 403);
  }
  const track = typeof request.query.track === 'string' ? request.query.track : '';
  const match = /^deezer:(\d{1,15})$/.exec(track);
  if (!match) throw new UpstreamError('Song starts are only found for Deezer tracks', 400);
  const deezerId = match[1] as string;

  const facts = await factsFor(deezerId);
  if (!facts) throw new UpstreamError('Deezer does not know that track', 404);
  let file: string | null;
  try {
    file = await introFile(deezerId, facts);
  } catch (problem) {
    if (problem instanceof IntroUnavailable) throw new UpstreamError('Song starts are not available right now', 503);
    throw problem;
  }
  if (!file) throw new UpstreamError('No clean copy of this song start was found', 404);
  response.setHeader('content-type', 'audio/mpeg');
  response.setHeader('cache-control', 'private, max-age=86400');
  response.sendFile(file);
});
