import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { after, before, test } from 'node:test';
import express from 'express';
import { staticSite } from '../server/lib/static.ts';

const SCRIPT = 'console.log("melodle");'.repeat(200);

let dist = '';
let base = '';
let server: Server;

before(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'melodle-dist-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Melodle</title>');
  writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), SCRIPT);
  writeFileSync(path.join(dist, 'assets', 'index-abc123.js.br'), brotliCompressSync(SCRIPT));
  writeFileSync(path.join(dist, 'assets', 'index-abc123.js.gz'), gzipSync(SCRIPT));
  writeFileSync(path.join(dist, 'assets', 'plain-def456.css'), 'body{color:red}');

  const app = express();
  app.use(staticSite(dist));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  rmSync(dist, { recursive: true, force: true });
});

// fetch() decodes bodies transparently, so the encoding is asserted on the header
// and the decoded body proves the right bytes were sent under it.
test('a hashed script is served precompressed as brotli when the browser accepts it', async () => {
  const response = await fetch(`${base}/assets/index-abc123.js`, {
    headers: { 'accept-encoding': 'gzip, br' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), 'br');
  assert.match(response.headers.get('content-type') ?? '', /javascript/);
  assert.match(response.headers.get('vary') ?? '', /accept-encoding/i);
  assert.equal(await response.text(), SCRIPT);
});

test('gzip is the fallback when brotli is not accepted', async () => {
  const response = await fetch(`${base}/assets/index-abc123.js`, {
    headers: { 'accept-encoding': 'gzip' },
  });
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.equal(await response.text(), SCRIPT);
});

test('hashed assets are cached for a year; the page itself is not', async () => {
  const asset = await fetch(`${base}/assets/plain-def456.css`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-encoding'), null);
  assert.match(asset.headers.get('cache-control') ?? '', /immutable/);

  const page = await fetch(`${base}/some/client/route`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Melodle/);
  assert.match(page.headers.get('cache-control') ?? '', /no-cache/);
});

test('a missing asset is a 404, not the page', async () => {
  const response = await fetch(`${base}/assets/gone-000000.js`);
  assert.equal(response.status, 404);
});
