import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import { formatTime } from '@codex-ux/video-domain';
import { IconButton } from '../components/ui';
import { useRef } from 'react';
import { usePlaybackDisplay } from '../hooks/use-playback-display';
import type { PlaybackClock } from '../lib/playback-clock';

export function Transport({
  time,
  duration,
  fps,
  playing,
  onPlay,
  clock,
  muted,
  onMute,
  fullscreen,
  onFullscreen,
}: {
  time: number;
  duration: number;
  fps: number;
  playing: boolean;
  onPlay: () => void;
  clock: PlaybackClock;
  muted: boolean;
  onMute: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const label = useRef<HTMLSpanElement>(null);
  usePlaybackDisplay(clock, (value) => {
    if (label.current) label.current.textContent = formatTime(value, true, fps);
  });
  return (
    <div className="transport">
      <div className="transport-side">
        <span className="timecode">
          <span className="current-time" ref={label}>
            {formatTime(time, true, fps)}
          </span>
          <span> / {formatTime(duration, true, fps)}</span>
        </span>
      </div>
      <div className="transport-center">
        <IconButton label={playing ? 'Pause' : 'Play'} className="play-button" onClick={onPlay}>
          {playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </IconButton>
      </div>
      <div className="transport-side right">
        <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={onMute}>
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </IconButton>
        <IconButton
          label={fullscreen ? 'Exit video fullscreen' : 'Video fullscreen'}
          onClick={onFullscreen}
        >
          {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </IconButton>
      </div>
    </div>
  );
}
