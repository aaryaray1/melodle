import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { belongsToList, languageOf, offLanguageList, onlyArtistsFor, type LanguageIndex } from '../shared/language.ts';

const song = (artist: string, title: string, album = '') => ({ artist, title, album });
const index: LanguageIndex = {
  lists: new Map([
    ['ko', new Set(['bts', 'blackpink', 'newjeans'])],
    ['es', new Set(['bad bunny', 'shakira'])],
    ['de', new Set(['apache 207'])],
    ['fr', new Set(['angèle'])],
  ]),
  only: new Map([
    ['es', new Set(['bad bunny'])],
    ['de', new Set(['apache 207'])],
  ]),
};

test('Korean music is a scene: anything by a K-pop act counts, whatever the title language', () => {
  assert.equal(languageOf(song('BTS', 'Dynamite', 'BE'), index), 'ko');
  assert.equal(languageOf(song('NewJeans', 'Super Shy', 'Get Up'), index), 'ko');
  assert.equal(languageOf(song('Someone', '사랑해', ''), index), 'ko', 'Hangul in the title is enough too');
});

test('Spanish keeps its crossover rule: Shakira in English stays English', () => {
  assert.equal(languageOf(song('Shakira', "Hips Don't Lie", 'Oral Fixation'), index), null);
  assert.equal(languageOf(song('Shakira', 'Hips Don’t Lie', 'Oral Fixation'), index), null);
  assert.equal(languageOf(song('Shakira', 'Suerte', 'Servicio de Lavandería'), index), 'es');
  assert.equal(languageOf(song('Bad Bunny', 'DtMF', 'DeBÍ TiRAR MáS FOToS'), index), 'es');
});

test('German, French, Italian, Portuguese and Dutch are told from their words', () => {
  assert.equal(languageOf(song('Apache 207', 'Roller', '2sad2disco'), index), 'de', 'an artist who sings only in German');
  assert.equal(languageOf(song('Nina Chuba', 'Wildberry Lillet', 'Glas'), index), null, 'no evidence, no guess');
  assert.equal(languageOf(song('Peter Fox', 'Haus am See', 'Stadtaffe'), index), 'de');
  assert.equal(languageOf(song('Angèle', 'Tout oublier', 'Brol'), index), 'fr');
  assert.equal(languageOf(song('Måneskin', 'Zitti e buoni', 'Teatro d’ira'), index), 'it');
  assert.equal(languageOf(song('Anitta', 'Não Perco Meu Tempo', 'Kisses'), index), 'pt');
  assert.equal(languageOf(song('Suzan & Freek', 'Als Het Avond Is', 'Gedeeld Door Ons'), index), 'nl');
});

test('English songs stay English', () => {
  for (const [artist, title] of [
    ['Ed Sheeran', 'Shape of You'],
    ['Coldplay', 'Viva La Vida'],
    ['Rihanna', 'Te Amo'],
    ['Shawn Mendes', 'Señorita'],
    ['Lady Gaga', 'Alejandro'],
    ['Måneskin', 'Beggin’'],
    ['Nena', '99 Red Balloons'],
  ] as [string, string][]) {
    assert.equal(languageOf(song(artist, title), index), null, `${title} is English`);
  }
});

test('who sings only in one language is worked out from the lists', () => {
  const only = onlyArtistsFor(
    'de',
    [song('Apache 207', 'Roller'), song('Apache 207', 'Fame'), song('Nena', '99 Luftballons'), song('Nena', 'Leuchtturm')],
    [song('Nena', '99 Red Balloons')],
  );
  assert.ok(only.has('apache 207'));
  assert.ok(!only.has('nena'), 'an English hit elsewhere makes her a crossover');
});

test('a foreign title by an unlisted act is still caught when two of its words agree and nothing contradicts', () => {
  assert.equal(languageOf(song('Die Toten Hosen', 'Tage wie diese', 'Ballast der Republik'), index), 'de');
  assert.equal(languageOf(song('Ganggorra', 'Bem Melhor', ''), index), 'pt');
  assert.equal(languageOf(song('Stromae', 'Alors on danse', 'Cheese'), index), 'fr');
});

test('shared little words are not evidence enough on their own', () => {
  assert.equal(languageOf(song('Coldplay', 'Viva La Vida', ''), index), null);
  assert.equal(languageOf(song('Madonna', 'La Isla Bonita', 'True Blue'), index), null);
  assert.equal(languageOf(song('Rihanna', 'Te Amo', 'Rated R'), index), null);
  assert.equal(languageOf(song('Shawn Mendes', 'Señorita', ''), index), null, 'one accent is not a language');
});

test('an English-chart act with an English title does not belong on a language list', () => {
  const englishActs = new Set(['imagine dragons', 'lola young']);
  assert.ok(offLanguageList('de', song('Imagine Dragons', 'Bones', 'Mercury - Act 2'), englishActs));
  assert.ok(offLanguageList('it', song('Lola Young', 'd£aler', ''), englishActs));
  assert.ok(!offLanguageList('de', song('Imagine Dragons', 'Träume', ''), englishActs), 'unless the title is in the language');
  assert.ok(!offLanguageList('de', song('Wincent Weiss', 'Uuuhh', ''), englishActs), 'a native act with a wordless title stays');
  assert.ok(!offLanguageList('ko', song('BTS', 'Dynamite', 'BE'), new Set(['bts'])), 'K-pop in English is still K-pop');
});

test('a letter the language owns, in a title of several words with its words, settles it', () => {
  assert.equal(languageOf(song('Deine Cousine', 'Stille Nächte', ''), index), 'de');
  assert.equal(languageOf(song('Kontrollverlust', 'In der Weihnachtsbäckerei', ''), index), 'de');
  assert.equal(languageOf(song('Shawn Mendes', 'Señorita', ''), index), null, 'one word with one accent is not');
  assert.equal(languageOf(song('Beyoncé', 'Déjà Vu', 'B’Day'), index), null, 'shared accents do not count as owned letters');
});

test('an act is kept on the language list where it has more songs', () => {
  const counts = new Map([
    ['ko', new Map([['bts', 20], ['kenshi yonezu', 1]])],
    ['ja', new Map([['kenshi yonezu', 6], ['bts', 1]])],
  ]);
  assert.ok(belongsToList('ko', 'BTS', counts));
  assert.ok(!belongsToList('ko', 'Kenshi Yonezu', counts), 'J-pop that strayed onto a K-pop playlist');
  assert.ok(belongsToList('ja', 'Kenshi Yonezu', counts));
  assert.ok(belongsToList('ko', 'Someone New', counts), 'an act on no other list stays');
});

test('the new languages are told by script', () => {
  const none: LanguageIndex = { lists: new Map(), only: new Map() };
  assert.equal(languageOf(song('Arijit Singh', 'तुम ही हो', 'Aashiqui 2'), none), 'hi');
  assert.equal(languageOf(song('Diljit Dosanjh', 'ਲਵਰ', ''), none), 'pa');
  assert.equal(languageOf(song('Amr Diab', 'نور العين', ''), none), 'ar');
  assert.equal(languageOf(song('Jay Chou', '晴天', '葉惠美'), none), 'zh');
  assert.equal(languageOf(song('Official HIGE DANdism', 'ミックスナッツ', ''), none), 'ja', 'kana is Japanese, not Chinese');
  assert.equal(languageOf(song('Miyagi', 'Минор', ''), none), 'ru');
  assert.equal(languageOf(song('Okean Elzy', 'Обійми', ''), none), 'uk', 'Ukrainian letters win over Russian');
  assert.equal(languageOf(song('Eleni Foureira', 'Φως', ''), none), 'el');
  assert.equal(languageOf(song('Palmy', 'คิดถึง', ''), none), 'th');
});

test('the Latin-script ones are told by their words and letters', () => {
  const none: LanguageIndex = { lists: new Map(), only: new Map() };
  assert.equal(languageOf(song('Arijit Singh', 'Tum Hi Ho', 'Aashiqui 2'), none), 'hi', 'romanised Hindi');
  assert.equal(languageOf(song('Tarkan', 'Şımarık', ''), none), null, 'one word with one letter is not enough');
  assert.equal(languageOf(song('Tarkan', 'Dudu Dudu', ''), none), null);
  assert.equal(languageOf(song('Sezen Aksu', 'Her Şeyi Yak', ''), none), 'tr');
  assert.equal(languageOf(song('Veronica Maggio', 'Jag kommer', ''), none), 'sv');
  assert.equal(languageOf(song('sanah', 'Nie chcę ciebie', ''), none), 'pl');
  assert.equal(languageOf(song('Tulus', 'Hati-Hati di Jalan', ''), none), 'id');
  assert.equal(languageOf(song('Sơn Tùng M-TP', 'Chúng Ta Của Hiện Tại', ''), none), 'vi');
  assert.equal(languageOf(song('Ben&Ben', 'Kathang Isip', ''), none), 'tl');
  assert.equal(languageOf(song('ABBA', 'Dancing Queen', 'Arrival'), none), null);
});

test('an English act that turns up on a foreign playlist keeps its English songs English', () => {
  const strays: LanguageIndex = {
    lists: new Map([
      ['it', new Set(['lola young', 'måneskin'])],
      ['fr', new Set(['fall out boy', 'angèle'])],
    ]),
    only: new Map(),
    counts: new Map([
      ['it', new Map([['lola young', 2], ['måneskin', 9]])],
      ['fr', new Map([['fall out boy', 1], ['angèle', 12]])],
    ]),
  };
  assert.equal(languageOf(song('Lola Young', 'Messy', 'This Wasn’t Meant For You Anyway'), strays), null);
  assert.equal(languageOf(song('Fall Out Boy', 'Thnks fr th Mmrs', 'Infinity on High'), strays), null, 'a shared "on" is not French');
  assert.equal(languageOf(song('Angèle', 'Une seule vie', ''), strays), 'fr', 'a real French word still counts');
  assert.equal(languageOf(song('Måneskin', 'Le parole lontane', ''), strays), 'it', 'a regular on the list is trusted on a small hint');
  assert.equal(languageOf(song('Lola Young', 'Le Messy', ''), strays), null, 'an occasional one is not');
});

test('an English song anywhere in the English lists makes an artist a crossover, not a single-language act', () => {
  const danishList = [song('Nelly Furtado', 'Promiscuous'), song('Nelly Furtado', 'Maneater'), song('Medina', 'Kun For Mig'), song('Medina', 'Vi To')];
  // "Say It Right" sits in Pop, not Global hits: every English list is looked at.
  const only = onlyArtistsFor('da', danishList, [song('Nelly Furtado', 'Say It Right')]);
  assert.ok(!only.has('nelly furtado'), 'nothing in her titles is Danish');
  assert.ok(only.has('medina'));
});

test('an album name is not evidence for an act that is only occasionally on the list', () => {
  const idx: LanguageIndex = { lists: new Map([['fr', new Set(['tokio hotel'])]]), only: new Map(), counts: new Map([['fr', new Map([['tokio hotel', 1]])]]) };
  assert.equal(languageOf(song('Tokio Hotel', 'California Nights', 'ENCORE'), idx), null);
});

test('a single-language act is not outvoted by a language it is not even listed in', () => {
  const idx: LanguageIndex = { lists: new Map([['es', new Set(['karol g'])]]), only: new Map([['es', new Set(['karol g'])]]) };
  assert.equal(languageOf(song('KAROL G', 'Si Antes Te Hubiera Conocido', ''), idx), 'es');
});

test('Lithuanian is told by its own letters and words', () => {
  const none: LanguageIndex = { lists: new Map(), only: new Map() };
  assert.equal(languageOf(song('Jazzu', 'Kai Tu Šalia Manęs', ''), none), 'lt', 'ę and words');
  assert.equal(languageOf(song('Andrius Mamontovas', 'Saulė Leidžias', ''), none), 'lt', 'ė is its own');
  assert.equal(languageOf(song('Foje', 'Laikas Ir Vėjas', ''), none), 'lt');
  assert.equal(languageOf(song('sanah', 'Nie chcę ciebie', ''), none), 'pl', 'Polish ę stays Polish');
  assert.equal(languageOf(song('Jazzu', 'Free', ''), none), null);
});
