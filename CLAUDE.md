# Melodle

Guess a song from 0.1s, then 0.5s, 2s, 8s, 15s. Songs come from charts, a
decade, a genre, your own listening history, or a party of several people's
histories. React + TypeScript (Vite) over Node + Express, SQLite for accounts,
plus an Android APK that is a thin client onto the server.

**Current state, credentials and next steps: `HANDOFF.md`.**
**Why the architecture is shaped this way: `docs/DESIGN.md`.**

## Commands

```bash
npm run dev          # API on 8787, app on 5173, both watching
npm run check        # typecheck all three tsconfigs, then the tests
npm run start:lan    # production build on every interface, for the phone
npm run apk          # rebuild the Android APK
```

`npm run check` is the gate. Green before anything is called done.

An always-on copy of the server runs from `scripts/serve-always.cmd`, launched by
a Startup-folder shortcut and logging to `%LOCALAPPDATA%\Melodle\server.log`.
It holds port 8787, so stop it before starting `npm run dev`.

`scripts/share.cmd` opens a public Cloudflare tunnel for remote players. It is
on demand, never at logon. `INVITE_CODE` in `.env` gates account creation and
should stay set whenever that tunnel is used.

## Layout

```
server/
  app.ts            express app (exported so tests can boot it)
  index.ts          listen + process guards
  lib/db.ts         SQLite schema (node:sqlite, no native build)
  lib/secrets.ts    scrypt passwords, AES-256-GCM token sealing
  lib/session.ts    signed httpOnly cookie over a sessions row
  lib/preview.ts    Deezer/iTunes preview matching + safeUrl
  providers/        one file per song source
  routes/           catalogue, account, auth, party, setup, audio
src/
  audio/engine.ts   the Web Audio engine
  audio/scale.ts    log timeline, waveform peaks, opening + hook detection
  game/useGame.ts   round state
  game/search.ts    guess autocomplete (artist blocks)
  styles/app.css    responsive overrides MUST stay at the end
shared/             types + text matching used by both sides
android-shell/      the single page inside the APK
```

## Constraints that shaped this — do not undo without reading DESIGN.md

**No music provider gives both history and audio.** Spotify removed
`preview_url` for new apps in Nov 2024; YouTube has no audio API. Providers
supply track metadata only; a 30s preview is matched from Deezer (Apple Music as
fallback). Deezer needs no key and allows ~50 req/5s; iTunes Search is ~20/min,
which is why it is the fallback. Do not reach for the Spotify Web Playback SDK.
Do not make iTunes primary.

**Audio is Web Audio, never `<audio>`.** A 100ms clip through an audio element
lands between 80 and 250ms with a click at each end. The preview is decoded once
and each snippet scheduled on the audio clock with a short fade. Measured
sample-accurate: 0.02 ms drift at every stage.

**Spotify has no recommendations endpoint for new apps.** "Your mix" is our own
blend of what is still exposed. `rankMix` is the pure, tested half.

**Decades come from Deezer editorial playlists, not Last.fm tags.** `tag=80s`
returns what users tagged, which skews obscure. A playlist only counts if its own
title names that decade, or "20s hits" drags in 00s playlists.

**The APK is a launcher, not the app.** It asks for a server address and hands
the WebView to that origin, so the phone runs the real site same-origin and
cookies keep working. `/api/ping` is the only CORS-enabled route.

## Gotchas that already cost a debugging cycle each

**Responsive CSS stays at the end of `app.css`.** Media queries are plain
selectors, not a cascade layer. Put the mobile block above the components and
`.rate { flex-direction: column }` silently beats the narrow-screen override.

**Never put side effects in a React state updater.** `saveProgress` and
`setStats` inside `setRound` ran twice and double-counted every result.

**The audio proxy owns its stream lifecycle.** An abandoned download once killed
the process 20s later: nothing cancelled the upstream fetch, and the timeout
spanning the body errored a stream with no listener.

**Errors must not echo upstream bodies.** `UpstreamError` carries a user-facing
`message` and a separate `detail` that only reaches the log. The Last.fm key
travels in a query string, so `fetchJson` strips the query before logging.

**Node's type stripping rejects TypeScript parameter properties.** Assign fields
explicitly in constructors or `npm test` will not run the file.

**`android/local.properties` needs forward slashes.** Java properties eat single
backslashes; Gradle then fails with "filename, directory name, or volume label
syntax is incorrect", which names nothing useful.

**Changing `SESSION_SECRET` makes every stored provider token undecryptable**
and forces everyone to relink.

**Previews are excerpts from the middle of a track, not its beginning.**
Measured across six 80s hits: the first two seconds sit at 87-111% of the
preview's own average loudness, so Billie Jean's quiet intro simply is not in
the file. "Clip start" therefore means the start of the excerpt. Do not promise
a song's intro; the audio does not exist to play.

**Deezer preview URLs expire after about fifteen minutes.** Never cache one and
serve it later — pools are cached for hours, so the URL inside is usually dead.
The client asks for audio by track id (`/api/audio?track=deezer:123`) and the
server resolves a fresh URL just before streaming. This is also why the client
never names a URL to the proxy.

**A backgrounded Chrome tab does not run `requestAnimationFrame`.** The waveform
canvas freezes, so canvas pixel checks in automation silently return the last
painted frame — identical readings across different songs is the tell. Force a
paint (take a screenshot) before measuring.

**Bash heredocs here eat one level of backslash.** `\\n` inside a
`python - <<'PY'` heredoc becomes a real newline and corrupts regex literals.
Use the Write/Edit tools for anything with escapes.

## How this project is tested

`npm run check` = typecheck (client, server, test) + `node --test`. Plain
`node:test` against pure functions, plus one suite that boots the real express
app on a random port. No test framework, no mocking library.

When a bug is found, write the test that fails against the broken code **and
prove it fails** before fixing. Two tests in `test/proxy.test.ts` exist in their
current form because the first two attempts passed against the broken version
and were therefore worthless.

Verify in the browser by driving the real app and asserting on DOM and canvas
pixels, not by eyeballing screenshots — JPEG artifacts at small scale have
already produced one false alarm about the waveform.
