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

`.env` is gitignored. Keys go in through the app's own setup panel, which writes
`.env` and only answers to localhost — not by hand.

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

## Sharing it

- `scripts/serve-always.cmd` keeps the server up and restarts it; a Startup
  shortcut runs it at logon. Log: `%LOCALAPPDATA%\Melodle\server.log`.
- `scripts/share.cmd` opens a Cloudflare quick tunnel for friends who are not on
  the Wi-Fi. New address each run, on demand only.
- `INVITE_CODE` in `.env` is set, so account creation needs it. Clear it to go
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

**Public at https://eternity-and-epilogue.tailc19105.ts.net (2026-10-10).**
Tailscale Funnel (`tailscale funnel --bg 8787`, persisted by tailscaled, operator
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
