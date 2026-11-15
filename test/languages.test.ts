import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { languageOf, offLanguageList, onlyArtistsFor, type LanguageIndex } from '../shared/language.ts';

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
