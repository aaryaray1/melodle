import { useState } from 'react';
import { STAGE_DURATIONS, type Rating, type Track } from '../../shared/types.ts';
import type { Guess, Status } from '../game/rules.ts';

interface Props {
  track: Track;
  status: Status;
  guesses: Guess[];
  daily: boolean;
  rating: Rating | 0;
  onRate: (rating: Rating | 0) => void;
  onNext: () => void;
  onShare: () => string;
}

export function Reveal({ track, status, guesses, daily, rating, onRate, onNext, onShare }: Props) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const won = status === 'won';
  const solvedAt = STAGE_DURATIONS[guesses.length - 1];

  const share = async () => {
    const text = onShare();
    try {
      await navigator.clipboard.writeText(text);
      setManual(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers refuse the clipboard, so hand the text over instead.
      setCopied(false);
      setManual(text);
    }
  };

  return (
    <section className={won ? 'reveal reveal-won' : 'reveal reveal-lost'} aria-live="polite">
      <p className="reveal-verdict">{won ? `Spotted it on ${solvedAt}s` : 'Out of attempts'}</p>
      <div className="reveal-track">
        {track.artwork ? <img className="reveal-art" src={track.artwork} alt="" width={72} height={72} /> : null}
        <div className="reveal-meta">
          <h3 className="reveal-title">{track.title}</h3>
          <p className="reveal-artist">{track.artist}</p>
          {track.contributor ? <p className="reveal-from">from {track.contributor}&apos;s library</p> : null}
          {track.link ? (
            <a className="reveal-link" href={track.link} target="_blank" rel="noreferrer noopener">
              Open the full track
            </a>
          ) : null}
        </div>
        <div className="rate" role="group" aria-label="Rate this song">
          <button
            type="button"
            className={rating === 1 ? 'rate-button rate-up rate-on' : 'rate-button rate-up'}
            aria-pressed={rating === 1}
            title="More songs like this"
            onClick={() => onRate(rating === 1 ? 0 : 1)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M7 22H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3v11Zm2-11.4 4.2-7.1a1 1 0 0 1 1.4-.3l.8.5a2 2 0 0 1 .8 2.2L15.4 9h4.3a2 2 0 0 1 2 2.5l-1.9 8A2 2 0 0 1 17.8 21H9V10.6Z"
                fill="currentColor"
              />
            </svg>
            <span className="rate-label">Like</span>
          </button>
          <button
            type="button"
            className={rating === -1 ? 'rate-button rate-down rate-on' : 'rate-button rate-down'}
            aria-pressed={rating === -1}
            title="Never show me this again"
            onClick={() => onRate(rating === -1 ? 0 : -1)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M17 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3V2Zm-2 11.4-4.2 7.1a1 1 0 0 1-1.4.3l-.8-.5a2 2 0 0 1-.8-2.2L8.6 15H4.3a2 2 0 0 1-2-2.5l1.9-8A2 2 0 0 1 6.2 3H15v10.4Z"
                fill="currentColor"
              />
            </svg>
            <span className="rate-label">Not this</span>
          </button>
        </div>
      </div>
      {rating === -1 ? <p className="reveal-note">Noted. This one will not come up again.</p> : null}
      <div className="reveal-actions">
        <button type="button" className="button button-primary" onClick={onNext}>
          {daily ? 'Play another song' : 'Next song'}
        </button>
        <button type="button" className="button" onClick={share}>
          {copied ? 'Copied' : 'Copy result'}
        </button>
      </div>
      {manual ? (
        <label className="reveal-manual">
          <span className="reveal-note">Your browser blocked the clipboard. Copy this instead:</span>
          <textarea className="reveal-share" readOnly rows={3} value={manual} onFocus={(e) => e.target.select()} />
        </label>
      ) : null}
      {daily ? <p className="reveal-note">Today&apos;s song is done. Anything after this is practice.</p> : null}
    </section>
  );
}
