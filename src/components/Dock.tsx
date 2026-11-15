import { useState } from 'react';
import type { Track } from '../../shared/types.ts';
import { useHeightVariable } from '../lib/viewport.ts';
import { GuessBar } from './GuessBar.tsx';
import { PlayButton } from './PlayButton.tsx';

interface Props {
  /** Still guessing (false once the round is won or lost). */
  guessing: boolean;
  ready: boolean;
  playing: boolean;
  playLabel: string;
  skipLabel: string;
  nextLabel: string;
  tracks: Track[];
  isGuessed: (track: Track) => boolean;
  signedIn: boolean;
  onPlay: () => void;
  onGuess: (track: Track) => void;
  onSkip: () => void;
  onNext: () => void;
  onSongs: () => void;
  onLevel: () => void;
  onRecord: () => void;
  onAccount: () => void;
}

/**
 * The phone layout's controls, fixed to the bottom of the screen where a thumb
 * reaches without shifting grip: the guess field, skip or next, the play button,
 * and a tab bar in place of the masthead buttons nobody can reach one-handed.
 * It rides above the on-screen keyboard (--keyboard-inset) and tells the page how
 * much room to leave for it (--dock-height).
 */
/**
 * A tap on a dock button must not take focus from the guess field: that would
 * close the keyboard and bring the tabs back, moving the button out from under
 * the finger mid-tap so the tap misses.
 */
const keepTyping = (event: React.MouseEvent) => event.preventDefault();

export function Dock(props: Props) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useHeightVariable(element, '--dock-height');

  return (
    <div className="dock" ref={setElement}>
      {props.guessing ? (
        <GuessBar tracks={props.tracks} disabled={!props.ready} isGuessed={props.isGuessed} onGuess={props.onGuess} opensUp />
      ) : null}
      <div className="dock-row">
        {props.guessing ? (
          <button
            type="button"
            className="button dock-main"
            onMouseDown={keepTyping}
            onClick={props.onSkip}
            disabled={!props.ready}
          >
            {props.skipLabel}
          </button>
        ) : (
          <button type="button" className="button button-primary dock-main" onMouseDown={keepTyping} onClick={props.onNext}>
            {props.nextLabel}
          </button>
        )}
        <PlayButton
          playing={props.playing}
          ready={props.ready}
          label={props.playLabel}
          className="transport-play dock-play"
          onPlay={props.onPlay}
        />
      </div>
      <nav className="tabbar" aria-label="Menu">
        <button type="button" className="tab" onClick={props.onSongs}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M7 15.5V4.5l10-2v11" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="5" cy="15.5" r="2.5" fill="currentColor" />
            <circle cx="15" cy="13.5" r="2.5" fill="currentColor" />
          </svg>
          Songs
        </button>
        <button type="button" className="tab" onClick={props.onLevel}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <rect x="2" y="12" width="3" height="5" fill="currentColor" />
            <rect x="6.25" y="9" width="3" height="8" fill="currentColor" />
            <rect x="10.5" y="6" width="3" height="11" fill="currentColor" />
            <rect x="14.75" y="3" width="3" height="14" fill="currentColor" />
          </svg>
          Level
        </button>
        <button type="button" className="tab" onClick={props.onRecord}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M4 3h12v4a6 6 0 0 1-12 0Z" fill="currentColor" />
            <rect x="8.5" y="12" width="3" height="3" fill="currentColor" />
            <rect x="6" y="15" width="8" height="2" fill="currentColor" />
          </svg>
          Record
        </button>
        <button type="button" className={props.signedIn ? 'tab tab-on' : 'tab'} onClick={props.onAccount}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
            <path d="M2.8 18a7.2 7.2 0 0 1 14.4 0Z" fill="currentColor" />
          </svg>
          {props.signedIn ? 'You' : 'Sign in'}
        </button>
      </nav>
    </div>
  );
}
