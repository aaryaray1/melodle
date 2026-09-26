import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Me, Rating, Stats, Track } from '../../shared/types.ts';
import { api, type RoundReport } from '../lib/api.ts';
import { loadRatings, loadStats, recordResult, saveRatings, type LocalStats } from '../lib/storage.ts';

export interface AccountApi {
  me: Me | null;
  signedIn: boolean;
  stats: Stats;
  ratings: Record<string, Rating>;
  refresh: () => Promise<void>;
  register: (username: string, password: string, invite?: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  rate: (track: Track, rating: Rating | 0) => Promise<void>;
  report: (round: RoundReport, won: boolean, stageIndex: number) => void;
}

/**
 * Signed in, the account is the record: stats and ratings come from the server
 * and follow you between browsers. Signed out, everything stays in this browser.
 */
export function useAccount(): AccountApi {
  const [me, setMe] = useState<Me | null>(null);
  const [localStats, setLocalStats] = useState<LocalStats>(() => loadStats());
  const [localRatings, setLocalRatings] = useState<Record<string, Rating>>(() => loadRatings());

  const refresh = useCallback(async () => {
    setMe(await api.me());
  }, []);

  useEffect(() => {
    refresh().catch(() => setMe(null));
  }, [refresh]);

  const signedIn = Boolean(me?.account);
  const stats = signedIn && me?.stats ? me.stats : localStats;
  const ratings = useMemo(() => (signedIn ? (me?.ratings ?? {}) : localRatings), [signedIn, me, localRatings]);

  const register = useCallback(
    async (username: string, password: string, invite?: string) => {
      await api.register(username, password, invite);
      await refresh();
    },
    [refresh],
  );

  const signIn = useCallback(
    async (username: string, password: string) => {
      await api.login(username, password);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    await refresh();
  }, [refresh]);

  const rate = useCallback(
    async (track: Track, rating: Rating | 0) => {
      if (signedIn) {
        await api.rate(track, rating);
        await refresh();
        return;
      }
      setLocalRatings((current) => {
        const next = { ...current };
        if (rating === 0) delete next[track.id];
        else next[track.id] = rating;
        saveRatings(next);
        return next;
      });
    },
    [refresh, signedIn],
  );

  const report = useCallback(
    (round: RoundReport, won: boolean, stageIndex: number) => {
      if (signedIn) {
        api
          .reportRound(round)
          .then(({ stats: fresh }) => setMe((current) => (current ? { ...current, stats: fresh } : current)))
          .catch(() => undefined);
        return;
      }
      setLocalStats((current) => recordResult(current, won, stageIndex, round.day));
    },
    [signedIn],
  );

  return { me, signedIn, stats, ratings, refresh, register, signIn, signOut, rate, report };
}
