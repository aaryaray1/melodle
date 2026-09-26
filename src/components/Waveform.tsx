import { useEffect, useRef } from 'react';
import { STAGE_DURATIONS } from '../../shared/types.ts';
import type { AudioEngine, LoadedClip } from '../audio/engine.ts';
import { WINDOW } from '../audio/engine.ts';
import { positionOf } from '../audio/scale.ts';

interface Props {
  clip: LoadedClip | null;
  unlocked: number;
  playing: boolean;
  tone: 'live' | 'won' | 'lost';
  engine: AudioEngine;
}

const COLUMN_PITCH = 4;
const GHOST_HEIGHT = 2;

interface Palette {
  lit: string;
  ghost: string;
  head: string;
}

function readPalette(canvas: HTMLCanvasElement): Palette {
  const styles = getComputedStyle(canvas);
  return {
    lit: styles.getPropertyValue('--wave-lit').trim() || '#ffad36',
    ghost: styles.getPropertyValue('--wave-ghost').trim() || '#31264f',
    head: styles.getPropertyValue('--wave-head').trim() || '#f4eeff',
  };
}

export function Waveform({ clip, unlocked, playing, tone, engine }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revealRef = useRef(0);
  const stateRef = useRef({ clip, unlocked, playing, tone });
  stateRef.current = { clip, unlocked, playing, tone };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const { clip: current, unlocked: window_, playing: sounding, tone: mood } = stateRef.current;
      const palette = readPalette(canvas);
      const target = positionOf(window_, WINDOW);
      revealRef.current = reduceMotion ? target : revealRef.current + (target - revealRef.current) * 0.18;
      if (Math.abs(target - revealRef.current) < 0.0015) revealRef.current = target;
      const reveal = revealRef.current;

      context.clearRect(0, 0, width, height);
      const middle = height / 2;
      const columns = Math.max(1, Math.floor(width / COLUMN_PITCH));
      const barWidth = Math.max(1.5, COLUMN_PITCH - 1.5);
      const peaks = current?.peaks;

      for (let column = 0; column < columns; column += 1) {
        const position = column / columns;
        const x = position * width;
        const inside = position <= reveal;
        let bar = GHOST_HEIGHT;
        if (inside && peaks) {
          const peak = peaks[Math.min(peaks.length - 1, Math.floor(position * peaks.length))] as number;
          bar = Math.max(GHOST_HEIGHT, peak ** 0.68 * (height - 6));
        }
        context.fillStyle = inside ? palette.lit : palette.ghost;
        context.globalAlpha = inside ? (mood === 'live' ? 1 : 0.95) : 0.7;
        const radius = Math.min(barWidth / 2, bar / 2);
        context.beginPath();
        context.roundRect(x, middle - bar / 2, barWidth, bar, radius);
        context.fill();
      }
      context.globalAlpha = 1;

      const elapsed = sounding ? engine.progress() : null;
      if (elapsed !== null) {
        const headX = positionOf(elapsed, WINDOW) * width;
        context.fillStyle = palette.head;
        context.fillRect(headX - 1, 0, 2, height);
        context.globalAlpha = 0.25;
        context.fillRect(headX - 5, 0, 10, height);
        context.globalAlpha = 1;
      }

      const settled = revealRef.current === target;
      frame = settled && !sounding ? 0 : requestAnimationFrame(draw);
    };

    const kick = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    resize();
    draw();
    const observer = new ResizeObserver(() => {
      resize();
      kick();
    });
    observer.observe(canvas);
    const timer = window.setInterval(kick, 120);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [engine]);

  const ticks = STAGE_DURATIONS.map((seconds) => ({
    seconds,
    left: positionOf(seconds, WINDOW) * 100,
    reached: seconds <= unlocked,
  }));

  return (
    <div className={tone === 'live' ? 'wave' : `wave wave-${tone}`}>
      <canvas
        ref={canvasRef}
        className="wave-canvas"
        role="img"
        aria-label={`Waveform, ${unlocked} seconds of ${WINDOW} unlocked`}
      />
      <div className="wave-ticks" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick.seconds}
            className={tick.reached ? 'tick tick-on' : 'tick'}
            style={{ left: `${tick.left}%` }}
          >
            {tick.seconds}s
          </span>
        ))}
      </div>
    </div>
  );
}
