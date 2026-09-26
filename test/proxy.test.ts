import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';

// Short enough that the old whole-body timeout fires while the mp3 is streaming.
process.env.AUDIO_HEADER_TIMEOUT_MS = '400';
const { app } = await import('../server/app.ts');

let base = '';
let server: Server;
let trackId = '';

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const chart = await fetch('https://api.deezer.com/chart/0/tracks?limit=1', {
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await chart.json()) as { data?: { id?: number }[] };
    trackId = payload.data?.[0]?.id ? `deezer:${payload.data[0].id}` : '';
  } catch {
    trackId = '';
  }
});

after(() => server.close());

test('the Android launcher can identify a Melodle server across origins', async () => {
  const response = await fetch(`${base}/api/ping`);
  const body = (await response.json()) as { app?: string };
  assert.equal(response.status, 200);
  assert.equal(body.app, 'melodle');
  // Without this header the launcher's check fails and the app can never connect.
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('ping is the only route that answers across origins', async () => {
  for (const path of ['/api/me', '/api/pool?source=charts', '/api/setup/redirects']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null,
      `${path} must not be open to other origins`,
    );
  }
});

test('the proxy only accepts track ids it knows how to resolve', async () => {
  for (const bad of ['https://example.com/x.mp3', 'spotify:123', 'deezer:abc', '../../etc/passwd', '']) {
    const response = await fetch(`${base}/api/audio?track=${encodeURIComponent(bad)}`);
    assert.equal(response.status, 400, `${bad} should be refused`);
  }
});

test('a track id that no longer has a preview says so instead of hanging', async (t) => {
  if (!trackId) return t.skip('needs Deezer to be reachable');
  const response = await fetch(`${base}/api/audio?track=deezer:1`);
  assert.ok([404, 502].includes(response.status), `expected a clean refusal, got ${response.status}`);
});

test('a preview the player skips away from does not take the server down', async (t) => {
  if (!trackId) return t.skip('needs Deezer to be reachable');

  // What "next song" does: start the download, read a little, then walk away.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    try {
      const response = await fetch(`${base}/api/audio?track=${encodeURIComponent(trackId)}`, {
        signal: controller.signal,
      });
      await response.body?.getReader().read();
      controller.abort();
    } catch {
      // Aborting is the point of the test.
    }
  }

  // Long enough for the old header timeout to fire against an abandoned stream.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const alive = await fetch(`${base}/api/me`);
  assert.equal(alive.status, 200, 'the API should still be serving after an aborted download');
});

test('a whole preview still streams through intact', async (t) => {
  if (!trackId) return t.skip('needs Deezer to be reachable');
  const response = await fetch(`${base}/api/audio?track=${encodeURIComponent(trackId)}`);
  const body = await response.arrayBuffer();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.ok(body.byteLength > 100_000, `expected a real mp3, got ${body.byteLength} bytes`);
});
