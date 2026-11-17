# Melodle — current state

Updated 2026-09-21. This file tracks what is *done*, what is *unverified*, and
what comes next. It changes as work progresses.

- How to work in this repo, the constraints and the gotchas: `CLAUDE.md`
  (loaded automatically each session)
- How to run and use it: `README.md`
- Why the architecture is shaped this way, eleven decisions: `docs/DESIGN.md`

About 6,400 lines across `server/`, `src/`, `shared/`. 70 tests, all passing.

---

## Built and verified in a browser

- Daily and endless modes, five stages, skip, reveal, share text
- Sources: charts (global + 11 genres), decades (70s–20s), Last.fm history
- Accounts (register, login, logout), server-side stats, ratings, round history
- Party mode: create, join by code, round-robin blend, per-song attribution
- Like / dislike, with a dislike removing a song from your rotation
- Artist search returning up to 7 of that artist's songs in pool order
- Opening / Hook toggle: where each round's 15 second window starts
- Installable on iPhone from Safari (web manifest, Apple icons, standalone)
- Mobile: no overflow at 360 and 390px, 44px touch targets, bottom sheets
- The production build under its CSP: audio decode, fonts and waveform all fine

## Pools and difficulty (2026-09-26)

- **Bigger pools.** Charts now add Deezer editorial playlists for the genre on
  top of the 100-song chart (`server/providers/editorial.ts`, shared with
  decades). Measured live: global 406, rock 330, hip hop 379, 80s 302, 10s 352.
  History sources resolve up to 200 songs, parties 80 per member.
- **The song count is no longer shown** anywhere on the page.
- **Difficulty 1-5**, per browser in the saved settings. A correct endless guess
  moves it up one step, and a win at 5 starts over at 1; a miss holds it. A lock
  toggle beside the pips freezes it either way. Endless picks from
  `difficultyBand`: the pool sorted by Deezer `rank`, a 40% window sliding from
  the biggest hits (1) to the deep cuts (5). The song of the day neither uses nor
  moves it.
- **Mixing genres and decades** (`shared/blend.ts`): chips toggle, and "Play
  these N" asks for the `blend` source, variant `charts:152,decades:1980s`
  (sorted, so the same picks share a song of the day). The server interleaves
  the parts round-robin, at most 8. Rock + The 80s is 673 songs.
- **Arcade look.** Press Start 2P marquee, Pixelify Sans headings, VT323 text,
  CRT scanlines and vignette, a synthwave floor, the waveform as a bezelled
  screen. The page heats with difficulty: `data-difficulty` on `<html>`
  redefines the same tokens in `tokens.css`, purple at 1 to red at 5, with the
  phone status bar following. `test/palette.test.ts` checks contrast at every
  level. The song of the day stays purple.
- **Search with covers.** The guess list holds up to 40 matches and scrolls:
  every title that starts with the query, then each matching artist's whole
  catalogue in the pool, then looser matches. Each row has a 48px cover fetched
  at 96px (`shared/artwork.ts` rewrites Deezer and Apple URLs; ~3 kB instead of
  37 kB) or a pixel-note stand-in. The reveal shows the full cover at 128px
  (96px on phones), framed green for a win and red for a loss. Checked live:
  "love" lists 28 songs, Beyoncé 15 of 15 in a six-list mix.
- **One picker model** (`shared/selection.ts`): genres and decades mix; a
  history choice or party stands alone and toggles off again; Global hits means
  "no genre filter" and is lit whenever no genre is picked. The sheet mounts
  only while open, so it always starts from what is playing.
- **Genres narrow decades** (`server/providers/crossed.ts`): rock with the 10s
  is rock from the 2010s, every genre x decade pair, merged round-robin. Built
  from playlists whose title names the genre and that one decade (no other).
  Deezer's editorial ones are trusted; users' ones only top up and each song
  must pass a release-year check (`yearFits`: never before the decade; after it
  only from the 2000s on, and for older decades not in the very next decade,
  since later dates there are reissues). Sampled: 2010s/2020s pairs 20/20 in
  decade. Cold build of a pair ~30s, then cached.
- **Deezer rate window** (`RateWindow` in `server/lib/http.ts`): 40 calls per
  5s, plus a retry on Deezer's 200-with-quota-error. Without it, bigger pools
  and date checks silently emptied lists.
- **Persistent caches** (`server/lib/diskcache.ts`, table `cache`): song lists
  (charts 6h, decades and pairs 24h) and release years (a year) survive
  deploys. Empty results are never kept.
- **Bigger pools:** global 767, 80s 481 (were 406 and 302).
- **No repeats:** endless remembers played songs by artist+title in
  localStorage (8000 max) and picks unplayed ones, band first, then anywhere in
  the pool; it starts over only when everything is played. 40 rounds from a
  149-song pool, no repeat. Per device, not per account.
- **Search reaches all of Deezer** (`/api/search`, cached an hour): Deezer's
  order first, pool-only matches after, one entry per song.
- **Headings are Jersey 10:** Pixelify Sans drew 2, 5 and 8 almost alike.
- **Clip start still cannot be a song's real opening.** Measured Apple previews
  too (Teen Spirit, Billie Jean, Hotel California...): first 3s within ~1 dB of
  the clip's average, so they are mid-song like Deezer's. See next steps.
- **Pick, then guess.** A click or Enter on a result only selects it (shown in
  the field with its cover); Guess or a second Enter sends it. Songs already
  guessed this round (by artist+title, `isGuessed`) are listed, tagged
  "Guessed", aria-disabled and refused by `useGame.guess` as well.
- **Skipping mid-clip keeps playing:** `AudioEngine.extend` moves the scheduled
  stop and the fade-out later while the clip sounds (start() no longer takes a
  duration, so the end stays movable); a skip or wrong guess calls it.
- **Difficulty pips are buttons:** tap one to set the level; the lock remains.
- **One-handed phone layout** (≤34rem, `useMediaQuery` in `src/lib/viewport.ts`):
  a fixed dock (`Dock.tsx`) holds the guess field, Skip/Next and Play, with a
  tab bar (Songs, Level, Record, You) replacing the masthead icons. Results open
  upward, best match nearest the thumb. The dock rides above the keyboard
  (`--keyboard-inset` from visualViewport; `interactive-widget=resizes-content`
  for Android) and publishes `--dock-height` so the page leaves room. Tabs hide
  only while the field is focused; dock buttons keep focus where it was and a
  guess blurs the field, because a focus change mid-tap moved Skip out from
  under the finger (caught in testing). Sheets close on a backdrop tap. Desktop
  is unchanged. Mode toggle (Song of the day / Endless) stays at the top: rare.
- **Difficulty picker** (`DifficultySheet.tsx`, Level tab or the "Difficulty"
  label): the five levels named (`DIFFICULTY_LEVELS`) and described, plus "move
  up a level" / "stay on this level" (the lock).
- **No alternate versions as answers** (`shared/versions.ts`, applied to every
  pool in the /pool route): remixes, other named mixes (not Radio/Original/7"/
  Single Mix), extended, acoustic, stripped, unplugged, live, instrumental,
  karaoke, sped up/slowed, re-recorded, tribute acts. Deezer hides the version
  in `title_version` (now kept as `Track.version`); remix singles show only in
  the album name; a "Remix EP" album also holds the original, so it does not
  count. Audited on four real lists: 117 removed, one false positive found and
  fixed (an album titled "...Live In Anymore"). Hits that only exist as a remix
  or live take (Seeb's Ibiza, Live Is Life) go too, by request.
- **Popularity floor** (`knownTracks`, `POPULARITY_FLOOR = 300k`): curated lists
  (charts, decades, mixes) pick only songs above it, for every level, the
  fallback and the song of the day; history and parties keep their deep cuts.
  Level 5's bottom went from 28-187k to 301-338k (Tumbling Dice, Little Red
  Corvette, Is It Any Wonder?). Search still covers everything.
- **Spanish is its own genre** (id 197, Deezer's Latin chart, labelled "Spanish",
  after Pop): the chart plus Spanish-language playlists (including regional
  mexicano, corridos, rock en español), minus anything clearly in another
  language. **Pop sheds its Spanish songs** (`withoutSpanish`), as does Pop
  within a decade. Deezer gives no song language, so `shared/language.ts`
  judges from words: Spanish words and title accents for, English words
  against, French and Portuguese kept apart; distinct words once; album words
  at half and only if not already in the title. An artist on the Spanish list
  may be judged on an album; one who sings almost only in Spanish
  (`spanishOnlyArtists`) on anything short of a clearly English title. Checked
  against all 239 songs actually played from Pop: the 5 Spanish ones (incl.
  Peso Pluma's "LADY GAGA") go, English hits by Latin artists (Hips Don't Lie,
  Havana, Hero) stay. There is no K-pop genre; Deezer only has "Asian Music".
- **Reliability (2026-11-15).** The round in progress is saved on every change
  (`src/game/resume.ts`, storage key `round`, answer included) and brought back
  after a reload, a crash, or a phone dropping the tab, with a 6s notice, before
  and independent of the song list loading. An `ErrorBoundary` replaces the
  blank page with a reload button; `src/lib/report.ts` posts render errors and
  unhandled rejections to `POST /api/client-log` (60/min cap, truncated), so a
  blank screen on a phone can be explained from the server log. Requests time
  out (20s; song lists 120s with one retry); the list request can be retried
  from the error panel; a slow first build says so after 6s. The audio engine
  replaces a closed context and resumes an interrupted one; on return to the
  foreground a missing clip is fetched again.
- **Speed.** `/api` JSON above 1 kB is brotli/gzip compressed in
  `server/lib/compress.ts` (global hits: 235 kB to 49 kB); the preview URL is
  stripped from list payloads; lists carry `max-age=600`; the next song's
  preview is prefetched during the reveal; `server/lib/warmup.ts` builds every
  main list after each start (about a minute, in the background).
- **Languages as tags** (`shared/language.ts`, `server/providers/languages.ts`,
  `facets.ts`): Korean, Japanese, Spanish, French, German, Italian, Portuguese,
  Dutch, picked alongside genres and decades (`lang:xx` parts, MAX_BLEND 10).
  Each language's list is Deezer's chart for it plus playlists titled for it
  (and for its genres), minus clearly-other-language titles and English-chart
  acts with English titles. **The main lists are English only**: `englishOnly`
  drops anything the lists or the words of a title place elsewhere (artist on
  a list + a little evidence; unlisted + a clearly foreign title; Korean and
  Japanese by artist alone, so BTS's Dynamite is Korean). **A language adds
  its songs on top of the pick and never narrows it** (owner's rule,
  2026-11-16): Rock + Korean is English rock plus K-pop; genres and decades
  still narrow each other. Labels read "Rock + Korean", "Pop · The 10s +
  Korean". Each act is kept on the one language list where it has the most
  songs (`belongsToList`), so J-pop that strays onto K-pop playlists stays
  Japanese. **29 languages** (2026-11-17; Lithuanian added the same day): Arabic, Chinese, Czech, Danish,
  Dutch, Filipino, Finnish, French, German, Greek, Hindi, Hungarian,
  Indonesian, Italian, Japanese, Korean, Lithuanian (826 songs, all from user
  playlists: Deezer has no editorial ones), Norwegian, Polish, Portuguese,
  Punjabi, Romanian, Russian, Spanish, Swedish, Thai, Turkish, Ukrainian,
  Vietnamese; chips alphabetical. Non-Latin scripts settle a language on sight
  (Ukrainian letters win over Russian); Chinese, Hindi, Punjabi and Thai are
  scenes like Korean and Japanese. Lists of 255-970 songs (Hungarian 97). A
  small market's list keeps its most popular 60% when few songs pass the 300k
  floor. English acts that turn up on foreign playlists stay English: an
  occasional act needs a real word or letter of the language in the title
  (album names do not count for them), and the single-language check reads
  every English list. Known miss: The Corrs' "Summer Sunshine" counts as
  Filipino (OPM playlists carry them, and nothing in the title is English). The old Spanish genre
  (`charts:197`) maps to `lang:es`. **Global hits is an ordinary pick** that
  mixes with genres (chips are plain toggles); nothing picked still means
  global hits. Measured after the last build: Pop has no songs by
  foreign-language acts; a 1,340-song English global+rock mix kept 2 foreign
  titles; the language lists keep a few English titles by lesser-known acts.
  Korean 528 songs, German 720, French 518, Italian 520, Korean · Pop 439,
  Korean · Pop · The 10s 273; cold builds 3-10s, then on disk.
- Verified by driving the deployed build in headless Chromium, twice from a cold
  restart: every difficulty rule, the lock, the reds at each level, the purple
  song of the day, a genre+decade mix, fonts loading, no overflow at 390px.

## Built but never run against the live service

**Spotify.** No client ID or secret on this machine, so "Your mix", the OAuth
round trip, and a Spotify member in a party have never touched live Spotify. The
ranking logic is unit-tested and the plumbing is the same code Last.fm and
parties exercise, but that is not the same as working. Add keys in the setup
panel and verify. *Highest-value gap.*

**YouTube Music.** Same, no Google client ID or secret. `parseVideo` is tested
against fixtures only.

**The APK on a real device.** This machine has no usable hardware
virtualisation, so no emulator, and there was no phone. What *was* checked: the
launcher extracted from the built APK and driven in Chrome (first run, bad
address, wrong port, a server that is not Melodle, a bare IP defaulting its
port, and the saved-address reconnect), the manifest, SDK levels, permissions
and signing, and the LAN server serving over its real IP via curl. Installing
and opening it is unverified.

The APK currently on the Desktop as `Melodle.apk` is debug-signed, 4.7 MB,
Android 6+, `INTERNET` as its only real permission.

## Credentials

`.env` is gitignored. Keys go in through the app's own setup panel. On a
development server that writes `.env` and answers only to localhost. On the
deployed server it answers only to an admin (`ADMIN_USERS=abyss`, else the
first account) and stores keys sealed in the `server_keys` table, which then
outranks `.env` at startup (`server/lib/keys.ts`). Every user then links their
own Last.fm, Spotify or YouTube account with the Link buttons.

| Key | State |
|---|---|
| `LASTFM_API_KEY` | set and working (`abyssosque`, ~138k scrobbles) |
| `SESSION_SECRET` | set — see the warning in `CLAUDE.md` before changing it |
| `SPOTIFY_CLIENT_ID` / `_SECRET` | empty |
| `GOOGLE_CLIENT_ID` / `_SECRET` | empty |

`npm run start:lan` binds to every interface so a phone can reach it. Windows
currently classifies this Wi-Fi as *Public*. Accounts are password-protected and
the setup panel stays loopback-only, but plain `npm start` is localhost if you
would rather.

## Next up

1. **Verify Spotify end to end** once keys exist.
2. **The curation algorithm.** The `rounds` table already records every finished
   round with the stage it was solved at, per user — that is the raw material,
   and nothing infers difficulty from it yet, deliberately. Obvious first moves:
   weight a song down once you have solved it early several times, and use
   stage-solved as a difficulty score to balance a party's pool.
3. **Verify the APK on a phone**, then decide whether a release-signed build is
   worth it.
4. Optional: YouTube Music verification, a release keystore.
5. **YouTube is refusing song starts (2026-11-08):** "Sign in to confirm you're
   not a bot" for this home's address, every client, latest yt-dlp too. It made
   each new song wait ~12s for three doomed attempts before the preview. Now a
   bot refusal stops at once and pauses song starts for 30 min
   (`SONG_START_PAUSE_MS`), so players get the preview immediately; stored
   openings (363) still play; the client also falls back after 12s whatever
   happens. Retried automatically every 30 min. Routing around the block (the
   home's IPv6 was still served) was deliberately not done: it is bot-check
   circumvention. Owner's options: wait it out, or decide on something else.
   **Song start from YouTube** (ADR-14), for the accounts in
   `SONG_START_USERS` only (`abyss,NotKloudie`; empty would mean every signed-in
   account). `/me` reports `songStart`, so everyone else sees "Clip start". Verified: nine known openings
   right by loudness, 12/12 chart songs fetched through the real route in 7-9s,
   about 1 transient failure in 22 (falls back to the preview, says so). Next
   ready in ~0.3s thanks to prefetch. If YouTube breaks yt-dlp, redeploy.

## Sharing it

- `scripts/serve-always.cmd` keeps the server up and restarts it; a Startup
  shortcut runs it at logon. Log: `%LOCALAPPDATA%\Melodle\server.log`.
- `scripts/share.cmd` opens a Cloudflare quick tunnel for friends who are not on
  the Wi-Fi. New address each run, on demand only.
- `INVITE_CODE` in `.env` is `blackpink` (case-insensitive), so account creation needs it. Clear it to go
  back to open sign-up.
- iPhones: open the address in Safari, Share, Add to Home Screen.

## Hosting

**Live on the home Linux box (2026-09-26).** The project moved from Windows to
Linux Mint; the `.cmd` scripts are Windows-only history. `scripts/deploy.sh`
builds the image and runs the `melodle` container on port 8787 with
`--restart unless-stopped`; the docker service is enabled at boot, so it comes
back after a reboot. Data is in the `melodle_data` volume. `.env` is passed with
`--env-file` (plain KEY=value, no quotes) and has a fresh `SESSION_SECRET` and
`INVITE_CODE`. The Last.fm key did not come across from Windows — add it to
`.env` and rerun `scripts/deploy.sh` (the setup panel is off in production).

The image is two-stage: build + typecheck + precompress, then a runtime with
only express, run by plain `node` (Node 24 strips the types). 184 MB, ~30 MB RAM.
Hashed assets are served as precompressed brotli/gzip with a one-year immutable
cache: 280 kB of client down to 75 kB on the wire.

**Public at https://melodle.tailc19105.ts.net (2026-10-10).**
Tailscale Funnel (machine renamed `melodle`; `tailscale funnel --bg 8787`, persisted by tailscaled, operator
`abyss`) gives a fixed https address with a real certificate, independent of the
home IP and the router. `PUBLIC_ORIGIN` in `.env` is that address, so session
cookies are `Secure`: sign-in no longer sticks over the plain-http LAN address,
use the https one everywhere. The site serves the APK at `/melodle.apk` with
that address built in (`scripts/build-apk.sh`, then `scripts/deploy.sh`), and a
bare domain typed into the launcher is treated as https. Verified over the
public path (public DNS to Tailscale's ingress): page, pool, audio, APK,
cookie, and a full round in headless Chromium.
The laptop: Cinnamon does not sleep on lid close or idle, and
`/etc/systemd/logind.conf.d/melodle.conf` ignores the lid when logged out.
Every visitor reaches the server from one address through the proxy; the login
throttle is keyed by address and username, so it still works per account.

`Dockerfile` + `fly.toml` are written and the image is verified locally: builds,
serves, streams audio, invite gate active, and an account created in one
container survives the container being destroyed and recreated against the same
volume (and is correctly absent without it).

Not deployed. `fly auth login` needs a real account and probably a card, which
is the user's to create. Everything up to that point is done.

Watch for after the first deploy: Deezer and Apple may treat a datacenter IP
differently from a home one (rate limits, region), so check that pools still
resolve previews once it is live.

## Known limits

- **No iOS app bundle.** Building one needs macOS and Xcode; putting it on other
  people's iPhones needs an Apple Developer account. iPhones use the PWA route
  instead: Safari, Share, Add to Home Screen. Since the APK is itself just a
  WebView onto the server, the two are the same experience.
- **Campus Wi-Fi blocks it.** Thomas More's network isolates clients, so a phone
  cannot reach a laptop on it. A phone hotspot works, and is what was verified.
- **A song's actual intro cannot be played.** Previews are excerpts cut from the
  middle of a track, measured at 87-111% of their own average loudness in the
  first two seconds. "Clip start" is the start of the excerpt, not the song.
- **The public address is ephemeral.** Cloudflare quick tunnels get a new
  hostname every start. A stable one needs a Cloudflare account and a domain.
