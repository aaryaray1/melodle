/**
 * Several genres and decades played as one pool. The selection travels as the
 * `blend` source's variant, "charts:152,decades:1980s", sorted so the same picks
 * always make the same key (and so the same song of the day).
 */
export interface BlendPart {
  source: 'charts' | 'decades' | 'lang';
  id: string;
}

/** Each part is its own few Deezer calls on a cold cache; this keeps the first load sane. */
export const MAX_BLEND = 10;

const PART = /^(charts:\d{1,6}|decades:\d{4}s|lang:[a-z]{2})$/;

export function parseBlend(variant: string): BlendPart[] {
  const parts: BlendPart[] = [];
  const seen = new Set<string>();
  for (const raw of variant.split(',')) {
    const value = raw.trim();
    if (!PART.test(value) || seen.has(value)) continue;
    seen.add(value);
    const [source, id] = value.split(':') as [BlendPart['source'], string];
    parts.push({ source, id });
    if (parts.length >= MAX_BLEND) break;
  }
  return parts;
}

export function blendVariant(parts: BlendPart[]): string {
  return [...new Set(parts.map((part) => `${part.source}:${part.id}`))].sort().join(',');
}

export function selectionOf(source: string, variant: string): BlendPart[] {
  if (source === 'blend') return parseBlend(variant);
  // The old Spanish genre is the Spanish language now.
  if (source === 'charts' && variant === '197') return parseBlend('lang:es');
  if (source === 'charts' || source === 'decades') return parseBlend(`${source}:${variant}`);
  return [];
}

/** "Rock + The 80s", or "Rock + The 80s + 3 more" once it stops fitting a chip. */
export function blendLabel(labels: string[]): string {
  if (labels.length <= 3) return labels.join(' + ');
  return `${labels.slice(0, 2).join(' + ')} + ${labels.length - 2} more`;
}

/** Genres narrowed to decades: "Rock + Metal · The 10s + The 20s". */
export function crossLabel(genres: string[], decades: string[]): string {
  return `${blendLabel(genres)} · ${blendLabel(decades)}`;
}

/** Languages, then genres, then decades: "Korean · Pop · The 10s", "Rock + Metal". */
export function mixLabel(languages: string[], genres: string[], decades: string[]): string {
  return [languages, genres, decades]
    .filter((group) => group.length)
    .map((group) => blendLabel(group))
    .join(' · ');
}
