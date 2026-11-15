import { STAGE_DURATIONS, type StartMode } from '../../shared/types.ts';
import { PlayButton, playLabel } from './PlayButton.tsx';

interface Props {
  unlocked: number;
  playing: boolean;
  ready: boolean;
  solved: boolean;
  startMode: StartMode;
  onPlay: () => void;
  onStartMode: (mode: StartMode) => void;
  /** Accounts with song start hear the real opening; everyone else hears the start of the preview. */
  songStart: boolean;
  /** On a phone the play button lives in the dock, under the thumb. */
  showPlay?: boolean;
}

export function Transport({
  unlocked,
  playing,
  ready,
  solved,
  startMode,
  songStart,
  showPlay = true,
  onPlay,
  onStartMode,
}: Props) {
  const stageIndex = STAGE_DURATIONS.indexOf(unlocked as (typeof STAGE_DURATIONS)[number]);
  const label = playLabel(unlocked, solved);
  const step = solved || stageIndex < 0 ? null : `Attempt ${stageIndex + 1} of ${STAGE_DURATIONS.length}`;

  return (
    <div className="transport">
      {showPlay ? <PlayButton playing={playing} ready={ready} label={label} onPlay={onPlay} /> : null}
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
          title={songStart ? 'The very start of the song' : 'Start of the 30 second preview'}
          onClick={() => onStartMode('opening')}
        >
          {songStart ? 'Song start' : 'Clip start'}
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
