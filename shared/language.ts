/**
 * What language a song is sung in, from its title, album and artist alone:
 * Deezer does not say. Words and accented letters count for a language,
 * common English words against; Hangul or kana settle Korean and Japanese on
 * sight. The album breaks ties: Bad Bunny's "DtMF" says nothing, its album
 * "DeBÍ TiRAR MáS FOToS" says plenty. Words languages share ("no", "me", "a")
 * count for none of them.
 *
 * Artists decide most cases: an artist on a language's list may be judged on a
 * word or an album; one who sings only in that language on anything short of a
 * clearly English title. Korean and Japanese music are scenes as much as
 * languages, so for them an artist on the list settles it outright: BTS's
 * "Dynamite" is K-pop.
 */
export interface LanguageFacts {
  title: string;
  artist: string;
  album?: string;
}

export type LanguageCode = 'ko' | 'ja' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl';
/** In the order they are tried; the script-based ones first. */
export const LANGUAGE_CODES: LanguageCode[] = ['ko', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'nl'];

export interface LanguageIndex {
  /** Artists with a song on each language's list. Lowercase. */
  lists: ReadonlyMap<string, ReadonlySet<string>>;
  /** Artists who sing only in that language, as far as the lists show. Lowercase. */
  only: ReadonlyMap<string, ReadonlySet<string>>;
}

const list = (text: string) => new Set(text.split(/\s+/).filter(Boolean));

const WORDS: Record<LanguageCode | 'en', ReadonlySet<string>> = {
  en: list(`the you your i i'm im my mine it it's its is are was and of to in on with for at all don't dont can't cant won't
    love baby girl boy night heart time feel know want need like just get go come back one more up down out what when
    how we us our she he her his they them be this that never always forever again tonight light moon sun dance hero
    shower bad good hot wild free life world home fire rain dream alive young feeling gotta whenever wherever lie hips
    story room service shape blinding lights moonlight levitating someone something nothing everything let's lets oh
    red balloons beggin about over after before who why where only every some there here than then from by or not so
    too very way day days year years little big old new last first`),
  ko: list(''),
  ja: list(''),
  es: list(`que de del el la los las mi mis tu tus te y en por para con sin una uno amor corazon noche dia baila bailar
    bailando quiero vida eres soy estoy estas cuando como todo nada siempre nunca mujer hombre beso besos dime dame ven
    vamos loco loca bonita bonito bebe mami papi perreo gasolina despacito adios hasta otra otro vez manana tiempo ojos
    cielo fuego luna sol mar mundo alma dios hoy ayer aqui ahora nosotros contigo conmigo yo ella chica chico fiesta
    verano calor pa pal nena guapa quien porque pero mas mucho poco bien mal buena bueno malo mala sola ti le lo se su
    sus al es ser hay va voy vas tengo tienes quiere sabe puedo mismo igual pido mia mio querer besame olvidar perdon
    cancion quiereme sigues dile dejame mentiras tusa duele vuelve volver bailamos corazones suerte pienso piensas
    siento sientes quieres quieren puede puedes podemos vamos voy vas vamos tengo tienes tiene estamos estan somos son
    fue fui era eran sera seria hace hacer dice decir mira mirar ves ver dame dar toma tomar deja dejar llama llamar
    espera esperar vuelve regresa lleva traer trae canta cantar baila grita llora rie sonrie suena noche dia tarde
    madrugada casa calle ciudad pueblo playa cielo estrellas lluvia viento mar rio camino coche carro mujer hombre
    amiga amigo nina nino chico chica reina rey princesa diablo angel`),
  fr: list(`avec toi moi tout tous pas je les des est et pour dans plus beau dis decider ete ne mon ma c'est cest qui sur
    oui tu il elle nous vous ils elles le une du sont suis es sans sous mes ton tes son sa ses notre votre leur ce cette
    ces quoi ou quand comme toujours jamais amour coeur nuit jour vie monde ciel soleil lune danse danser chanson chante
    encore lui eux rien toute tres bien mal belle petit petite grand grande demain hier aujourd'hui oublier ensemble
    bonjour merci parce alors danse rendez on emmene au vent j'ai j'me t'aime aime aimer perdu pere mere fille garcon
    ceux celle celui on etait sommes etes avez avons ont ai as avait voudrais veux veut peux peut faut fait faire dit
    dire vois voir va vas aller viens vient venir reste rester laisse laisser donne donner prends prendre histoire meme
    pourquoi comment combien toujours deja jamais encore rien personne quelque chose temps fois heure minute matin soir
    ete hiver pluie neige mer plage ville rue maison route voiture train avion`),
  de: list(`und ich du nicht dich mich mir dir liebe nie immer der die das ein eine mit fur wir ist bist sind wie wenn
    was alles nichts herz nacht zeit leben welt ohne auf aus bei ja nein mein meine dein deine kein keine schon noch nur
    wieder hier heute morgen bleib bleibt lass komm geh weiss ganz sehr gut schon traum tanz tanzen sommer himmel sterne
    wo wer wohin zuruck allein zusammen haus am see luftballons tage diese dieser dieses zukunft traume liebe muss
    stille nachte nacht konigin deutschland gans
    sein niemand voller flugel nuchtern uns euch ihr ihm ihn sie es man kann will soll darf mochte mochten habe hast
    hat hatte war waren wird werden wurde konnte musste jetzt dann denn doch also auch oder aber nach vor uber unter
    durch gegen seit bis zwischen stadt strasse weg wind regen sonne meer feuer wasser erde kind madchen junge frau mann
    freund freunde lied tanzt singt lacht weint bleibt geht kommt kennt weiss glaub glaube vielleicht niemals endlich`),
  it: list(`amore cuore sei mi ti che non una il lo gli le per con come sempre mai vita notte ciao bella bello io noi voi
    sono siamo questa questo quella quello anche ancora dove quando perche cosa niente tutto solo sola ragazza ragazzo
    mondo cielo sole mare luna canzone ballo cantare baciami stasera domani ieri oggi senza dentro fuori piu zitti buoni
    e estate sento musica buona domenica pensare male niente altra altro unica donna uomo via con me vivo vivere morire
    amo amare amato odio sogno sognare cantare ballare ridere piangere voglio vuoi vuole posso puoi puo devo devi deve
    faccio fai fa fare dico dici dice dire vedo vedi vede vedere vado vai andare vieni viene venire resta restare lascia
    lasciare dammi dimmi tienimi portami ancora gia adesso subito tardi presto tutta tutti tutte qualcosa qualcuno nessuno
    casa strada citta paese mare cielo stelle estate inverno pioggia vento fuoco acqua terra`),
  pt: list(`nao voce eu meu minha pra pro ta saudade beijo coracao amanha nos tudo agora ao vivo vem vai quero quer tem
    tenho sou esta estou foi ser ter um uma uns umas sem do da dos das no na nas em ele ela eles elas seu sua teu tua
    nosso nossa noite dia festa menina menino coisa gente mais muito pouco bem bom boa sempre nunca hoje ontem perco
    tempo melhor pior demais saudades amar confesso tentei era um garoto como amava cidade envelheco recomecar francesa
    vida mundo ceu mar sol lua chuva estrela flor casa rua carro moto beber bebida cerveja dancar danca cantar musica
    menina mulher homem amigo amiga gente so nunca sempre ainda depois antes agora hoje ontem amanha quero queria posso
    pode podia vou vai vamos fui foi deixa deixar fica ficar volta voltar chega chegar sinto sente saudade tao mas porque
    entao assim isso esse essa aquele aquela toda todo todas todos`),
  nl: list(`ik je jij jou jouw niet een het de van voor met mijn mij wij we ze zij hij zijn haar hun ben bent hebben heb
    hebt laat altijd nooit liefde hart nacht dag tijd leven wereld zonder op uit bij ja nee geen al nog maar weer hier
    vandaag morgen blijf kom ga weet heel erg goed mooi droom dans dansen zomer hemel sterren waar wie terug alleen samen
    dat dit die deze als dan toch wel avond is zeg laat neem mee hou vast los vlieg avontuur niets alles iets iemand
    niemand ooit nooit steeds vaak soms meer minder heel veel weinig groot klein mooi lelijk nieuw oud jong warm koud
    zon maan regen wind zee strand stad straat huis thuis weg auto fiets trein kind meisje jongen vrouw man vriend
    vriendin lach huil droom slaap wakker weet wist denk dacht voel voelde zie zag hoor hoorde zing zong dans danste`),
};

/** Articles and particles that several of these languages share. */
const WEAK = new Set(
  'la le les de del da do el un una uno une a e o os as en mi tu te se si me ma mon ta no lo al der die das het van ne y'.split(
    ' ',
  ),
);

/** Words in two or more of the languages ("mas", "era", "son") count half for each: a nudge, not a verdict. */
const SHARED: ReadonlySet<string> = (() => {
  const seen = new Map<string, number>();
  for (const code of LANGUAGE_CODES) for (const word of WORDS[code]) seen.set(word, (seen.get(word) ?? 0) + 1);
  return new Set([...seen].filter(([, count]) => count >= 2).map(([word]) => word));
})();

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const KANA = /[぀-ヿ]/;
const KANJI = /[一-鿿]/;
/** Letters one language all but owns. */
const LETTERS: [LanguageCode, RegExp][] = [
  ['es', /[ñ¿¡]/i],
  ['de', /[ßäöü]/i],
  ['pt', /[ãõ]/i],
  ['fr', /[œêâîûëï]/i],
  ['it', /[ìò]/i],
];
/** Letters several of them share: a nudge, never a verdict. */
const SHARED_ACCENTS = /[áéíóúàèç]/i;

type Evidence = Record<LanguageCode | 'en', number>;

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'");
}

function words(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function empty(): Evidence {
  return { en: 0, ko: 0, ja: 0, es: 0, fr: 0, de: 0, it: 0, pt: 0, nl: 0 };
}

/**
 * Each distinct word counts once ("La La La La" is one "la"). Letters only
 * count in a song title: in an album or artist name they say nothing about the
 * song ("XO" on the album "BEYONCÉ").
 */
function evidence(text: string, letters: boolean, skip: ReadonlySet<string> = new Set()): Evidence {
  const found = empty();
  if (!text) return found;
  if (letters) {
    if (HANGUL.test(text)) found.ko += 3;
    if (KANA.test(text)) found.ja += 3;
    else if (KANJI.test(text)) found.ja += 1.5;
    for (const [code, pattern] of LETTERS) if (pattern.test(text)) found[code] += 2;
    if (SHARED_ACCENTS.test(text)) for (const code of ['es', 'fr', 'it', 'pt'] as const) found[code] += 1;
  }
  for (const word of new Set(words(text))) {
    if (skip.has(word)) continue;
    const weight = WEAK.has(word) || SHARED.has(word) ? 0.5 : 1;
    for (const code of Object.keys(WORDS) as (LanguageCode | 'en')[]) {
      if (WORDS[code].has(word)) found[code] += weight;
    }
  }
  return found;
}

/** How many real (not merely shared) words of the language a text has. */
function strongWords(text: string, code: LanguageCode): number {
  let count = 0;
  for (const word of new Set(words(text))) if (WORDS[code].has(word) && !WEAK.has(word) && !SHARED.has(word)) count += 1;
  return count;
}

/**
 * Title counts in full; the album at half, as a tie-breaker, and only for words
 * the title does not already have: a single is often its own album, and "Viva
 * La Vida" on "Viva La Vida or Death..." is not twice the evidence.
 */
function combined(track: LanguageFacts): Evidence {
  const title = evidence(track.title, true);
  const album = evidence(track.album ?? '', false, new Set(words(track.title)));
  const found = empty();
  for (const code of Object.keys(found) as (LanguageCode | 'en')[]) found[code] = title[code] + album[code] / 2;
  return found;
}

function clearlyEnglish(found: Evidence, code: LanguageCode): boolean {
  return found.en >= 1 && found.en > found[code];
}

/** The strongest other language's evidence, English aside. */
function rival(found: Evidence, code: LanguageCode): number {
  return Math.max(...LANGUAGE_CODES.filter((other) => other !== code).map((other) => found[other]));
}

const SCENES = new Set<LanguageCode>(['ko', 'ja']);

/**
 * Sung in `code`, on the evidence. This takes a song out of the English lists,
 * so it needs real evidence: an ambiguous title stays where it is.
 */
export function looksLanguage(code: LanguageCode, track: LanguageFacts, index: LanguageIndex): boolean {
  const artist = track.artist.toLowerCase();
  const onList = index.lists.get(code)?.has(artist) ?? false;
  if (SCENES.has(code) && onList) return true;
  const found = combined(track);
  if (index.only.get(code)?.has(artist)) return !clearlyEnglish(found, code) && rival(found, code) <= found[code];
  // Someone who sings in the language needs only a little evidence, and a tie
  // with a neighbouring language ("mas" is Spanish and Portuguese) goes their way.
  if (onList) return found[code] > 0 && rival(found, code) <= found[code] && found.en <= found[code];
  if (rival(found, code) >= found[code] || found.en >= found[code]) return false;
  // Anyone else needs a clearly foreign title: "Señorita", "Te Amo" and "Viva La Vida" are English songs.
  if (found[code] >= 3) return true;
  // Two real words of the language, and not a word of anything else: "Tage wie diese".
  if (found[code] >= 2 && found.en === 0 && rival(found, code) <= 0.5 && strongWords(track.title, code) >= 2) return true;
  // A letter the language owns (ä, ñ, ã...) in a title of several words, with a word to go with it: "Stille Nächte".
  const owned = LETTERS.find(([owner]) => owner === code)?.[1];
  return Boolean(owned?.test(track.title)) && words(track.title).length >= 2 && found[code] > found.en + 1 && rival(found, code) < found[code];
}

/**
 * Whether a song does not belong on a language's list: by an act whose songs on
 * the English charts are in English (Imagine Dragons on a German feel-good
 * playlist), with a title that shows nothing of the language. Korean and
 * Japanese lists are scenes, so their acts stay whatever they sing in.
 */
export function offLanguageList(code: LanguageCode, track: LanguageFacts, englishActs: ReadonlySet<string>): boolean {
  if (SCENES.has(code)) return false;
  if (!englishActs.has(track.artist.toLowerCase())) return false;
  return combined(track)[code] < 1;
}

/** Acts with at least two clearly English songs on `englishList`. Lowercase. */
export function englishActsOf(englishList: LanguageFacts[]): Set<string> {
  const counts = new Map<string, number>();
  for (const track of englishList) {
    const found = combined(track);
    if (found.en < 1 || LANGUAGE_CODES.some((code) => found[code] >= found.en)) continue;
    const artist = track.artist.toLowerCase();
    counts.set(artist, (counts.get(artist) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count >= 2).map(([artist]) => artist));
}

/** The language a song belongs to, or null for English (and anything undecidable). */
export function languageOf(track: LanguageFacts, index: LanguageIndex): LanguageCode | null {
  for (const code of LANGUAGE_CODES) if (looksLanguage(code, track, index)) return code;
  return null;
}

/** Clearly in some other language. For a language's own list, which keeps anything that is not. */
export function clearlyNotLanguage(code: LanguageCode, track: LanguageFacts): boolean {
  if (SCENES.has(code)) return false;
  const found = combined(track);
  if (found[code] === 0 && rival(found, code) > 0) return true;
  if (rival(found, code) > found[code]) return true;
  return clearlyEnglish(found, code);
}

/**
 * Artists who sing only in `code`, as far as the lists show: two songs on its
 * list and no clearly English one on `elsewhere`, or three and four times as
 * many as English. Shakira and Pitbull have both kinds, so they are not, and
 * their English hits keep needing no excuse.
 */
export function onlyArtistsFor(code: LanguageCode, languageList: LanguageFacts[], elsewhere: LanguageFacts[]): Set<string> {
  const own = new Map<string, number>();
  for (const track of languageList) {
    const artist = track.artist.toLowerCase();
    own.set(artist, (own.get(artist) ?? 0) + 1);
  }
  const english = new Map<string, number>();
  for (const track of elsewhere) {
    if (!clearlyEnglish(combined(track), code)) continue;
    const artist = track.artist.toLowerCase();
    english.set(artist, (english.get(artist) ?? 0) + 1);
  }
  const found = new Set<string>();
  for (const [artist, count] of own) {
    const other = english.get(artist) ?? 0;
    if ((count >= 2 && other === 0) || (count >= 3 && count >= 4 * other)) found.add(artist);
  }
  return found;
}

// The Spanish-only names, kept for what still calls them.

export function looksSpanish(track: LanguageFacts, latinArtists: ReadonlySet<string>, spanishOnly: ReadonlySet<string> = new Set()): boolean {
  return looksLanguage('es', track, { lists: new Map([['es', latinArtists]]), only: new Map([['es', spanishOnly]]) });
}

export function spanishOnlyArtists(spanishList: LanguageFacts[], elsewhere: LanguageFacts[]): Set<string> {
  return onlyArtistsFor('es', spanishList, elsewhere);
}

export function clearlyNotSpanish(track: LanguageFacts): boolean {
  return clearlyNotLanguage('es', track);
}
