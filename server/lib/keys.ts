import type { Request } from 'express';
import { getAccount } from './accounts.ts';
import { db } from './db.ts';
import { applyCredentials, env } from './env.ts';
import { seal, unseal } from './secrets.ts';

/**
 * The server's own API keys (Last.fm, Spotify, Google). On a deployed server the
 * .env file inside the container is rebuilt from the host's on every deploy, so
 * keys set from the page live here instead: in the database, on the volume,
 * sealed like provider tokens. At startup they override whatever .env says.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS server_keys (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const upsertKey = db.prepare(`
  INSERT INTO server_keys (name, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT (name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);
const selectKeys = db.prepare('SELECT name, value FROM server_keys');
const selectFirstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1');

export function loadStoredKeys(): void {
  const stored: Record<string, string> = {};
  for (const row of selectKeys.all() as { name: string; value: string }[]) {
    // A changed SESSION_SECRET makes these unreadable; .env then stands.
    const value = unseal<string>(row.value);
    if (value) stored[row.name] = value;
  }
  applyCredentials(stored);
}

export function storeKeys(updates: Record<string, string>): void {
  const now = Date.now();
  for (const [name, value] of Object.entries(updates)) upsertKey.run(name, seal(value), now);
  applyCredentials(updates);
}

/** ADMIN_USERS when it is set; otherwise whoever made the first account on this server. */
export function isAdmin(userId: number | null): boolean {
  if (!userId) return false;
  if (env.adminUsers.length) {
    const account = getAccount(userId);
    return Boolean(account && env.adminUsers.includes(account.username.toLowerCase()));
  }
  const first = selectFirstUser.get() as { id: number } | undefined;
  return first?.id === userId;
}

function fromLoopback(request: Request): boolean {
  const address = (request.socket.remoteAddress ?? '').replace('::ffff:', '');
  return address === '127.0.0.1' || address === '::1';
}

/**
 * Who may type keys into the page: anyone at the keyboard of a development
 * server, and the admin of any server. On a deployed server every visitor
 * arrives through the proxy, so loopback proves nothing there.
 */
export function canEditKeys(request: Request): boolean {
  if (!env.isProduction && fromLoopback(request)) return true;
  return isAdmin(request.session?.userId ?? null);
}
