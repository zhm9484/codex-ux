import type { Clip, VideoDocument } from './schema.ts';
export const durationOf = (doc: VideoDocument) =>
  doc.native?.duration ?? Math.max(1, ...doc.clips.map((c) => c.start + c.duration));
export const roundFrame = (time: number, fps: number) => Math.round(time * fps) / fps;
export function formatTime(time: number, frames = false, fps = 30) {
  const safe = Math.max(0, time);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${frames ? `:${String(Math.floor((safe % 1) * fps + 0.001)).padStart(2, '0')}` : ''}`;
}
export function moveClip(
  clip: Clip,
  delta: number,
  fps: number,
  edge: 'move' | 'start' | 'end',
  trackId = clip.trackId,
): Clip {
  const min = 1 / fps;
  if (edge === 'move')
    return { ...clip, start: Math.max(0, roundFrame(clip.start + delta, fps)), trackId };
  if (edge === 'end')
    return { ...clip, duration: Math.max(0.1, roundFrame(clip.duration + delta, fps)) };
  const timedSource = ['scene', 'video', 'audio'].includes(clip.kind);
  const change = Math.max(
    -clip.start,
    timedSource ? -clip.offset : -clip.start,
    Math.min(clip.duration - Math.max(min, 0.1), roundFrame(delta, fps)),
  );
  return {
    ...clip,
    start: clip.start + change,
    duration: clip.duration - change,
    offset: timedSource ? clip.offset + change : clip.offset,
  };
}
export function splitClip(clip: Clip, at: number, id: string): [Clip, Clip] | null {
  const left = at - clip.start;
  if (left < 0.1 || clip.duration - left < 0.1) return null;
  return [
    { ...clip, duration: left },
    { ...clip, id, start: at, duration: clip.duration - left, offset: clip.offset + left },
  ];
}
