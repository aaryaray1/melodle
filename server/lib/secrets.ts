import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { env } from './env.ts';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(SALT_LENGTH).toString('base64');
  return { hash: derive(password, salt), salt };
}

export function verifyPassword(password: string, salt: string, expected: string): boolean {
  const candidate = Buffer.from(derive(password, salt), 'base64');
  const known = Buffer.from(expected, 'base64');
  if (candidate.length !== known.length) return false;
  return timingSafeEqual(candidate, known);
}

function derive(password: string, salt: string): string {
  return scryptSync(password.normalize('NFKC'), Buffer.from(salt, 'base64'), KEY_LENGTH).toString('base64');
}

// Provider tokens sit in a file on disk, so they are sealed with a key derived
// from SESSION_SECRET. Change that secret and connections simply need redoing.
const tokenKey = scryptSync(env.sessionSecret, 'melodle.tokens.v1', 32);

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function unseal<T>(sealed: string): T | null {
  try {
    const [iv, tag, body] = sealed.split('.');
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv('aes-256-gcm', tokenKey, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as T;
  } catch {
    return null;
  }
}
