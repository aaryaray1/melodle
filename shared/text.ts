const NOISE = /\s*[([](?:[^)\]]*\b(?:remaster(?:ed)?|remix|radio edit|single version|album version|mono|stereo|deluxe|bonus|live|explicit|clean|feat\.?|featuring|with)\b[^)\]]*)[)\]]/gi;
const TRAILING = /\s+-\s+(?:.*\b(?:remaster(?:ed)?|radio edit|single version|album version|mix|version|live|mono|stereo)\b.*)$/i;
const FEAT = /\s+(?:feat\.?|ft\.?|featuring|with)\s+.*$/i;

/** Strip accents, edition noise and punctuation so "Björk - Jóga (Remastered)" ~ "bjork joga". */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(NOISE, ' ')
    .replace(TRAILING, ' ')
    .replace(FEAT, ' ')
    .replace(/[&]/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function tokens(value: string): string[] {
  const normalized = normalize(value);
  return normalized ? normalized.split(' ') : [];
}

function bigrams(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < value.length - 1; i += 1) {
    const gram = value.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Sørensen-Dice on character bigrams: 1 is identical, 0 shares nothing. */
export function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  let shared = 0;
  for (const [gram, count] of leftGrams) {
    shared += Math.min(count, rightGrams.get(gram) ?? 0);
  }
  return (2 * shared) / (left.length - 1 + (right.length - 1));
}

/** A guess counts when the title matches closely and the artist is recognisable. */
export function matchesTrack(
  guess: { title: string; artist: string },
  answer: { title: string; artist: string },
): boolean {
  const title = similarity(guess.title, answer.title);
  if (title < 0.82) return false;
  const artist = similarity(guess.artist, answer.artist);
  if (artist >= 0.7) return true;
  // Collaborations list artists differently everywhere; accept a shared name.
  const guessArtists = new Set(tokens(guess.artist));
  return tokens(answer.artist).some((word) => word.length > 3 && guessArtists.has(word));
}

export function trackKey(track: { title: string; artist: string }): string {
  return `${normalize(track.artist)}|${normalize(track.title)}`;
}
