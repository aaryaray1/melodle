import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

// A deployed server on a fresh database. Values set here win over the real .env,
// which process.loadEnvFile never overrides.
const dir = mkdtempSync(path.join(tmpdir(), 'melodle-keys-'));
process.env.NODE_ENV = 'production';
process.env.DATA_FILE = path.join(dir, 'keys.db');
process.env.INVITE_CODE = '';
process.env.ADMIN_USERS = '';
process.env.LASTFM_API_KEY = '';
process.env.SESSION_SECRET = 'test-secret-for-sealing-keys';

const { app } = await import('../server/app.ts');
const { env } = await import('../server/lib/env.ts');
const { db } = await import('../server/lib/db.ts');
const { loadStoredKeys } = await import('../server/lib/keys.ts');

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

async function register(username: string): Promise<string> {
  const response = await fetch(`${base}/api/account/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'a-long-password' }),
  });
  assert.equal(response.status, 200, `register ${username}`);
  // Signing in replaces the anonymous session cookie, so the last one is the account's.
  return (response.headers.getSetCookie().at(-1) ?? '').split(';')[0] as string;
}

const me = async (cookie?: string) =>
  (await (await fetch(`${base}/api/me`, { headers: cookie ? { cookie } : {} })).json()) as {
    keysEditable: boolean;
    connections: { lastfm: { configured: boolean } };
  };

const saveLastfm = (cookie?: string) =>
  fetch(`${base}/api/setup/lastfm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ LASTFM_API_KEY: 'abcdef0123456789abcdef0123456789' }),
  });

let owner = '';
let friend = '';

test('on a deployed server the first account may set keys and nobody else may', async () => {
  owner = await register('owner');
  friend = await register('friend');

  assert.equal((await me()).keysEditable, false, 'signed out');
  assert.equal((await me(friend)).keysEditable, false, 'a later account');
  assert.equal((await me(owner)).keysEditable, true, 'the first account');

  assert.equal((await saveLastfm()).status, 403, 'a stranger cannot set keys');
  assert.equal((await saveLastfm(friend)).status, 403, 'a friend cannot set keys');
});

test('a key set from the page switches the service on for everyone', async () => {
  assert.equal((await me(friend)).connections.lastfm.configured, false);
  assert.equal((await saveLastfm(owner)).status, 200);
  assert.equal((await me(friend)).connections.lastfm.configured, true, 'friends can now link Last.fm');
});

test('the key is stored sealed, and comes back after a restart', () => {
  const row = db.prepare('SELECT value FROM server_keys WHERE name = ?').get('LASTFM_API_KEY') as { value: string };
  assert.ok(row, 'stored in the database, which survives redeploys');
  assert.ok(!row.value.includes('abcdef0123456789'), 'not stored in plain text');

  env.lastfmKey = '';
  delete process.env.LASTFM_API_KEY;
  loadStoredKeys();
  assert.equal(env.lastfmKey, 'abcdef0123456789abcdef0123456789');
});

test('ADMIN_USERS, when set, names the admins instead of the first account', async () => {
  env.adminUsers = ['friend'];
  try {
    assert.equal((await me(friend)).keysEditable, true, 'named admin');
    assert.equal((await me(owner)).keysEditable, false, 'the first account no longer is');
  } finally {
    env.adminUsers = [];
  }
});
