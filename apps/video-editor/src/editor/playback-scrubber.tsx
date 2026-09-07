import { useRef } from 'react';
import { formatTime } from '@codex-ux/video-domain';
import { usePlaybackDisplay } from '../hooks/use-playback-display';
import type { PlaybackClock } from '../lib/playback-clock';

export function PlaybackScrubber({
  clock,
  duration,
  fps,
  onSeek,
  onPlay,
}: {
  clock: PlaybackClock;
  duration: number;
  fps: number;
  onSeek: (time: number) => void;
  onPlay: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  usePlaybackDisplay(clock, (time) => {
    if (!input.current) return;
    input.current.value = String(time);
    input.current.style.setProperty('--progress', `${(time / duration) * 100}%`);
    input.current.setAttribute('aria-valuetext', formatTime(time, true, fps));
  });
  return (
    <input
      ref={input}
      className="playback-scrubber"
      type="range"
      aria-label="Playback position"
      min={0}
      max={duration}
      step={1 / fps}
      defaultValue={clock.sample()}
      onChange={(event) => onSeek(Number(event.currentTarget.value))}
      onKeyDown={(event) => {
        if (event.code === 'Space') {
          event.preventDefault();
          onPlay();
        }
      }}
    />
  );
}
