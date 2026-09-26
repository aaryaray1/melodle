import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import { env } from './env.ts';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  account?: string;
}

export interface PendingAuth {
  provider: 'spotify' | 'youtube';
  state: string;
  verifier: string;
  createdAt: number;
}

export interface Session {
  id: string;
  userId: number | null;
  pending: PendingAuth | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    session: Session;
  }
}

const COOKIE = 'melodle.sid';
const MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

const insertSession = db.prepare(
  'INSERT INTO sessions (id, user_id, pending, created_at, seen_at) VALUES (?, ?, NULL, ?, ?)',
);
const selectSession = db.prepare('SELECT id, user_id, pending FROM sessions WHERE id = ?');
const touchSession = db.prepare('UPDATE sessions SET seen_at = ? WHERE id = ?');
const setSessionUser = db.prepare('UPDATE sessions SET user_id = ? WHERE id = ?');
const setSessionPending = db.prepare('UPDATE sessions SET pending = ? WHERE id = ?');
const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?');
const expireSessions = db.prepare('DELETE FROM sessions WHERE seen_at < ?');

interface SessionRow {
  id: string;
  user_id: number | null;
  pending: string | null;
}

function sign(id: string): string {
  return createHmac('sha256', env.sessionSecret).update(id).digest('base64url');
}

function verify(value: string): string | null {
  const split = value.lastIndexOf('.');
  if (split <= 0) return null;
  const id = value.slice(0, split);
  const provided = Buffer.from(value.slice(split + 1));
  const expected = Buffer.from(sign(id));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return id;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function writeCookie(response: Response, id: string): void {
  response.cookie(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction && env.publicOrigin.startsWith('https://'),
    maxAge: MAX_IDLE_MS,
    path: '/',
  });
}

function create(response: Response, userId: number | null): Session {
  const id = randomBytes(24).toString('base64url');
  const now = Date.now();
  insertSession.run(id, userId, now, now);
  writeCookie(response, id);
  return { id, userId, pending: null };
}

export function sessionMiddleware(request: Request, response: Response, next: NextFunction): void {
  const raw = readCookie(request.headers.cookie, COOKIE);
  const id = raw ? verify(raw) : null;
  const row = id ? (selectSession.get(id) as SessionRow | undefined) : undefined;

  if (!row) {
    request.session = create(response, null);
    next();
    return;
  }

  touchSession.run(Date.now(), row.id);
  request.session = {
    id: row.id,
    userId: row.user_id,
    pending: row.pending ? (JSON.parse(row.pending) as PendingAuth) : null,
  };
  next();
}

/** A fresh id on sign-in, so a session handed over beforehand cannot ride along. */
export function signIn(request: Request, response: Response, userId: number): void {
  deleteSession.run(request.session.id);
  request.session = create(response, userId);
}

export function signOut(request: Request, response: Response): void {
  deleteSession.run(request.session.id);
  request.session = create(response, null);
}

export function rememberPending(session: Session, pending: PendingAuth | null): void {
  session.pending = pending;
  setSessionPending.run(pending ? JSON.stringify(pending) : null, session.id);
}

export function attachUser(session: Session, userId: number): void {
  session.userId = userId;
  setSessionUser.run(userId, session.id);
}

setInterval(() => expireSessions.run(Date.now() - MAX_IDLE_MS), 60 * 60 * 1000).unref();
