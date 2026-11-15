import { chartTracks, chartVariants } from '../providers/charts.ts';
import { DECADE_VARIANTS, decadeTracks } from '../providers/decades.ts';
import { LANGUAGES, languageIndex, languageTracks } from '../providers/languages.ts';

/**
 * Builds the lists players reach for first, right after the server starts, so
 * the first player after a deploy is not the one who waits for Deezer. One at a
 * time, in the background; the Deezer rate window paces it. Anything already on
 * disk from before the deploy comes back in milliseconds.
 */
export async function warmUp(): Promise<void> {
  const started = Date.now();
  const jobs: (() => Promise<unknown>)[] = [() => chartTracks('0')];
  const genres = await chartVariants().catch(() => []);
  for (const genre of genres) jobs.push(() => chartTracks(genre.id));
  for (const decade of DECADE_VARIANTS) jobs.push(() => decadeTracks(decade.id));
  for (const language of LANGUAGES) jobs.push(() => languageTracks(language.code));
  jobs.push(() => languageIndex());
  let built = 0;
  for (const job of jobs) {
    try {
      await job();
      built += 1;
    } catch {
      // A list that will not build now builds for whoever asks later.
    }
  }
  console.log(`[melodle] warmed ${built} of ${jobs.length} lists in ${Math.round((Date.now() - started) / 1000)}s`);
}
