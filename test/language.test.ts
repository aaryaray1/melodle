import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clearlyNotSpanish, looksSpanish, spanishOnlyArtists } from '../shared/language.ts';

const latinArtists = new Set(['bad bunny', 'karol g', 'shakira', 'pitbull', 'enrique iglesias', 'becky g', 'kali uchis', 'juanes']);
const song = (artist: string, title: string, album = '') => ({ artist, title, album });

test('Spanish-language songs in Pop are recognised from their words', () => {
  assert.ok(looksSpanish(song('Juanes', 'A Dios Le Pido', 'Un Día Normal'), latinArtists));
  assert.ok(looksSpanish(song('Kali Uchis', 'Igual Que Un Ángel', 'ORQUÍDEAS'), latinArtists));
  assert.ok(looksSpanish(song('Bad Bunny', 'BAILE INoLVIDABLE', 'DeBÍ TiRAR MáS FOToS'), latinArtists));
  assert.ok(looksSpanish(song('Daddy Yankee', 'Gasolina', 'Barrio Fino'), new Set(['daddy yankee'])));
  assert.ok(looksSpanish(song('Someone New', 'Quiero Bailar Contigo', ''), latinArtists), 'a clearly Spanish title, any artist');
});

test('a title that says nothing is settled by its album', () => {
  assert.ok(looksSpanish(song('Bad Bunny', 'DtMF', 'DeBÍ TiRAR MáS FOToS'), latinArtists));
  assert.ok(!looksSpanish(song('Kali Uchis', 'Moonlight', 'Red Moon In Venus'), latinArtists));
});

test('English songs by Latin artists stay in Pop', () => {
  assert.ok(!looksSpanish(song('Shakira', "Hips Don't Lie (feat. Wyclef Jean)", 'Oral Fixation Vol. 2'), latinArtists));
  assert.ok(!looksSpanish(song('Shakira', 'Whenever, Wherever', 'Laundry Service'), latinArtists));
  assert.ok(!looksSpanish(song('Enrique Iglesias', 'Hero', 'Escape'), latinArtists));
  assert.ok(!looksSpanish(song('Pitbull', 'I Know You Want Me (Calle Ocho)', 'Pitbull Starring In Rebelution'), latinArtists));
  assert.ok(!looksSpanish(song('The Black Eyed Peas', 'I Gotta Feeling', 'THE E.N.D.'), latinArtists));
});

test('ordinary English titles with a stray Spanish-looking word are not taken for Spanish', () => {
  assert.ok(!looksSpanish(song('Clean Bandit', 'Solo (feat. Demi Lovato)', 'What Is Love?'), latinArtists));
  assert.ok(!looksSpanish(song('Lady Gaga', 'Alejandro', 'The Fame Monster'), latinArtists));
  assert.ok(!looksSpanish(song('Taylor Swift', 'Love Story', 'Fearless'), latinArtists));
});

test('Portuguese is not Spanish', () => {
  assert.ok(!looksSpanish(song('Ivete Sangalo', 'Não Precisa Mudar', 'Multishow Ao Vivo'), latinArtists));
  assert.ok(clearlyNotSpanish(song('Ivete Sangalo', 'Não Precisa Mudar', 'Multishow Ao Vivo')));
});

test('the Spanish list keeps anything not clearly in another language', () => {
  assert.ok(!clearlyNotSpanish(song('Bad Bunny', 'DtMF', 'DeBÍ TiRAR MáS FOToS')));
  assert.ok(!clearlyNotSpanish(song('Rosalía', 'MALAMENTE', 'El Mal Querer')));
  assert.ok(!clearlyNotSpanish(song('Unknown', 'Mayores', '')), 'no evidence either way: kept');
  assert.ok(clearlyNotSpanish(song('Ed Sheeran', 'Shape of You', '÷ (Deluxe)')));
});

test('English songs with a Spanish title stay in Pop', () => {
  assert.ok(!looksSpanish(song('Coldplay', 'Viva La Vida', 'Viva La Vida or Death and All His Friends'), latinArtists));
  assert.ok(!looksSpanish(song('Shawn Mendes', 'Señorita', 'Señorita'), latinArtists));
  assert.ok(!looksSpanish(song('Rihanna', 'Te Amo', 'Rated R'), latinArtists));
  assert.ok(!looksSpanish(song('A Touch Of Class', 'Around the World (La La La La La)', 'Planet Pop'), latinArtists));
});

test('an accent in the album or artist name is not evidence about the song', () => {
  assert.ok(!looksSpanish(song('Beyoncé', 'XO', 'BEYONCÉ [Platinum Edition]'), new Set(['beyoncé'])));
});

test('French is not Spanish', () => {
  assert.ok(!looksSpanish(song('Angèle', 'Dis-le', 'Instinct'), latinArtists));
  assert.ok(!looksSpanish(song('Angèle', 'Tout décider', 'Instinct'), latinArtists));
  assert.ok(!looksSpanish(song('TeddyBear', 'Le Plus Beau', 'Le Plus Beau'), latinArtists));
  assert.ok(!looksSpanish(song('Adèle Castillon', 'Été avec toi', 'Été avec toi'), latinArtists));
});

test('Spanish songs by Latin artists still leave Pop', () => {
  assert.ok(looksSpanish(song('KAROL G', 'EL MAKINON', 'KG0516'), latinArtists));
  assert.ok(looksSpanish(song('ROSALÍA', 'Con Altura (feat. El Guincho)', 'Con Altura'), new Set(['rosalía'])));
  assert.ok(looksSpanish(song('Lali', 'Bailo Pa Mí', ''), new Set(['lali'])));
});

test('an artist who sings almost only in Spanish is Spanish whatever the title says', () => {
  const spanishOnly = new Set(['peso pluma', 'bad bunny']);
  assert.ok(looksSpanish(song('Peso Pluma', 'LADY GAGA', 'GÉNESIS'), latinArtists, spanishOnly));
  assert.ok(looksSpanish(song('Bad Bunny', 'NUEVAYoL', ''), latinArtists, spanishOnly));
  assert.ok(!looksSpanish(song('Bad Bunny', "I Like It (with Cardi B)", ''), latinArtists, spanishOnly), 'unless the title is clearly English');
});

test('a crossover artist still needs evidence: their English hits stay', () => {
  const spanishOnly = new Set(['peso pluma']);
  assert.ok(!looksSpanish(song('Pitbull', 'Timber (feat. Ke$ha)', 'Global Warming'), latinArtists, spanishOnly));
  assert.ok(!looksSpanish(song('Camila Cabello', 'Havana (feat. Young Thug)', 'Camila'), new Set(['camila cabello']), spanishOnly));
});

test('who counts as singing almost only in Spanish', () => {
  const spanishList = [
    ...Array.from({ length: 6 }, (_, n) => song('Peso Pluma', `Corrido ${n}`)),
    ...Array.from({ length: 5 }, (_, n) => song('Pitbull', `Canción ${n}`)),
    song('Beyoncé', 'Irreemplazable'),
  ];
  const pop = [
    song('Pitbull', 'Hotel Room Service'),
    song('Pitbull', 'I Know You Want Me'),
    song('Peso Pluma', 'LADY GAGA'),
    song('Beyoncé', 'Halo'),
  ];
  const found = spanishOnlyArtists(spanishList, pop);
  assert.ok(found.has('peso pluma'));
  assert.ok(!found.has('pitbull'), 'five Spanish songs against two clearly English ones is crossover');
  assert.ok(!found.has('beyoncé'), 'one Spanish song is not enough');
});

test('two Spanish songs and no English ones is enough', () => {
  const found = spanishOnlyArtists(
    [song('Peso Pluma', 'dopamina'), song('Peso Pluma', 'BELLAKEO'), song('Selena Gomez', 'Taki Taki'), song('Selena Gomez', 'Baila Conmigo')],
    [song('Peso Pluma', 'LADY GAGA'), song('Selena Gomez', 'Come & Get It')],
  );
  assert.ok(found.has('peso pluma'));
  assert.ok(!found.has('selena gomez'), 'she has English hits in Pop');
});
