import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Track } from '../../shared/types.ts';
import { buildIndex, mergeResults, searchTracks } from '../game/search.ts';
import { api } from '../lib/api.ts';
import { Cover } from './Cover.tsx';

interface Props {
  tracks: Track[];
  disabled: boolean;
  /** Songs already guessed this round: shown, marked, and not selectable. */
  isGuessed: (track: Track) => boolean;
  onGuess: (track: Track) => void;
}

/**
 * Choosing a song and guessing it are two steps. Clicking (or Enter on) a result
 * only selects it, shown in the field with its cover; Guess, or a second Enter,
 * sends it. A misclick costs nothing but picking again.
 */
export function GuessBar({ tracks, disabled, isGuessed, onGuess }: Props) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Track | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const index = useMemo(() => buildIndex(tracks), [tracks]);
  const local = useMemo(() => searchTracks(index, query), [index, query]);
  // All of Deezer as well as the pool, fetched once typing pauses.
  const [remote, setRemote] = useState<{ query: string; tracks: Track[] } | null>(null);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .search(trimmed, controller.signal)
        .then(({ tracks: found }) => setRemote({ query: trimmed, tracks: found }))
        .catch(() => undefined);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const matches = useMemo(
    () => (remote && remote.query === query.trim() ? mergeResults(remote.tracks, local) : local),
    [local, query, remote],
  );

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

  const pick = (track: Track | undefined) => {
    if (!track || isGuessed(track)) return;
    setPicked(track);
    setQuery(`${track.title} — ${track.artist}`);
    setOpen(false);
  };

  const submit = () => {
    if (!picked || isGuessed(picked)) return;
    onGuess(picked);
    setPicked(null);
    setQuery('');
    setOpen(false);
  };

  const showList = open && matches.length > 0 && !disabled;

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
      // First Enter picks the highlighted song; with one picked and the list shut, Enter guesses.
      if (picked && !showList) submit();
      else pick(matches[active]);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setPicked(null);
      setQuery('');
    }
  };


  return (
    <div className="guessbar">
      <div className={picked ? 'guessbar-field guessbar-field-picked' : 'guessbar-field'}>
        {picked ? <Cover track={picked} size={36} className="guessbar-picked-cover" /> : null}
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
            setPicked(null);
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
          disabled={disabled || !picked}
          title={picked ? `Guess ${picked.title}` : 'Pick a song from the list first'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
        >
          Guess
        </button>
      </div>
      {showList ? (
        <ul className="guessbar-list" id={listId} role="listbox">
          {matches.map((track, index) => {
            const guessed = isGuessed(track);
            const classes = ['guessbar-option'];
            if (index === active) classes.push('guessbar-option-active');
            if (guessed) classes.push('guessbar-option-guessed');
            return (
              <li
                key={track.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={guessed}
                className={classes.join(' ')}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(track)}
              >
                <Cover track={track} size={48} className="guessbar-cover" lazy />
                <span className="guessbar-text">
                  <span className="guessbar-title">{track.title}</span>
                  <span className="guessbar-artist">
                    {track.artist}
                    {track.album && track.album !== track.title ? ` · ${track.album}` : ''}
                  </span>
                </span>
                {guessed ? <span className="guessbar-badge">Guessed</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
