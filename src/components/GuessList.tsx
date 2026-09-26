import { MAX_STAGE, STAGE_DURATIONS } from '../../shared/types.ts';
import type { Guess } from '../game/rules.ts';

interface Props {
  guesses: Guess[];
  active: boolean;
}

const ICON: Record<Guess['outcome'], string> = { right: '✓', wrong: '✗', skip: '–' };

export function GuessList({ guesses, active }: Props) {
  const rows = Array.from({ length: MAX_STAGE }, (_, index) => ({
    seconds: STAGE_DURATIONS[index] as number,
    guess: guesses[index],
  }));

  return (
    <ol className="guesses" aria-label="Your attempts">
      {rows.map((row, index) => (
        <li key={row.seconds} className={row.guess ? `guess guess-${row.guess.outcome}` : 'guess guess-empty'}>
          <span className="guess-seconds">{row.seconds}s</span>
          {row.guess ? (
            <>
              <span className="guess-mark" aria-hidden="true">
                {ICON[row.guess.outcome]}
              </span>
              <span className="guess-label">{row.guess.label}</span>
            </>
          ) : (
            <>
              <span className="guess-mark" aria-hidden="true" />
              <span className="guess-label guess-waiting">
                {active && index === guesses.length ? 'Your turn' : ''}
              </span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
