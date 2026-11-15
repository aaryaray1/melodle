import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isAlternateVersion } from '../shared/versions.ts';

const song = (title: string, extra: { version?: string; album?: string; artist?: string } = {}) => ({
  title,
  artist: extra.artist ?? 'Artist',
  version: extra.version,
  album: extra.album,
});

test('remixes are caught from the version Deezer keeps apart from the title', () => {
  assert.ok(isAlternateVersion(song('Midnight City', { version: '(Trentemoller Remix)', album: 'Midnight City (Remix EP)' })));
  assert.ok(isAlternateVersion(song('SLICK', { version: '(Remix)' })));
  assert.ok(isAlternateVersion(song('Levels (Skrillex Remix)')), 'or from the title itself');
  assert.ok(isAlternateVersion(song('Titanium', { version: '(Extended Mix)' })));
  assert.ok(isAlternateVersion(song('One More Time', { version: '(Club Mix)' })));
});

test('the original on a remix EP is still the original', () => {
  assert.ok(!isAlternateVersion(song('Midnight City', { version: '', album: 'Midnight City (Remix EP)' })));
  assert.ok(!isAlternateVersion(song('Strobe', { version: '(Original Mix)' })), 'EDM calls the original that');
});

test('acoustic, live, instrumental and karaoke versions are all caught', () => {
  assert.ok(isAlternateVersion(song('Wonderwall', { version: '(Acoustic)' })));
  assert.ok(isAlternateVersion(song('Shallow', { version: '(Live)' })));
  assert.ok(isAlternateVersion(song('Psycho Killer', { album: 'Stop Making Sense (Live)' })), 'a live album');
  assert.ok(isAlternateVersion(song('Rock the Casbah', { album: 'Live in London' })));
  assert.ok(isAlternateVersion(song('Come As You Are', { album: 'MTV Unplugged in New York' })));
  assert.ok(isAlternateVersion(song('Halo - Instrumental')));
  assert.ok(isAlternateVersion(song('Someone Like You', { version: '(Karaoke Version)' })));
  assert.ok(isAlternateVersion(song('Blinding Lights', { version: '(Piano Version)' })));
  assert.ok(isAlternateVersion(song('Creep', { version: '(Stripped)' })));
});

test('sped up, slowed and other edits are caught, and so are re-recordings and tribute acts', () => {
  assert.ok(isAlternateVersion(song('Die For You', { version: '(Sped Up)' })));
  assert.ok(isAlternateVersion(song('Snowfall', { version: '(Slowed + Reverb)' })));
  assert.ok(isAlternateVersion(song('Why You Treat Me So Bad', { version: '(Re-Recorded / Remastered)' })));
  assert.ok(isAlternateVersion(song('Only God Knows Why', { artist: 'The Tribute Crew' })));
});

test('ordinary releases are kept', () => {
  for (const [title, extra] of [
    ['Get Lucky', { version: '(Radio Edit)', album: 'Get Lucky (Radio Edit - feat. Pharrell Williams)' }],
    ['...Baby One More Time', { album: '...Baby One More Time (Digital Deluxe Version)' }],
    ['Bohemian Rhapsody', { version: '(Remastered 2011)' }],
    ['Owner of a Lonely Heart', { album: '90125 (Deluxe Version)' }],
    ['Animal', { album: 'Habits (International Version)' }],
    ['Love Story', { version: "(Taylor's Version)" }],
  ] as const) {
    assert.ok(!isAlternateVersion(song(title, extra)), `${title} is a normal release`);
  }
});

test('a song whose own name contains one of the words is not mistaken for a version', () => {
  assert.ok(!isAlternateVersion(song('Live Forever')));
  assert.ok(!isAlternateVersion(song('Live and Let Die')));
  assert.ok(!isAlternateVersion(song('Acoustic #3')));
  assert.ok(!isAlternateVersion(song('Cover Me Up')));
  assert.ok(!isAlternateVersion(song('Smells Like Teen Spirit', { album: 'Live Through This' })), 'a studio album named Live...');
});

test('a remix released as its own single is caught from the album, a remix EP is not', () => {
  assert.ok(isAlternateVersion(song('Starlight', { album: 'Starlight (Skrillex & ring noord Remix)' })));
  assert.ok(isAlternateVersion(song('SLICK', { album: 'SLICK (Remix)' })));
  assert.ok(isAlternateVersion(song('Where Do We Go', { album: 'Where Do We Go (Peggy Gou Remix)' })));
  assert.ok(!isAlternateVersion(song('Sonnentanz', { album: 'Sonnentanz (Remix EP)' })), 'an EP of remixes also holds the original');
  assert.ok(!isAlternateVersion(song('Midnight City', { album: 'Midnight City (Remixes)' })));
});

test('named mixes are versions; the single and the original mix are not', () => {
  assert.ok(isAlternateVersion(song('Vois sur ton chemin', { version: '(Techno Mix)' })));
  assert.ok(isAlternateVersion(song('Never Ending Story', { version: '(12" Mix)' })), 'the extended 12-inch');
  assert.ok(isAlternateVersion(song('Sparks', { version: '(Remixed Album Version)' })));
  assert.ok(!isAlternateVersion(song('You Spin Me Round (Like A Record)', { version: '(Original 7" Mix)' })));
  assert.ok(!isAlternateVersion(song('Call on Me', { version: '(Radio Mix)' })));
  assert.ok(!isAlternateVersion(song('Strobe', { version: '(Single Mix)' })));
});

test('live albums are told apart from album titles that merely use the word', () => {
  assert.ok(!isAlternateVersion(song("The House That We Don't Live In Anymore", { album: "The House That We Don't Live In Anymore" })));
  assert.ok(isAlternateVersion(song('Behind Blue Eyes', { album: 'The Who With Orchestra: Live At Wembley' })));
  assert.ok(isAlternateVersion(song('Whatever You Want', { album: 'Aquostic! Live at the Roundhouse' })));
  assert.ok(isAlternateVersion(song('Love Will Find A Way', { album: "It's Good to Be Live" })));
});

test('a named mix released alone is caught from the album too', () => {
  assert.ok(isAlternateVersion(song('I Feel So Free', { album: 'I Feel So Free (Peggy Gou Energy Mix)' })));
  assert.ok(!isAlternateVersion(song('Call on Me', { album: 'Call on Me (Radio Mix)' })));
});
