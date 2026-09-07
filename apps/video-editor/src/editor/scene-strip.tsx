import { previewScenes } from './timeline-items';
import { useRef } from 'react';
import {
  durationOf,
  timeStep,
  roundFrame,
  formatTime,
  type VideoDocument,
} from '@codex-ux/video-domain';
import type { TimeRange } from './types';
import type { PlaybackClock } from '../lib/playback-clock';
import { usePlaybackDisplay } from '../hooks/use-playback-display';

interface Props {
  document: VideoDocument;
  time: number;
  clock: PlaybackClock;
  range: TimeRange | null;
  thumbnail: (id: string) => string | undefined;
  onSeek: (time: number) => void;
  onRange: (range: TimeRange | null) => void;
  onPoint: (point: { x: number; y: number } | null) => void;
  onRangeStart: () => void;
}
export function SceneStrip(p: Props) {
  const root = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    time: number;
    x: number;
    kind: 'range' | 'seek' | 'start' | 'end';
    range: TimeRange | null;
  } | null>(null);

  const duration = durationOf(p.document);
  const scenes = previewScenes(p.document);
  usePlaybackDisplay(p.clock, (time) => {
    if (playhead.current) playhead.current.style.left = `${Math.min(time / duration, 1) * 100}%`;
  });
  function timeAt(event: React.PointerEvent) {
    const rect = root.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        duration - timeStep(p.document.fps),
        roundFrame(((event.clientX - rect.left) / rect.width) * duration, p.document.fps),
      ),
    );
  }
  return (
    <div className="timeline-navigation">
      <div className="navigation-meta">
        <span>
          {p.range
            ? `${formatTime(p.range.start, true)} — ${formatTime(p.range.end, true)}`
            : 'Drag to select a moment'}
        </span>
        <span>{formatTime(duration)}</span>
      </div>
      <div
        ref={root}
        className="scene-strip"
        role="slider"
        aria-label="Video position"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={p.time}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            p.onSeek(
              p.clock.sample() + (event.key === 'ArrowRight' ? 1 : -1) * timeStep(p.document.fps),
            );
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          p.onPoint(null);
          const kind = (event.target as HTMLElement).dataset.gesture as
            'seek' | 'start' | 'end' | undefined;
          gesture.current = {
            time: timeAt(event),
            x: event.clientX,
            kind: kind ?? 'range',
            range: p.range,
          };
          if (!kind || kind === 'seek') {
            p.onRangeStart();
            p.onSeek(timeAt(event));
            p.onRange(null);
          }
          root.current!.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (!start) return;
          const time = timeAt(event);
          if (start.kind === 'seek') p.onSeek(time);
          else if (start.kind === 'start' && start.range)
            p.onRange({
              start: Math.min(time, start.range.end - timeStep(p.document.fps)),
              end: start.range.end,
            });
          else if (start.kind === 'end' && start.range)
            p.onRange({
              start: start.range.start,
              end: Math.max(time, start.range.start + timeStep(p.document.fps)),
            });
          else if (Math.abs(event.clientX - start.x) > 5)
            p.onRange({ start: Math.min(time, start.time), end: Math.max(time, start.time) });
        }}
        onPointerUp={(event) => {
          p.onPoint({ x: event.clientX, y: event.clientY });
          gesture.current = null;
        }}
        onPointerCancel={() => {
          if (gesture.current) p.onRange(gesture.current.range);
          gesture.current = null;
        }}
      >
        {scenes.map((clip, index) => (
          <div
            className="strip-scene"
            key={clip.id}
            style={{
              left: `${(clip.start / duration) * 100}%`,
              width: `${(clip.duration / duration) * 100}%`,
            }}
          >
            {p.thumbnail(clip.id) && (
              <img className="clip-thumbnail" src={p.thumbnail(clip.id)} alt="" draggable={false} />
            )}
            <span className="strip-caption">
              <small>{String(index + 1).padStart(2, '0')}</small>
              <span>{clip.name}</span>
            </span>
          </div>
        ))}
        {!scenes.length && <span className="strip-empty">Drag to select a moment</span>}
        {p.range && (
          <div
            className="strip-range"
            style={{
              left: `${(p.range.start / duration) * 100}%`,
              width: `${((p.range.end - p.range.start) / duration) * 100}%`,
            }}
          >
            <span
              className="selection-edge start"
              data-gesture="start"
              title="Adjust range start"
            />
            <span className="selection-edge end" data-gesture="end" title="Adjust range end" />
          </div>
        )}
        <div ref={playhead} className="strip-playhead" data-gesture="seek" title="Drag to scrub" />
      </div>
    </div>
  );
}
