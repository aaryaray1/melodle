# Melodle - design decisions

Guess a song from 0.1s, then 0.5s, 2s, 8s, 15s. Songs come from your own
listening history (Spotify / YouTube Music / Last.fm) or from charts.

## What makes or breaks this game

A 100ms snippet is 4,410 samples. Every clone that uses `<audio>` + `setTimeout`
plays somewhere between 80ms and 250ms of audio, with a click at each end, and
the click is loud enough to mask the music. The whole game lives or dies on that
first stage, so audio is the architecture.

## ADR-1: Web Audio API with a decoded buffer, not an <audio> element

`decodeAudioData` once, then `source.start(when, offset, duration)` schedules on
the audio clock, accurate to the sample. A GainNode applies a 12ms equal-power
fade in and out inside the window so short clips sound like music instead of a
pop. Cost: the whole clip must be downloaded and decoded before the first play
(~200KB, prefetched during setup, so it is free in practice).

Rejected: `<audio>` + `currentTime` (tens of ms of jitter, audible clicks),
Spotify Web Playback SDK (remote player, network-latency start, Premium only,
cannot do 100ms).

## ADR-2: providers supply songs, preview CDNs supply audio

Spotify removed `preview_url` for new apps in Nov 2024 and YouTube has no audio
API at all, so no provider gives both. Melodle splits the two jobs:

    history (who/what you listen to)        audio (30s preview mp3)
    Spotify top + recent tracks    ---\
    YouTube Music likes + playlists ---+--> iTunes Search --> Deezer fallback
    Last.fm scrobbles              ---/
    Apple charts (no account)      ---/

Tracks that resolve to no preview are dropped from the pool before the client
sees them, so a round can never be unplayable.

## ADR-3: a thin backend, and provider tokens never reach the browser

Needed for CORS (`decodeAudioData` needs a same-origin, CORS-clean byte stream),
for Google's code exchange (requires a client secret), and for caching. Tokens
live in an in-memory session keyed by a signed, httpOnly cookie. The client only
ever sees track metadata.

The audio proxy is the one route that fetches a URL the client names, so it
takes a strict host allowlist (`*.mzstatic.com`, `*.apple.com`, `*.dzcdn.net`)
and refuses everything else - otherwise it is an open SSRF relay.

## ADR-4: decades come from editorial playlists, not tags

Last.fm's `tag.gettoptracks` for "80s" returns what users tagged, which skews
obscure and indie. Deezer's editorial decade playlists ("80s Hits", "90s Party
Hits") are curated for recognition and carry previews already, so no per-track
lookup is needed. A playlist only counts for a decade when its own title names
that decade, otherwise searches for "20s hits" quietly drag in 00s playlists.

## ADR-5: SQLite, and only for what an account needs

Stats, streaks, settings and the day's progress are localStorage. The daily song
is picked by hashing the date against the pool, so every device agrees without a
server round trip.

## Visual direction

Sodium-amber signal on indigo ink, mint for a hit, rose for a miss. The hero is
the real waveform of the decoded buffer: the unlocked window burns amber, the
rest sits as a ghost, and the five stages are notches along it - a real sequence,
so numbering it is information rather than decoration. Display type is Bricolage
Grotesque, UI text is Figtree, numerals are tabular so the timer does not jitter.
One orchestrated motion: the unlock, where the lit window springs outward.


## ADR-7: the audio proxy owns its stream lifecycle

The first version piped the upstream body straight to the response with a
timeout signal covering the whole download. Skipping to the next song aborted
the request, nothing cancelled the upstream fetch, and twenty seconds later the
timeout errored a stream nobody was listening to, which exits the process. The
proxy now cancels upstream when the client leaves, clears the timeout once the
headers arrive, and pipes through `stream/promises` so a failure rejects instead
of raising an unhandled event. `test/proxy.test.ts` fails against the old code.

## ADR-8: parties blend round-robin, not by concatenation

Concatenating each member's history would give the first person the opening
stretch of the game. Interleaving means everyone is represented from the first
few songs, and it makes the "whose song is this" moment work. Duplicates are
credited to whoever appeared first rather than dropped from both.

## ADR-9: responsive overrides live at the end of the stylesheet

The mobile block was first written above the component sections, so
`.rate { flex-direction: column }` quietly beat the narrow-screen override at
equal specificity and the rating buttons stacked. Media queries here are plain
selectors, not a cascade layer, so they only win by coming last.


## ADR-10: artist search returns a block, not a score ranking

Scoring every track against the whole query and taking the best seven answers
the wrong question for an artist search: you get a scattering of their catalogue
rather than the songs you would actually name. A query that matches an artist
now returns that artist's first seven tracks in pool order, and pool order is
the source's own ranking (chart position, playlist order, scrobble count, mix
score), so the recognisable ones come first for free.

Whole-string prefixes are not enough to match a name, because nobody types the
"The" in The Weeknd; any word of the name can carry the match, from three
characters up. Titles that start with the query are kept ahead of the artist
block so "billie" still finds Billie Jean.


## ADR-11: the APK carries a launcher, not the app

An APK cannot be all of Melodle. The Last.fm key has to stay off the device,
accounts and ratings need a database, and a party is meaningless unless several
phones share one server. So the APK ships a single page that asks for a server
address, checks it, and then hands the WebView over to that origin.

Everything after that is the website, on its own origin, which is why sessions
and cookies keep working untouched. Bundling the built UI instead would have put
the app on `localhost` and the API on the LAN, making every request cross-origin:
cookies would need `SameSite=None`, which needs HTTPS, which a LAN address does
not have. Token auth could have solved it, but for no gain over just loading the
site.

The one cross-origin call left is the launcher's check, so `/api/ping` is the
only route that sends `Access-Control-Allow-Origin`. It carries no session and
no data beyond "yes, this is Melodle", and a test asserts no other route
answers across origins.

Android blocks plain HTTP by default from API 28, so the manifest sets
`usesCleartextTraffic`. A LAN address cannot have a real certificate, so this is
the price of talking to a machine on your own Wi-Fi.

## ADR-12: audio is requested by track id, not by URL

Deezer preview links carry a token that dies after roughly fifteen minutes,
while pools are cached for an hour (charts) or a day (decades). The URLs inside
a cached pool are therefore usually dead, which surfaced as a constant "this
preview would not load". The client now sends a track id and the server fetches
a fresh URL immediately before streaming, with a ten minute cache that sits
comfortably inside the token's life.

A useful side effect: the client no longer names a URL for the server to fetch,
so the proxy's input is an opaque id matching `(deezer|itunes):\d+`. The host
allowlist stays as the last word on what may be fetched, but it is now defence
in depth rather than the only guard.

## ADR-13: two ways into a song, because one was not enough

"Opening" starts where the preview starts, skipping any lead-in silence. "Hook"
opens on the most energetic fifteen seconds, which for most songs is the chorus.

The first implementation of Hook found the peak of a smoothed energy curve and
walked back to its onset. On modern, heavily compressed pop that walk reaches
the start of the preview, so both modes collapsed into the same thing and the
toggle appeared to do nothing. Scoring whole candidate windows cannot degenerate
— there is always a loudest one — and near-ties resolve to the later window,
since a chorus sits later than second zero and the opening is what the other
mode is for.
