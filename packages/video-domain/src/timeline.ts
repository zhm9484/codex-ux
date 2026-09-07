import type { TimelineItem, VideoDocument } from './schema.ts';
export const durationOf = (doc: VideoDocument) => doc.duration;
export const timeStep = (fps: number | null) => (fps === null ? 0.1 : 1 / fps);
export const lastTime = (doc: VideoDocument) =>
  Math.max(0, doc.duration - (doc.fps === null ? 0.001 : 1 / doc.fps));
export const clampTime = (doc: VideoDocument, time: number) =>
  Math.max(0, Math.min(lastTime(doc), time));
export const roundFrame = (time: number, fps: number | null) =>
  fps === null ? time : Math.round(time * fps) / fps;
export function formatTime(time: number, precise = false, fps: number | null = null) {
  const safe = Math.max(0, time);
  const base = `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
  if (!precise) return base;
  return (
    base +
    (fps === null
      ? `.${String(Math.floor((safe % 1) * 1000 + 0.001)).padStart(3, '0')}`
      : `:${String(Math.floor((safe % 1) * fps + 0.001)).padStart(2, '0')}`)
  );
}
export function moveTiming(
  item: TimelineItem,
  delta: number,
  fps: number | null,
  edge: 'move' | 'start' | 'end',
): TimelineItem {
  const min = Math.max(0.1, fps === null ? 0.1 : 1 / fps);
  const offset = item.target?.offset ?? 0;
  if (edge === 'move')
    return { ...item, start: Math.max(offset, roundFrame(item.start + delta, fps)) };
  if (edge === 'end')
    return { ...item, duration: Math.max(min, roundFrame(item.duration + delta, fps)) };
  const change = Math.max(
    offset - item.start,
    Math.min(item.duration - min, roundFrame(delta, fps)),
  );
  return { ...item, start: item.start + change, duration: item.duration - change };
}
