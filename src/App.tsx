import { useCallback, useEffect, useState } from 'react';
import type { ProviderId } from '../shared/types.ts';
import { AccountSheet } from './components/AccountSheet.tsx';
import { GuessBar } from './components/GuessBar.tsx';
import { GuessList } from './components/GuessList.tsx';
import { Reveal } from './components/Reveal.tsx';
import { Sheet } from './components/Sheet.tsx';
import { SourceSheet } from './components/SourceSheet.tsx';
import { StatsSheet } from './components/StatsSheet.tsx';
import { DifficultyControl } from './components/DifficultyControl.tsx';
import { DifficultySheet } from './components/DifficultySheet.tsx';
import { Dock } from './components/Dock.tsx';
import { playLabel } from './components/PlayButton.tsx';
import { Transport } from './components/Transport.tsx';
import { Waveform } from './components/Waveform.tsx';
import { useAccount } from './game/useAccount.ts';
import { useGame } from './game/useGame.ts';
import { isGuessed, nextUnlock, shareText } from './game/rules.ts';
import { api } from './lib/api.ts';
import { installHint } from './lib/platform.ts';
import { useMediaQuery, useVisibleViewport } from './lib/viewport.ts';

const CONNECT_MESSAGES: Record<string, string> = {
  denied: 'You turned that connection down. Nothing was saved.',
  state_mismatch: 'That sign-in did not come back cleanly. Try linking again.',
  expired: 'That sign-in took too long. Try linking again.',
  exchange_failed: 'The service refused the sign-in. Check the keys in the setup panel.',
  not_configured: 'That service has no keys yet. Add them in the setup panel.',
  no_account: 'Sign in to Melodle first, then link the service to your account.',
};

const PROVIDER_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube Music',
  lastfm: 'Last.fm',
};

function readConnectNotice(): string | null {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get('connect');
  if (!provider) return null;
  window.history.replaceState({}, '', window.location.pathname);
  const error = params.get('error');
  if (error) return CONNECT_MESSAGES[error] ?? 'That connection did not work.';
  return `${PROVIDER_NAMES[provider] ?? provider} is linked. Pick a list to play from.`;
}

export default function App() {
  const account = useAccount();
  const game = useGame(account);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  // Phones get the one-handed layout: every control a round needs sits in a dock
  // at the bottom of the screen, where the thumb already is.
  const compact = useMediaQuery('(max-width: 34rem)');
  useVisibleViewport(compact);
  const [notice, setNotice] = useState<string | null>(null);
  // The page heats with difficulty. The song of the day ignores difficulty, so it stays purple.
  const heat = game.settings.daily ? 1 : game.settings.difficulty;
  useEffect(() => {
    document.documentElement.dataset.difficulty = String(heat);
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink-900').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ink);
  }, [heat]);
  const [hint] = useState(() =>
    installHint(navigator.userAgent, window.matchMedia('(display-mode: standalone)').matches),
  );

  useEffect(() => {
    const message = readConnectNotice();
    if (!message) return;
    setNotice(message);
    setSourcesOpen(true);
  }, []);

  // The song from before a reload (or a phone dropping the tab) is back: say so, briefly.
  const { restored } = game;
  useEffect(() => {
    if (!restored) return;
    setNotice('Your previous song was loaded.');
    const timer = window.setTimeout(() => setNotice((current) => (current === 'Your previous song was loaded.' ? null : current)), 6000);
    return () => window.clearTimeout(timer);
  }, [restored]);

  const { play } = game;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || event.repeat) return;
      if (target && ['INPUT', 'BUTTON', 'A', 'TEXTAREA'].includes(target.tagName)) return;
      event.preventDefault();
      play();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play]);

  const { refresh } = account;
  const { chooseSource, settings } = game;

  const connectLastfm = useCallback(
    async (user: string) => {
      await api.connectLastfm(user);
      await refresh();
      chooseSource('lastfm', 'top:overall');
    },
    [refresh, chooseSource],
  );

  const disconnect = useCallback(
    async (provider: ProviderId) => {
      await api.disconnect(provider);
      await refresh();
      if (settings.source === provider) chooseSource('charts', '0');
    },
    [refresh, chooseSource, settings.source],
  );

  const round = game.round;
  const finished = round ? round.status !== 'playing' : false;
  const upcoming = round && !finished ? nextUnlock(round.guesses.length) : null;
  const solvedStage = round?.status === 'won' ? round.guesses.length - 1 : null;
  const currentRating = round ? (account.ratings[round.answer.id] ?? 0) : 0;
  const skipLabel = upcoming ? `Skip, unlock ${upcoming}s` : 'Skip the last one';

  // On a phone the reveal is scrolled into view above the dock the moment a round ends.
  useEffect(() => {
    if (compact && finished) document.querySelector('.reveal')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [compact, finished]);

  const difficulty = (
    <DifficultyControl
      level={game.settings.difficulty}
      locked={game.settings.difficultyLocked}
      onSet={game.setDifficulty}
      onLock={game.setDifficultyLocked}
      onOpen={() => setLevelOpen(true)}
    />
  );

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="wordmark">Melodle</h1>
        <div className="masthead-actions">
          <button type="button" className="chip-button" onClick={() => setSourcesOpen(true)}>
            {game.pool ? game.pool.label : 'Choose your music'}
          </button>
          {compact ? null : (
            <>
              <button type="button" className="icon-button" onClick={() => setStatsOpen(true)} aria-label="Your record">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                  <rect x="2" y="11" width="4" height="7" rx="1.4" fill="currentColor" />
                  <rect x="8" y="6" width="4" height="12" rx="1.4" fill="currentColor" />
                  <rect x="14" y="2" width="4" height="16" rx="1.4" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                className={account.signedIn ? 'icon-button icon-button-on' : 'icon-button'}
                onClick={() => setAccountOpen(true)}
                aria-label={account.signedIn ? `Signed in as ${account.me?.account?.username}` : 'Sign in'}
              >
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                  <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
                  <path d="M2.8 18a7.2 7.2 0 0 1 14.4 0Z" fill="currentColor" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}

      <main className="board">
        <div className="modes" role="group" aria-label="Game mode">
          <button
            type="button"
            className={game.settings.daily ? 'mode mode-active' : 'mode'}
            aria-pressed={game.settings.daily}
            onClick={() => game.setDaily(true)}
          >
            Song of the day
          </button>
          <button
            type="button"
            className={game.settings.daily ? 'mode' : 'mode mode-active'}
            aria-pressed={!game.settings.daily}
            onClick={() => game.setDaily(false)}
          >
            Endless
          </button>
        </div>

        {game.poolState === 'error' ? (
          <section className="panel panel-problem">
            <p className="panel-text">{game.poolError}</p>
            <div className="panel-actions">
              <button type="button" className="button button-primary" onClick={game.retryPool}>
                Try again
              </button>
              <button type="button" className="button" onClick={() => setSourcesOpen(true)}>
                Pick another list
              </button>
            </div>
          </section>
        ) : null}

        {game.poolState === 'loading' && game.poolSlow ? (
          <p className="notice" role="status">
            Putting this list together for the first time. It can take up to a minute; after that it is instant.
          </p>
        ) : null}

        <Waveform
          clip={game.clip}
          unlocked={game.unlocked}
          playing={game.playing}
          tone={round?.status === 'won' ? 'won' : round?.status === 'lost' ? 'lost' : 'live'}
          engine={game.engine}
        />

        <Transport
          unlocked={game.unlocked}
          playing={game.playing}
          ready={Boolean(game.clip)}
          solved={finished}
          startMode={game.settings.startMode}
          songStart={Boolean(account.me?.songStart)}
          showPlay={!compact}
          onPlay={game.play}
          onStartMode={game.setStartMode}
        />

        {game.introMissing && !game.clipError ? (
          <p className="notice" role="status">
            The song start isn&apos;t available this round, so it plays the preview.
          </p>
        ) : null}

        {game.clipError ? (
          <p className="notice notice-problem" role="status">
            {game.clipError}
            <button type="button" className="link-button" onClick={game.nextRound}>
              Try a different song
            </button>
          </p>
        ) : null}

        {round && !finished && !compact ? (
          <>
            <GuessBar
              tracks={game.pool?.tracks ?? []}
              disabled={!game.clip}
              isGuessed={(track) => isGuessed(round.guesses, track)}
              onGuess={game.guess}
            />
            <div className="skip-row">
              <button type="button" className="button" onClick={game.skip} disabled={!game.clip}>
                {skipLabel}
              </button>
              {game.settings.daily ? null : difficulty}
            </div>
          </>
        ) : null}

        {compact && !game.settings.daily ? <div className="difficulty-row">{difficulty}</div> : null}

        {round ? <GuessList guesses={round.guesses} active={!finished} /> : null}

        {round && finished ? (
          <Reveal
            track={round.answer}
            status={round.status}
            guesses={round.guesses}
            daily={round.daily}
            rating={currentRating}
            onRate={(rating) => void account.rate(round.answer, rating)}
            onNext={game.nextRound}
            showNext={!compact}
            onShare={() =>
              shareText({
                label: game.pool?.label ?? '',
                day: game.day,
                guesses: round.guesses,
                status: round.status,
                daily: round.daily,
              })
            }
          />
        ) : null}
      </main>

      <footer className="footnote">
        {hint === 'android' ? (
          <p className="install-hint">
            <a href="/melodle.apk" download>
              Get the Android app
            </a>
          </p>
        ) : hint === 'ios' ? (
          <p className="install-hint">Install it: tap Share, then Add to Home Screen.</p>
        ) : null}
        {compact ? null : 'Space plays the snippet. Slash jumps to search. Enter picks a song, Enter again guesses it.'}
      </footer>

      <Sheet open={sourcesOpen} title="Where your songs come from" onClose={() => setSourcesOpen(false)}>
        {/* Mounted only while open, so the picker always starts from what is playing. */}
        {sourcesOpen ? (
          <SourceSheet
            me={account.me}
            source={game.settings.source as ProviderId}
            variant={game.settings.variant}
            signedIn={account.signedIn}
            onChoose={(source, variant) => {
              game.chooseSource(source, variant);
              setSourcesOpen(false);
            }}
            onConnectLastfm={connectLastfm}
            onDisconnect={disconnect}
            onSaved={account.refresh}
            onOpenAccount={() => {
              setSourcesOpen(false);
              setAccountOpen(true);
            }}
          />
        ) : null}
      </Sheet>

      {compact && round ? (
        <Dock
          guessing={!finished}
          ready={Boolean(game.clip)}
          playing={game.playing}
          playLabel={playLabel(game.unlocked, finished)}
          skipLabel={skipLabel}
          nextLabel={round.daily ? 'Play another song' : 'Next song'}
          tracks={game.pool?.tracks ?? []}
          isGuessed={(track) => isGuessed(round.guesses, track)}
          signedIn={account.signedIn}
          onPlay={game.play}
          onGuess={game.guess}
          onSkip={game.skip}
          onNext={game.nextRound}
          onSongs={() => setSourcesOpen(true)}
          onLevel={() => setLevelOpen(true)}
          onRecord={() => setStatsOpen(true)}
          onAccount={() => setAccountOpen(true)}
        />
      ) : null}

      <Sheet open={levelOpen} title="Difficulty" onClose={() => setLevelOpen(false)}>
        <DifficultySheet
          level={game.settings.difficulty}
          locked={game.settings.difficultyLocked}
          daily={game.settings.daily}
          onSet={game.setDifficulty}
          onLock={game.setDifficultyLocked}
          onDone={() => setLevelOpen(false)}
        />
      </Sheet>

      <Sheet open={statsOpen} title="Your record" onClose={() => setStatsOpen(false)}>
        <StatsSheet stats={account.stats} highlight={solvedStage} signedIn={account.signedIn} />
      </Sheet>

      <Sheet open={accountOpen} title="Your account" onClose={() => setAccountOpen(false)}>
        <AccountSheet account={account} onDone={() => setAccountOpen(false)} />
      </Sheet>
    </div>
  );
}
