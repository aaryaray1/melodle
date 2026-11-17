import type { Track, VariantOption } from '../../shared/types.ts';
import {
  belongsToList,
  clearlyNotLanguage,
  englishActsOf,
  LANGUAGE_CODES,
  languageOf,
  offLanguageList,
  onlyArtistsFor,
  type LanguageCode,
  type LanguageIndex,
} from '../../shared/language.ts';
import { TtlCache } from '../lib/cache.ts';
import { DiskCache } from '../lib/diskcache.ts';
import { fetchJson, mapLimit } from '../lib/http.ts';
import { trackFromDeezer } from '../lib/preview.ts';
import { chartTracks } from './charts.ts';
import { addPlaylistTracks, findPlaylists } from './editorial.ts';

/**
 * Music in other languages, each its own tag. A language's list is built from
 * Deezer's chart for it where one exists plus playlists titled for it, the way
 * decades are. The main lists (genres, decades, global hits) are English only:
 * `englishOnly` takes out anything these lists, or the words of a title, place
 * in another language.
 */
export interface LanguageSpec {
  code: LanguageCode;
  label: string;
  /** A Deezer genre chart for the language, when it has one. */
  chart?: string;
  queries: string[];
  /** How the language is named in a playlist title, for crossing with genres and decades. */
  pattern: RegExp;
  /** Deezer genre id to the phrases playlists use for that genre in this language. */
  genres: Record<string, string[]>;
}

export const LANGUAGES: LanguageSpec[] = [
  {
    code: 'ko',
    label: 'Korean',
    queries: ['k-pop hits', 'top k-pop', 'kpop', 'k-pop classics', 'korean hits', 'k-pop party', 'k-hip hop', 'k-ballad', 'k-indie', 'korean love hits'],
    pattern: /\bk-?pop\b|\bkorea(n)?\b|\bk-?hip\s?hop\b|\bk-?ballad\b|\bk-?r&b\b|\bk-?indie\b|\bk-?rock\b/i,
    genres: { '132': ['k-pop'], '116': ['k-hip hop', 'korean hip hop'], '165': ['k-r&b', 'korean r&b'], '152': ['k-rock', 'korean rock'], '85': ['k-indie'] },
  },
  {
    code: 'ja',
    label: 'Japanese',
    queries: ['j-pop hits', 'top j-pop', 'jpop', 'japanese hits', 'anime hits', 'city pop', 'j-rock', 'japanese classics'],
    pattern: /\bj-?pop\b|\bjapan(ese)?\b|\banime\b|\bcity pop\b|\bj-?rock\b|\bj-?rap\b/i,
    genres: { '132': ['j-pop'], '152': ['j-rock'], '116': ['japanese hip hop', 'j-rap'] },
  },
  {
    code: 'es',
    label: 'Spanish',
    chart: '197',
    queries: ['éxitos en español', 'pop en español', 'latin hits', 'reggaeton hits', 'top latino', 'éxitos latinos', 'música latina', 'éxitos españa', 'latin pop', 'hits en español', 'regional mexicano', 'corridos', 'rock en español', 'baladas en español'],
    pattern: /\blatin[oa]?\b|\bespa[nñ]ol\b|\bspanish\b|\breggaet[oó]n\b|\bmexican[oa]?\b|\bespa[nñ]a\b|\bcorridos?\b/i,
    genres: { '116': ['rap español', 'trap latino', 'hip hop latino'], '132': ['pop latino', 'pop en español'], '152': ['rock en español', 'rock latino'], '113': ['latin dance', 'reggaeton'], '165': ['r&b en español'] },
  },
  {
    code: 'fr',
    label: 'French',
    chart: '52',
    queries: ['chanson française', 'rap français', 'hits français', 'variété française', 'pop française', 'french hits', 'essentiels chanson française', 'tubes français'],
    pattern: /\bfran[cç]ais(e)?\b|\bfrench\b|\bchanson\b|\bvari[eé]t[eé]\b|\btubes?\b/i,
    genres: { '116': ['rap français', 'rap fr'], '132': ['pop française', 'variété française'], '152': ['rock français'], '106': ['french touch', 'électro française'] },
  },
  {
    code: 'de',
    label: 'German',
    queries: ['deutschpop', 'deutschrap', 'deutsche hits', 'schlager hits', 'deutsche musik', 'german hits', 'deutschpop super hits', 'neue deutsche welle', 'deutschpunk', 'deutsche indie', 'deutschrock'],
    pattern: /deutsch|\bgerman\b|\bschlager\b|\bndw\b/i,
    genres: { '116': ['deutschrap', 'deutscher rap'], '132': ['deutschpop', 'deutscher pop', 'schlager'], '152': ['deutschrock', 'deutscher rock'] },
  },
  {
    code: 'it',
    label: 'Italian',
    queries: ['hits italiani', 'musica italiana', 'pop italiano', 'rap italiano', 'italian hits', 'canzoni italiane', 'ti amo italia', 'italo'],
    pattern: /\bitalian[oaie]?\b|\bitaly\b|\bitalia\b|\bitalo\b/i,
    genres: { '116': ['rap italiano', 'trap italiana'], '132': ['pop italiano'], '152': ['rock italiano'], '113': ['italo disco', 'italo dance'] },
  },
  {
    code: 'pt',
    label: 'Portuguese',
    chart: '75',
    queries: ['sertanejo', 'funk brasileiro', 'mpb', 'hits brasil', 'top brasil', 'pagode', 'fado', 'músicas portuguesas', 'pop brasileiro'],
    pattern: /\bbrasil\b|\bbrazil(ian)?\b|\bportugu[eê]s(a|e)?\b|\bsertanejo\b|\bmpb\b|\bpagode\b|\bfado\b|\bnacional\b/i,
    genres: { '116': ['rap brasileiro', 'rap nacional'], '132': ['pop brasileiro', 'pop nacional'], '152': ['rock brasileiro', 'rock nacional'], '113': ['funk brasileiro'] },
  },
  {
    code: 'nl',
    label: 'Dutch',
    chart: '518',
    queries: ['nederlandstalig', 'nederlandse hits', 'hollandse hits', 'vlaamse hits', 'nederpop', 'nl hits', 'nederlandstalige muziek'],
    pattern: /\bnederland(s|se|stalig|stalige)?\b|\bnederpop\b|\bhollands(e)?\b|\bvlaams(e)?\b|\bdutch\b|\bnl\b/i,
    genres: { '116': ['nederhop', 'nederlandse rap'], '132': ['nederpop'], '152': ['nederlandse rock'] },
  },
  { code: 'zh', label: 'Chinese', queries: ['mandopop', 'chinese hits', 'cantopop', '华语流行', 'c-pop', 'chinese pop'], pattern: /\bmandopop\b|\bcantopop\b|\bchinese\b|\bc-?pop\b|华语/i, genres: {} },
  { code: 'hi', label: 'Hindi', chart: '81', queries: ['bollywood hits', 'hindi hits', 'bollywood top', 'hindi pop', 'bollywood romantic', 'bollywood party', 'hindi love songs'], pattern: /\bbollywood\b|\bhindi\b/i, genres: {} },
  { code: 'pa', label: 'Punjabi', queries: ['punjabi hits', 'punjabi pop', 'top punjabi', 'bhangra', 'punjabi party'], pattern: /\bpunjabi\b|\bbhangra\b/i, genres: {} },
  { code: 'ar', label: 'Arabic', chart: '12', queries: ['arabic hits', 'اغاني عربية', 'arab pop', 'arabic pop', 'أغاني'], pattern: /\barab(ic)?\b|عرب/i, genres: {} },
  { code: 'th', label: 'Thai', queries: ['เพลงไทย', 'thai hits', 't-pop', 'thai pop', 'เพลงฮิต'], pattern: /\bthai\b|\bt-?pop\b|ไทย/i, genres: {} },
  { code: 'el', label: 'Greek', queries: ['ελληνικά τραγούδια', 'ελληνικές επιτυχίες', 'greek hits', 'greek pop', 'λαϊκά'], pattern: /\bgreek\b|ελλην/i, genres: {} },
  { code: 'uk', label: 'Ukrainian', queries: ['українські хіти', 'українська музика', 'ukrainian hits', 'укр хіти'], pattern: /\bukrain(e|ian)\b|україн|укр/i, genres: {} },
  { code: 'ru', label: 'Russian', queries: ['русские хиты', 'русский поп', 'русский рэп', 'russian hits', 'русские песни'], pattern: /\brussian\b|русск/i, genres: {} },
  { code: 'sv', label: 'Swedish', queries: ['svenska hits', 'svensk pop', 'svenska klassiker', 'swedish hits', 'svensk musik'], pattern: /\bsvensk(a)?\b|\bswedish\b/i, genres: {} },
  { code: 'no', label: 'Norwegian', queries: ['norske hits', 'norsk pop', 'norske klassikere', 'norwegian hits', 'norsk musikk'], pattern: /\bnorsk(e)?\b|\bnorwegian\b/i, genres: {} },
  { code: 'da', label: 'Danish', queries: ['danske hits', 'dansk pop', 'danske klassikere', 'danish hits', 'dansk musik'], pattern: /\bdansk(e)?\b|\bdanish\b/i, genres: {} },
  { code: 'fi', label: 'Finnish', queries: ['suomihitit', 'suomipop', 'suomirock', 'finnish hits', 'suomi hitit'], pattern: /\bsuomi|\bfinnish\b/i, genres: {} },
  { code: 'pl', label: 'Polish', queries: ['polskie hity', 'polski pop', 'polski rap', 'polish hits', 'polska muzyka'], pattern: /\bpolsk|\bpolish\b/i, genres: {} },
  { code: 'tr', label: 'Turkish', queries: ['türkçe pop', 'türkçe hit', 'türkçe rap', 'turkish hits', 'türkçe slow'], pattern: /\bt[uü]rk(ish|[cç]e)?\b/i, genres: {} },
  { code: 'ro', label: 'Romanian', queries: ['muzica romaneasca', 'hituri romanesti', 'romanian hits', 'muzică românească', 'manele'], pattern: /\brom[aâ]n(ia|ian|easca|esti|ească|ești)\b|\bmanele\b/i, genres: {} },
  { code: 'hu', label: 'Hungarian', queries: ['magyar slágerek', 'magyar pop', 'magyar hits', 'hungarian hits', 'magyar zene'], pattern: /\bmagyar\b|\bhungarian\b/i, genres: {} },
  { code: 'cs', label: 'Czech', queries: ['české hity', 'český pop', 'czech hits', 'česká hudba', 'československé hity'], pattern: /\b[cč]esk|\bczech\b/i, genres: {} },
  {
    code: 'lt',
    label: 'Lithuanian',
    queries: ['lietuviškos dainos', 'lietuviška muzika', 'lithuanian hits', 'lietuviški hitai', 'top lietuva', 'lietuviškos naujausios dainos', 'lietuviška estrada', 'lietuviškas repas'],
    pattern: /lietuv|\blithuanian\b/i,
    genres: {},
  },
  { code: 'id', label: 'Indonesian', queries: ['lagu indonesia', 'indonesia hits', 'pop indonesia', 'indonesian hits', 'lagu galau'], pattern: /\bindonesia(n)?\b|\blagu\b/i, genres: {} },
  { code: 'vi', label: 'Vietnamese', queries: ['nhạc việt', 'vpop', 'vietnamese hits', 'v-pop', 'nhạc trẻ'], pattern: /\bv-?pop\b|\bviet(nam|namese)?\b|việt/i, genres: {} },
  { code: 'tl', label: 'Filipino', queries: ['opm hits', 'pinoy hits', 'opm love songs', 'filipino hits', 'tagalog hits'], pattern: /\bopm\b|\bpinoy\b|\bfilipino\b|\btagalog\b/i, genres: {} },
];

/** Alphabetical, so the chips read easily. */
export const LANGUAGE_VARIANTS: VariantOption[] = LANGUAGES.map(({ code, label }) => ({ id: code, label })).sort((a, b) =>
  a.label.localeCompare(b.label),
);

export function languageSpec(code: string): LanguageSpec | undefined {
  return LANGUAGES.find((language) => language.code === code);
}

export function languageLabel(code: string): string {
  return languageSpec(code)?.label ?? code;
}

const MAX_TRACKS = 1000;
const TOP_UP_BELOW = 250;
// v2: English-chart acts kept off the lists; genre phrases searched too, for wider artist coverage.
const lists = new DiskCache<Track[]>('lang-v4', 24 * 60 * 60 * 1000, (tracks) => tracks.length > 0);

export async function languageTracks(code: string): Promise<Track[]> {
  const language = languageSpec(code);
  if (!language) return [];
  return lists.wrap(code, async () => {
    let tracks: Track[] = [];
    if (language.chart) {
      const payload = await fetchJson<{ data?: Parameters<typeof trackFromDeezer>[0][] }>(
        `https://api.deezer.com/chart/${language.chart}/tracks?limit=100`,
      ).catch(() => ({ data: [] }));
      tracks = (payload.data ?? []).map(trackFromDeezer).filter((track): track is Track => track !== null);
    }
    // The genre phrases too ("deutschrock", "k-indie"), so the list, and so the
    // artists known to sing in the language, reach past the biggest playlists.
    const queries = [...language.queries, ...Object.values(language.genres).flat()];
    const found = await findPlaylists({ queries, maxPlaylists: 18, minTracks: 25 });
    await addPlaylistTracks(tracks, found.editorial, MAX_TRACKS);
    if (tracks.length < TOP_UP_BELOW) await addPlaylistTracks(tracks, found.community, MAX_TRACKS);
    // Feel-good playlists in any language carry international hits; those go back to English.
    const englishLists = await Promise.all(['0', '132', '152'].map((id) => chartTracks(id).catch(() => [] as Track[])));
    const englishActs = englishActsOf(englishLists.flat());
    return tracks.filter(
      (track) => !clearlyNotLanguage(language.code, track) && !offLanguageList(language.code, track, englishActs),
    );
  });
}

/**
 * Who sings in what, from every language's list, against the global chart for
 * the crossover check. Rebuilt hourly in memory; the lists themselves are on disk.
 */
const indexes = new TtlCache<LanguageIndex & { counts: Map<string, Map<string, number>> }>(60 * 60 * 1000, 1);

export async function languageIndex(): Promise<LanguageIndex & { counts: Map<string, Map<string, number>> }> {
  return indexes.wrap('index', async () => {
    // Every English list, so an act's English songs are seen wherever they chart.
    const englishLists = await Promise.all(
      ['0', '132', '116', '152', '113', '165', '85', '106'].map((id) => chartTracks(id).catch(() => [] as Track[])),
    );
    const elsewhere = englishLists.flat();
    const built = await mapLimit(LANGUAGE_CODES, 2, async (code) => ({
      code,
      tracks: await languageTracks(code).catch(() => [] as Track[]),
    }));
    const listed = new Map<string, Set<string>>();
    const only = new Map<string, Set<string>>();
    const counts = new Map<string, Map<string, number>>();
    for (const { code, tracks } of built) {
      listed.set(code, new Set(tracks.map((track) => track.artist.toLowerCase())));
      only.set(code, onlyArtistsFor(code, tracks, elsewhere));
      const perArtist = new Map<string, number>();
      for (const track of tracks) {
        const artist = track.artist.toLowerCase();
        perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
      }
      counts.set(code, perArtist);
    }
    return { lists: listed, only, counts };
  });
}

/** A language's list as played: acts more at home on another language's list are left to it. */
export async function languagePool(code: string): Promise<Track[]> {
  const [tracks, index] = await Promise.all([languageTracks(code), languageIndex()]);
  return tracks.filter((track) => belongsToList(code, track.artist, index.counts));
}

/** The main lists are English: songs the language lists, or their own words, place elsewhere go. */
export async function englishOnly(tracks: Track[]): Promise<Track[]> {
  const index = await languageIndex();
  return tracks.filter((track) => languageOf(track, index) === null);
}
