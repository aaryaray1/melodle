import { Router } from 'express';
import type { Request } from 'express';
import { MAX_STAGE } from '../../shared/types.ts';
import {
  accountStats,
  authenticate,
  createAccount,
  getAccount,
  rateTrack,
  recordRound,
  UsernameTaken,
} from '../lib/accounts.ts';
import { env } from '../lib/env.ts';
import { UpstreamError } from '../lib/http.ts';
import { signIn, signOut } from '../lib/session.ts';

const USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]{1,22})[a-zA-Z0-9]$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

function throttle(request: Request, username: string): void {
  const key = `${request.socket.remoteAddress ?? 'unknown'}|${username.toLowerCase()}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > ATTEMPT_LIMIT) {
    throw new UpstreamError('Too many attempts. Wait a few minutes and try again.', 429);
  }
}

function clearThrottle(request: Request, username: string): void {
  attempts.delete(`${request.socket.remoteAddress ?? 'unknown'}|${username.toLowerCase()}`);
}

function credentials(request: Request): { username: string; password: string } {
  const username = String(request.body?.username ?? '').trim();
  const password = String(request.body?.password ?? '');
  if (!username || !password) throw new UpstreamError('Type a username and a password', 400);
  return { username, password };
}

function requireAccount(request: Request): number {
  const userId = request.session.userId;
  if (!userId) throw new UpstreamError('Sign in to save this', 401);
  return userId;
}

export const accountRouter = Router();

accountRouter.post('/account/register', (request, response) => {
  const { username, password } = credentials(request);
  if (env.inviteCode) {
    const offered = String(request.body?.invite ?? '').trim();
    if (offered !== env.inviteCode) {
      throw new UpstreamError('That invite code is not right. Ask whoever runs this server.', 403);
    }
  }
  if (!USERNAME.test(username)) {
    throw new UpstreamError('Usernames are 3 to 24 letters, numbers, dots, dashes or underscores', 400);
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    throw new UpstreamError(`Passwords need at least ${MIN_PASSWORD} characters`, 400);
  }

  try {
    const account = createAccount(username, password);
    signIn(request, response, account.id);
    response.json({ account });
  } catch (problem) {
    if (problem instanceof UsernameTaken) throw new UpstreamError('That username is taken', 409);
    throw problem;
  }
});

accountRouter.post('/account/login', (request, response) => {
  const { username, password } = credentials(request);
  throttle(request, username);
  const account = authenticate(username, password);
  if (!account) throw new UpstreamError('That username and password do not match', 401);
  clearThrottle(request, username);
  signIn(request, response, account.id);
  response.json({ account });
});

accountRouter.post('/account/logout', (request, response) => {
  signOut(request, response);
  response.json({ account: null });
});

accountRouter.post('/ratings', (request, response) => {
  const userId = requireAccount(request);
  const trackId = String(request.body?.trackId ?? '').slice(0, 200);
  const title = String(request.body?.title ?? '').slice(0, 300);
  const artist = String(request.body?.artist ?? '').slice(0, 300);
  const rating = Number(request.body?.rating);
  if (!trackId || !title || !artist) throw new UpstreamError('That song is missing details', 400);
  if (rating !== 1 && rating !== -1 && rating !== 0) throw new UpstreamError('A rating is 1, -1 or 0', 400);

  rateTrack(userId, { id: trackId, title, artist }, rating as 1 | -1 | 0);
  response.json({ trackId, rating });
});

accountRouter.post('/rounds', (request, response) => {
  const userId = requireAccount(request);
  const body = request.body ?? {};
  const outcome = String(body.outcome ?? '');
  const stage = Number(body.stage);
  if (outcome !== 'right' && outcome !== 'wrong' && outcome !== 'skip') {
    throw new UpstreamError('Unknown outcome', 400);
  }
  if (!Number.isInteger(stage) || stage < 0 || stage >= MAX_STAGE) {
    throw new UpstreamError('Unknown stage', 400);
  }

  recordRound(userId, {
    trackId: String(body.trackId ?? '').slice(0, 200),
    title: String(body.title ?? '').slice(0, 300),
    artist: String(body.artist ?? '').slice(0, 300),
    source: String(body.source ?? '').slice(0, 40),
    variant: String(body.variant ?? '').slice(0, 60),
    outcome,
    stage,
    day: String(body.day ?? '').slice(0, 10),
  });
  response.json({ stats: accountStats(userId), account: getAccount(userId) });
});
