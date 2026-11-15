import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { NextFunction, Request, Response } from 'express';

/**
 * A song list is a few hundred kilobytes of JSON and shrinks sevenfold as
 * brotli, which on a phone over a home upload is the difference between a
 * second and several. Only JSON answers above a kilobyte are touched; audio
 * streams and small replies pass through. Brotli at quality 4 is a few
 * milliseconds for the biggest list.
 */
const MIN_BYTES = 1024;

export function compressJson(request: Request, response: Response, next: NextFunction): void {
  const accepts = String(request.headers['accept-encoding'] ?? '');
  const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
  if (!encoding) return next();

  const plainJson = response.json.bind(response);
  response.json = (body: unknown) => {
    const text = JSON.stringify(body);
    if (text.length < MIN_BYTES || response.getHeader('content-encoding')) return plainJson(body);
    const bytes = Buffer.from(text, 'utf8');
    const packed =
      encoding === 'br'
        ? brotliCompressSync(bytes, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 4, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length },
          })
        : gzipSync(bytes, { level: 6 });
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('content-encoding', encoding);
    response.setHeader('vary', 'accept-encoding');
    response.setHeader('content-length', packed.length);
    return response.send(packed);
  };
  next();
}
