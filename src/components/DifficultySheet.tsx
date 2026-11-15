import { DIFFICULTY_LEVELS } from '../game/rules.ts';

interface Props {
  level: number;
  locked: boolean;
  daily: boolean;
  onSet: (level: number) => void;
  onLock: (locked: boolean) => void;
  onDone: () => void;
}

/** Choose the level to play on, and whether winning moves you up from it. */
export function DifficultySheet({ level, locked, daily, onSet, onLock, onDone }: Props) {
  return (
    <div className="levels">
      {daily ? (
        <p className="levels-note">The song of the day is the same for everyone, so this applies to Endless.</p>
      ) : null}
      <div className="levels-list" role="radiogroup" aria-label="Difficulty level">
        {DIFFICULTY_LEVELS.map((entry, index) => {
          const value = index + 1;
          const chosen = value === level;
          return (
            <button
              key={entry.name}
              type="button"
              role="radio"
              aria-checked={chosen}
              className={chosen ? 'level level-chosen' : 'level'}
              data-level={value}
              onClick={() => onSet(value)}
            >
              <span className="level-number">{value}</span>
              <span className="level-text">
                <span className="level-name">{entry.name}</span>
                <span className="level-blurb">{entry.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="levels-heading">When you guess a song</p>
      <div className="levels-mode" role="radiogroup" aria-label="When you guess a song">
        <button
          type="button"
          role="radio"
          aria-checked={!locked}
          className={!locked ? 'mode mode-active' : 'mode'}
          onClick={() => onLock(false)}
        >
          Move up a level
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={locked}
          className={locked ? 'mode mode-active' : 'mode'}
          onClick={() => onLock(true)}
        >
          Stay on this level
        </button>
      </div>
      <p className="levels-note">
        {locked
          ? 'Win or lose, you stay where you are.'
          : 'A win moves you up one; a win on 5 starts over at 1. A miss keeps you where you are.'}
      </p>

      <button type="button" className="button button-primary levels-done" onClick={onDone}>
        Play on {DIFFICULTY_LEVELS[level - 1]?.name ?? 'this level'}
      </button>
    </div>
  );
}
