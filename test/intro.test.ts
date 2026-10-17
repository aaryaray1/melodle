import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'melodle-intro-'));
process.env.DATA_FILE = path.join(dir, 'intro.db');
process.env.INVITE_CODE = '';
process.env.SONG_START_USERS = 'Listed, other';
const { app } = await import('../server/app.ts');

let base = '';
let server: Server;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('song starts are for signed-in players only; guests are refused before anything runs', async () => {
  const response = await fetch(`${base}/api/intro?track=deezer:3135556`);
  assert.equal(response.status, 401);
});

test('only Deezer track ids are accepted', async () => {
  const register = await fetch(`${base}/api/account/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'other', password: 'a-long-password' }),
  });
  const cookie = (register.headers.getSetCookie().at(-1) ?? '').split(';')[0] as string;
  for (const bad of ['itunes:1', 'deezer:abc', 'deezer:1;rm -rf /', '']) {
    const response = await fetch(`${base}/api/intro?track=${encodeURIComponent(bad)}`, { headers: { cookie } });
    assert.equal(response.status, 400, `${bad} is refused`);
  }
});

async function account(username: string): Promise<string> {
  const response = await fetch(`${base}/api/account/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'a-long-password' }),
  });
  return (response.headers.getSetCookie().at(-1) ?? '').split(';')[0] as string;
}

const me = async (cookie: string) =>
  ((await (await fetch(`${base}/api/me`, { headers: { cookie } })).json()) as { songStart: boolean }).songStart;

test('only the listed accounts get song starts, matched without regard to case', async () => {
  const listed = await account('listed');
  const unlisted = await account('notlisted');
  assert.equal(await me(listed), true);
  assert.equal(await me(unlisted), false, 'the page is told, so it shows Clip start');

  const refused = await fetch(`${base}/api/intro?track=deezer:3135556`, { headers: { cookie: unlisted } });
  assert.equal(refused.status, 403);
  // A listed account gets past the gate (a bad id then stops it before anything runs).
  const gated = await fetch(`${base}/api/intro?track=itunes:1`, { headers: { cookie: listed } });
  assert.equal(gated.status, 400);
});
