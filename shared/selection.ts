import type { ProviderId } from './types.ts';
import { blendVariant, MAX_BLEND, selectionOf, type BlendPart } from './blend.ts';

/**
 * What the music picker has selected but not yet played. Genres, decades and
 * languages mix with each other (global hits is a genre pick like any other); a
 * history source (or a party) stands alone. Every choice can be switched off
 * again, and an empty selection means global hits.
 */
export type Draft =
  | { kind: 'mix'; parts: BlendPart[] }
  | { kind: 'history'; source: ProviderId; variant: string };

export interface Target {
  source: ProviderId;
  variant: string;
}

const GLOBAL_HITS: BlendPart = { source: 'charts', id: '0' };

const same = (a: BlendPart, b: BlendPart) => a.source === b.source && a.id === b.id;

export function draftOf(source: ProviderId, variant: string): Draft {
  if (source === 'charts' || source === 'decades' || source === 'blend') {
    return { kind: 'mix', parts: selectionOf(source, variant) };
  }
  return { kind: 'history', source, variant };
}

export function toggleHistory(draft: Draft, source: ProviderId, variant: string): Draft {
  const already = draft.kind === 'history' && draft.source === source && draft.variant === variant;
  return already ? { kind: 'mix', parts: [] } : { kind: 'history', source, variant };
}

export function toggleTag(draft: Draft, part: BlendPart): Draft {
  if (draft.kind === 'history') return { kind: 'mix', parts: [part] };
  if (draft.parts.some((entry) => same(entry, part))) {
    return { kind: 'mix', parts: draft.parts.filter((entry) => !same(entry, part)) };
  }
  return draft.parts.length >= MAX_BLEND ? draft : { kind: 'mix', parts: [...draft.parts, part] };
}

/** Whether a chip is lit. Global hits is also lit when nothing at all is picked, since that is what plays. */
export function isPicked(draft: Draft, part: BlendPart): boolean {
  if (draft.kind !== 'mix') return false;
  if (draft.parts.some((entry) => same(entry, part))) return true;
  return draft.parts.length === 0 && same(part, GLOBAL_HITS);
}

export function targetOf(draft: Draft): Target {
  if (draft.kind === 'history') return { source: draft.source, variant: draft.variant };
  const [only] = draft.parts;
  if (!only) return { source: 'charts', variant: '0' };
  if (draft.parts.length === 1 && only.source !== 'lang') return { source: only.source, variant: only.id };
  return { source: 'blend', variant: blendVariant(draft.parts) };
}

export function sameTarget(draft: Draft, source: ProviderId, variant: string): boolean {
  const target = targetOf(draft);
  return target.source === source && target.variant === variant;
}
