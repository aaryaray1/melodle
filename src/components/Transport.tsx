import { STAGE_DURATIONS, type StartMode } from '../../shared/types.ts';

interface Props {
  unlocked: number;
  playing: boolean;
  ready: boolean;
  solved: boolean;
  startMode: StartMode;
  onPlay: () => void;
  onStartMode: (mode: StartMode) => void;
}

export function Transport({ unlocked, playing, ready, solved, startMode, onPlay, onStartMode }: Props) {
  const stageIndex = STAGE_DURATIONS.indexOf(unlocked as (typeof STAGE_DURATIONS)[number]);
  const label = solved ? 'Full 15 seconds' : `${unlocked}s unlocked`;
  const step = solved || stageIndex < 0 ? null : `Attempt ${stageIndex + 1} of ${STAGE_DURATIONS.length}`;

  return (
    <div className="transport">
      <button
        type="button"
        className="transport-play"
        onClick={onPlay}
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
      <div className="transport-readout">
        <span className="transport-amount">{label}</span>
        {step ? <span className="transport-step">{step}</span> : null}
        {!ready ? <span className="transport-step">Loading the clip</span> : null}
      </div>

      <div className="starts" role="group" aria-label="Where the snippet starts">
        <button
          type="button"
          className={startMode === 'opening' ? 'start-pick start-pick-on' : 'start-pick'}
          aria-pressed={startMode === 'opening'}
          title="Start of the 30 second preview"
          onClick={() => onStartMode('opening')}
        >
          Clip start
        </button>
        <button
          type="button"
          className={startMode === 'hook' ? 'start-pick start-pick-on' : 'start-pick'}
          aria-pressed={startMode === 'hook'}
          title="The loudest stretch of the preview, usually the chorus"
          onClick={() => onStartMode('hook')}
        >
          Hook
        </button>
      </div>
    </div>
  );
}
