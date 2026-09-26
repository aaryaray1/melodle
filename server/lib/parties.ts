import { randomInt } from 'node:crypto';
import type { Party, PartyMember, ProviderId } from '../../shared/types.ts';
import { db } from './db.ts';
import { UpstreamError } from './http.ts';

/** No vowels, so a code can never spell anything, and no 0/O or 1/I to mishear. */
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_MEMBERS = 12;

const insertParty = db.prepare(
  'INSERT INTO parties (code, name, host_id, created_at) VALUES (?, ?, ?, ?) RETURNING id, code, name, host_id',
);
const selectPartyByCode = db.prepare('SELECT id, code, name, host_id FROM parties WHERE code = ?');
const selectPartyForUser = db.prepare(`
  SELECT p.id, p.code, p.name, p.host_id
  FROM parties p
  JOIN party_members m ON m.party_id = p.id
  WHERE m.user_id = ?
`);
const insertMember = db.prepare('INSERT OR IGNORE INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)');
const deleteMember = db.prepare('DELETE FROM party_members WHERE party_id = ? AND user_id = ?');
const deleteParty = db.prepare('DELETE FROM parties WHERE id = ?');
const countMembers = db.prepare('SELECT COUNT(*) AS total FROM party_members WHERE party_id = ?');
const selectMembers = db.prepare(`
  SELECT u.id, u.username, c.provider
  FROM party_members m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN connections c ON c.user_id = u.id
  WHERE m.party_id = ?
  ORDER BY m.joined_at ASC, u.username ASC
`);

interface PartyRow {
  id: number;
  code: string;
  name: string;
  host_id: number;
}

export interface PartyDetail extends Party {
  id: number;
  memberIds: { userId: number; username: string }[];
}

/** Spotify first: it is the richest history, then scrobbles, then YouTube likes. */
const SOURCE_ORDER: ProviderId[] = ['spotify', 'lastfm', 'youtube'];

function newCode(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = '';
    for (let index = 0; index < CODE_LENGTH; index += 1) {
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    if (!selectPartyByCode.get(code)) return code;
  }
  throw new UpstreamError('Could not find a free party code. Try again.', 503);
}

function detail(row: PartyRow, userId: number): PartyDetail {
  const rows = selectMembers.all(row.id) as { id: number; username: string; provider: string | null }[];
  const byUser = new Map<number, { username: string; providers: string[] }>();
  for (const entry of rows) {
    const existing = byUser.get(entry.id) ?? { username: entry.username, providers: [] };
    if (entry.provider) existing.providers.push(entry.provider);
    byUser.set(entry.id, existing);
  }

  const members: PartyMember[] = [];
  const memberIds: { userId: number; username: string }[] = [];
  for (const [id, entry] of byUser) {
    const source = SOURCE_ORDER.find((provider) => entry.providers.includes(provider)) ?? null;
    members.push({ username: entry.username, source, isHost: id === row.host_id });
    memberIds.push({ userId: id, username: entry.username });
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    members,
    youAreHost: row.host_id === userId,
    memberIds,
  };
}

export function partyFor(userId: number): PartyDetail | null {
  const row = selectPartyForUser.get(userId) as PartyRow | undefined;
  return row ? detail(row, userId) : null;
}

export function createParty(userId: number, name: string): PartyDetail {
  leaveParty(userId);
  const row = insertParty.get(newCode(), name, userId, Date.now()) as unknown as PartyRow;
  insertMember.run(row.id, userId, Date.now());
  return detail(row, userId);
}

export function joinParty(userId: number, code: string): PartyDetail {
  const row = selectPartyByCode.get(code.trim()) as PartyRow | undefined;
  if (!row) throw new UpstreamError('No party has that code', 404);
  const { total } = countMembers.get(row.id) as { total: number };
  if (total >= MAX_MEMBERS) throw new UpstreamError(`A party holds ${MAX_MEMBERS} people`, 409);
  leaveParty(userId);
  insertMember.run(row.id, userId, Date.now());
  return detail(row, userId);
}

/** The host leaving ends the party, rather than stranding everyone in it. */
export function leaveParty(userId: number): void {
  const row = selectPartyForUser.get(userId) as PartyRow | undefined;
  if (!row) return;
  if (row.host_id === userId) {
    deleteParty.run(row.id);
    return;
  }
  deleteMember.run(row.id, userId);
}
