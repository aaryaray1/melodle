import type { ProviderId } from './types.ts';
import { blendVariant, MAX_BLEND, selectionOf, type BlendPart } from './blend.ts';

/**
 * What the music picker has selected but not yet played. Genres and decades mix
 * with each other; a history source (or a party) stands alone. Every choice can
 * be switched off again, and an empty selection means global hits.
 */
export type Draft =
  | { kind: 'mix'; parts: BlendPart[] }
  | { kind: 'history'; source: ProviderId; variant: string };

export interface Target {
  source: ProviderId;
  variant: string;
}

/** Global hits is no genre filter at all, so it never sits in the selection itself. */
const isGlobalHits = (part: BlendPart) => part.source === 'charts' && part.id === '0';

export function draftOf(source: ProviderId, variant: string): Draft {
  if (source === 'charts' || source === 'decades' || source === 'blend') {
    return { kind: 'mix', parts: selectionOf(source, variant).filter((part) => !isGlobalHits(part)) };
  }
  return { kind: 'history', source, variant };
}

export function toggleHistory(draft: Draft, source: ProviderId, variant: string): Draft {
  const already = draft.kind === 'history' && draft.source === source && draft.variant === variant;
  return already ? { kind: 'mix', parts: [] } : { kind: 'history', source, variant };
}

/** Whether the global hits chip is lit: no genre picked, whatever the decades. */
export function noGenre(draft: Draft): boolean {
  return draft.kind === 'mix' && !draft.parts.some((part) => part.source === 'charts');
}

export function toggleTag(draft: Draft, part: BlendPart): Draft {
  // Tapping global hits clears the genres; any decades stay.
  if (isGlobalHits(part)) {
    return { kind: 'mix', parts: draft.kind === 'mix' ? draft.parts.filter((entry) => entry.source !== 'charts') : [] };
  }
  if (draft.kind === 'history') return { kind: 'mix', parts: [part] };
  const has = draft.parts.some((entry) => entry.source === part.source && entry.id === part.id);
  if (has) return { kind: 'mix', parts: draft.parts.filter((entry) => entry.source !== part.source || entry.id !== part.id) };
  return draft.parts.length >= MAX_BLEND ? draft : { kind: 'mix', parts: [...draft.parts, part] };
}

export function targetOf(draft: Draft): Target {
  if (draft.kind === 'history') return { source: draft.source, variant: draft.variant };
  const [only] = draft.parts;
  if (!only) return { source: 'charts', variant: '0' };
  if (draft.parts.length === 1) return { source: only.source, variant: only.id };
  return { source: 'blend', variant: blendVariant(draft.parts) };
}

export function sameTarget(draft: Draft, source: ProviderId, variant: string): boolean {
  const target = targetOf(draft);
  return target.source === source && target.variant === variant;
}
