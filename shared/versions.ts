/**
 * Whether a track is some other version of a song rather than the record:
 * remixes, acoustic and live takes, instrumentals, karaoke, sped-up edits,
 * re-recordings, tribute acts. None of those is fair to guess from.
 *
 * Deezer keeps the version apart from the title ("Midnight City" with version
 * "(Trentemoller Remix)"), so the version field is the main signal. Words in the
 * title only count inside brackets or after " - ", so a song called Live
 * Forever or Acoustic #3 is left alone. An album name only counts when the
 * whole album is that kind of version: a "Remix EP" also carries the original.
 */
export interface VersionFacts {
  title: string;
  artist: string;
  version?: string;
  album?: string;
}

const VERSION =
  /\b(re-?mix(es|ed)?|rmx|megamix|mash-?up|bootleg|rework|extended|acoustic|stripped|unplugged|instrumental|karaoke|a ?cappella|acapella|backing track|live|sped[\s-]?up|slowed|reverb|nightcore|8d|piano version|orchestral|symphonic|lo-?fi|demo|re-?recorded|cover)\b/i;

/**
 * A whole album of one kind. "Live" only counts where a live album puts it: at
 * the start followed by at/in/from/on, a colon or a year ("Live in London"),
 * after a colon or bracket ("...: Live At Wembley", "(Live)"), or at the end.
 * So "The House That We Don't Live In Anymore" and "Live Through This" are not.
 */
const WHOLE_ALBUM =
  /^live\b(\s+(at|in|from|on|and)\b|\s*[:!\-–(]|\s+\d|$)|[:!([\-–]\s*live\b|\blive[)\]]?$|\bunplugged\b|\bacoustic\b|\binstrumentals?\b|\bkaraoke\b|\ba ?cappella\b|\bsped[\s-]?up\b|\bslowed\b|\blo-?fi\b|\btribute\b|\bin the style of\b/i;

/**
 * "Techno Mix", '12" Mix', "Club Mix" are other versions; the single goes by
 * "Radio Mix", '7" Mix', "Single Mix", "Album Mix", and EDM calls the original
 * "Original Mix".
 */
const NAMED_MIX = /\bmix\b/i;
const THE_RECORD_MIX = /\b(original|radio|single|album|main|clean|explicit|stereo|mono|7")\s*(version\s*)?mix\b/i;

function isOtherMix(part: string): boolean {
  return NAMED_MIX.test(part) && !THE_RECORD_MIX.test(part);
}

/**
 * One remix released alone: "Starlight" on "Starlight (Skrillex Remix)", "I Feel
 * So Free" on "... (Peggy Gou Energy Mix)". A "Remix EP" or "(Remixes)" album
 * holds the original too, so those do not count.
 */
function isRemixSingle(title: string, album: string): boolean {
  if (!album.toLowerCase().startsWith(title.toLowerCase())) return false;
  return versionParts(album.slice(title.length)).some((part) => {
    if (/\bremix(es)?\s*(ep|album|collection|pack)\b|\bremixes\b/i.test(part)) return false;
    return /\bremix\b/i.test(part) || isOtherMix(part);
  });
}

const NOT_THE_ARTIST = /\b(tribute|karaoke|cover band|covers|sound-?alikes?|the hit crew|in the style of)\b/i;

/** The bracketed parts of a title and anything after " - ": where versions are named. */
function versionParts(title: string): string[] {
  const parts = [...title.matchAll(/[([]([^)\]]*)[)\]]/g)].map((match) => match[1] ?? '');
  const dash = title.lastIndexOf(' - ');
  if (dash > 0) parts.push(title.slice(dash + 3));
  return parts;
}

export function isAlternateVersion(track: VersionFacts): boolean {
  const named = [track.version ?? '', ...versionParts(track.title)].filter(Boolean);
  if (named.some((part) => VERSION.test(part) || isOtherMix(part))) return true;
  if (track.album) {
    const album = track.album.trim();
    if (WHOLE_ALBUM.test(album) || isRemixSingle(track.title.trim(), album)) return true;
  }
  return NOT_THE_ARTIST.test(track.artist);
}
