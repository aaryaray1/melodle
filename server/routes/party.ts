import { Router } from 'express';
import type { Request } from 'express';
import { UpstreamError } from '../lib/http.ts';
import { createParty, joinParty, leaveParty, partyFor } from '../lib/parties.ts';

const NAME_LIMIT = 40;
const CODE = /^[A-Za-z0-9]{4,8}$/;

function requireAccount(request: Request): number {
  const userId = request.session.userId;
  if (!userId) throw new UpstreamError('Make an account to start or join a party', 401);
  return userId;
}

function publicView(party: ReturnType<typeof partyFor>) {
  if (!party) return null;
  const { code, name, members, youAreHost } = party;
  return { code, name, members, youAreHost };
}

export const partyRouter = Router();

partyRouter.get('/party', (request, response) => {
  const userId = request.session.userId;
  response.json({ party: userId ? publicView(partyFor(userId)) : null });
});

partyRouter.post('/party/create', (request, response) => {
  const userId = requireAccount(request);
  const name = String(request.body?.name ?? '').trim().slice(0, NAME_LIMIT) || 'Listening party';
  response.json({ party: publicView(createParty(userId, name)) });
});

partyRouter.post('/party/join', (request, response) => {
  const userId = requireAccount(request);
  const code = String(request.body?.code ?? '').trim();
  if (!CODE.test(code)) throw new UpstreamError('A party code is five letters and numbers', 400);
  response.json({ party: publicView(joinParty(userId, code)) });
});

partyRouter.post('/party/leave', (request, response) => {
  const userId = requireAccount(request);
  leaveParty(userId);
  response.json({ party: null });
});
