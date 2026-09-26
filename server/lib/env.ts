import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ENV_FILE = '.env';
const EOL = String.fromCharCode(10);

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // No .env file: Melodle still runs on charts alone.
}

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

const port = Number(read('PORT') || 8787);
const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  port,
  isProduction,
  /** Loopback by default; set HOST=0.0.0.0 to let phones on the Wi-Fi reach it. */
  host: read('HOST') || (isProduction ? '0.0.0.0' : '127.0.0.1'),
  publicOrigin: read('PUBLIC_ORIGIN') || (isProduction ? `http://localhost:${port}` : 'http://localhost:5173'),
  sessionSecret: read('SESSION_SECRET') || randomBytes(32).toString('hex'),
  dataFile: read('DATA_FILE') || 'melodle.db',
  /** How long the preview host gets to answer. Tests shorten it. */
  audioHeaderTimeoutMs: Number(read('AUDIO_HEADER_TIMEOUT_MS') || 20_000),
  /** When set, a new account needs this code. Use it if the server is public. */
  inviteCode: read('INVITE_CODE'),
  lastfmKey: read('LASTFM_API_KEY'),
  spotify: { id: read('SPOTIFY_CLIENT_ID'), secret: read('SPOTIFY_CLIENT_SECRET') },
  google: { id: read('GOOGLE_CLIENT_ID'), secret: read('GOOGLE_CLIENT_SECRET') },
};

export const hasEphemeralSecret = !read('SESSION_SECRET');

export function redirectUri(provider: 'spotify' | 'youtube'): string {
  return `${env.publicOrigin.replace(/\/$/, '')}/api/auth/${provider}/callback`;
}

/** Keys are opaque strings from a dashboard; anything exotic is a mistake or an attack. */
export function isPlausibleKey(value: string): boolean {
  return /^[A-Za-z0-9._~-]{8,200}$/.test(value);
}

function persist(updates: Record<string, string>): void {
  let contents = '';
  try {
    contents = readFileSync(ENV_FILE, 'utf8');
  } catch {
    contents = '';
  }
  const lines = contents.split(EOL).filter((line, index, all) => line.trim() || index < all.length - 1);
  for (const [name, value] of Object.entries(updates)) {
    const index = lines.findIndex((line) => line.startsWith(`${name}=`));
    if (index >= 0) lines[index] = `${name}=${value}`;
    else lines.push(`${name}=${value}`);
  }
  writeFileSync(ENV_FILE, `${lines.join(EOL).trimStart()}${EOL}`, { mode: 0o600 });
}

/** Saves credentials typed into the setup panel, for both this process and the next. */
export function saveCredentials(updates: Record<string, string>): void {
  persist(updates);
  for (const [name, value] of Object.entries(updates)) {
    process.env[name] = value;
  }
  env.lastfmKey = read('LASTFM_API_KEY');
  env.spotify = { id: read('SPOTIFY_CLIENT_ID'), secret: read('SPOTIFY_CLIENT_SECRET') };
  env.google = { id: read('GOOGLE_CLIENT_ID'), secret: read('GOOGLE_CLIENT_SECRET') };
}
