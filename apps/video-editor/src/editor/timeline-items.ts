import {
  hyperframesTimelineItems,
  type TimelineItem,
  type VideoDocument,
} from '@codex-ux/video-domain';
export type { TimelineItem } from '@codex-ux/video-domain';
export function timelineItems(doc: VideoDocument): TimelineItem[] {
  if (doc.source.kind !== 'hyperframes') return [];
  return hyperframesTimelineItems(doc).map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.textIndex === undefined ? 'scene' : 'text',
    start: item.start,
    duration: item.duration,
    target: item,
  }));
}
export function previewScenes(doc: VideoDocument): TimelineItem[] {
  const scenes = timelineItems(doc).filter((item) => item.kind === 'scene');
  return scenes.length
    ? scenes
    : Array.from({ length: 8 }, (_, index) => ({
        id: `sample-${index}`,
        name: doc.name,
        kind: 'scene',
        start: (index * doc.duration) / 8,
        duration: doc.duration / 8,
      }));
}
