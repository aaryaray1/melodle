interface Props {
  playing: boolean;
  ready: boolean;
  /** What a press plays, for the accessible name: "0.5s unlocked", "Full 15 seconds". */
  label: string;
  className?: string;
  onPlay: () => void;
}

/** The round arcade button, shared by the desktop transport and the phone dock. */
export function PlayButton({ playing, ready, label, className = 'transport-play', onPlay }: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={onPlay}
      // Keeps focus (and the phone keyboard) where it was, so nothing shifts mid-tap.
      onMouseDown={(event) => event.preventDefault()}
      disabled={!ready}
      aria-label={playing ? 'Stop the snippet' : `Play ${label}`}
    >
      <span className="transport-icon" data-playing={playing} aria-hidden="true">
        {playing ? (
          <svg viewBox="0 0 24 24" width="26" height="26">
            <rect x="6" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path d="M8 5.6v12.8a1 1 0 0 0 1.54.84l9.2-6.4a1 1 0 0 0 0-1.68l-9.2-6.4A1 1 0 0 0 8 5.6Z" fill="currentColor" />
          </svg>
        )}
      </span>
    </button>
  );
}

export function playLabel(unlocked: number, solved: boolean): string {
  return solved ? 'Full 15 seconds' : `${unlocked}s unlocked`;
}
