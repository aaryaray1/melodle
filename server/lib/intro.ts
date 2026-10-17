import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getAccount } from './accounts.ts';
import { env } from './env.ts';
import { rankVideos, type SongFacts, type VideoCandidate } from './youtube-match.ts';

/**
 * A song's real opening, which neither Deezer's nor Apple's previews contain:
 * the album upload is found on YouTube with yt-dlp and its first seconds are
 * cut to mp3 with ffmpeg. Only those seconds are ever fetched or kept.
 *
 * The processes are bounded the way the audio proxy's streams are: a hard
 * timeout that kills them, two jobs at a time, and one job per song however
 * many players ask for it at once.
 */
const run = promisify(execFile);
const YT_DLP = process.env.YT_DLP_PATH || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
/** The longest stage is 15s; the rest covers any silence before the first note. */
const INTRO_SECONDS = 20;
const MAX_FILES = 3000;
const dir = path.join(path.dirname(path.resolve(env.dataFile)), 'intros');

export class IntroUnavailable extends Error {}

/** SONG_START_USERS when set; otherwise anyone signed in. Never guests. */
export function canHearSongStart(userId: number | null): boolean {
  if (!userId) return false;
  if (!env.songStartUsers.length) return true;
  const account = getAccount(userId);
  return Boolean(account && env.songStartUsers.includes(account.username.toLowerCase()));
}

const inflight = new Map<string, Promise<string | null>>();
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function search(song: SongFacts): Promise<VideoCandidate[]> {
  const { stdout } = await run(
    YT_DLP,
    ['--js-runtimes', 'node', '--force-ipv4', '--flat-playlist', '--dump-json', '--no-warnings', `ytsearch8:${song.artist} ${song.title}`],
    { timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { id?: string; title?: string; channel?: string; uploader?: string; duration?: number })
    .filter((entry) => entry.id && entry.title)
    .map((entry) => ({
      id: entry.id as string,
      title: entry.title as string,
      channel: entry.channel ?? entry.uploader ?? '',
      duration: entry.duration,
    }));
}

async function cut(videoId: string, target: string): Promise<void> {
  const { stdout } = await run(
    YT_DLP,
    // The stream URL is tied to the address that asked for it; IPv4 keeps yt-dlp and ffmpeg on the same one.
    ['--js-runtimes', 'node', '--force-ipv4', '-f', 'bestaudio', '-g', '--no-warnings', `https://www.youtube.com/watch?v=${videoId}`],
    { timeout: 30_000, killSignal: 'SIGKILL' },
  );
  const audioUrl = stdout.split('\n')[0]?.trim();
  if (!audioUrl) throw new Error('no audio stream');
  const partial = `${target}.part`;
  // Leading silence is dropped first (some uploads open on seconds of it), then the
  // output stops at INTRO_SECONDS of music, so the rest of the song is never downloaded.
  await run(
    FFMPEG,
    [
      '-nostdin', '-loglevel', 'error', '-y', '-i', audioUrl, '-vn',
      '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05',
      '-t', String(INTRO_SECONDS), '-ac', '2', '-ar', '44100', '-b:a', '160k', '-f', 'mp3', partial,
    ],
    { timeout: 60_000, killSignal: 'SIGKILL' },
  );
  await rename(partial, target);
}

async function prune(): Promise<void> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.mp3'));
  if (names.length <= MAX_FILES) return;
  const aged = await Promise.all(
    names.map(async (name) => ({ name, at: (await stat(path.join(dir, name))).mtimeMs })),
  );
  aged.sort((a, b) => a.at - b.at);
  await Promise.all(aged.slice(0, names.length - MAX_FILES).map(({ name }) => rm(path.join(dir, name), { force: true })));
}

/**
 * The cached opening for a Deezer track, made on first request. Null when no
 * YouTube upload is plausibly the album version (remembered, so the search is
 * not repeated). Throws IntroUnavailable when the tools are missing or fail.
 */
export async function introFile(deezerId: string, song: SongFacts): Promise<string | null> {
  const target = path.join(dir, `${deezerId}.mp3`);
  const miss = path.join(dir, `${deezerId}.none`);
  if (existsSync(target)) return target;
  if (existsSync(miss)) return null;

  const pending = inflight.get(deezerId);
  if (pending) return pending;

  const job = slot(async () => {
    await mkdir(dir, { recursive: true });
    try {
      const videos = rankVideos(await search(song), song);
      if (!videos.length) {
        await writeFile(miss, '');
        return null;
      }
      // One upload can refuse (region, age gate, a passing YouTube hiccup); try the next best.
      let lastProblem: unknown;
      for (const video of videos.slice(0, 3)) {
        try {
          await cut(video.id, target);
          void prune().catch(() => undefined);
          return target;
        } catch (problem) {
          lastProblem = problem;
          await rm(`${target}.part`, { force: true });
        }
      }
      throw lastProblem;
    } catch (problem) {
      await rm(`${target}.part`, { force: true });
      // The stream URL carries a token; log what failed, never the command line.
      const code = (problem as { code?: string }).code;
      const said = String((problem as { stderr?: string }).stderr ?? '')
        .split('\n')
        .find((line) => line.trim())
        ?.replace(/https?:\/\/\S+/g, '<url>')
        .slice(0, 160);
      console.error('[melodle] song start failed for', deezerId, code ?? '', said ?? '');
      throw new IntroUnavailable(code === 'ENOENT' ? 'yt-dlp or ffmpeg is not installed' : 'fetch failed');
    }
  }).finally(() => inflight.delete(deezerId));

  inflight.set(deezerId, job);
  return job;
}
