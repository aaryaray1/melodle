import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Track } from '../../shared/types.ts';
import { buildIndex, searchTracks } from '../game/search.ts';
import { Cover } from './Cover.tsx';

interface Props {
  tracks: Track[];
  disabled: boolean;
  onGuess: (track: Track) => void;
}

export function GuessBar({ tracks, disabled, onGuess }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const index = useMemo(() => buildIndex(tracks), [tracks]);
  const matches = useMemo(() => searchTracks(index, query), [index, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // The list scrolls now, so arrow keys must keep the highlighted row on screen.
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== inputRef.current) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const choose = (track: Track | undefined) => {
    if (!track) return;
    onGuess(track);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!matches.length) return;
      setOpen(true);
      setActive((current) => {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        return (current + step + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(matches[active]);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const showList = open && matches.length > 0 && !disabled;

  return (
    <div className="guessbar">
      <div className="guessbar-field">
        <input
          ref={inputRef}
          className="guessbar-input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          placeholder={disabled ? 'Round over' : 'Type a song or artist'}
          value={query}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="guessbar-submit"
          disabled={disabled || !matches.length}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(matches[active])}
        >
          Guess
        </button>
      </div>
      {showList ? (
        <ul className="guessbar-list" id={listId} role="listbox">
          {matches.map((track, index) => (
            <li
              key={track.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'guessbar-option guessbar-option-active' : 'guessbar-option'}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(track)}
            >
              <Cover track={track} size={48} className="guessbar-cover" lazy />
              <span className="guessbar-text">
                <span className="guessbar-title">{track.title}</span>
                <span className="guessbar-artist">
                  {track.artist}
                  {track.album && track.album !== track.title ? ` · ${track.album}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
