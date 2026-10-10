import { useState } from 'react';
import type { Track } from '../../shared/types.ts';
import { thumbnail } from '../../shared/artwork.ts';

interface Props {
  track: Track;
  /** Displayed size in CSS pixels. Thumbnails are fetched at twice that for sharp screens. */
  size: number;
  className: string;
  /** Full-size art for the reveal; a small fetch for list rows. */
  full?: boolean;
  lazy?: boolean;
}

/** An album cover, or a pixel note in its place when there is none or it fails to load. */
export function Cover({ track, size, className, full = false, lazy = false }: Props) {
  const [failed, setFailed] = useState(false);
  const source = full ? track.artwork : thumbnail(track.artwork, Math.min(size * 2, 250));

  if (!source || failed) {
    return (
      <span className={`${className} cover-missing`} style={{ width: size, height: size }} aria-hidden="true">
        <svg viewBox="0 0 16 16" width={Math.round(size / 2.2)} height={Math.round(size / 2.2)}>
          <path d="M6 2h8v3H8v7.5A2.5 2.5 0 1 1 6 10.5Z" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <img
      className={className}
      src={source}
      alt=""
      width={size}
      height={size}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
