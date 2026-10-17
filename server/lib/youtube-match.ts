import { normalize } from '../../shared/text.ts';

/**
 * Which YouTube upload holds a song's real opening. A music video often opens
 * on a skit or sound effects before the song, and live takes and covers are
 * not the record, so the album version is wanted: a "Topic" upload (YouTube
 * Music's own copy of the album track) if there is one, otherwise an upload
 * whose length matches the album version Deezer reports.
 */
export interface VideoCandidate {
  id: string;
  title: string;
  channel: string;
  duration?: number;
}

export interface SongFacts {
  title: string;
  artist: string;
  /** Album version length in seconds, from Deezer. */
  duration?: number;
}

/** Not the record. A word that is in the song's own title is not held against it. */
const OTHER_VERSIONS = [
  'live',
  'concert',
  'cover',
  'karaoke',
  'instrumental',
  'remix',
  'acoustic',
  'sped up',
  'slowed',
  'reverb',
  'nightcore',
  '8d',
  'reaction',
  'tutorial',
  'lesson',
  'piano',
  'guitar',
  'drum',
  'bass boosted',
];

/**
 * Lowercase words only. Unlike `normalize`, this keeps "(Live)" and "(Remix)":
 * normalize strips them on purpose so guesses match across versions, which is
 * exactly what must not happen here.
 */
function plain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function hasWord(haystack: string, word: string): boolean {
  return ` ${haystack} `.includes(` ${word} `);
}

export function scoreVideo(video: VideoCandidate, song: SongFacts): number {
  const title = normalize(video.title);
  const channel = normalize(video.channel);
  const songTitle = normalize(song.title);
  if (!songTitle || !title.includes(songTitle)) return Number.NEGATIVE_INFINITY;
  const raw = plain(video.title);
  const rawSong = plain(song.title);
  if (OTHER_VERSIONS.some((word) => hasWord(raw, word) && !hasWord(rawSong, word))) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (video.channel.endsWith(' - Topic')) score += 4;
  if (song.duration && video.duration) {
    const off = Math.abs(video.duration - song.duration);
    if (off > 25) return Number.NEGATIVE_INFINITY;
    if (off <= 3) score += 3;
    else if (off <= 8) score += 1.5;
  }
  const artist = normalize(song.artist);
  if (artist && (channel.includes(artist) || title.includes(artist))) score += 1;
  if (hasWord(raw, 'audio')) score += 1;
  // Videos are where skits and intros live.
  if (/\b(official (music )?video|music video|mv)\b/.test(raw)) score -= 2;
  if (/\blyrics?\b/.test(raw)) score -= 0.5;
  return score;
}

/** Plausible album versions, best first; ties keep YouTube's own order, its relevance. */
export function rankVideos(candidates: VideoCandidate[], song: SongFacts): VideoCandidate[] {
  return candidates
    .map((video, order) => ({ video, order, score: scoreVideo(video, song) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.video);
}

/** The best upload, or null when none is plausibly the album version. */
export function pickVideo(candidates: VideoCandidate[], song: SongFacts): VideoCandidate | null {
  return rankVideos(candidates, song)[0] ?? null;
}
