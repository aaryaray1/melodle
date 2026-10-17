import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_STAGE,
  STAGE_DURATIONS,
  type Pool,
  type ProviderId,
  type StartMode,
  type Track,
} from '../../shared/types.ts';
import { matchesTrack, trackKey } from '../../shared/text.ts';
import { AudioEngine, clipFor, WINDOW, type LoadedClip } from '../audio/engine.ts';
import { api, ApiError } from '../lib/api.ts';
import {
  loadPlayed,
  loadProgress,
  loadSettings,
  savePlayed,
  saveProgress,
  saveSettings,
  type Settings,
} from '../lib/storage.ts';
import {
  dailyTrack,
  difficultyBand,
  freshTrack,
  clampDifficulty,
  guessFor,
  isGuessed,
  nextDifficulty,
  playableTracks,
  sourceKey,
  todayKey,
  type Guess,
  type Status,
} from './rules.ts';
import type { AccountApi } from './useAccount.ts';

const DEFAULTS: Settings = { source: 'charts', variant: '0', daily: true, startMode: 'opening', difficulty: 1, difficultyLocked: false };

export interface Round {
  answer: Track;
  guesses: Guess[];
  status: Status;
  daily: boolean;
}

export interface Game {
  settings: Settings;
  pool: Pool | null;
  poolState: 'loading' | 'ready' | 'error';
  poolError: string | null;
  round: Round | null;
  clip: LoadedClip | null;
  clipError: string | null;
  /** True when song start was asked for but this song had none, so the preview plays. */
  introMissing: boolean;
  day: string;
  unlocked: number;
  playing: boolean;
  engine: AudioEngine;
  chooseSource: (source: ProviderId, variant: string) => void;
  setDaily: (daily: boolean) => void;
  setStartMode: (mode: StartMode) => void;
  setDifficultyLocked: (locked: boolean) => void;
  setDifficulty: (level: number) => void;
  play: () => void;
  guess: (track: Track) => void;
  skip: () => void;
  nextRound: () => void;
}

export function useGame(account: AccountApi): Game {
  const engine = useMemo(() => new AudioEngine(), []);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(DEFAULTS));
  const [pool, setPool] = useState<Pool | null>(null);
  const [poolState, setPoolState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [poolError, setPoolError] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [decoded, setDecoded] = useState<AudioBuffer | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [introMissing, setIntroMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const day = useMemo(() => todayKey(), []);
  const key = sourceKey(settings.source as ProviderId, settings.variant);
  const { ratings, report } = account;

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const playable = useMemo(() => (pool ? playableTracks(pool.tracks, ratings) : []), [pool, ratings]);

  // Every song you have been played, so endless never serves one twice until the pool runs dry.
  const played = useRef<Set<string>>(new Set(loadPlayed()));
  const pickEndless = useCallback(
    (avoidId?: string) => {
      const { track, exhausted } = freshTrack(difficultyBand(playable, settings.difficulty), playable, played.current, avoidId);
      if (exhausted) played.current = new Set();
      return track;
    },
    [playable, settings.difficulty],
  );

  // Load the song list for the chosen source.
  useEffect(() => {
    const controller = new AbortController();
    setPoolState('loading');
    setPoolError(null);
    api
      .pool(settings.source as ProviderId, settings.variant, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setPool(next);
        setPoolState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPool(null);
        setPoolState('error');
        setPoolError(error instanceof ApiError ? error.message : 'Could not reach Melodle');
      });
    return () => controller.abort();
  }, [settings.source, settings.variant]);

  // Start a round whenever the list or the mode changes.
  useEffect(() => {
    if (!pool || !playable.length) {
      if (!pool) setRound(null);
      return;
    }
    if (settings.daily) {
      const saved = loadProgress(key, day);
      // A round already under way keeps its song even if the list shifts underneath.
      const resumed = saved ? pool.tracks.find((track) => track.id === saved.answerId) : undefined;
      if (saved && resumed) {
        setRound({ answer: resumed, guesses: saved.guesses, status: saved.status, daily: true });
        return;
      }
      const answer = dailyTrack(playable, key, day);
      if (answer) setRound({ answer, guesses: [], status: 'playing', daily: true });
      return;
    }
    const answer = pickEndless();
    if (answer) setRound({ answer, guesses: [], status: 'playing', daily: false });
    // Ratings must not restart a round in progress, so `playable` is read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, settings.daily, key, day]);

  // A song counts as played the moment its round starts, so a reload cannot bring it back.
  const answer = round?.answer;
  useEffect(() => {
    if (!answer) return;
    played.current.add(trackKey(answer));
    savePlayed(played.current);
  }, [answer]);

  // Fetch and decode the clip for the current answer.
  // Song start plays the real opening (signed-in players only); Hook keeps the preview,
  // where the chorus is. Any failure to find an opening falls back to the preview.
  const answerId = round?.answer.id;
  const songStart = Boolean(account.me?.songStart);
  const wantIntro = settings.startMode === 'opening' && songStart && Boolean(answerId?.startsWith('deezer:'));
  useEffect(() => {
    if (!answerId) return;
    const controller = new AbortController();
    setDecoded(null);
    setClipError(null);
    setIntroMissing(false);
    engine.stop();
    setPlaying(false);
    const preview = () => engine.load(answerId, controller.signal);
    const load = wantIntro
      ? engine.load(answerId, controller.signal, 'intro').catch((problem: unknown) => {
          if (controller.signal.aborted) throw problem;
          setIntroMissing(true);
          return preview();
        })
      : preview();
    load
      .then((buffer) => {
        if (!controller.signal.aborted) setDecoded(buffer);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setClipError(error instanceof Error ? error.message : 'This preview would not load');
      });
    return () => controller.abort();
  }, [answerId, engine, wantIntro]);

  // Re-slicing is cheap, so the toggle takes effect without fetching again.
  const clip = useMemo(
    () => (decoded ? clipFor(decoded, settings.startMode) : null),
    [decoded, settings.startMode],
  );

  useEffect(() => {
    const warm = () => void engine.warm().catch(() => undefined);
    const options = { once: true, passive: true } as const;
    window.addEventListener('pointerdown', warm, options);
    window.addEventListener('keydown', warm, options);
    return () => {
      window.removeEventListener('pointerdown', warm);
      window.removeEventListener('keydown', warm);
    };
  }, [engine]);

  useEffect(() => () => engine.stop(), [engine]);

  const finished = round ? round.status !== 'playing' : false;
  const unlocked = round
    ? finished
      ? WINDOW
      : (STAGE_DURATIONS[Math.min(round.guesses.length, MAX_STAGE - 1)] as number)
    : (STAGE_DURATIONS[0] as number);

  const play = useCallback(() => {
    if (!clip) return;
    if (playing) {
      engine.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    engine.play(clip, unlocked, () => setPlaying(false)).catch(() => setPlaying(false));
  }, [clip, engine, playing, unlocked]);

  // Writing storage and stats from inside a state updater would run twice and
  // double-count the result, so the round is settled before anything is set.
  const settle = useCallback(
    (outcome: Guess) => {
      if (!round || round.status !== 'playing') return;
      const guesses = [...round.guesses, outcome];
      const won = outcome.outcome === 'right';
      const status: Status = won ? 'won' : guesses.length >= MAX_STAGE ? 'lost' : 'playing';

      setRound({ ...round, guesses, status });
      if (round.daily) saveProgress(key, day, { answerId: round.answer.id, guesses, status });
      // Still guessing and the clip is sounding: let it run on to the newly unlocked length.
      if (status === 'playing') engine.extend(STAGE_DURATIONS[Math.min(guesses.length, MAX_STAGE - 1)] as number);
      if (status !== 'playing') {
        // The song of the day is the same for everyone, so it neither uses nor moves difficulty.
        if (!round.daily) {
          setSettings((current) => ({ ...current, difficulty: nextDifficulty(current.difficulty, won, current.difficultyLocked) }));
        }
        engine.stop();
        setPlaying(false);
        report(
          {
            trackId: round.answer.id,
            title: round.answer.title,
            artist: round.answer.artist,
            source: settings.source,
            variant: settings.variant,
            outcome: won ? 'right' : outcome.outcome,
            stage: guesses.length - 1,
            day,
          },
          won,
          guesses.length - 1,
        );
      }
    },
    [day, engine, key, report, round, settings.source, settings.variant],
  );

  const guess = useCallback(
    (track: Track) => {
      const answer = round?.answer;
      if (!answer) return;
      // The same song twice would waste a stage; the list disables it, and this refuses it too.
      if (!round || isGuessed(round.guesses, track)) return;
      const right = track.id === answer.id || matchesTrack(track, answer);
      settle(guessFor(track, right ? 'right' : 'wrong'));
    },
    [round, settle],
  );

  const skip = useCallback(() => settle({ outcome: 'skip', label: 'Skipped' }), [settle]);

  // The next song is chosen as soon as a round ends (difficulty has moved by then)
  // and, for song start, its opening is fetched while the reveal is on screen.
  // The fetch lands in the browser's cache, so Next finds it already there.
  const upcoming = useRef<Track | undefined>(undefined);
  const finishedId = round && round.status !== 'playing' ? round.answer.id : undefined;
  const prefetchIntro = settings.startMode === 'opening' && songStart;
  useEffect(() => {
    upcoming.current = undefined;
    if (!finishedId) return;
    const { track } = freshTrack(difficultyBand(playable, settings.difficulty), playable, played.current, finishedId);
    upcoming.current = track;
    if (prefetchIntro && track?.id.startsWith('deezer:')) {
      void fetch(`/api/intro?track=${encodeURIComponent(track.id)}`).catch(() => undefined);
    }
  }, [finishedId, playable, prefetchIntro, settings.difficulty]);

  const nextRound = useCallback(() => {
    if (!playable.length) return;
    setSettings((current) => (current.daily ? { ...current, daily: false } : current));
    const ready = upcoming.current;
    const answer = ready && playable.includes(ready) ? ready : pickEndless(round?.answer.id);
    if (answer) setRound({ answer, guesses: [], status: 'playing', daily: false });
  }, [pickEndless, playable.length, round?.answer.id]);

  const chooseSource = useCallback((source: ProviderId, variant: string) => {
    setSettings((current) => ({ ...current, source, variant }));
  }, []);

  const setDaily = useCallback((daily: boolean) => {
    setSettings((current) => ({ ...current, daily }));
  }, []);

  const setDifficulty = useCallback((level: number) => {
    setSettings((current) => ({ ...current, difficulty: clampDifficulty(level) }));
  }, []);

  const setDifficultyLocked = useCallback((difficultyLocked: boolean) => {
    setSettings((current) => ({ ...current, difficultyLocked }));
  }, []);

  const setStartMode = useCallback((startMode: StartMode) => {
    engine.stop();
    setPlaying(false);
    setSettings((current) => ({ ...current, startMode }));
  }, [engine]);

  return {
    settings,
    pool,
    poolState,
    poolError,
    round,
    clip,
    clipError,
    introMissing,
    day,
    unlocked,
    playing,
    engine,
    chooseSource,
    setDaily,
    setStartMode,
    setDifficultyLocked,
    setDifficulty,
    play,
    guess,
    skip,
    nextRound,
  };
}
