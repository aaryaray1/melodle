# Melodle

Name the song from a tenth of a second. If you can't, you get half a second, then
two, then eight, then fifteen — and then it's over. Five attempts, five lengths.

Pick where the songs come from: what is charting right now, a whole decade, a
genre, or your own listening history from Last.fm, Spotify or YouTube Music.
It works the moment you start it, with no account and no keys.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. That's it — no keys needed to play.

For a production run, `npm run build` then `npm start`, which serves the built
app and the API together on port 8787.

## Where the songs come from

Open **Where your songs come from** (the pill in the top right). Three groups:

- **Popular now** — the global chart, or any of eleven genres.
- **By decade** — the 70s through the 20s, built from Deezer's editorial
  decade playlists, so you get Billie Jean rather than a deep cut.
- **From your history** — Last.fm, Spotify or YouTube Music.
- **Party** — everyone who joins with the code adds their own listening.

### Your mix (Spotify)

Spotify withdrew its recommendations endpoint from new apps in late 2024, so
"Your mix" is Melodle's own blend of what Spotify still exposes: your top
tracks over three time ranges, what you played lately and what you saved, each
weighted by list *and* by rank inside that list. It then pulls a few well-known
songs by the artists that dominate all of it, which is where the surprises come
from. `test/party.test.ts` pins the ranking.

### Party

One person creates a party and shares the five-character code. Everyone else
joins with it, and the pool is dealt round-robin from each member's history, so
with four people every fourth song is yours rather than the first quarter of the
game. After the reveal, the card says whose library the song came from.

A party needs an account per person, and each person needs a linked service to
contribute. Members without one can still play; they just add no songs.

## Accounts

Playing needs no account. An account gets you three things: your stats follow
you between browsers, your liked and disliked songs are remembered, and you can
link a music service.

Passwords are hashed with scrypt and a per-account salt. Provider tokens are
sealed with AES-256-GCM before they touch the database, using a key derived from
`SESSION_SECRET`. The browser never holds a provider token.

## Linking a music service

Sign in first, then use the setup panel. Server keys are written to a `.env`
file next to the server and never leave the machine. Only a browser on that same
machine can change them.

| Service | What you need | Where to get it |
|---|---|---|
| Last.fm | An API key, then type your username | <https://www.last.fm/api/account/create> |
| Spotify | Client ID and secret | <https://developer.spotify.com/dashboard> |
| YouTube Music | Google OAuth client ID and secret, YouTube Data API v3 enabled | <https://console.cloud.google.com/apis/credentials> |

Spotify and Google both need a redirect URI registered in their dashboard. The
setup panel shows the exact one to paste, with a copy button.

Last.fm only reads public scrobbles, so it needs a username rather than a login.

## How it plays

**Song of the day** picks one track from the chosen list using the date, so the
same list gives everyone the same song and your progress survives a refresh.
**Endless** keeps dealing new ones.

After a round, thumb the song up or down. A thumbs down takes it out of your
rotation for good; a thumbs up is recorded for the song-picking work to come.
Every round is written to a `rounds` table with the stage you solved it at,
which is the raw material that curation will run on.

Guess from the dropdown, or skip to unlock the next length. Space plays, `/`
jumps to the search box, Enter locks in a guess.

Each round can open at the **clip start** or at the **hook**, the loudest
stretch. Worth knowing: previews are 30 second excerpts cut from the middle of a
track, so neither option is the song's own intro — that audio is not in the file
and no free API provides it.

Search a song title, or search an artist and you get up to seven of their songs
in the order the source ranks them, so the best-known ones come first. Part of a
name is enough: "weeknd" finds The Weeknd. A title that starts with what you
typed still leads, so "billie" offers Billie Jean as well as Billie Eilish.

The timeline is drawn on a log scale, so each of the five stages takes a similar
slice of the bar — otherwise 0.1s and 0.5s would share the leftmost 3% of it.
Only the part you have unlocked shows its real waveform; the rest stays a flat
ghost so the shape of the song is not a free hint.

## How it works

```
song lists                         playable audio
 Last.fm  ─┐
 Spotify  ─┼─► server ─► Deezer / Apple preview lookup ─► /api/audio ─► Web Audio
 YouTube  ─┘                                                              decode
 Charts   ─┤                                                              + slice
 Decades  ─┘
```

No provider gives both history and audio: Spotify dropped preview URLs for new
apps in 2024 and YouTube has no audio API at all. So the providers supply the
song list, and a 30 second preview is matched from Deezer (falling back to Apple
Music). Anything with no matching preview is dropped before it can become a
round you cannot play.

Playback is Web Audio, not an `<audio>` element: the preview is decoded once and
each snippet is scheduled on the audio clock with a short fade at both edges.
That is what makes 0.1s land at 0.1s instead of somewhere between 80 and 250ms
with a click on each end. `test/audio.test.ts` pins the timeline maths and the
entry-point search.

Sessions are a signed httpOnly cookie over a SQLite row. Accounts, sealed
provider tokens, ratings and round history live in that same SQLite file
(`node:sqlite`, so there is no native dependency to build). Signed out,
everything falls back to localStorage and the game plays exactly the same.

## On an iPhone

There is no App Store build: that needs macOS, Xcode and an Apple Developer
account. iPhones install it from Safari instead, which for this app is the same
thing — the Android APK is only a WebView onto the server anyway.

1. Join the same Wi-Fi as the computer, or its hotspot
2. Open the server address **in Safari** (not Chrome)
3. Share, then **Add to Home Screen**

It gets the Melodle icon and opens without browser chrome. Everything works,
parties included, as long as each phone can reach the server.

## On your phone

`Melodle.apk` is a debug-signed Android build (Android 6 and up). Copy it to
your phone, allow installs from that source, and open it.

The APK is the Melodle client, not the whole thing. Accounts, parties, the
Last.fm key and the audio proxy all live on the server, so the phone has to
reach a computer running one. That is also the only way a party works: everyone
points at the same server.

1. On the computer, run `npm run start:lan`. It prints the address to use, for
   example `http://192.168.1.20:8787`. To have it come up by itself at every
   logon instead, see **Keeping the server up** below.
2. Open the app and type that address. The port defaults to 8787 if you leave it
   off. It checks the address before it commits to it, and remembers it after.
3. Phone and computer must be on the same Wi-Fi.

`npm run start:lan` binds to every network interface, so anyone on that Wi-Fi
can reach the server. Accounts are password-protected and the key-setup panel
still only answers to the computer itself, but do not run it on a network you do
not trust. Plain `npm start` stays on localhost.

To rebuild after changing the app: `npm run apk`. The APK lands in
`android/app/build/outputs/apk/debug/`.

## Playing with other people

A party needs everyone pointed at the same server, so:

- **In the same room** — turn on the host phone's hotspot, join the computer to
  it, and have everyone else join it too. Each person opens the address, makes
  an account, and joins with the party code. This is the tested path.
- **Not in the same room** — run `scripts\share.cmd`. It opens a public HTTPS
  address through Cloudflare that forwards to your server, and prints it in the
  window. Share that address and the invite code; close the window to take it
  down.

Set `INVITE_CODE` in `.env` before sharing publicly. With it set, making an
account needs that code, so nobody who stumbles on the address can sign up.
Everything else — the key-setup panel — already refuses anything but the
computer itself.

The public address changes every time `share.cmd` starts, so send a fresh link
each session. It is deliberately not started at logon: while it runs, your
laptop is serving the internet.

## Hosting it online

`Dockerfile` and `fly.toml` are ready and the image is tested: it builds, serves
the app, streams audio, and keeps accounts across a redeploy as long as a volume
is mounted at `/data`. Without that volume every deploy hands everyone a blank
slate, which is the one thing to get right.

Deploying needs an account, which only you can create:

```bash
fly auth login                       # opens a browser; sign up if you have none
fly launch --no-deploy               # keep the existing fly.toml when asked
fly volumes create melodle_data --size 1 --region ams
fly secrets set SESSION_SECRET=<a long random string>                 LASTFM_API_KEY=<your key>                 INVITE_CODE=<a code for your friends>
fly deploy
```

`SESSION_SECRET` must stay stable: change it and every linked music service has
to be relinked. Keep the invite code set, because the address is public.

Any host works, not just Fly — it needs to run a container, keep a volume, and
stay awake. Free tiers that sleep or wipe the disk will lose accounts and drop
you mid-round.

## Keeping the server up

`scripts/serve-always.cmd` runs the server and restarts it if it ever exits,
logging to `%LOCALAPPDATA%\Melodle\server.log`. A shortcut to it lives in the
Startup folder, so it comes back at every logon, minimised.

- **Stop it for now:** close the "Melodle server" window in the taskbar.
- **Stop it for good:** delete `Melodle server.lnk` from the Startup folder
  (press Win+R and enter `shell:startup`).
- **Read the log:** `%LOCALAPPDATA%\Melodle\server.log`.
- **Which address to type into the phone:** the log's last
  "reachable on this network" line. It changes whenever you change network.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API on 8787 and the app on 5173, both watching |
| `npm run check` | Typecheck all three projects, then the tests |
| `npm test` | Unit tests only |
| `npm run build` | Typecheck and build to `dist/` |
| `npm start` | Serve the built app and the API on 8787, localhost only |
| `npm run start:lan` | Same, but reachable from your phone on the Wi-Fi |
| `npm run apk` | Rebuild the Android APK |

## Layout

```
server/      Express BFF: accounts, OAuth, provider calls, previews, audio proxy
  lib/       database, sessions, password and token crypto
  providers/ one file per song source
src/
  audio/     Web Audio engine, log timeline, waveform analysis
  game/      rules, daily pick, round state
  components/
shared/      types and the text matching used by both sides
test/        unit tests
android-shell/  the page inside the APK that finds your server
android/     generated Capacitor project (rebuilt by `npm run apk`)
assets/      app icon and splash art
docs/        why the architecture is shaped this way
```
