import { MAX_DIFFICULTY } from '../game/rules.ts';

interface Props {
  level: number;
  locked: boolean;
  onSet: (level: number) => void;
  onLock: (locked: boolean) => void;
  /** Opens the full difficulty picker. */
  onOpen: () => void;
}

/** The pips (tap one to set the level), the lock, and a way into the full picker. */
export function DifficultyControl({ level, locked, onSet, onLock, onOpen }: Props) {
  return (
    <span className="difficulty">
      <button type="button" className="difficulty-open" onClick={onOpen}>
        Difficulty
      </button>
      <span className="difficulty-pips" role="group" aria-label="Difficulty">
        {Array.from({ length: MAX_DIFFICULTY }, (_, index) => (
          <button
            key={index}
            type="button"
            className="difficulty-pip-button"
            aria-label={`Set difficulty ${index + 1}`}
            aria-pressed={index + 1 === level}
            onClick={() => onSet(index + 1)}
          >
            <span className={index < level ? 'difficulty-pip difficulty-pip-on' : 'difficulty-pip'} />
          </button>
        ))}
      </span>
      <button
        type="button"
        className="difficulty-lock"
        aria-pressed={locked}
        title={locked ? 'Difficulty stays put' : 'Difficulty climbs as you win'}
        onClick={() => onLock(!locked)}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <rect x="3" y="7" width="10" height="8" fill="currentColor" />
          <path d={locked ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 6 0'} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        {locked ? 'Locked' : 'Lock'}
      </button>
    </span>
  );
}
