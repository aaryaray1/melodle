/**
 * Several genres and decades played as one pool. The selection travels as the
 * `blend` source's variant, "charts:152,decades:1980s", sorted so the same picks
 * always make the same key (and so the same song of the day).
 */
export interface BlendPart {
  source: 'charts' | 'decades';
  id: string;
}

/** Each part is its own few Deezer calls on a cold cache; this keeps the first load sane. */
export const MAX_BLEND = 8;

const PART = /^(charts:\d{1,6}|decades:\d{4}s)$/;

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
  if (source === 'charts' || source === 'decades') return parseBlend(`${source}:${variant}`);
  return [];
}

export function toggleSelection(selection: BlendPart[], part: BlendPart): BlendPart[] {
  const has = selection.some((entry) => entry.source === part.source && entry.id === part.id);
  if (has) {
    return selection.length > 1
      ? selection.filter((entry) => entry.source !== part.source || entry.id !== part.id)
      : selection;
  }
  return selection.length >= MAX_BLEND ? selection : [...selection, part];
}

/** "Rock + The 80s", or "Rock + The 80s + 3 more" once it stops fitting a chip. */
export function blendLabel(labels: string[]): string {
  if (labels.length <= 3) return labels.join(' + ');
  return `${labels.slice(0, 2).join(' + ')} + ${labels.length - 2} more`;
}
